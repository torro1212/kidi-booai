export interface PanelCaptions {
    A: string; // Top-Right
    B: string; // Top-Left
    C: string; // Bottom-Right
    D: string; // Bottom-Left
}

export interface ComicComposerOptions {
    imageUrl: string;
    text?: string; // For backward compatibility
    captions?: PanelCaptions; // Per-panel mode with A/B/C/D
    captionRatio?: number;
    paddingRatio?: number;
    fontFamily?: string;
}

// Always returns EXACTLY 4 parts (pads with '')
export const splitTextIntoFour = (text: string): string[] => {
    const clean = (text || "").trim();
    if (!clean) return ["", "", "", ""];

    // Split by sentence boundaries (keeps punctuation)
    const sentences = clean
        .split(/(?<=[.!?。؟…])\s+/)
        .map(s => s.trim())
        .filter(Boolean);

    if (sentences.length >= 4) {
        const parts = ["", "", "", ""];
        const per = Math.ceil(sentences.length / 4);
        let p = 0;

        for (let i = 0; i < sentences.length; i++) {
            if (p < 3 && i > 0 && i % per === 0) p++;
            parts[p] += (parts[p] ? " " : "") + sentences[i];
        }
        return parts;
    }

    // Fallback: split by words
    const words = clean.split(/\s+/).filter(Boolean);
    const parts = ["", "", "", ""];
    const per = Math.ceil(words.length / 4);

    for (let i = 0; i < 4; i++) {
        parts[i] = words.slice(i * per, (i + 1) * per).join(" ").trim();
    }
    return parts;
};

// Robust image loader preventing CORS issues
const loadImage = async (url: string): Promise<HTMLImageElement> => {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        return await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(img);
            };
            img.onerror = (e) => {
                URL.revokeObjectURL(objectUrl);
                reject(e);
            };
            img.src = objectUrl;
        });
    } catch {
        return await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    }
};

export const composeComicImageWithCaptions = async (
    options: ComicComposerOptions
): Promise<string> => {
    const {
        imageUrl,
        text,
        captions,
        captionRatio = 0.20, // Increased from 0.13 to fit 5-9 word captions
        paddingRatio = 0.08,
        fontFamily = "'Rubik', 'Heebo', 'Arial', sans-serif"
    } = options;

    // Determine caption texts: use A/B/C/D captions or fall back to splitting text
    let captionTexts: string[];
    if (captions && typeof captions === 'object' && 'A' in captions) {
        // Map A/B/C/D to panels in Hebrew RTL reading order
        captionTexts = [captions.A, captions.B, captions.C, captions.D];
    } else {
        captionTexts = splitTextIntoFour(text || '');
    }

    const img = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");

    // Draw base image
    ctx.drawImage(img, 0, 0);

    const panelW = w / 2;
    const panelH = h / 2;

    const panels = [
        { x: panelW, y: 0 },        // Panel 1 (top-right) - RTL first
        { x: 0, y: 0 },             // Panel 2 (top-left)
        { x: panelW, y: panelH },   // Panel 3 (bottom-right)
        { x: 0, y: panelH },        // Panel 4 (bottom-left)
    ];

    panels.forEach((panel, i) => {
        const captionH = panelH * captionRatio;
        const captionY = panel.y + panelH - captionH;
        const captionPadding = Math.max(6, captionH * paddingRatio);

        // Draw caption bar with rounded corners
        ctx.fillStyle = "rgba(255, 255, 255, 0.90)";
        ctx.strokeStyle = "#333333";
        ctx.lineWidth = 1.5;

        // Rounded rectangle
        const cornerRadius = Math.min(captionH * 0.15, 8);
        const barX = panel.x + 2;
        const barY = captionY + 2;
        const barW = panelW - 4;
        const barH = captionH - 4;

        ctx.beginPath();
        ctx.moveTo(barX + cornerRadius, barY);
        ctx.lineTo(barX + barW - cornerRadius, barY);
        ctx.quadraticCurveTo(barX + barW, barY, barX + barW, barY + cornerRadius);
        ctx.lineTo(barX + barW, barY + barH - cornerRadius);
        ctx.quadraticCurveTo(barX + barW, barY + barH, barX + barW - cornerRadius, barY + barH);
        ctx.lineTo(barX + cornerRadius, barY + barH);
        ctx.quadraticCurveTo(barX, barY + barH, barX, barY + barH - cornerRadius);
        ctx.lineTo(barX, barY + cornerRadius);
        ctx.quadraticCurveTo(barX, barY, barX + cornerRadius, barY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        const captionText = captionTexts[i]?.trim();
        if (!captionText) return;

        // Setup text rendering
        ctx.direction = "rtl";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#111111";

        const centerX = panel.x + panelW / 2;
        const centerY = captionY + captionH / 2;
        const maxW = panelW - (captionPadding * 2) - 8;

        // Auto-fit font size to ensure ONE line only
        // Increased from 0.45 to 0.50 to use more of the larger caption bar
        let fontSize = Math.floor(captionH * 0.50);
        const minFontSize = 10; // Increased from 8 to ensure readability
        let finalText = captionText;

        while (fontSize >= minFontSize) {
            ctx.font = `bold ${fontSize}px ${fontFamily}`;
            const metrics = ctx.measureText(captionText);

            if (metrics.width <= maxW) {
                break;
            }
            fontSize -= 1;
        }

        // If still doesn't fit at minimum size, truncate with ellipsis
        if (fontSize < minFontSize) {
            fontSize = minFontSize;
            ctx.font = `bold ${fontSize}px ${fontFamily}`;
            let truncated = captionText;
            while (truncated.length > 1 && ctx.measureText(truncated + '…').width > maxW) {
                truncated = truncated.slice(0, -1);
            }
            finalText = truncated + '…';
        }

        // Render the single line
        ctx.font = `bold ${fontSize}px ${fontFamily}`;
        ctx.fillText(finalText, centerX, centerY);
    });

    return canvas.toDataURL("image/png");
};

// Wrap text + handle a single word longer than maxWidth
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];

    const lines: string[] = [];
    let current = "";

    const pushCurrent = () => {
        if (current.trim()) lines.push(current.trim());
        current = "";
    };

    for (const word of words) {
        if (ctx.measureText(word).width > maxWidth) {
            pushCurrent();
            const chunks = breakLongWord(ctx, word, maxWidth);
            for (const ch of chunks) lines.push(ch);
            continue;
        }

        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width <= maxWidth) {
            current = test;
        } else {
            pushCurrent();
            current = word;
        }
    }

    pushCurrent();
    return lines.length ? lines : [text];
}

function breakLongWord(ctx: CanvasRenderingContext2D, word: string, maxWidth: number): string[] {
    const out: string[] = [];
    let chunk = "";

    for (const ch of word) {
        const test = chunk + ch;
        if (ctx.measureText(test).width <= maxWidth) {
            chunk = test;
        } else {
            if (chunk) out.push(chunk);
            chunk = ch;
        }
    }
    if (chunk) out.push(chunk);
    return out;
}
