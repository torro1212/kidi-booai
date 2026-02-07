# 02_user_flow.md

## 1. Start & Configuration
**Entry Point:** Home Page (Hero Section) -> Click "Start Creating".

**User Choices:**
1.  **Mode Selection:**
    *   **New Story:** Start from scratch.
    *   **Sequel:** Continue an existing story (Upload JSON or PDF of previous book).
2.  **Target Age Group:**
    *   3-8 (Early Childhood)
    *   9-12 (Middle Grade)
    *   13-16 (Young Adult)
3.  **Art Style Selection:**
    *   Random (Surprise Me)
    *   3D (Magical/Disney-like)
    *   Watercolor
    *   Anime
    *   Paper Cutout
    *   Plasticine/Clay
    *   Colored Pencil
    *   Pixel Art
    *   Modern Vector
    *   Comic Book (4-Panel Layout)
4.  **Audio Settings:**
    *   Enable/Disable Narration.
    *   **Voice Selection:** Puck (Playful), Kore (Gentle), Charon (Deep), Fenrir (Strong), Zephyr (Soft). Includes preview play button.
5.  **Story Length:**
    *   Slider from 1 to 20 pages.
6.  **Story Topic:**
    *   Free text input (e.g., "A brave turtle...").
    *   **"Graceful Idea" (Magic Wand):** AI generates a topic based on age range.

## 2. Generation Process
*   **Trigger:** User clicks "Create My Book".
*   **State:** UI shows loading animation ("Dreaming up your story...").
*   **Background Mode:** App requests "wake lock" to prevent mobile devices from sleeping during long generation.
*   **Process:**
    1.  **Safety Check:** Prompt logic validates topic for safety/copyright.
    2.  **Story & Prompts:** Gemini Pro generates the full text (Hebrew) and image prompts (English) in structured JSON.
    3.  **Image Generation:** background process generating images for the cover and internal pages (can happen progressively).

## 3. Editor & Customization (The Studio)
**View:** Grid of pages + Cover.

**Actions:**
*   **Text Editing:** User can edit the generated Hebrew text directly.
*   **Prompt Editing:** User can tweak the English image prompt for any page.
*   **Regenerate:**
    *   **Single Page:** Re-roll a specific image.
    *   **Multi-Select:** Select multiple pages and batch regenerate.
*   **Sequel Creation:** Option to start a new book based on the current one (locking character metadata).

## 4. Preview & Reader
**View:** "Book Viewer" (Flipbook or Scroll view).
*   **Audio:** Play narration for each page.
*   **Navigation:** Flip through pages.

## 5. Finalization & Export
**Output Format:** ZIP Archive containing:
*   **PDF:** Full book printable file (A4).
*   **Images:** Individual PNG files (Page_01.png, etc.).
*   **Audio:** WAV files for each page (if enabled).
*   **Data:** `sequel_data.json` for future continuity.

**Monetization/Limits:**
*   **Cost Estimate:** Real-time calculator shown in Creation Form based on page count and audio.
*   **API Key:** User must provide their own Google Gemini API Key (B2C/BYOK model).
