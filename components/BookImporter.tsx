'use client'

import React, { useState, useRef } from 'react'
import { Book, AppView } from '@/types'

interface BookImporterProps {
    onBookLoaded: (book: Book) => void;
    onBack: () => void;
}

const BookImporter: React.FC<BookImporterProps> = ({ onBookLoaded, onBack }) => {
    const [loadedBook, setLoadedBook] = useState<Book | null>(null);
    const [error, setError] = useState<string>('');
    const [fileName, setFileName] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError('');
        setFileName(file.name);

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);

                // Validate it's a Book object
                if (!json.metadata || !json.pages || !Array.isArray(json.pages)) {
                    setError('קובץ JSON לא תקין - חייב להכיל metadata ו-pages');
                    return;
                }

                if (!json.metadata.title || !json.metadata.artStyle) {
                    setError('קובץ JSON חסר שדות חובה (title, artStyle)');
                    return;
                }

                if (json.pages.length === 0) {
                    setError('הספר לא מכיל עמודים');
                    return;
                }

                setLoadedBook(json as Book);
            } catch (err) {
                setError('שגיאה בקריאת הקובץ - ודא שזה קובץ JSON תקין');
            }
        };
        reader.readAsText(file);
    };

    const imagesCount = loadedBook?.pages.filter(p => p.generatedImageUrl).length || 0;
    const totalPages = loadedBook?.pages.length || 0;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-teal-900 text-white">
            {/* Header Bar */}
            <div className="bg-black/30 backdrop-blur-sm border-b border-white/10 px-4 py-3 flex items-center justify-between">
                <button
                    onClick={onBack}
                    className="text-white/70 hover:text-white flex items-center gap-2 transition-colors"
                >
                    ← חזרה
                </button>
                <h1 className="text-xl font-bold flex items-center gap-2">
                    ✏️ עריכת ספר קיים
                </h1>
                <div className="w-20" />
            </div>

            <div className="max-w-2xl mx-auto px-4 py-12">
                {/* Upload Section */}
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 mb-8">
                    <h2 className="text-2xl font-bold mb-2 text-center">📁 העלאת קובץ ספר</h2>
                    <p className="text-white/60 text-center mb-6" dir="rtl">
                        העלה את קובץ ה-<code className="bg-white/20 px-1 rounded">sequel_data.json</code> מתוך ה-ZIP שהורד
                    </p>

                    <div
                        className="border-2 border-dashed border-white/30 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-400/60 hover:bg-white/5 transition-all"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <div className="text-5xl mb-4">📄</div>
                        {fileName ? (
                            <p className="text-emerald-300 font-medium">{fileName}</p>
                        ) : (
                            <p className="text-white/50">לחץ כאן או גרור קובץ JSON</p>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            onChange={handleFileUpload}
                            className="hidden"
                        />
                    </div>

                    {error && (
                        <div className="mt-4 bg-red-500/20 border border-red-400/30 rounded-lg p-3 text-red-300 text-center" dir="rtl">
                            ❌ {error}
                        </div>
                    )}
                </div>

                {/* Book Preview */}
                {loadedBook && (
                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 animate-fadeIn">
                        <h2 className="text-2xl font-bold mb-6 text-center" dir="rtl">📖 תצוגה מקדימה</h2>

                        <div className="space-y-4" dir="rtl">
                            <div className="flex justify-between items-center bg-white/5 rounded-lg p-3">
                                <span className="text-white/60">שם הספר:</span>
                                <span className="font-bold text-emerald-300">{loadedBook.metadata.title}</span>
                            </div>
                            <div className="flex justify-between items-center bg-white/5 rounded-lg p-3">
                                <span className="text-white/60">סגנון אמנותי:</span>
                                <span className="font-medium">{loadedBook.metadata.artStyle}</span>
                            </div>
                            <div className="flex justify-between items-center bg-white/5 rounded-lg p-3">
                                <span className="text-white/60">מספר עמודים:</span>
                                <span className="font-medium">{totalPages}</span>
                            </div>
                            <div className="flex justify-between items-center bg-white/5 rounded-lg p-3">
                                <span className="text-white/60">תמונות זמינות:</span>
                                <span className={`font-medium ${imagesCount === totalPages ? 'text-emerald-300' : 'text-amber-300'}`}>
                                    {imagesCount} / {totalPages}
                                </span>
                            </div>
                            <div className="flex justify-between items-center bg-white/5 rounded-lg p-3">
                                <span className="text-white/60">דמות ראשית:</span>
                                <span className="font-medium text-sm">{loadedBook.metadata.mainCharacterDescription?.substring(0, 50)}...</span>
                            </div>
                        </div>

                        {/* Thumbnail preview of first few pages */}
                        {imagesCount > 0 && (
                            <div className="mt-6">
                                <p className="text-white/60 text-sm mb-3" dir="rtl">תצוגה מקדימה של עמודים:</p>
                                <div className="grid grid-cols-4 gap-2">
                                    {loadedBook.pages.slice(0, 8).map((page, i) => (
                                        <div key={i} className="aspect-square rounded-lg overflow-hidden bg-white/5 border border-white/10">
                                            {page.generatedImageUrl ? (
                                                <img
                                                    src={page.generatedImageUrl}
                                                    alt={`Page ${i}`}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-white/30 text-xs">
                                                    אין תמונה
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Action Button */}
                        <button
                            onClick={() => onBookLoaded(loadedBook)}
                            className="w-full mt-8 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xl font-bold py-4 px-8 rounded-xl shadow-lg hover:from-emerald-400 hover:to-teal-400 hover:shadow-xl transition-all transform hover:-translate-y-0.5"
                        >
                            ✏️ פתח בעורך
                        </button>

                        <p className="text-white/40 text-sm text-center mt-3" dir="rtl">
                            תוכל לערוך טקסט, ליצור מחדש תמונות נבחרות, ולהוריד ZIP מעודכן
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BookImporter;
