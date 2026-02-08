import React from 'react';
import { APP_VERSION } from '@/lib/version';

export const VersionDisplay = () => {
    return (
        <div className="fixed bottom-1 right-1 z-[9999] bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white/50 hover:text-white/90 text-[10px] px-1.5 py-0.5 rounded pointer-events-auto select-none font-mono transition-all duration-300">
            v{APP_VERSION}
        </div>
    );
};
