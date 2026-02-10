'use client'

import React, { useState, useRef, useCallback } from 'react'
import { AutoPilotStory, AutoPilotStoriesFile, AutoPilotProgress, Book, AppView } from '@/types'
import { parseStoriesJson, processAutoPilotQueue } from '@/services/autoPilotService'
import { generatePageImage, generatePageAudio } from '@/services/geminiService'
import { composeComicImageWithCaptions } from '@/lib/comicComposer'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import { audioBufferToMp3, generateBookSummary } from '@/utils/audioUtils'

interface AutoPilotProps {
    onBack: () => void;
}

const AutoPilot: React.FC<AutoPilotProps> = ({ onBack }) => {
    const [stories, setStories] = useState<AutoPilotStory[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState<AutoPilotProgress | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const abortRef = useRef(false);

    const addLog = (message: string) => {
        const timestamp = new Date().toLocaleTimeString('he-IL');
        setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const content = event.target?.result as string;
                const parsed = parseStoriesJson(content);
                setStories(parsed.stories);
                addLog(`✅ נטען קובץ עם ${parsed.stories.length} עלילות`);
            } catch (error: any) {
                addLog(`❌ שגיאה: ${error.message}`);
                alert(error.message);
            }
        };
        reader.readAsText(file, 'utf-8');

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Prepare export canvas with image on top and text below (matching BookEditor layout)
    const prepareExportCanvas = async (page: any, isCover: boolean, imgUrl: string): Promise<HTMLCanvasElement> => {
        // EXPORT LAYOUT STRATEGY:
        // Cover: 1024x1024 Square
        // Inner: 1024x1280 Rectangle (1024x1000 Image Top, 1024x280 Text Bottom)

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
            container.innerHTML = `<img src="${imgUrl}" style="width: 1024px; height: 1024px; object-fit: cover;" />`;
        } else {
            // Get text - either from panelCaptions or hebrewText
            let text = page.hebrewText || "";
            if (page.panelCaptions) {
                text = [
                    page.panelCaptions.A,
                    page.panelCaptions.B,
                    page.panelCaptions.C,
                    page.panelCaptions.D
                ].filter(Boolean).join(' ');
            }

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

    const downloadBookAsZip = async (book: Book) => {
        const zip = new JSZip();
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = 210;

        try {
            // Add sequel data JSON
            zip.file("sequel_data.json", JSON.stringify(book, null, 2));

            // Add book summary
            const bookSummary = await generateBookSummary(book);
            const summaryBlob = new Blob([bookSummary], { type: 'text/plain;charset=utf-8' });
            zip.file("BOOK_SUMMARY.txt", summaryBlob);

            // Process each page
            for (let i = 0; i < book.pages.length; i++) {
                const page = book.pages[i];
                const imgUrl = page.generatedImageUrl;
                const isCover = i === 0;

                if (imgUrl) {
                    try {
                        // Use prepareExportCanvas for ALL pages - creates image on top, text below
                        const canvas = await prepareExportCanvas(page, isCover, imgUrl);

                        // Export to blob for ZIP
                        const exportBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
                        if (exportBlob) {
                            zip.file(i === 0 ? '00_COVER.png' : `PAGE_${String(i).padStart(2, '0')}.png`, exportBlob);
                        }

                        // Add to PDF
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

                    } catch (err) {
                        console.error(`Failed to process page ${i}`, err);
                    }
                }

                // Generate audio if enabled
                if (book.metadata.audioConfig?.enabled) {
                    if (!audioContextRef.current) {
                        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                    }

                    let textForAudio = i === 0 ? book.metadata.title : page.hebrewText;
                    if (i > 0 && page.panelCaptions) {
                        textForAudio = [
                            page.panelCaptions.A,
                            page.panelCaptions.B,
                            page.panelCaptions.C,
                            page.panelCaptions.D
                        ].join('. ');
                    }

                    try {
                        const buf = await generatePageAudio(textForAudio, audioContextRef.current, book.metadata.audioConfig.voiceName || 'Puck');
                        if (buf) {
                            const mp3Blob = await audioBufferToMp3(buf);
                            zip.file(i === 0 ? '00_AUDIO_Title.mp3' : `AUDIO_Page_${String(i).padStart(2, '0')}.mp3`, mp3Blob);
                        }
                    } catch (err) {
                        console.error(`Failed to generate audio for page ${i}`, err);
                    }
                }
            }

            // Add PDF
            const pdfBlob = pdf.output('blob');
            zip.file(`${book.metadata.title}.pdf`, pdfBlob);

            // Generate and download ZIP
            const content = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            const safeTitle = book.metadata.title.replace(/[\\/:*?"<>|]/g, '_');
            link.download = `${safeTitle}.zip`;
            link.click();

            // Cleanup
            URL.revokeObjectURL(link.href);

        } catch (error) {
            console.error("Export failed:", error);
            throw error;
        }
    };

    const handleStart = async () => {
        if (stories.length === 0) {
            alert('נא להעלות קובץ JSON עם עלילות');
            return;
        }

        setIsRunning(true);
        abortRef.current = false;
        addLog(`🚀 מתחיל AUTO PILOT עבור ${stories.length} ספרים`);

        try {
            const generator = processAutoPilotQueue(stories, async (book, index) => {
                addLog(`📦 מוריד ZIP עבור: ${book.metadata.title}`);
                await downloadBookAsZip(book);
                addLog(`✅ הורדה הושלמה: ${book.metadata.title}`);
            });

            for await (const progressUpdate of generator) {
                if (abortRef.current) {
                    addLog('⛔ AUTO PILOT הופסק על ידי המשתמש');
                    break;
                }

                setProgress(progressUpdate);

                if (progressUpdate.status === 'generating') {
                    addLog(`📖 מייצר ספר ${progressUpdate.currentIndex + 1}/${progressUpdate.totalStories}: ${progressUpdate.currentStoryTitle}`);
                } else if (progressUpdate.status === 'waiting') {
                    addLog(`⏳ ממתין לפני הספר הבא (Rate Limit)...`);
                } else if (progressUpdate.status === 'error') {
                    addLog(`❌ שגיאה: ${progressUpdate.errorMessages[progressUpdate.errorMessages.length - 1]}`);
                }
            }

            if (!abortRef.current) {
                addLog(`🎉 AUTO PILOT הסתיים! ${progress?.completedBooks.length || 0}/${stories.length} ספרים נוצרו בהצלחה`);
            }

        } catch (error: any) {
            addLog(`❌ שגיאה כללית: ${error.message}`);
        } finally {
            setIsRunning(false);
        }
    };

    const handleStop = () => {
        abortRef.current = true;
        addLog('⏹️ מבקש לעצור את AUTO PILOT...');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
            {/* Header */}
            <header className="bg-slate-800/50 backdrop-blur border-b border-slate-700 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors">
                            ← חזרה
                        </button>
                        <h1 className="text-2xl font-bold flex items-center gap-3">
                            <span className="text-3xl">🤖</span>
                            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                                AUTO PILOT
                            </span>
                        </h1>
                    </div>
                </div>
            </header>

            <div className="max-w-4xl mx-auto px-4 py-8">
                {/* Settings Card */}
                <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 mb-6 border border-slate-700">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span>⚙️</span> הגדרות קבועות
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="bg-slate-700/50 rounded-lg p-3">
                            <div className="text-slate-400 text-xs">גיל</div>
                            <div className="font-bold">3-8</div>
                        </div>
                        <div className="bg-slate-700/50 rounded-lg p-3">
                            <div className="text-slate-400 text-xs">סגנון</div>
                            <div className="font-bold">3D קסום</div>
                        </div>
                        <div className="bg-slate-700/50 rounded-lg p-3">
                            <div className="text-slate-400 text-xs">עמודים</div>
                            <div className="font-bold">15</div>
                        </div>
                        <div className="bg-slate-700/50 rounded-lg p-3">
                            <div className="text-slate-400 text-xs">קול</div>
                            <div className="font-bold">רנדומלי</div>
                        </div>
                    </div>
                </div>

                {/* Upload Section */}
                <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 mb-6 border border-slate-700">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span>📁</span> העלאת קובץ עלילות
                    </h2>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleFileUpload}
                        className="hidden"
                    />

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isRunning}
                        className="w-full py-4 border-2 border-dashed border-slate-600 rounded-xl hover:border-purple-500 hover:bg-slate-700/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="text-4xl mb-2">📤</div>
                        <div className="font-medium">לחץ להעלאת קובץ JSON</div>
                        <div className="text-sm text-slate-400 mt-1">
                            {stories.length > 0 ? `${stories.length} עלילות נטענו` : 'בחר קובץ עם עלילות'}
                        </div>
                    </button>

                    {stories.length > 0 && (
                        <div className="mt-4 p-4 bg-green-900/30 border border-green-700/50 rounded-lg">
                            <div className="font-bold text-green-400 mb-2">✅ עלילות שנטענו:</div>
                            <div className="max-h-32 overflow-y-auto">
                                {stories.map((story, idx) => (
                                    <div key={idx} className="text-sm text-slate-300 py-1">
                                        {idx + 1}. {story.title} ({story.heroName})
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Progress Section */}
                {progress && (
                    <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 mb-6 border border-slate-700">
                        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <span>📊</span> התקדמות
                        </h2>

                        <div className="mb-4">
                            <div className="flex justify-between text-sm mb-2">
                                <span>{progress.currentStoryTitle}</span>
                                <span>{progress.currentIndex + 1}/{progress.totalStories}</span>
                            </div>
                            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                                    style={{ width: `${((progress.currentIndex + 1) / progress.totalStories) * 100}%` }}
                                />
                            </div>
                        </div>

                        <div className="flex gap-4 text-sm">
                            <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-3 flex-1">
                                <div className="text-green-400 font-bold">{progress.completedBooks.length}</div>
                                <div className="text-slate-400 text-xs">הושלמו</div>
                            </div>
                            <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 flex-1">
                                <div className="text-red-400 font-bold">{progress.errorMessages.length}</div>
                                <div className="text-slate-400 text-xs">שגיאות</div>
                            </div>
                            <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3 flex-1">
                                <div className="text-blue-400 font-bold">{progress.totalStories - progress.currentIndex - 1}</div>
                                <div className="text-slate-400 text-xs">נותרו</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Control Buttons */}
                <div className="flex gap-4 mb-6">
                    {!isRunning ? (
                        <button
                            onClick={handleStart}
                            disabled={stories.length === 0}
                            className="flex-1 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl font-bold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                        >
                            <span className="text-2xl">🚀</span>
                            התחל AUTO PILOT
                        </button>
                    ) : (
                        <button
                            onClick={handleStop}
                            className="flex-1 py-4 bg-red-600 hover:bg-red-500 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-3"
                        >
                            <span className="text-2xl">⏹️</span>
                            עצור
                        </button>
                    )}
                </div>

                {/* Logs Section */}
                <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span>📝</span> לוג פעילות
                    </h2>
                    <div className="h-64 overflow-y-auto bg-slate-900/50 rounded-lg p-4 font-mono text-sm">
                        {logs.length === 0 ? (
                            <div className="text-slate-500 text-center py-8">הלוג ריק</div>
                        ) : (
                            logs.map((log, idx) => (
                                <div key={idx} className="py-1 text-slate-300 border-b border-slate-800 last:border-0">
                                    {log}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AutoPilot;
