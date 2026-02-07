# 06_current_issues_and_open_questions.md

## 1. Known Problems & Limitations

### A. Comic Book Text Overlay
**Issue:** The "4-Panel Comic" style generates images with empty caption strips at the bottom, but the application struggles to overlay the Hebrew text correctly into these strips.
**Current State:** The `ComicImageWithText.tsx` component attempts to render text over the image, but alignment is often imprecise due to varying image generation outputs.
**Impact:** Text may overlap with artwork or be illegible.
**Status:** Open / Work in Progress.

### B. Mobile Background Execution
**Issue:** Mobile browsers (especially iOS Safari) throttle JavaScript execution when the tab is in the background or the screen locks. Image generation can take 30-60+ seconds, leading to failed generations if the user switches apps.
**Workaround:** `backgroundMode.ts` plays a silent audio track to keep the Service Worker/Tab active ("Wake Lock").
**Impact:** Drains battery; "hacky" solution that may not work 100% of the time.

### C. Client-Side PDF/Export
**Issue:** PDF generation relies on `html2canvas` and `jspdf` running in the browser.
**Impact:**
*   Large memory usage for 20-page books (potential crash on older mobile devices).
*   Rendering inconsistencies across browsers (fonts, shadows).
*   No true "Print Ready" CMYK support, only RGB.

## 2. UX / UI Friction Points

### A. Google Drive Integration
**Issue:** Requires the user (or developer) to set up a Google Cloud Project and add the `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to `.env.local`.
**Impact:** High barrier to entry for non-technical users if they deploy their own instance.
**Status:** Functional but difficult setup.

### B. Error Handling
**Issue:** Most errors (API quotas, network fail) result in a generic `alert()` dialog.
**To Do:** Implement a proper UI toast/notification system and specific error messages for "Quota Exceeded" vs "Content Safety Block".

### C. Hardcoded Language
**Issue:** valid prompts are English-only, UI is mixed Hebrew/English, Story is Hebrew-only.
**Limitation:** Difficult to localize to other languages (e.g., Arabic, English, Spanish) without significant refactoring of `geminiService.ts` and `CreationForm.tsx`.

## 3. Missing Features / Open Questions

*   **User Accounts:** Currently no backend auth (besides Firebase anonymous/Google for Drive). Books are lost if browser cache is cleared unless exported.
*   **Edit History:** No "Undo" functionality in the Editor.
*   **Scene Consistency:** While character consistency is enforced, *location* consistency (staying in the same room for 3 pages) is not explicitly tracked in the prompt logic.
*   **Audio Export:** Audio is exported as separate WAV files. Users likely want a video file (MP4) with the audio synced to the pages.
