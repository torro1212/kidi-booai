'use client'

import React, { useEffect, useState } from 'react';
import { composeComicImageWithCaptions, type PanelCaptions } from '@/lib/comicComposer';

interface ComicImageWithTextProps {
    imageUrl: string;
    text?: string;
    captions?: PanelCaptions;
    captionRatio?: number;
    className?: string;
}

export const ComicImageWithText: React.FC<ComicImageWithTextProps> = ({
    imageUrl,
    text,
    captions,
    captionRatio = 0.15,
    className = ''
}) => {
    const [compositedUrl, setCompositedUrl] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        const generateComposite = async () => {
            try {
                // If no text or captions, just show the image
                if (!text && !captions) {
                    if (isMounted) setCompositedUrl(imageUrl);
                    return;
                }

                const result = await composeComicImageWithCaptions({
                    imageUrl,
                    text,
                    captions,
                    captionRatio
                });

                if (isMounted) {
                    setCompositedUrl(result);
                }
            } catch (error) {
                console.error("Failed to compose comic image:", error);
                // Fallback to original if something fails
                if (isMounted) setCompositedUrl(imageUrl);
            }
        };

        generateComposite();

        return () => {
            isMounted = false;
        };
    }, [imageUrl, text, captions, captionRatio]);

    if (!compositedUrl) {
        // Show loading state or original while processing
        return (
            <div className={`relative w-full aspect-square bg-slate-100 animate-pulse ${className}`}>
                <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                    <span className="text-xs">מעבד קומיקס...</span>
                </div>
            </div>
        );
    }

    return (
        <img
            src={compositedUrl}
            className={`w-full h-full object-cover ${className}`}
            alt="Comic strip"
        />
    );
};
