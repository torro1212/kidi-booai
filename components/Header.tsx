'use client'

import React from 'react'
import { AppView } from '@/types'

interface HeaderProps {
  onNavigate: (view: AppView) => void
  onChangeKey?: () => void
  onShowGallery?: () => void
}

const Header: React.FC<HeaderProps> = ({ onNavigate, onChangeKey, onShowGallery }) => {
  return (
    <header className="w-full bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div
            className="flex items-center cursor-pointer"
            onClick={() => onNavigate(AppView.HOME)}
          >
            <span className="text-3xl mr-2">🚀</span>
            <h1 className="text-2xl font-extrabold text-kid-blue tracking-tight">
              KidCraft <span className="text-kid-orange">AI</span>
            </h1>
          </div>
          <nav className="flex items-center gap-3">
            {onShowGallery && (
              <button
                onClick={onShowGallery}
                className="text-kid-blue hover:text-teal-600 px-3 py-1 rounded-full text-sm font-bold border border-kid-blue/30 hover:border-kid-blue transition-colors flex items-center gap-1"
                title="הספרים שלי"
              >
                📚 <span className="hidden sm:inline">הספרים שלי</span>
              </button>
            )}
            {onChangeKey && (
              <button
                onClick={onChangeKey}
                className="text-slate-400 hover:text-slate-600 px-3 py-1 rounded-full text-xs font-bold border border-slate-200 hover:border-slate-300 transition-colors flex items-center gap-1"
                title="החלף מפתח API"
              >
                🔑 <span className="hidden sm:inline">API</span>
              </button>
            )}
            <button
              onClick={() => onNavigate(AppView.CREATE)}
              className="bg-kid-yellow hover:bg-yellow-400 text-kid-text font-bold py-2 px-6 rounded-full transition-transform transform hover:scale-105 shadow-md"
            >
              Start Creating
            </button>
          </nav>
        </div>
      </div>
    </header>
  )
}

export default Header
