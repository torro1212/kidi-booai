'use client'

import React from 'react'

interface HeroProps {
  onStart: () => void
}

const Hero: React.FC<HeroProps> = ({ onStart }) => {
  return (
    <div className="relative overflow-hidden bg-sky-50 py-16 sm:py-24">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center">
        <h2 className="text-sm font-bold text-kid-blue uppercase tracking-wide mb-2">
          The Magic of AI for Kids
        </h2>
        <h1 className="text-4xl sm:text-6xl font-extrabold text-slate-800 mb-6 leading-tight">
          Create Magical Stories <br />
          <span className="text-kid-orange">In Seconds.</span>
        </h1>
        <p className="mt-4 text-xl text-slate-600 max-w-2xl mx-auto mb-10">
          Turn any idea into a fully illustrated children&apos;s book, complete with educational values,
          Hebrew translations, and beautiful characters.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={onStart}
            className="bg-kid-blue text-white text-xl font-bold py-4 px-10 rounded-full shadow-lg hover:bg-teal-400 hover:shadow-xl transition-all transform hover:-translate-y-1"
          >
            Create a Book Now ✨
          </button>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20 text-left">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="text-4xl mb-4">🎨</div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Instant Illustrations</h3>
            <p className="text-slate-600">Magical 3D Pixar-style visuals generated automatically for your story.</p>
          </div>
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="text-4xl mb-4">🧠</div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Educational Value</h3>
            <p className="text-slate-600">Every story comes with a tailored moral, learning goals, and age-appropriate language.</p>
          </div>
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="text-4xl mb-4">🌍</div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Bilingual</h3>
            <p className="text-slate-600">Automatic translation between English and Hebrew to support language learning.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Hero
