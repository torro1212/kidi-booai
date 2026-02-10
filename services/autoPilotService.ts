/**
 * AUTO PILOT Service
 * Handles batch book generation with rate limiting and auto-download
 */

import { AutoPilotStory, AutoPilotStoriesFile, AutoPilotProgress, Book, BookRequest } from '@/types';
import { generateBookContent, generatePageImage } from './geminiService';
import { startBackgroundMode, stopBackgroundMode } from './backgroundMode';

// Fixed settings for AUTO PILOT mode
const AUTO_PILOT_SETTINGS = {
    ageRange: '3-8',
    pageCount: 15,
    artStyle: 'Cute 3D animation style, Disney-light, glossy textures, volumetric lighting, vibrant colors, magical atmosphere',
    voices: {
        gentle: 'Puck',    // עדין ומרגיע
        energetic: 'Charon' // חזק ואנרגטי
    }
};

// Rate limiting: delay between books (in milliseconds)
const DELAY_BETWEEN_BOOKS_MS = 60000; // 60 seconds

/**
 * Parse and validate uploaded JSON file
 */
export function parseStoriesJson(jsonContent: string): AutoPilotStoriesFile {
    try {
        const parsed = JSON.parse(jsonContent);

        // Support both formats:
        // 1. Direct array: [{ title: ..., heroName: ... }, ...]
        // 2. Object with stories: { stories: [{ title: ..., heroName: ... }, ...] }
        let stories: AutoPilotStory[];

        if (Array.isArray(parsed)) {
            // Direct array format
            stories = parsed;
        } else if (parsed.stories && Array.isArray(parsed.stories)) {
            // Object with stories property
            stories = parsed.stories;
        } else {
            throw new Error('קובץ JSON חייב להכיל מערך של סיפורים או אובייקט עם מפתח "stories"');
        }

        // Validate each story has required fields
        for (let i = 0; i < stories.length; i++) {
            const story = stories[i];
            if (!story.title || !story.heroName || !story.plotSummary) {
                throw new Error(`סיפור ${i + 1} חסר שדות חובה (title, heroName, plotSummary)`);
            }
        }

        return { stories } as AutoPilotStoriesFile;
    } catch (error: any) {
        if (error.message.includes('JSON')) {
            throw new Error('קובץ JSON לא תקין');
        }
        throw error;
    }
}

/**
 * Get random voice (gentle or energetic)
 */
function getRandomVoice(): string {
    const isGentle = Math.random() < 0.5;
    return isGentle ? AUTO_PILOT_SETTINGS.voices.gentle : AUTO_PILOT_SETTINGS.voices.energetic;
}

/**
 * Create BookRequest from AutoPilotStory
 */
function createBookRequest(story: AutoPilotStory): BookRequest {
    return {
        ageRange: AUTO_PILOT_SETTINGS.ageRange,
        topic: `
שם הספר: ${story.title}
שם הגיבור/ה: ${story.heroName}
תיאור הדמות: ${story.heroDescription || story.heroName}
סימן היכר: ${story.distinctiveMark || 'ללא'}
תקציר העלילה: ${story.plotSummary}
נושא: ${story.mainTheme || 'הרפתקה'}
מסר חינוכי: ${story.educationalMessage || 'אמונה בעצמך'}
    `.trim(),
        pageCount: AUTO_PILOT_SETTINGS.pageCount,
        artStyle: AUTO_PILOT_SETTINGS.artStyle,
        audioEnabled: true,
        voiceName: getRandomVoice()
    };
}
/**
 * Generate images for all pages of a book
 */
async function generateImagesForBook(book: Book): Promise<Book> {
    const updatedBook = { ...book, pages: [...book.pages] };

    // Build character description
    const characterDescription = `
        ${book.metadata.mainCharacterDescription}
        [DISTINCTIVE MARK]: ${book.metadata.mainCharacterDistinctiveMark}
        ${book.metadata.secondaryCharacterDescription ? `[SECONDARY CHARACTER]: ${book.metadata.secondaryCharacterDescription}` : ''}
    `.trim();

    // Get base character image from first generated page
    let baseCharacterImageUrl = book.metadata.baseCharacterImageUrl;

    for (let i = 0; i < updatedBook.pages.length; i++) {
        const page = updatedBook.pages[i];
        const isCover = i === 0;

        console.log(`🖼️ AUTO PILOT: Generating image ${i + 1}/${updatedBook.pages.length}...`);

        try {
            const imageUrl = await generatePageImage(
                page.imagePrompt,
                characterDescription,
                book.metadata.artStyle,
                baseCharacterImageUrl,
                isCover,
                isCover ? book.metadata.title : undefined,
                book.metadata.characterColorPalette,
                isCover ? undefined : page.hebrewText
            );

            if (imageUrl) {
                updatedBook.pages[i] = { ...page, generatedImageUrl: imageUrl };

                // Use first image as base reference for consistency
                if (!baseCharacterImageUrl && (i === 0 || i === 1)) {
                    baseCharacterImageUrl = imageUrl;
                }
            }
        } catch (err) {
            console.error(`❌ Failed to generate image for page ${i}:`, err);
        }
    }

    return updatedBook;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Process AUTO PILOT queue - generates books one by one with rate limiting
 */
export async function* processAutoPilotQueue(
    stories: AutoPilotStory[],
    onBookComplete: (book: Book, index: number) => Promise<void>
): AsyncGenerator<AutoPilotProgress, void, void> {
    const progress: AutoPilotProgress = {
        currentIndex: 0,
        totalStories: stories.length,
        currentStoryTitle: '',
        status: 'idle',
        completedBooks: [],
        errorMessages: []
    };

    await startBackgroundMode();

    try {
        for (let i = 0; i < stories.length; i++) {
            const story = stories[i];
            progress.currentIndex = i;
            progress.currentStoryTitle = story.title;
            progress.status = 'generating';

            console.log(`🤖 AUTO PILOT: Starting book ${i + 1}/${stories.length}: ${story.title}`);
            yield { ...progress };

            try {
                // Generate the book text and structure
                const request = createBookRequest(story);
                const bookWithText = await generateBookContent(request);

                // Generate images for all pages
                console.log(`🖼️ AUTO PILOT: Generating images for ${story.title}...`);
                const bookWithImages = await generateImagesForBook(bookWithText);

                // Trigger download
                progress.status = 'downloading';
                yield { ...progress };

                await onBookComplete(bookWithImages, i);
                progress.completedBooks.push(story.title);

                console.log(`✅ AUTO PILOT: Completed book ${i + 1}/${stories.length}: ${story.title}`);

                // Rate limiting: wait before next book (except for the last one)
                if (i < stories.length - 1) {
                    progress.status = 'waiting';
                    yield { ...progress };

                    console.log(`⏳ AUTO PILOT: Waiting ${DELAY_BETWEEN_BOOKS_MS / 1000} seconds before next book...`);
                    await sleep(DELAY_BETWEEN_BOOKS_MS);
                }

            } catch (error: any) {
                console.error(`❌ AUTO PILOT: Error generating book ${i + 1}: ${story.title}`, error);
                progress.status = 'error';
                progress.errorMessages.push(`${story.title}: ${error.message}`);
                yield { ...progress };

                // Continue to next book even if one fails
                if (i < stories.length - 1) {
                    console.log(`⏳ AUTO PILOT: Waiting before retry/next book...`);
                    await sleep(DELAY_BETWEEN_BOOKS_MS);
                }
            }
        }

        progress.status = 'complete';
        yield { ...progress };

        console.log(`🎉 AUTO PILOT: Completed! Generated ${progress.completedBooks.length}/${stories.length} books`);

    } finally {
        stopBackgroundMode();
    }
}
