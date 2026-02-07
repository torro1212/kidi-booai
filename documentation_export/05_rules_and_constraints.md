# 05_rules_and_constraints.md

## 1. System Constraints
*   **Page Count:** Minimum 1, Maximum 20 pages.
*   **Audio Generation:** Per-page limit (based on text length implicitly).
*   **Image Format:**
    *   Cover: 1:1 Aspect Ratio (Square).
    *   Inner Pages: 1:1 Aspect Ratio (Square) generated, but exported in a container (1024x1024 Image + 256px Text box).
*   **File Uploads:**
    *   Sequel Context: JSON or PDF only.
    *   PDF Analysis: Relies on `gemini-3-flash-preview` to extract text/images.

## 2. Generation Rules (Enforced by Prompt)
*   **Language:** Text MUST be in Hebrew (user-facing story). Prompts MUST be in English (internal).
*   **Rhyming:** Discouraged ("DO NOT force rhymes"). Natural prose preferred unless natural rhyme is possible.
*   **Consistency:** "Color Lock" mechanism enforces HEX codes for character appearance (Skin, Hair, Clothes).
*   **Character Inclusion:**
    *   Main character: Appear if mentioned.
    *   Sidekick: Only if explicitly mentioned.
    *   Solo scenes: Do not inject characters not present in text.

## 3. Copyright & Safety
*   **Prompt Guard (`promptGuard.ts`):** Validates user topics before generation.
    *   Blocks: Copyrighted characters (e.g., "Mickey Mouse", "Harry Potter").
    *   Blocks: NSFW, Violence, Hate Speech.
*   **Error Handling:** If topic is blocked, generation aborts with specific error.

## 4. Export Rules
*   **PDF:** A4 format.
*   **Images:** PNG format.
*   **Audio:** WAV format.
*   **Storage:** Client-side ZIP generation (`JSZip`). No server-side storage except optional Google Drive upload.

## 5. Technology Constraints
*   **Wake Lock:** Used on mobile (`navigator.wakeLock`) to prevent screen sleep during long generation times.
*   **API Keys:**
    *   Stored in `localStorage` (Gemini).
    *   Stored in `sessionStorage` (Drive Token).
*   **Mobile:**
    *   "Background Mode" service plays silent audio to keep the Service Worker/Tab active on iOS Safari.
