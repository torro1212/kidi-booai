'use client'

import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Book, BookPage, PreviousBookContext } from '@/types'
import { generatePageImage, generatePageAudio, analyzeBookPdf } from '@/services/geminiService'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import { ComicImageWithText } from '@/components/ComicImageWithText'
import { composeComicImageWithCaptions } from '@/lib/comicComposer'
import { audioBufferToMp3, generateBookSummary } from '@/utils/audioUtils'

interface BookEditorProps {
  book: Book;
  onUpdateBook: (updatedBook: Book) => void;
  onPreview: () => void;
  onBack: () => void;
  onCreateSequel?: (book: Book) => void;
}

const BookEditor: React.FC<BookEditorProps> = ({ book, onUpdateBook, onPreview, onBack, onCreateSequel }) => {
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [isRegenerating, setIsRegenerating] = useState<Set<number>>(new Set());
  const [globalLoading, setGlobalLoading] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');
  const audioContextRef = useRef<AudioContext | null>(null);

  // Sequel dropdown state
  const [showSequelMenu, setShowSequelMenu] = useState(false);
  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);
  const sequelFileInputRef = useRef<HTMLInputElement>(null);

  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);
  const [tempMetadata, setTempMetadata] = useState(book.metadata);

  // Update temp metadata when book changes
  useEffect(() => {
    setTempMetadata(book.metadata);
  }, [book.metadata]);

  const handleSaveSettings = () => {
    onUpdateBook({ ...book, metadata: tempMetadata });
    setShowSettings(false);
  };


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

  // Helper to get dimensions from dataURL
  const getDataUrlImageSize = (dataUrl: string): Promise<{ w: number; h: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
      img.onerror = reject;
      img.src = dataUrl;
    });
  };

  const toggleSelection = (index: number) => {
    const newSet = new Set(selectedPages);
    if (newSet.has(index)) { newSet.delete(index); } else { newSet.add(index); }
    setSelectedPages(newSet);
  };

  const selectAll = () => {
    if (selectedPages.size === book.pages.length) { setSelectedPages(new Set()); }
    else { setSelectedPages(new Set(book.pages.map((_, i) => i))); }
  };

  // Helper to read file as base64
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Handle file upload for sequel
  const handleSequelFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onCreateSequel) return;
    setShowSequelMenu(false);

    if (file.type === 'application/json') {
      // Handle JSON
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target?.result as string) as Book;
          if (json.metadata && json.pages) {
            // Create context from JSON and trigger sequel
            const context: PreviousBookContext = {
              title: json.metadata.title,
              summary: json.pages.map(p => p.hebrewText).join('\n'),
              characterDescription: json.metadata.mainCharacterDescription,
              secondaryCharacterDescription: json.metadata.secondaryCharacterDescription,
              artStyle: json.metadata.artStyle,
              baseCharacterImage: json.metadata.baseCharacterImageUrl || json.pages.find(p => p.generatedImageUrl)?.generatedImageUrl
            };
            // Pass as a "fake" book with context attached for the onCreateSequel handler
            const fakeBook = { ...book, _sequelContext: context } as any;
            onCreateSequel(fakeBook);
          } else {
            alert("קובץ JSON לא תקין. נא להעלות קובץ שנוצר באפליקציה.");
          }
        } catch (err) {
          alert("שגיאה בקריאת הקובץ");
          console.error(err);
        }
      };
      reader.readAsText(file);
    } else if (file.type === 'application/pdf') {
      // Handle PDF
      setIsAnalyzingFile(true);
      try {
        const base64 = await readFileAsBase64(file);
        const context = await analyzeBookPdf(base64);
        // Pass as a "fake" book with context attached
        const fakeBook = { ...book, _sequelContext: context } as any;
        onCreateSequel(fakeBook);
      } catch (err) {
        console.error(err);
        alert("לא הצלחנו לנתח את ה-PDF. אנא נסה שוב.");
      } finally {
        setIsAnalyzingFile(false);
      }
    } else {
      alert("נא להעלות קובץ JSON או PDF בלבד.");
    }
    // Reset file input
    if (sequelFileInputRef.current) {
      sequelFileInputRef.current.value = '';
    }
  };

  const handlePromptChange = (index: number, newPrompt: string) => {
    const newPages = [...book.pages];
    newPages[index] = { ...newPages[index], imagePrompt: newPrompt };
    onUpdateBook({ ...book, pages: newPages });
  };

  const handleTextChange = (index: number, newText: string) => {
    const newPages = [...book.pages];
    newPages[index] = { ...newPages[index], hebrewText: newText };
    onUpdateBook({ ...book, pages: newPages });
  };

  const handlePanelCaptionChange = (index: number, panel: 'A' | 'B' | 'C' | 'D', newText: string) => {
    const newPages = [...book.pages];
    if (!newPages[index].panelCaptions) return;

    newPages[index] = {
      ...newPages[index],
      panelCaptions: {
        ...newPages[index].panelCaptions!,
        [panel]: newText
      }
    };
    onUpdateBook({ ...book, pages: newPages });
  };

  // Main generation function
  const generateImagesForIndices = async (indices: number[]) => {
    if (indices.length === 0) return;

    setGlobalLoading(true);

    // Mark these as regenerating for UI spinners
    const newRegenerating = new Set(isRegenerating);
    indices.forEach(i => newRegenerating.add(i));
    setIsRegenerating(newRegenerating);

    // We work on a copy of pages to avoid state tearing, but we also update main state incrementally
    const workingPages = [...book.pages];

    // Find reference image from metadata or existing pages
    let referenceImage = book.metadata.baseCharacterImageUrl || workingPages.find(p => p.generatedImageUrl)?.generatedImageUrl;

    // Process sequentially
    for (const i of indices) {
      try {
        const isCover = i === 0;
        const textToRender = isCover ? book.metadata.title : undefined;

        // COMIC LOGIC: If we have panels AND art style is comic, construct a strict 4-panel prompt
        // Note: AI models generate LTR (Panel 1=TL, 2=TR). 
        // Hebrew is RTL (A=TR, B=TL).
        // So we must map: Panel 1 (TL) -> Scene B
        //                Panel 2 (TR) -> Scene A
        //                Panel 3 (BL) -> Scene D
        //                Panel 4 (BR) -> Scene C
        const isComicStyle = book.metadata.artStyle.toLowerCase().includes('comic');
        let promptToUse = workingPages[i].imagePrompt;
        if (!isCover && isComicStyle && workingPages[i].panels) {
          const p = workingPages[i].panels!;
          promptToUse = `comic strip 4-panel layout, 2x2 grid.
Panel 1 (Top-Left): ${p.B?.scene || ''}
Panel 2 (Top-Right): ${p.A?.scene || ''}
Panel 3 (Bottom-Left): ${p.D?.scene || ''}
Panel 4 (Bottom-Right): ${p.C?.scene || ''}`;
        }

        const url = await generatePageImage(
          promptToUse,
          fullCharacterDescription,
          book.metadata.artStyle,
          referenceImage || undefined,
          isCover,
          textToRender,
          book.metadata.characterColorPalette,
          isCover ? undefined : workingPages[i].hebrewText
        );

        if (url) {
          workingPages[i] = { ...workingPages[i], generatedImageUrl: url };

          // Save first INNER page (not cover) as permanent reference for character consistency
          // Cover (i=0) uses a different model and includes text, so we prefer page 1
          if (!book.metadata.baseCharacterImageUrl && i === 1) {
            console.log("Saving page 1 as character reference image");
            referenceImage = url;
            onUpdateBook({
              ...book,
              pages: [...workingPages],
              metadata: { ...book.metadata, baseCharacterImageUrl: url }
            });
          } else {
            if (!referenceImage && (i === 0 || i === 1)) {
              referenceImage = url;
            }
            onUpdateBook({ ...book, pages: [...workingPages] });
          }
        }
      } catch (error) {
        console.error(`Failed to generate image for page ${i}`, error);
      } finally {
        setIsRegenerating(prev => {
          const next = new Set(prev);
          next.delete(i);
          return next;
        });
      }
    }
    setGlobalLoading(false);
  };

  const handleRegenerateSelected = () => { generateImagesForIndices(Array.from(selectedPages)); };
  const handleSingleRegenerate = (index: number) => { generateImagesForIndices([index]); };

  // AUTO-GENERATE EFFECT
  useEffect(() => {
    const missingIndices = book.pages
      .map((page, index) => page.generatedImageUrl ? -1 : index)
      .filter(index => index !== -1);

    if (missingIndices.length > 0 && !globalLoading && isRegenerating.size === 0) {
      console.log("Auto-generating missing images for indices:", missingIndices);
      generateImagesForIndices(missingIndices);
    }
  }, []); // Run once on mount

  const prepareExportCanvas = async (i: number, imgUrl: string) => {
    const isCover = i === 0;

    // EXPORT LAYOUT STRATEGY:
    // Cover: 1024x1024 Square
    // Inner: 1024x1280 Rectangle (1024x1024 Image Top, 1024x256 Text Bottom)

    const width = 1024;
    const height = isCover ? 1024 : 1280;

    const container = document.createElement('div');
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.backgroundColor = '#ffffff'; // White background
    container.style.overflow = 'hidden';

    if (isCover) {
      container.innerHTML = `<img src="${imgUrl}" style="width: 1024px; height: 1024px; object-fit: cover;" />`;
    } else {
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
    if (isExporting || globalLoading) return;
    setIsExporting(true);
    setExportProgress('מכין חבילה...');

    const zip = new JSZip();
    // Use A4 for standard printing support
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;

    const updatedPages = [...book.pages];
    const audioEnabled = book.metadata.audioConfig?.enabled;
    const voiceName = book.metadata.audioConfig?.voiceName || 'Puck';

    try {
      // Add sequel data JSON
      zip.file("sequel_data.json", JSON.stringify(book, null, 2));

      // Add book summary text file (AI-generated marketing blurb)
      // Important: Convert to UTF-8 Blob to preserve Hebrew characters
      const bookSummary = await generateBookSummary(book);
      const summaryBlob = new Blob([bookSummary], { type: 'text/plain;charset=utf-8' });
      zip.file("BOOK_SUMMARY.txt", summaryBlob);

      for (let i = 0; i < book.pages.length; i++) {
        setExportProgress(`מעבד עמוד ${i + 1}/${book.pages.length}...`);

        let imgUrl = updatedPages[i].generatedImageUrl;
        const isCover = i === 0;

        if (!imgUrl) {
          // Generate on fly if missing during export
          let referenceImage = book.metadata.baseCharacterImageUrl || updatedPages.find(p => p.generatedImageUrl)?.generatedImageUrl;
          const textToRender = isCover ? book.metadata.title : undefined;

          imgUrl = await generatePageImage(
            updatedPages[i].imagePrompt,
            fullCharacterDescription,
            book.metadata.artStyle,
            referenceImage || undefined,
            isCover,
            textToRender,
            book.metadata.characterColorPalette,
            isCover ? undefined : updatedPages[i].hebrewText
          ) || undefined;
          if (imgUrl) {
            updatedPages[i].generatedImageUrl = imgUrl;
            if (!referenceImage && (i === 0 || i === 1)) referenceImage = imgUrl;
            onUpdateBook({ ...book, pages: updatedPages });
          }
        }

        if (imgUrl) {
          const isCover = i === 0;
          const isComicInner = book.metadata.artStyle.toLowerCase().includes('comic') && !isCover && updatedPages[i].hebrewText;

          if (isComicInner) {
            // COMIC INNER PAGE: Use compositor only, no canvas
            try {
              const compositeDataUrl = await composeComicImageWithCaptions({
                imageUrl: imgUrl,
                captions: updatedPages[i].panelCaptions,
                text: updatedPages[i].panelCaptions ? undefined : updatedPages[i].hebrewText,
                captionRatio: 0.15
              });

              // ZIP: PNG blob
              const res = await fetch(compositeDataUrl);
              const exportBlob = await res.blob();
              zip.file(`PAGE_${String(i).padStart(2, '0')}.png`, exportBlob);

              // PDF: PNG format
              const { w, h } = await getDataUrlImageSize(compositeDataUrl);
              const ratio = h / w;
              let renderWidth = pageWidth;
              let renderHeight = pageWidth * ratio;

              if (renderHeight > 297) {
                const scale = 297 / renderHeight;
                renderHeight = 297;
                renderWidth = pageWidth * scale;
              }
              const xOffset = (210 - renderWidth) / 2;

              pdf.addImage(compositeDataUrl, 'PNG', xOffset, 0, renderWidth, renderHeight);
              if (i < book.pages.length - 1) pdf.addPage();

            } catch (err) {
              console.error(`Comic composition failed for export on page ${i}:`, err);
              throw new Error(`Failed to compose comic page ${i}. Aborting export.`);
            }

          } else {
            // STANDARD EXPORT (Cover or non-comic)
            const canvas = await prepareExportCanvas(i, imgUrl);
            const exportBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));

            if (exportBlob) {
              zip.file(i === 0 ? '00_COVER.png' : `PAGE_${String(i).padStart(2, '0')}.png`, exportBlob);
            }

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

        if (audioEnabled) {
          if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

          let textForAudio = i === 0 ? book.metadata.title : updatedPages[i].hebrewText;
          if (i > 0 && updatedPages[i].panelCaptions) {
            textForAudio = [
              updatedPages[i].panelCaptions!.A,
              updatedPages[i].panelCaptions!.B,
              updatedPages[i].panelCaptions!.C,
              updatedPages[i].panelCaptions!.D
            ].join('. ');
          }

          const buf = await generatePageAudio(textForAudio, audioContextRef.current, voiceName);
          if (buf) {
            // Convert to MP3 and add to ZIP
            const mp3Blob = await audioBufferToMp3(buf);
            zip.file(i === 0 ? '00_AUDIO_Title.mp3' : `AUDIO_Page_${String(i).padStart(2, '0')}.mp3`, mp3Blob);
          }
        }
      }

      const pdfBlob = pdf.output('blob');
      zip.file(`${book.metadata.title}.pdf`, pdfBlob);

      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      // Clean filename, just the book title
      const safeTitle = book.metadata.title.replace(/[\\/:*?"<>|]/g, '_');
      link.download = `${safeTitle}.zip`;
      link.click();
    } catch (error) {
      console.error("Export failed:", error);
      alert("הייצוא נכשל.");
    } finally {
      setIsExporting(false);
      setExportProgress('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors">← חזרה</button>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">✏️ סטודיו לעריכה: <span className="text-kid-blue">{book.metadata.title}</span></h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-400 mr-2 hidden sm:block">{selectedPages.size} נבחרו</div>
            {onCreateSequel && (
              <div className="relative">
                <button
                  onClick={() => setShowSequelMenu(!showSequelMenu)}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded-lg text-sm transition-all shadow-md flex items-center gap-2"
                  title="צור ספר המשך"
                >
                  🔄 צור ספר המשך ▾
                </button>

                {/* Dropdown Menu */}
                {showSequelMenu && (
                  <div className="absolute top-full mt-2 right-0 bg-slate-700 rounded-lg shadow-xl border border-slate-600 overflow-hidden z-50 min-w-[200px]">
                    <button
                      onClick={() => { setShowSequelMenu(false); onCreateSequel(book); }}
                      className="w-full px-4 py-3 text-right text-sm text-white hover:bg-slate-600 transition-colors flex items-center gap-2"
                    >
                      📖 מהספר הנוכחי
                    </button>
                    <button
                      onClick={() => { setShowSequelMenu(false); sequelFileInputRef.current?.click(); }}
                      className="w-full px-4 py-3 text-right text-sm text-white hover:bg-slate-600 transition-colors flex items-center gap-2 border-t border-slate-600"
                    >
                      📂 העלה קובץ (PDF/JSON)
                    </button>
                  </div>
                )}

                {/* Hidden file input */}
                <input
                  ref={sequelFileInputRef}
                  type="file"
                  accept=".json,.pdf"
                  onChange={handleSequelFileUpload}
                  className="hidden"
                />
              </div>
            )}
            <button onClick={handleDownloadZIP} disabled={isExporting || globalLoading} className="bg-kid-orange hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition-all shadow-md flex items-center gap-2 disabled:opacity-50">
              {isExporting ? <span className="animate-spin">⏳</span> : '📦'} הורד ZIP
            </button>
            <button onClick={handleRegenerateSelected} disabled={selectedPages.size === 0 || globalLoading} className="bg-kid-blue/20 hover:bg-kid-blue/40 text-kid-blue border border-kid-blue/50 font-bold py-2 px-4 rounded-lg text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2">
              {globalLoading ? <span className="animate-spin">⏳</span> : '⚡'} צור תמונות לנבחרים
            </button>
            <button onClick={() => setShowSettings(true)} className="bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold py-2 px-4 rounded-lg text-sm transition-all shadow-md flex items-center gap-2" title="הגדרות ספר">
              ⚙️ הגדרות
            </button>
            <button onClick={onPreview} className="bg-kid-yellow hover:bg-yellow-400 text-slate-900 font-bold py-2 px-6 rounded-lg text-sm transition-all shadow-lg transform hover:-translate-y-0.5 flex items-center gap-2">
              <span>📖</span> עבור לקריאה
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-slate-300">לוח העמודים</h2>
            <button onClick={selectAll} className="text-sm text-slate-400 hover:text-white underline">{selectedPages.size === book.pages.length ? 'בטל בחירה' : 'בחר הכל'}</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {book.pages.map((page, index) => (
              <div key={index} className={`relative bg-slate-800 rounded-xl overflow-hidden border-2 transition-all group ${selectedPages.has(index) ? 'border-kid-blue shadow-[0_0_15px_rgba(64,224,208,0.3)]' : 'border-slate-700 hover:border-slate-600'} `} onClick={() => toggleSelection(index)}>
                <div className="absolute top-3 left-3 z-20">
                  <input type="checkbox" checked={selectedPages.has(index)} onChange={() => { }} className="w-5 h-5 rounded border-slate-500 bg-slate-700 checked:bg-kid-blue cursor-pointer" />
                </div>

                <div className="aspect-square bg-slate-900 relative">
                  {page.generatedImageUrl ? (
                    book.metadata.artStyle.toLowerCase().includes('comic') && index !== 0 && page.hebrewText ? (
                      <ComicImageWithText
                        imageUrl={page.generatedImageUrl}
                        text={page.hebrewText}
                        className="w-full h-full"
                      />
                    ) : (
                      <img src={page.generatedImageUrl} alt={`Page ${index} `} className="w-full h-full object-cover" />
                    )
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-600">
                      <span className="text-4xl mb-2">🖼️</span>
                      <span className="text-xs">
                        {isRegenerating.has(index) ? 'מייצר תמונה...' : 'ממתין ליצירה...'}
                      </span>
                    </div>
                  )}

                  {isRegenerating.has(index) && (
                    <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center z-10">
                      <div className="w-8 h-8 border-2 border-kid-blue border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}

                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-2">
                    <button onClick={(e) => { e.stopPropagation(); handleSingleRegenerate(index); }} className="p-2 bg-white/10 hover:bg-white/30 rounded-full text-white backdrop-blur-sm" title="Regenerate this page">🔄</button>
                  </div>

                  <div className="absolute top-3 right-3 bg-black/50 backdrop-blur text-white text-xs font-bold px-2 py-1 rounded">{index === 0 ? 'כריכה' : `עמוד ${page.pageNumber} `}</div>
                </div>

                <div className="p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1 block">הנחיה לבינה מלאכותית (PROMPT)</label>
                    <textarea value={page.imagePrompt} onChange={(e) => handlePromptChange(index, e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-300 focus:border-kid-blue focus:ring-1 focus:ring-kid-blue outline-none resize-none h-24 scrollbar-thin" placeholder="תאר את הסצנה באנגלית..." />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1 block">טקסט בעברית</label>
                    {index === 0 ? (
                      <p className="text-xs text-slate-400" dir="rtl">{book.metadata.title}</p>
                    ) : (
                      <div className="space-y-2">
                        {/* Main Hebrew Summary Text */}
                        <textarea
                          value={page.hebrewText}
                          onChange={(e) => handleTextChange(index, e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-300 focus:border-kid-blue focus:ring-1 focus:ring-kid-blue outline-none resize-none h-16 scrollbar-thin"
                          placeholder="תקציר העמוד..."
                          dir="rtl"
                        />

                        {/* Comic Panel Captions (if available) - Hebrew RTL Order */}
                        {page.panelCaptions && (
                          <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-800">
                            <div className="col-span-2 text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-1">כיתובי קומיקס (לפי סדר הקריאה)</div>

                            {/* Panel A (Top-Right) - First in RTL */}
                            <div>
                              <label className="text-[9px] text-slate-500 block mb-0.5">A (ימין-למעלה)</label>
                              <textarea
                                value={page.panelCaptions.A}
                                onChange={(e) => handlePanelCaptionChange(index, 'A', e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-[10px] text-slate-300 focus:border-kid-blue outline-none resize-none h-14"
                                dir="rtl"
                              />
                            </div>

                            {/* Panel B (Top-Left) - Second in RTL */}
                            <div>
                              <label className="text-[9px] text-slate-500 block mb-0.5">B (שמאל-למעלה)</label>
                              <textarea
                                value={page.panelCaptions.B}
                                onChange={(e) => handlePanelCaptionChange(index, 'B', e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-[10px] text-slate-300 focus:border-kid-blue outline-none resize-none h-14"
                                dir="rtl"
                              />
                            </div>

                            {/* Panel C (Bottom-Right) - Third in RTL */}
                            <div>
                              <label className="text-[9px] text-slate-500 block mb-0.5">C (ימין-למטה)</label>
                              <textarea
                                value={page.panelCaptions.C}
                                onChange={(e) => handlePanelCaptionChange(index, 'C', e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-[10px] text-slate-300 focus:border-kid-blue outline-none resize-none h-14"
                                dir="rtl"
                              />
                            </div>

                            {/* Panel D (Bottom-Left) - Fourth in RTL */}
                            <div>
                              <label className="text-[9px] text-slate-500 block mb-0.5">D (שמאל-למטה)</label>
                              <textarea
                                value={page.panelCaptions.D}
                                onChange={(e) => handlePanelCaptionChange(index, 'D', e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-[10px] text-slate-300 focus:border-kid-blue outline-none resize-none h-14"
                                dir="rtl"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isExporting && (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 flex items-center justify-center text-white">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-kid-blue border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
            <h3 className="text-2xl font-bold font-fredoka">{exportProgress}</h3>
          </div>
        </div>
      )}

      {isAnalyzingFile && (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 flex items-center justify-center text-white">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
            <h3 className="text-2xl font-bold font-fredoka">מנתח את הספר...</h3>
            <p className="text-slate-400 mt-2">מחלץ דמויות וסגנון אמנותי</p>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-700 flex justify-between items-center sticky top-0 bg-slate-800 z-10">
              <h3 className="text-xl font-bold text-white">⚙️ הגדרות ספר ודמויות</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="p-6 space-y-6">

              {/* Secondary Character Timing Control */}
              <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                <h4 className="text-md font-bold text-kid-blue mb-2 flex items-center gap-2">
                  <span>⏱️</span> תזמון הופעת דמות משנית
                </h4>
                <p className="text-xs text-slate-400 mb-3">
                  באיזה עמוד בדיוק הדמות המשנית מופיעה לראשונה בטקסט?
                  הבינה המלאכותית לא תצייר את הדמות המשנית בעמודים שלפני עמוד זה.
                </p>
                <div className="flex items-center gap-4">
                  <label className="text-sm text-slate-300">עמוד ראשון להופעה:</label>
                  <input
                    type="number"
                    min="1"
                    max={book.pages.length}
                    value={tempMetadata.secondaryCharacterIntroPage || 0}
                    onChange={(e) => setTempMetadata({ ...tempMetadata, secondaryCharacterIntroPage: parseInt(e.target.value) || 0 })}
                    className="bg-slate-950 border border-slate-600 rounded px-3 py-1 w-20 text-center text-white focus:border-kid-blue outline-none"
                  />
                  <span className="text-xs text-slate-500">(0 = אין דמות משנית / לא הוגדר)</span>
                </div>
              </div>

              {/* Character Descriptions */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-1">תיאור דמות ראשית</label>
                  <textarea
                    value={tempMetadata.mainCharacterDescription}
                    onChange={(e) => setTempMetadata({ ...tempMetadata, mainCharacterDescription: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-600 rounded-lg p-3 text-sm text-slate-200 focus:border-kid-blue outline-none h-24 resize-none"
                    placeholder="תיאור מלא של הדמות הראשית..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-1">סימן היכר (דמות ראשית)</label>
                  <input
                    type="text"
                    value={tempMetadata.mainCharacterDistinctiveMark}
                    onChange={(e) => setTempMetadata({ ...tempMetadata, mainCharacterDistinctiveMark: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-600 rounded-lg p-2 text-sm text-slate-200 focus:border-kid-blue outline-none"
                  />
                </div>

                <div className="pt-4 border-t border-slate-700">
                  <label className="block text-sm font-bold text-slate-300 mb-1">תיאור דמות משנית (אופציונלי)</label>
                  <textarea
                    value={tempMetadata.secondaryCharacterDescription || ''}
                    onChange={(e) => setTempMetadata({ ...tempMetadata, secondaryCharacterDescription: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-600 rounded-lg p-3 text-sm text-slate-200 focus:border-kid-blue outline-none h-24 resize-none"
                    placeholder="תיאור הדמות המשנית..."
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-700 bg-slate-800 sticky bottom-0 flex justify-end gap-3">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-6 py-2 bg-kid-blue hover:bg-blue-600 text-white font-bold rounded-lg shadow-lg transition-all"
              >
                שמור שינויים
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookEditor;
