'use client'

import React, { useState, useEffect } from 'react'
import { getSavedBooks, SavedBook } from '@/services/firebase'

interface BooksGalleryProps {
    onClose: () => void
}

const BooksGallery: React.FC<BooksGalleryProps> = ({ onClose }) => {
    const [books, setBooks] = useState<SavedBook[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        loadBooks()
    }, [])

    const loadBooks = async () => {
        setLoading(true)
        setError(null)
        try {
            const savedBooks = await getSavedBooks()
            // Sort by date, newest first
            savedBooks.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds)
            setBooks(savedBooks)
        } catch (err) {
            console.error('Error loading books:', err)
            setError('שגיאה בטעינת הספרים. וודא שה-Firebase Rules מוגדרים נכון.')
        } finally {
            setLoading(false)
        }
    }

    const formatDate = (timestamp: { seconds: number }) => {
        const date = new Date(timestamp.seconds * 1000)
        return date.toLocaleDateString('he-IL', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="bg-gradient-to-r from-kid-blue to-teal-400 px-6 py-4 flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        📚 הספרים שלי
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="w-12 h-12 border-4 border-kid-blue border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="text-slate-500">טוען ספרים...</p>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                            <span className="text-4xl mb-2 block">⚠️</span>
                            <p className="text-red-600 font-bold mb-2">שגיאה</p>
                            <p className="text-red-500 text-sm">{error}</p>
                            <button
                                onClick={loadBooks}
                                className="mt-4 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm"
                            >
                                נסה שוב
                            </button>
                        </div>
                    )}

                    {!loading && !error && books.length === 0 && (
                        <div className="text-center py-12">
                            <span className="text-6xl mb-4 block">📖</span>
                            <p className="text-slate-500 text-lg">עדיין לא יצרת ספרים</p>
                            <p className="text-slate-400 text-sm mt-2">ספרים שתייצא יופיעו כאן</p>
                        </div>
                    )}

                    {!loading && !error && books.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {books.map((book) => (
                                <div
                                    key={book.id}
                                    className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-shadow border border-slate-200"
                                >
                                    {/* Thumbnail */}
                                    <div className="aspect-square bg-slate-200 relative">
                                        {book.thumbnailUrl ? (
                                            <img
                                                src={book.thumbnailUrl}
                                                alt={book.title}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-6xl">
                                                📕
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="p-4">
                                        <h3 className="font-bold text-slate-800 text-lg mb-1 truncate" title={book.title}>
                                            {book.title}
                                        </h3>
                                        <p className="text-slate-400 text-xs mb-3">
                                            {formatDate(book.createdAt)}
                                        </p>
                                        {book.drivePdfUrl || book.driveZipUrl ? (
                                            <div className="flex flex-col gap-2">
                                                {book.drivePdfUrl && (
                                                    <a
                                                        href={book.drivePdfUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="block w-full bg-kid-blue hover:bg-teal-400 text-white text-center py-2 rounded-lg font-bold text-sm transition-colors"
                                                    >
                                                        📄 PDF ב-Drive
                                                    </a>
                                                )}
                                                {book.driveZipUrl && (
                                                    <a
                                                        href={book.driveZipUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="block w-full bg-kid-orange hover:bg-orange-400 text-white text-center py-2 rounded-lg font-bold text-sm transition-colors"
                                                    >
                                                        📦 ZIP ב-Drive
                                                    </a>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-slate-400 text-xs text-center py-2">
                                                💾 שמור ב-Firestore בלבד
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-slate-100 px-6 py-4 bg-slate-50 text-center">
                    <p className="text-slate-400 text-sm">
                        {books.length > 0 ? `${books.length} ספרים נמצאו` : 'צור ספרים חדשים והם יופיעו כאן'}
                    </p>
                </div>
            </div>
        </div>
    )
}

export default BooksGallery
