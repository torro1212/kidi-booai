import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || '');

// Panel scene input structure
export interface PanelScene {
    id: 'A' | 'B' | 'C' | 'D';
    scenePrompt: string;
}

export interface GenerateComicCaptionsParams {
    pageId: string;
    panels: PanelScene[];
    targetAge?: string;
    mainTheme?: string;
}

export interface PanelCaptions {
    A: string; // Top-Right (Hebrew RTL first)
    B: string; // Top-Left
    C: string; // Bottom-Right
    D: string; // Bottom-Left
}

const captionSchema: any = {
    type: SchemaType.OBJECT,
    properties: {
        pageId: { type: SchemaType.STRING },
        panelCaptions: {
            type: SchemaType.OBJECT,
            properties: {
                A: { type: SchemaType.STRING },
                B: { type: SchemaType.STRING },
                C: { type: SchemaType.STRING },
                D: { type: SchemaType.STRING },
            },
            required: ['A', 'B', 'C', 'D'],
        },
    },
    required: ['pageId', 'panelCaptions'],
};

// Forbidden connector words at start or end
const FORBIDDEN_CONNECTORS = ['ו', 'ואז', 'אבל', 'כי', 'ש', 'לכן', 'אז', 'רק', 'גם', 'את', 'של', 'אם', 'כש'];

function hasForbiddenStart(text: string): boolean {
    const trimmed = text.trim();
    const firstWord = trimmed.split(/\s+/)[0];
    return FORBIDDEN_CONNECTORS.includes(firstWord);
}

function hasForbiddenEnding(text: string): boolean {
    const trimmed = text.trim();
    const lastWord = trimmed.split(/\s+/).pop() || '';
    return FORBIDDEN_CONNECTORS.includes(lastWord);
}

function startsWithPunctuation(text: string): boolean {
    const trimmed = text.trim();
    return /^[,،;:\-…]/.test(trimmed);
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

export function validateCaption(caption: string, panelId: string): ValidationResult {
    const errors: string[] = [];
    const trimmed = caption.trim();

    // Check empty
    if (!trimmed) {
        errors.push(`Panel ${panelId}: caption is empty`);
        return { valid: false, errors };
    }

    // Check Hebrew only (allow Hebrew letters, nikud, spaces, basic punctuation)
    const hebrewPattern = /^[\u0590-\u05FF\s.,!?\-…״״׳׳]+$/;
    if (!hebrewPattern.test(trimmed)) {
        errors.push(`Panel ${panelId}: contains non-Hebrew characters`);
    }

    // Check single line
    if (trimmed.includes('\n')) {
        errors.push(`Panel ${panelId}: contains newline character`);
    }

    // Check length
    if (trimmed.length > 65) {
        errors.push(`Panel ${panelId}: exceeds 65 characters (${trimmed.length})`);
    }

    // Check word count (5-10 allowed, prefer 5-9)
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
    if (wordCount < 5) {
        errors.push(`Panel ${panelId}: only ${wordCount} words (minimum 5)`);
    } else if (wordCount > 10) {
        errors.push(`Panel ${panelId}: ${wordCount} words (maximum 10)`);
    }

    // Check forbidden start connectors
    if (hasForbiddenStart(trimmed)) {
        errors.push(`Panel ${panelId}: starts with forbidden connector word`);
    }

    // Check forbidden end connectors
    if (hasForbiddenEnding(trimmed)) {
        errors.push(`Panel ${panelId}: ends with forbidden connector word`);
    }

    // Check starts with punctuation
    if (startsWithPunctuation(trimmed)) {
        errors.push(`Panel ${panelId}: starts with punctuation (dangling)`);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

export function validateAllCaptions(captions: PanelCaptions): ValidationResult {
    const allErrors: string[] = [];
    const panels = ['A', 'B', 'C', 'D'] as const;

    for (const panel of panels) {
        const result = validateCaption(captions[panel], panel);
        allErrors.push(...result.errors);
    }

    return {
        valid: allErrors.length === 0,
        errors: allErrors
    };
}

export function normalizeCaption(text: string): string {
    return text
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\.{2,}/g, '…')
        .replace(/!{2,}/g, '!')
        .replace(/\?{2,}/g, '?')
        .substring(0, 60);
}

// Generate a single panel caption with retry
async function generateSinglePanelCaption(
    panelId: 'A' | 'B' | 'C' | 'D',
    scenePrompt: string,
    targetAge: string,
    mainTheme: string,
    maxRetries: number = 5
): Promise<string> {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',
    });

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const prompt = `You are a Hebrew children's comic caption editor for ages ${targetAge}.

TASK: Create ONE Hebrew caption for panel ${panelId} of a comic page.

PANEL SCENE (what is visible in this panel):
${scenePrompt}

THEME: ${mainTheme}

RULES (strict):
- Hebrew ONLY
- EXACTLY ONE line (no newlines)
- 5-9 words ideal (minimum 5, maximum 10)
- Maximum 65 characters
- Must be a COMPLETELY STANDALONE sentence.
- CRITICAL: DO NOT start with "And", "But", "So", "Then" (ו, ואז, אבל, אז).
- CRITICAL: Describe ONLY the visual action in this panel.

Return ONLY the Hebrew caption text, nothing else.`;

            const result = await model.generateContent(prompt);
            const caption = normalizeCaption(result.response.text());

            const validation = validateCaption(caption, panelId);
            if (validation.valid) {
                return caption;
            }

            console.warn(`Panel ${panelId} attempt ${attempt + 1} failed:`, validation.errors);
        } catch (error) {
            console.error(`Panel ${panelId} attempt ${attempt + 1} error:`, error);
        }
    }

    // Fallback: use Hebrew placeholder (never use English scene prompt)
    const hebrewPanelNames: Record<string, string> = {
        A: 'זהו הפאנל הראשון בסיפור המיוחד',
        B: 'כאן רואים את הפאנל השני',
        C: 'עכשיו הגענו אל הפאנל השלישי',
        D: 'ולסיום הנה הפאנל הרביעי בדף'
    };
    return normalizeCaption(hebrewPanelNames[panelId] || 'פאנל נוסף בסיפור המיוחד הזה');
}

export async function generateComicCaptions(params: GenerateComicCaptionsParams): Promise<PanelCaptions> {
    const { pageId, panels, targetAge = '3-8', mainTheme = '' } = params;

    // Ensure we have all 4 panels
    const panelMap = new Map(panels.map(p => [p.id, p.scenePrompt]));
    const panelIds = ['A', 'B', 'C', 'D'] as const;

    // First attempt: generate all 4 together with structured output
    try {
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash-exp',
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: captionSchema,
            },
        });

        const prompt = `You are a Hebrew children's comic caption editor for ages ${targetAge}.

TASK: Create 4 Hebrew captions for a 4-panel comic (2x2 grid).

HEBREW RTL READING ORDER:
A = Top-Right (first)
B = Top-Left
C = Bottom-Right
D = Bottom-Left

PANEL SCENES (what is visible in each panel):
Panel A: ${panelMap.get('A') || 'Opening scene'}
Panel B: ${panelMap.get('B') || 'Action scene'}
Panel C: ${panelMap.get('C') || 'Reaction scene'}
Panel D: ${panelMap.get('D') || 'Resolution scene'}

THEME: ${mainTheme}

HARD RULES FOR EACH CAPTION:
- Hebrew ONLY
- EXACTLY ONE line (no newlines)
- 4–9 words ideal (minimum 3, maximum 12)
- Maximum 55 characters
- Must be a COMPLETE, natural sentence
- Describe ONLY what happens in THAT panel (no leakage to other panels)
- DO NOT start or end with connector words: ו, ואז, אבל, כי, ש, לכן, אז, רק, גם
- Each caption must stand alone without needing context from other panels

PANEL ISOLATION:
- Panel A caption describes ONLY Panel A's scene
- Panel B caption describes ONLY Panel B's scene
- Panel C caption describes ONLY Panel C's scene
- Panel D caption describes ONLY Panel D's scene

Return JSON:
{
  "pageId": "${pageId}",
  "panelCaptions": {
    "A": "...",
    "B": "...",
    "C": "...",
    "D": "..."
  }
}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const parsed = JSON.parse(text);

        const captions: PanelCaptions = {
            A: normalizeCaption(parsed.panelCaptions.A),
            B: normalizeCaption(parsed.panelCaptions.B),
            C: normalizeCaption(parsed.panelCaptions.C),
            D: normalizeCaption(parsed.panelCaptions.D),
        };

        const validation = validateAllCaptions(captions);

        if (validation.valid) {
            console.log(`Page ${pageId}: All captions valid on first attempt`);
            return captions;
        }

        console.warn(`Page ${pageId}: Some captions failed validation, retrying failed panels...`);

        // Per-panel retry for failed captions
        for (const panelId of panelIds) {
            const panelValidation = validateCaption(captions[panelId], panelId);
            if (!panelValidation.valid) {
                console.log(`Retrying panel ${panelId}...`);
                captions[panelId] = await generateSinglePanelCaption(
                    panelId,
                    panelMap.get(panelId) || '',
                    targetAge,
                    mainTheme
                );
            }
        }

        // Final validation
        const finalValidation = validateAllCaptions(captions);
        if (finalValidation.valid) {
            console.log(`Page ${pageId}: All captions valid after per-panel retry`);
            return captions;
        }

        console.warn(`Page ${pageId}: Still has validation errors after retries:`, finalValidation.errors);
        return captions; // Return best effort

    } catch (error) {
        console.error(`Page ${pageId}: Failed to generate captions, using per-panel fallback:`, error);

        // Fallback: generate each panel individually
        const captions: PanelCaptions = { A: '', B: '', C: '', D: '' };

        for (const panelId of panelIds) {
            captions[panelId] = await generateSinglePanelCaption(
                panelId,
                panelMap.get(panelId) || '',
                targetAge,
                mainTheme
            );
        }

        return captions;
    }
}

// Legacy support: convert from hebrewText + imagePrompt to panel scenes
export function extractPanelScenesFromPrompt(imagePrompt: string): PanelScene[] {
    // Try to find panel descriptions in the prompt
    const panelPatterns = [
        /Panel\s*1[:\s]+([^.]+)/i,
        /Panel\s*2[:\s]+([^.]+)/i,
        /Panel\s*3[:\s]+([^.]+)/i,
        /Panel\s*4[:\s]+([^.]+)/i,
        /P1[:\s]+([^.]+)/i,
        /P2[:\s]+([^.]+)/i,
        /P3[:\s]+([^.]+)/i,
        /P4[:\s]+([^.]+)/i,
    ];

    const scenes: PanelScene[] = [];
    const panelIds: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];

    for (let i = 0; i < 4; i++) {
        const pattern1 = panelPatterns[i];
        const pattern2 = panelPatterns[i + 4];

        let match = imagePrompt.match(pattern1) || imagePrompt.match(pattern2);

        if (match) {
            scenes.push({
                id: panelIds[i],
                scenePrompt: match[1].trim()
            });
        } else {
            // Fallback: split prompt into 4 parts
            const words = imagePrompt.split(/\s+/);
            const chunkSize = Math.ceil(words.length / 4);
            const chunk = words.slice(i * chunkSize, (i + 1) * chunkSize).join(' ');
            scenes.push({
                id: panelIds[i],
                scenePrompt: chunk || imagePrompt
            });
        }
    }

    return scenes;
}
