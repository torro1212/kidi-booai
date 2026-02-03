'use client'

import React from 'react';

interface ComicImageWithTextProps {
    imageUrl: string;
    text: string;
    className?: string;
}

// Simple text splitter - divides by words
const splitTextIntoFour = (text: string): string[] => {
    const words = text.split(' ').filter(w => w.trim());
    const chunkSize = Math.ceil(words.length / 4);

    return [
        words.slice(0, chunkSize).join(' '),
        words.slice(chunkSize, chunkSize * 2).join(' '),
        words.slice(chunkSize * 2, chunkSize * 3).join(' '),
        words.slice(chunkSize * 3).join(' ')
    ].filter(part => part.trim()); // Remove empty parts
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
                left: '2.5%',
                top: '37.5%',
                width: '45%',
                height: '11%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <p className="text-center text-xs font-medium text-slate-900 px-1" style={{
                    fontSize: 'clamp(8px, 1.2vw, 14px)',
                    lineHeight: '1.2',
                    direction: 'rtl'
                }}>
                    {textParts[0]}
                </p>
            </div>

            {/* Top-right panel text */}
            <div className="absolute" style={{
                left: '52.5%',
                top: '37.5%',
                width: '45%',
                height: '11%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <p className="text-center text-xs font-medium text-slate-900 px-1" style={{
                    fontSize: 'clamp(8px, 1.2vw, 14px)',
                    lineHeight: '1.2',
                    direction: 'rtl'
                }}>
                    {textParts[1]}
                </p>
            </div>

            {/* Bottom-left panel text */}
            <div className="absolute" style={{
                left: '2.5%',
                top: '87.5%',
                width: '45%',
                height: '11%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <p className="text-center text-xs font-medium text-slate-900 px-1" style={{
                    fontSize: 'clamp(8px, 1.2vw, 14px)',
                    lineHeight: '1.2',
                    direction: 'rtl'
                }}>
                    {textParts[2]}
                </p>
            </div>

            {/* Bottom-right panel text */}
            <div className="absolute" style={{
                left: '52.5%',
                top: '87.5%',
                width: '45%',
                height: '11%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <p className="text-center text-xs font-medium text-slate-900 px-1" style={{
                    fontSize: 'clamp(8px, 1.2vw, 14px)',
                    lineHeight: '1.2',
                    direction: 'rtl'
                }}>
                    {textParts[3]}
                </p>
            </div>
        </div>
    );
};
