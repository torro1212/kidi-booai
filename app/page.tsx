'use client'

import React, { useState, useCallback, useEffect } from 'react'
import Header from '@/components/Header'
import Hero from '@/components/Hero'
import CreationForm from '@/components/CreationForm'
import BookViewer from '@/components/BookViewer'
import BookEditor from '@/components/BookEditor'
import ApiKeyModal from '@/components/ApiKeyModal'
import BooksGallery from '@/components/BooksGallery'
import AutoPilot from '@/components/AutoPilot'
import BookImporter from '@/components/BookImporter'
import { AppView, Book, BookRequest, GenerationStatus } from '@/types'
import { generateBookContent } from '@/services/geminiService'
import { startBackgroundMode, stopBackgroundMode } from '@/services/backgroundMode'
import { apiKeyManager } from '@/services/apiKeyManager'

export default function Home() {
    const [currentView, setCurrentView] = useState<AppView>(AppView.HOME)
    const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE)
    const [currentBook, setCurrentBook] = useState<Book | null>(null)
    const [hasApiKey, setHasApiKey] = useState<boolean | null>(null)
    const [showGallery, setShowGallery] = useState(false)

    // Check for API key on mount
    useEffect(() => {
        setHasApiKey(apiKeyManager.hasKey())
    }, [])

    const handleApiKeySubmit = useCallback((key: string) => {
        apiKeyManager.setKey(key)
        setHasApiKey(true)
    }, [])

    const handleChangeKey = useCallback(() => {
        apiKeyManager.removeKey()
        setHasApiKey(false)
    }, [])

    const handleNavigate = useCallback((view: AppView) => {
        setCurrentView(view)
        if (view === AppView.CREATE) {
            setStatus(GenerationStatus.IDLE)
        }
    }, [])

    const handleCreateBook = useCallback(async (request: BookRequest) => {
        setStatus(GenerationStatus.GENERATING_TEXT)

        // Enable background mode to prevent mobile from suspending
        await startBackgroundMode()

        try {
            const book = await generateBookContent(request)
            setCurrentBook(book)
            setStatus(GenerationStatus.SUCCESS)
            setCurrentView(AppView.EDITOR)
        } catch (error: any) {
            console.error(error)
            setStatus(GenerationStatus.ERROR)
            // Show copyright error or general error
            if (error.message?.includes('מוגן')) {
                alert(error.message)
            } else {
                alert('Oops! Something went wrong while crafting your story. Please try again.')
            }
        } finally {
            stopBackgroundMode() // Release wake lock
        }
    }, [])

    const handleUpdateBook = useCallback((updatedBook: Book) => {
        setCurrentBook(updatedBook)
    }, [])

    // Show loading state while checking for API key
    if (hasApiKey === null) {
        return null
    }

    return (
        <>
            {/* API Key Modal */}
            <ApiKeyModal
                isVisible={!hasApiKey}
                onKeySubmit={handleApiKeySubmit}
            />

            {/* Books Gallery Modal */}
            {showGallery && (
                <BooksGallery onClose={() => setShowGallery(false)} />
            )}

            <div className="min-h-screen flex flex-col font-sans text-slate-800">
                {/* Hide Header in Editor/Reading/AutoPilot modes for immersion/focus */}
                {currentView !== AppView.READING && currentView !== AppView.EDITOR && currentView !== AppView.AUTO_PILOT && currentView !== AppView.RE_EDIT && (
                    <Header
                        onNavigate={handleNavigate}
                        onChangeKey={handleChangeKey}
                        onShowGallery={() => setShowGallery(true)}
                    />
                )}

                <main className="flex-grow">
                    {currentView === AppView.HOME && (
                        <Hero
                            onStart={() => setCurrentView(AppView.CREATE)}
                            onAutoPilot={() => setCurrentView(AppView.AUTO_PILOT)}
                            onReEdit={() => setCurrentView(AppView.RE_EDIT)}
                        />
                    )}

                    {currentView === AppView.CREATE && (
                        <CreationForm
                            onSubmit={handleCreateBook}
                            isLoading={status === GenerationStatus.GENERATING_TEXT}
                        />
                    )}

                    {currentView === AppView.EDITOR && currentBook && (
                        <BookEditor
                            book={currentBook}
                            onUpdateBook={handleUpdateBook}
                            onPreview={() => setCurrentView(AppView.READING)}
                            onBack={() => setCurrentView(AppView.CREATE)}
                        />
                    )}

                    {currentView === AppView.READING && currentBook && (
                        <BookViewer
                            book={currentBook}
                            onUpdateBook={handleUpdateBook}
                            onClose={() => setCurrentView(AppView.EDITOR)}
                        />
                    )}

                    {currentView === AppView.AUTO_PILOT && (
                        <AutoPilot
                            onBack={() => setCurrentView(AppView.HOME)}
                        />
                    )}

                    {currentView === AppView.RE_EDIT && (
                        <BookImporter
                            onBookLoaded={(book) => {
                                setCurrentBook(book);
                                setCurrentView(AppView.EDITOR);
                            }}
                            onBack={() => setCurrentView(AppView.HOME)}
                        />
                    )}
                </main>

                {currentView === AppView.HOME && (
                    <footer className="bg-white py-8 border-t border-slate-100">
                        <div className="max-w-7xl mx-auto px-4 text-center text-slate-400 relative">
                            <p>© {new Date().getFullYear()} KidCraft AI. Making learning magical.</p>
                            <p className="text-xs text-slate-300 mt-2">v2.1</p>
                        </div>
                    </footer>
                )}
            </div>
        </>
    )
}
