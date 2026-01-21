'use client'

import React, { useState } from 'react'

interface ApiKeyModalProps {
    onKeySubmit: (key: string) => void
    onChangeKey?: () => void
    isVisible: boolean
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onKeySubmit, isVisible }) => {
    const [apiKey, setApiKey] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!apiKey.trim()) {
            setError('נא להזין מפתח API')
            return
        }

        if (!apiKey.startsWith('AIza')) {
            setError('מפתח API לא תקין. מפתח Gemini מתחיל ב-AIza')
            return
        }

        setIsLoading(true)
        setError('')

        // Small delay for UX
        await new Promise(resolve => setTimeout(resolve, 500))

        onKeySubmit(apiKey.trim())
        setIsLoading(false)
    }

    if (!isVisible) return null

    return (
        <div className="fixed inset-0 bg-gradient-to-br from-sky-100 via-blue-50 to-teal-50 z-[200] flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-10 border-4 border-kid-blue/20 animate-fade-in">
                <div className="text-center mb-8">
                    <div className="text-6xl mb-4">🔑</div>
                    <h1 className="text-3xl font-black text-slate-800 mb-2">!ברוכים הבאים</h1>
                    <p className="text-slate-600 leading-relaxed">
                        כדי להתחיל ליצור ספרים קסומים, נא להזין את מפתח ה-API של Gemini שלך
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="apiKey" className="block text-sm font-bold text-slate-700 mb-2 text-right">
                            Gemini API Key
                        </label>
                        <input
                            id="apiKey"
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="AIza..."
                            className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-4 text-lg focus:border-kid-blue focus:ring-0 outline-none transition-colors text-left font-mono"
                            dir="ltr"
                        />
                        {error && (
                            <p className="text-red-500 text-sm mt-2 text-right">{error}</p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-kid-blue hover:bg-teal-400 text-white font-bold py-4 rounded-2xl shadow-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                מתחבר...
                            </>
                        ) : (
                            <>
                                התחל ליצור ✨
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-slate-100">
                    <p className="text-sm text-slate-400 text-center leading-relaxed">
                        אין לך מפתח?{' '}
                        <a
                            href="https://aistudio.google.com/app/apikey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-kid-blue underline hover:text-teal-500 font-bold"
                        >
                            קבל מפתח בחינם מ-Google AI Studio
                        </a>
                    </p>
                    <p className="text-xs text-slate-300 mt-3 text-center">
                        🔒 המפתח נשמר רק בדפדפן שלך ולא נשלח לשום שרת
                    </p>
                </div>
            </div>
        </div>
    )
}

export default ApiKeyModal
