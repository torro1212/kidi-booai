'use client'

import { checkForCopyrightIssues } from '@/lib/copyrightBlocklist'
import { saveBookPrompts, checkSimilarPrompts } from './firebase'
import { Book } from '@/types'

export interface PromptGuardResult {
    allowed: boolean
    reason?: string
    blockedTerm?: string
}

// Check book request before generation
export const validateBookRequest = async (
    topic: string,
    title?: string
): Promise<PromptGuardResult> => {
    // Check for copyright issues in topic
    const topicCheck = checkForCopyrightIssues(topic)
    if (topicCheck.isBlocked) {
        return {
            allowed: false,
            reason: `לא ניתן להשתמש בדמות/מותג מוגן: "${topicCheck.blockedTerm}"`,
            blockedTerm: topicCheck.blockedTerm
        }
    }

    // Check title if provided
    if (title) {
        const titleCheck = checkForCopyrightIssues(title)
        if (titleCheck.isBlocked) {
            return {
                allowed: false,
                reason: `לא ניתן להשתמש בדמות/מותג מוגן בכותרת: "${titleCheck.blockedTerm}"`,
                blockedTerm: titleCheck.blockedTerm
            }
        }
    }

    return { allowed: true }
}

// Check character description for copyright
export const validateCharacterDescription = (description: string): PromptGuardResult => {
    const check = checkForCopyrightIssues(description)
    if (check.isBlocked) {
        return {
            allowed: false,
            reason: `תיאור הדמות מכיל הפניה לדמות מוגנת: "${check.blockedTerm}"`,
            blockedTerm: check.blockedTerm
        }
    }
    return { allowed: true }
}

// Log book prompts to Firebase after successful generation
export const logGeneratedBook = async (book: Book): Promise<void> => {
    try {
        await saveBookPrompts({
            bookTitle: book.metadata.title,
            mainCharacter: book.metadata.mainCharacterDescription || '',
            secondaryCharacter: book.metadata.secondaryCharacterDescription,
            artStyle: book.metadata.artStyle,
            topic: book.metadata.mainTheme || '',
            imagePrompts: book.pages.map(p => p.imagePrompt)
        })
    } catch (error) {
        // Don't fail generation if logging fails
        console.error('Failed to log book to Firebase:', error)
    }
}

// Check for duplicate/similar books
export const checkDuplicateBook = async (
    mainCharacter: string,
    bookTitle: string
): Promise<{ isDuplicate: boolean; message?: string }> => {
    try {
        const result = await checkSimilarPrompts(mainCharacter, bookTitle)
        if (result.exists) {
            return {
                isDuplicate: true,
                message: result.similarTo
            }
        }
        return { isDuplicate: false }
    } catch (error) {
        // Don't block on errors
        console.error('Error checking duplicates:', error)
        return { isDuplicate: false }
    }
}

// Extract character names from Hebrew text
export const extractCharacterMentions = (
    text: string,
    mainCharName?: string,
    secondaryCharName?: string
): { hasMain: boolean; hasSecondary: boolean } => {
    const lowerText = text.toLowerCase()

    const hasMain = mainCharName
        ? lowerText.includes(mainCharName.toLowerCase())
        : true // If no name defined, assume present

    const hasSecondary = secondaryCharName
        ? lowerText.includes(secondaryCharName.toLowerCase())
        : false

    return { hasMain, hasSecondary }
}
