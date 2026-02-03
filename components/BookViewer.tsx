'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Book } from '@/types'
import { generatePageImage, generatePageAudio } from '@/services/geminiService'
import { startBackgroundMode, stopBackgroundMode } from '@/services/backgroundMode'
import DriveConnectButton from '@/components/DriveConnectButton'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import { ComicImageWithText } from '@/components/ComicImageWithText'

interface BookViewerProps {
  book: Book;
  onUpdateBook: (book: Book) => void;
  onClose: () => void;
}

// Helper to convert AudioBuffer to WAV Blob
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataByteCount = buffer.length * blockAlign;
  const headerByteCount = 44;
  const totalByteCount = headerByteCount + dataByteCount;
  const headerBuffer = new ArrayBuffer(headerByteCount);
  const view = new DataView(headerBuffer);
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalByteCount - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataByteCount, true);
  const dataBuffer = new ArrayBuffer(dataByteCount);
  const dataView = new DataView(dataBuffer);
  let offset = 0;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = buffer.getChannelData(channel)[i];
      const s = Math.max(-1, Math.min(1, sample));
      const int16 = s < 0 ? s * 0x8000 : s * 0x7FFF;
      dataView.setInt16(offset, int16, true);
      offset += 2;
    }
  }
  return new Blob([headerBuffer, dataBuffer], { type: 'audio/wav' });
}

const BookViewer: React.FC<BookViewerProps> = ({ book, onUpdateBook, onClose }) => {
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const bookRef = useRef(book);

  useEffect(() => {
    bookRef.current = book;
  }, [book]);

  const [images, setImages] = useState<Record<number, string>>(() => {
    const initialImages: Record<number, string> = {};
    book.pages.forEach((page, index) => {
      if (page.generatedImageUrl) {
        initialImages[index] = page.generatedImageUrl;
      }
    });
    return initialImages;
  });

  const [loadingImages, setLoadingImages] = useState<Record<number, boolean>>({});

  const [sessionReferenceImage, setSessionReferenceImage] = useState<string | null>(
    book.metadata.baseCharacterImageUrl || book.pages.find(p => p.generatedImageUrl)?.generatedImageUrl || null
  );

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioBuffers, setAudioBuffers] = useState<Record<number, AudioBuffer>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const currentPage = book.pages[currentPageIndex];
  const totalPages = book.pages.length;
  const audioEnabled = book.metadata.audioConfig?.enabled ?? true;
  const voiceName = book.metadata.audioConfig?.voiceName || 'Puck';

  const fullCharacterDescription = useMemo(() => {
    let desc = `Main Character: ${book.metadata.mainCharacterDescription}.`;
    if (book.metadata.mainCharacterDistinctiveMark) {
      desc += ` DISTINCTIVE FEATURE: ${book.metadata.mainCharacterDistinctiveMark} (Must appear in every image).`;
    }
    if (book.metadata.secondaryCharacterDescription) {
      desc += `\nSecondary Character (Sidekick): ${book.metadata.secondaryCharacterDescription} (This appearance MUST be consistent across all pages).`;
      if (book.metadata.secondaryCharacterDistinctiveMark) {
        desc += ` DISTINCTIVE FEATURE: ${book.metadata.secondaryCharacterDistinctiveMark}.`;
      }
    }
    return desc;
  }, [book.metadata]);

  useEffect(() => {
    return () => {
      stopAudio();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    stopAudio();
    setAudioError(null);
  }, [currentPageIndex]);

  const stopAudio = () => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch (e) { }
      audioSourceRef.current = null;
    }
    setIsPlaying(false);
  };

  const handleChangeKey = () => {
    const aistudio = (window as any).aistudio;
    if (aistudio) aistudio.openSelectKey();
  };

  const handleToggleAudio = async () => {
    if (!audioEnabled) return;

    if (isPlaying) {
      stopAudio();
      return;
    }

    setAudioError(null);

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }

    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    const ctx = audioContextRef.current;

    if (audioBuffers[currentPageIndex]) {
      playBuffer(audioBuffers[currentPageIndex], ctx);
      return;
    }

    setIsLoadingAudio(true);
    try {
      const textToRead = currentPageIndex === 0 ? book.metadata.title : currentPage.hebrewText;
      const buffer = await generatePageAudio(textToRead, ctx, voiceName);
      if (buffer) {
        setAudioBuffers(prev => ({ ...prev, [currentPageIndex]: buffer }));
        playBuffer(buffer, ctx);
      } else {
        setAudioError("תקלה ביצירת אודיו");
      }
    } catch (e) {
      console.error(e);
      setAudioError("שגיאה כללית");
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const playBuffer = (buffer: AudioBuffer, ctx: AudioContext) => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => setIsPlaying(false);
    audioSourceRef.current = source;
    source.start();
    setIsPlaying(true);
  };

  const handleNext = () => { if (currentPageIndex < totalPages - 1) setCurrentPageIndex((prev) => prev + 1); };
  const handlePrev = () => { if (currentPageIndex > 0) setCurrentPageIndex((prev) => prev - 1); };

  const updateBookState = (index: number, url: string) => {
    const currentBookState = bookRef.current;
    const updatedPages = [...currentBookState.pages];
    updatedPages[index] = { ...updatedPages[index], generatedImageUrl: url };
    const updatedBook = { ...currentBookState, pages: updatedPages };
    onUpdateBook(updatedBook);
  };

  const loadImage = async (pageIndex: number, actionPrompt: string) => {
    if (images[pageIndex] || loadingImages[pageIndex]) return;

    if (bookRef.current.pages[pageIndex].generatedImageUrl) {
      setImages((prev) => ({ ...prev, [pageIndex]: bookRef.current.pages[pageIndex].generatedImageUrl! }));
      return;
    }

    setLoadingImages((prev) => ({ ...prev, [pageIndex]: true }));
    try {
      const referenceToUse = bookRef.current.metadata.baseCharacterImageUrl || sessionReferenceImage;
      const isCover = pageIndex === 0;
      const textToRender = isCover ? bookRef.current.metadata.title : undefined;

      const url = await generatePageImage(
        actionPrompt,
        fullCharacterDescription,
        bookRef.current.metadata.artStyle,
        referenceToUse || undefined,
        isCover,
        textToRender,
        bookRef.current.metadata.characterColorPalette,
        isCover ? undefined : bookRef.current.pages[pageIndex].hebrewText
      );

      if (url) {
        setImages((prev) => ({ ...prev, [pageIndex]: url }));
        if (!referenceToUse && !sessionReferenceImage) {
          setSessionReferenceImage(url);
        }
        updateBookState(pageIndex, url);
      }
      return url;
    } catch (err) {
      console.error("Failed to load page image:", err);
      return null;
    } finally {
      setLoadingImages((prev) => ({ ...prev, [pageIndex]: false }));
    }
  };

  const handleRegenerateImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const pageIndex = currentPageIndex;
    if (loadingImages[pageIndex]) return;

    setLoadingImages((prev) => ({ ...prev, [pageIndex]: true }));

    try {
      const referenceToUse = bookRef.current.metadata.baseCharacterImageUrl || sessionReferenceImage;
      const isCover = pageIndex === 0;
      const textToRender = isCover ? bookRef.current.metadata.title : undefined;

      const url = await generatePageImage(
        bookRef.current.pages[pageIndex].imagePrompt,
        fullCharacterDescription,
        bookRef.current.metadata.artStyle,
        referenceToUse || undefined,
        isCover,
        textToRender,
        bookRef.current.metadata.characterColorPalette,
        isCover ? undefined : bookRef.current.pages[pageIndex].hebrewText
      );

      if (url) {
        setImages((prev) => ({ ...prev, [pageIndex]: url }));
        if (pageIndex === 0 && !bookRef.current.metadata.baseCharacterImageUrl) {
          setSessionReferenceImage(url);
        }
        updateBookState(pageIndex, url);
      }
    } catch (error) {
      console.error("Regeneration failed", error);
      alert("שגיאה ביצירת התמונה מחדש");
    } finally {
      setLoadingImages((prev) => ({ ...prev, [pageIndex]: false }));
    }
  };

  useEffect(() => {
    const page = book.pages[currentPageIndex];
    if (page && !images[currentPageIndex]) {
      loadImage(currentPageIndex, page.imagePrompt);
    }
  }, [currentPageIndex]);

  const prepareExportCanvas = async (i: number, imgUrl: string) => {
    const isCover = i === 0;

    // EXPORT LAYOUT STRATEGY:
    // Cover: 1024x1024 Square (Image contains title, no extra text area)
    // Inner: 1024x1280 (1024x1024 Image Top + 1024x256 Text Area Bottom)

    const width = 1024;
    const height = isCover ? 1024 : 1280;

    const container = document.createElement('div');
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.backgroundColor = '#ffffff';
    container.style.overflow = 'hidden';

    if (isCover) {
      // Cover is simple full image
      container.innerHTML = `<img src="${imgUrl}" style="width: 1024px; height: 1024px; object-fit: cover;" />`;
    } else {
      // Inner pages: Vertical Stack. Image Top, Text Bottom.
      const text = book.pages[i].hebrewText || "";
      // Improved text styling matching globals.css updates
      container.innerHTML = `
            <div style="display: flex; flex-direction: column; width: 1024px; height: 1280px; background: white;">
                <div style="width: 1024px; height: 1000px; flex-shrink: 0; background-color: #f8fafc;">
                    <img src="${imgUrl}" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
                </div>
                <div style="
                    width: 1024px; 
                    height: 280px; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    padding: 32px 48px; 
                    box-sizing: border-box; 
                    background: linear-gradient(to bottom, #fffdf5 0%, #fff8e7 30%, #fdecc8 70%, #fbe3b2 100%);
                    box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.8), inset 0 -2px 8px rgba(0, 0, 0, 0.05);
                    border-top: 3px solid rgba(255, 255, 255, 0.9);
                ">
                     <p style="
                        margin: 0; 
                        font-family: 'Rubik', 'Heebo', 'Arial', sans-serif; 
                        font-size: 44px; 
                        font-weight: 600; 
                        color: #2a1a0a; 
                        direction: rtl; 
                        text-align: center; 
                        line-height: 1.7;
                        text-shadow: 0 1px 0 rgba(255, 255, 255, 0.8), 0 2px 4px rgba(0, 0, 0, 0.06);
                        letter-spacing: 0.01em;
                     ">
                        ${text}
                     </p>
                </div>
            </div>
        `;
    }

    document.body.appendChild(container);
    await new Promise(resolve => setTimeout(resolve, 500));
    const canvas = await html2canvas(container, { scale: 1, useCORS: true, width, height });
    document.body.removeChild(container);
    return canvas;
  };

  const handleDownloadZIP = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportProgress('מכין חבילה מלאה...');

    // Enable background mode to prevent mobile from suspending
    await startBackgroundMode();

    const zip = new JSZip();
    // A4 Portrait for standardized printing
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;

    try {
      zip.file("sequel_data.json", JSON.stringify(bookRef.current, null, 2));

      for (let i = 0; i < book.pages.length; i++) {
        setExportProgress(`מעבד עמוד ${i + 1} מתוך ${book.pages.length}...`);
        let imgUrl: string | null | undefined = images[i];
        const isCover = i === 0;

        if (!imgUrl) {
          const referenceToUse = bookRef.current.metadata.baseCharacterImageUrl || sessionReferenceImage;
          const textToRender = isCover ? (bookRef.current.metadata.title || '') : undefined;
          const newUrl = await generatePageImage(
            book.pages[i].imagePrompt,
            fullCharacterDescription,
            book.metadata.artStyle,
            (referenceToUse || undefined) as string | undefined,
            isCover,
            textToRender,
            book.metadata.characterColorPalette,
            isCover ? undefined : book.pages[i].hebrewText
          );
          if (newUrl) {
            imgUrl = newUrl;
            setImages(prev => ({ ...prev, [i]: newUrl }));
            if (!referenceToUse && !sessionReferenceImage) setSessionReferenceImage(newUrl);
            updateBookState(i, newUrl); // Sync!
          }
        }

        if (imgUrl) {
          const canvas = await prepareExportCanvas(i, imgUrl);
          const pngBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));

          if (pngBlob) zip.file(i === 0 ? '00_COVER.png' : `PAGE_${String(i).padStart(2, '0')}.png`, pngBlob);

          const imgData = canvas.toDataURL('image/jpeg', 0.9);

          // PDF Layout
          const canvasRatio = canvas.height / canvas.width;
          const pdfImgHeight = pageWidth * canvasRatio;

          // If height exceeds A4 (297mm), scale down to fit
          let renderWidth = pageWidth;
          let renderHeight = pdfImgHeight;
          if (renderHeight > 297) {
            const scale = 297 / renderHeight;
            renderHeight = 297;
            renderWidth = pageWidth * scale;
          }
          const xOffset = (210 - renderWidth) / 2;

          pdf.addImage(imgData, 'JPEG', xOffset, 0, renderWidth, renderHeight);

          if (i < book.pages.length - 1) pdf.addPage();
        }

        if (audioEnabled) {
          let audioBuf = audioBuffers[i];
          if (!audioBuf) {
            if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            const buf = await generatePageAudio(i === 0 ? book.metadata.title : book.pages[i].hebrewText, audioContextRef.current, voiceName);
            if (buf) { audioBuf = buf; setAudioBuffers(prev => ({ ...prev, [i]: buf })); }
          }
          if (audioBuf) zip.file(i === 0 ? '00_AUDIO_Title.wav' : `AUDIO_Page_${String(i).padStart(2, '0')}.wav`, audioBufferToWav(audioBuf));
        }
      }

      const pdfBlob = pdf.output('blob');
      zip.file(`${book.metadata.title}.pdf`, pdfBlob);

      const content = await zip.generateAsync({ type: 'blob' });

      // Upload to Google Drive if connected
      let driveLinks: { zipLink: string; pdfLink: string } | null = null;
      try {
        const { hasDriveAccess, uploadBookToDrive } = await import('@/services/googleDrive');
        if (hasDriveAccess()) {
          setExportProgress('מעלה ל-Google Drive...');
          driveLinks = await uploadBookToDrive(content, pdfBlob, book.metadata.title);
        }
      } catch (driveError) {
        console.warn('Drive upload failed:', driveError);
      }

      // Save to Firestore WITH Drive links
      setExportProgress('שומר מידע...');
      try {
        const { saveBookPrompts } = await import('@/services/firebase');
        await saveBookPrompts({
          bookTitle: book.metadata.title,
          mainCharacter: book.metadata.mainCharacterDescription || '',
          artStyle: book.metadata.artStyle,
          topic: book.metadata.mainTheme || '',
          imagePrompts: book.pages.map(p => p.imagePrompt),
          driveZipUrl: driveLinks?.zipLink,
          drivePdfUrl: driveLinks?.pdfLink
        });
        console.log('Book saved to Firestore with Drive links!');
      } catch (firebaseError) {
        console.warn('Firestore save failed:', firebaseError);
      }

      // Download locally
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      const safeTitle = book.metadata.title.replace(/[\\/:*?"<>|]/g, '_');
      link.download = `${safeTitle}.zip`;
      link.click();

      // Show Drive links if uploaded
      if (driveLinks) {
        setTimeout(() => {
          const showLinks = confirm(`הספר הועלה ל-Google Drive!\n\nלהציג קישורים?`);
          if (showLinks) {
            alert(`📦 ZIP: ${driveLinks.zipLink}\n\n📄 PDF: ${driveLinks.pdfLink}`);
          }
        }, 500);
      }
    } catch (error) {
      console.error("Export failed:", error);
      alert("הייצוא נכשל. אנא נסה שוב.");
    } finally {
      stopBackgroundMode(); // Release wake lock
      setIsExporting(false);
      setExportProgress('');
    }
  };

  const handleDownloadPDF = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportProgress('יוצר PDF...');

    // Enable background mode to prevent mobile from suspending
    await startBackgroundMode();

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;

    try {
      for (let i = 0; i < book.pages.length; i++) {
        setExportProgress(`מוסיף עמוד ${i + 1}...`);
        let imgUrl: string | undefined = images[i];
        const isCover = i === 0;

        if (!imgUrl) {
          const ref = bookRef.current.metadata.baseCharacterImageUrl || sessionReferenceImage;
          const textToRender = isCover ? (bookRef.current.metadata.title || '') : undefined;
          const newUrl = await generatePageImage(
            book.pages[i].imagePrompt,
            fullCharacterDescription,
            book.metadata.artStyle,
            (ref || undefined) as string | undefined,
            isCover,
            textToRender,
            book.metadata.characterColorPalette,
            isCover ? undefined : book.pages[i].hebrewText
          );
          if (newUrl) { imgUrl = newUrl; setImages(prev => ({ ...prev, [i]: newUrl })); updateBookState(i, newUrl); }
        }
        if (imgUrl) {
          const canvas = await prepareExportCanvas(i, imgUrl);
          const imgData = canvas.toDataURL('image/jpeg', 0.9);

          const canvasRatio = canvas.height / canvas.width;
          const pdfImgHeight = pageWidth * canvasRatio;

          let renderWidth = pageWidth;
          let renderHeight = pdfImgHeight;
          if (renderHeight > 297) {
            const scale = 297 / renderHeight;
            renderHeight = 297;
            renderWidth = pageWidth * scale;
          }
          const xOffset = (210 - renderWidth) / 2;

          pdf.addImage(imgData, 'JPEG', xOffset, 0, renderWidth, renderHeight);
          if (i < book.pages.length - 1) pdf.addPage();
        }
      }

      const pdfBlob = pdf.output('blob');

      // Upload to Google Drive if connected
      let driveLinks: { zipLink: string; pdfLink: string } | null = null;
      try {
        const { hasDriveAccess, uploadBookToDrive } = await import('@/services/googleDrive');
        if (hasDriveAccess()) {
          setExportProgress('מעלה ל-Google Drive...');
          // For PDF only export, we just upload the PDF (mock empty ZIP)
          // Or better, we can use a simpler uploadToDrive function, but uploadBookToDrive is handy.
          // Let's just upload the PDF using the generic upload function exposed or via uploadBookToDrive passing empty blob for zip?
          // Actually uploadBookToDrive expects both. Let's import uploadToDrive directly.
          const { uploadToDrive } = await import('@/services/googleDrive');
          const safeTitle = book.metadata.title.replace(/[\\/:*?"<>|]/g, '_');
          const timestamp = new Date().toISOString().split('T')[0];
          const result = await uploadToDrive(pdfBlob, `${safeTitle}_${timestamp}.pdf`, 'application/pdf');
          driveLinks = { zipLink: '', pdfLink: result.webViewLink };
        }
      } catch (driveError) {
        console.warn('Drive upload failed:', driveError);
      }

      // Log book metadata to Firestore WITH Drive link
      setExportProgress('שומר מידע...');
      try {
        const { saveBookPrompts } = await import('@/services/firebase');
        await saveBookPrompts({
          bookTitle: book.metadata.title,
          mainCharacter: book.metadata.mainCharacterDescription || '',
          artStyle: book.metadata.artStyle,
          topic: book.metadata.mainTheme || '',
          imagePrompts: book.pages.map(p => p.imagePrompt),
          drivePdfUrl: driveLinks?.pdfLink
        });
        console.log('Book metadata saved to Firestore!');
      } catch (firebaseError) {
        console.warn('Firestore save failed:', firebaseError);
      }

      const safeTitle = book.metadata.title.replace(/[\\/:*?"<>|]/g, '_');
      pdf.save(`${safeTitle}.pdf`);

      // Show Drive links if uploaded
      if (driveLinks?.pdfLink) {
        setTimeout(() => {
          const showLinks = confirm(`ה-PDF הועלה ל-Google Drive!\n\nלהציג קישור?`);
          if (showLinks) {
            alert(`📄 PDF: ${driveLinks.pdfLink}`);
          }
        }, 500);
      }
    } finally {
      stopBackgroundMode(); // Release wake lock
      setIsExporting(false);
      setExportProgress('');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900 z-[100] flex flex-col items-center">
      <div className="w-full bg-white px-4 h-20 flex items-center justify-between shadow-md shrink-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="text-slate-600 hover:text-slate-900 font-bold flex items-center gap-2">
            <span className="text-xl">←</span> חזרה לעריכה
          </button>
          <button onClick={handleChangeKey} className="text-slate-400 hover:text-slate-600 text-xs font-bold border border-slate-200 px-2 py-1 rounded-full flex items-center gap-1">
            🔑 API
          </button>
        </div>
        <div className="flex items-center gap-3">
          <DriveConnectButton />
          <button onClick={handleDownloadZIP} disabled={isExporting} className="bg-kid-orange hover:bg-orange-400 text-white font-bold py-2 px-4 rounded-full text-sm transition-all flex items-center gap-2">
            <span>חבילה מלאה</span> 📦
          </button>
          <button onClick={handleDownloadPDF} disabled={isExporting} className="bg-kid-blue hover:bg-teal-400 text-white font-bold py-2 px-4 rounded-full text-sm transition-all">
            PDF בלבד 📄
          </button>
        </div>
      </div>

      <div className="flex-grow w-full flex items-center justify-center p-4 overflow-auto bg-slate-800">
        <div className="relative w-full max-w-[550px] bg-white rounded-2xl shadow-2xl overflow-hidden group border-4 border-white flex flex-col">
          {images[currentPageIndex] ? (
            <>
              {/* IMAGE AREA: 
                 - Cover: Full container.
                 - Inner: Strictly square, top part of flex column.
              */}
              <div className={`relative w-full ${currentPageIndex === 0 ? 'h-full aspect-square' : 'aspect-square shrink-0'} bg-slate-100`}>
                <img src={images[currentPageIndex]} className="w-full h-full object-cover" />

                <button
                  onClick={handleRegenerateImage}
                  disabled={loadingImages[currentPageIndex]}
                  className="absolute top-4 left-4 z-30 bg-white/80 hover:bg-white text-slate-700 p-2 rounded-full shadow-lg backdrop-blur-sm transition-all hover:scale-110 disabled:opacity-50"
                  title="צייר מחדש את התמונה"
                >
                  {loadingImages[currentPageIndex] ? (
                    <div className="w-6 h-6 border-2 border-slate-700 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <span className="text-xl">🔄</span>
                  )}
                </button>

                {/* Audio Button for Cover (Overlay Style) */}
                {currentPageIndex === 0 && audioEnabled && (
                  <div className="absolute bottom-6 right-6 flex flex-col items-end gap-2 z-20">
                    {audioError && <span className="text-xs text-red-500 bg-white px-2 py-1 rounded-full font-bold shadow-md">{audioError}</span>}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleAudio(); }}
                      disabled={isLoadingAudio}
                      className={`
                                flex items-center justify-center w-14 h-14 rounded-full shadow-lg border-4 border-white transition-all
                                ${isPlaying ? 'bg-red-500 text-white animate-pulse' : 'bg-kid-blue text-white hover:bg-teal-400 hover:scale-110'}
                                ${audioError ? 'bg-slate-400 border-slate-200' : ''}
                            `}
                    >
                      {isLoadingAudio ? <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div> : isPlaying ? <span className="text-3xl">⏹</span> : <span className="text-3xl">🔊</span>}
                    </button>
                  </div>
                )}
              </div>

              {/* TEXT AREA (Inner Pages Only): Use custom book-text-container class */}
              {currentPageIndex !== 0 && (
                <div className="w-full book-text-container flex items-center justify-between flex-1">

                  {audioEnabled && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleAudio(); }}
                      disabled={isLoadingAudio}
                      className={`
                                shrink-0 flex items-center justify-center w-12 h-12 rounded-full shadow-sm transition-all mr-6
                                ${isPlaying ? 'bg-red-500 text-white animate-pulse' : 'bg-kid-blue text-white hover:bg-teal-400'}
                                ${isLoadingAudio ? 'opacity-70 cursor-wait' : ''}
                                ${audioError ? 'bg-slate-400' : ''}
                            `}
                    >
                      {isLoadingAudio ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : isPlaying ? <span className="text-2xl">⏹</span> : <span className="text-2xl">🔊</span>}
                    </button>
                  )}

                  <div className="flex-1 text-center flex items-center justify-center">
                    <p className="book-text">
                      {currentPage.hebrewText}
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="w-full aspect-square flex flex-col items-center justify-center bg-slate-100">
              <div className="w-12 h-12 border-4 border-kid-blue border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="font-bold text-slate-500">מצייר רגע קסום...</p>
            </div>
          )}
        </div>
      </div>

      <div className="w-full bg-white/10 backdrop-blur-md p-6 flex justify-center items-center gap-10">
        <button onClick={handlePrev} disabled={currentPageIndex === 0} className="w-14 h-14 bg-white/20 hover:bg-white/40 text-white rounded-full text-2xl disabled:opacity-20 transition-all">←</button>
        <span className="text-white font-bold bg-black/40 px-6 py-2 rounded-full">
          עמוד {currentPageIndex + 1} מתוך {totalPages}
        </span>
        <button onClick={handleNext} disabled={currentPageIndex === totalPages - 1} className="w-14 h-14 bg-kid-yellow hover:bg-yellow-400 text-slate-900 rounded-full text-2xl disabled:opacity-20 transition-all">→</button>
      </div>

      {isExporting && (
        <div className="fixed inset-0 z-[400] bg-slate-900/90 flex items-center justify-center text-white">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-kid-blue border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
            <h3 className="text-2xl font-bold font-fredoka">{exportProgress}</h3>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookViewer;
