'use client'

import React from 'react';

interface ComicImageWithTextProps {
    imageUrl: string;
    text: string;
    className?: string;
}

// Smarter text splitter - tries to split at sentence boundaries
const splitTextIntoFour = (text: string): string[] => {
    // Try to split by sentences first
    const sentences = text.split(/([.!?।]+\s+)/).filter(s => s.trim());

    if (sentences.length >= 4) {
        // We have enough sentences, distribute them
        const parts: string[] = ['', '', '', ''];
        const sentencesPerPart = Math.ceil(sentences.length / 4);

        let partIndex = 0;
        sentences.forEach((sentence, i) => {
            if (partIndex < 3 && i > 0 && i % sentencesPerPart === 0) {
                partIndex++;
            }
            parts[partIndex] += sentence;
        });

        return parts.map(p => p.trim()).filter(p => p);
    }

    // Fallback: split by words if not enough sentences
    const words = text.split(' ').filter(w => w.trim());
    if (words.length < 4) {
        // Very short text, put one word per panel
        return [...words, '', '', ''].slice(0, 4);
    }

    const chunkSize = Math.ceil(words.length / 4);
    return [
        words.slice(0, chunkSize).join(' '),
        words.slice(chunkSize, chunkSize * 2).join(' '),
        words.slice(chunkSize * 2, chunkSize * 3).join(' '),
        words.slice(chunkSize * 3).join(' ')
    ].filter(part => part.trim());
};

export const ComicImageWithText: React.FC<ComicImageWithTextProps> = ({ imageUrl, text, className = '' }) => {
    const textParts = splitTextIntoFour(text);

    // Ensure we have exactly 4 parts (pad with empty if needed)
    while (textParts.length < 4) {
        textParts.push('');
    }

    return (
        <div className={`relative w-full aspect-square ${className}`}>
            {/* Base comic image */}
            <img src={imageUrl} className="w-full h-full object-cover" alt="Comic strip" />

            {/* Text overlays - positioned in 2x2 grid matching panel layout */}

            {/* Top-left panel text */}
            <div className="absolute" style={{
                left: '3%',
                top: '39%',
                width: '44%',
                height: '10%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <p className="text-center text-xs font-bold text-slate-900 px-2" style={{
                    fontSize: 'clamp(9px, 1.3vw, 15px)',
                    lineHeight: '1.3',
                    direction: 'rtl',
                    fontWeight: 700
                }}>
                    {textParts[0]}
                </p>
            </div>

            {/* Top-right panel text */}
            <div className="absolute" style={{
                left: '53%',
                top: '39%',
                width: '44%',
                height: '10%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <p className="text-center text-xs font-bold text-slate-900 px-2" style={{
                    fontSize: 'clamp(9px, 1.3vw, 15px)',
                    lineHeight: '1.3',
                    direction: 'rtl',
                    fontWeight: 700
                }}>
                    {textParts[1]}
                </p>
            </div>

            {/* Bottom-left panel text */}
            <div className="absolute" style={{
                left: '3%',
                top: '89%',
                width: '44%',
                height: '10%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <p className="text-center text-xs font-bold text-slate-900 px-2" style={{
                    fontSize: 'clamp(9px, 1.3vw, 15px)',
                    lineHeight: '1.3',
                    direction: 'rtl',
                    fontWeight: 700
                }}>
                    {textParts[2]}
                </p>
            </div>

            {/* Bottom-right panel text */}
            <div className="absolute" style={{
                left: '53%',
                top: '89%',
                width: '44%',
                height: '10%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <p className="text-center text-xs font-bold text-slate-900 px-2" style={{
                    fontSize: 'clamp(9px, 1.3vw, 15px)',
                    lineHeight: '1.3',
                    direction: 'rtl',
                    fontWeight: 700
                }}>
                    {textParts[3]}
                </p>
            </div>
        </div>
    );
};
