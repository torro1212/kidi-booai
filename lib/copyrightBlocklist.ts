// רשימת מילים ודמויות חסומות מסיבות של זכויות יוצרים
// Copyright blocklist - characters and terms that should not be used

export const BLOCKED_CHARACTERS = [
    // Disney
    'מיקי מאוס', 'mickey mouse', 'מיני מאוס', 'minnie mouse',
    'אלזה', 'elsa', 'אנה', 'anna', 'frozen', 'פרוזן',
    'סינדרלה', 'cinderella', 'שלגייה', 'snow white',
    'אריאל', 'ariel', 'בת הים', 'little mermaid',
    'סימבה', 'simba', 'מלך האריות', 'lion king',
    'באז', 'buzz lightyear', 'וודי', 'woody', 'צעצוע של סיפור', 'toy story',
    'נמו', 'nemo', 'דורי', 'dory',
    'מואנה', 'moana', 'רפונזל', 'rapunzel', 'tangled',

    // Marvel/DC
    'ספיידרמן', 'spider-man', 'spiderman', 'איש העכביש',
    'באטמן', 'batman', 'סופרמן', 'superman',
    'איירון מן', 'iron man', 'תור', 'thor', 'הענק הירוק', 'hulk',
    'קפטן אמריקה', 'captain america', 'נוקמים', 'avengers',
    'וונדר וומן', 'wonder woman',

    // Anime/Manga
    'פיקאצ\'ו', 'pikachu', 'פוקימון', 'pokemon',
    'נארוטו', 'naruto', 'גוקו', 'goku', 'דרגון בול', 'dragon ball',
    'סיילור מון', 'sailor moon',

    // Other
    'הלו קיטי', 'hello kitty', 'ספוגבוב', 'spongebob',
    'פפה חזיר', 'peppa pig', 'מפלצות בע"מ', 'monsters inc',
    'שרק', 'shrek', 'מיניונים', 'minions',
    'הארי פוטר', 'harry potter', 'הוגוורטס', 'hogwarts'
]

export const BLOCKED_BRANDS = [
    'דיסני', 'disney', 'pixar', 'פיקסר',
    'מארוול', 'marvel', 'dc comics',
    'nickelodeon', 'ניקלודיאון',
    'cartoon network', 'קרטון נטוורק',
    'dreamworks', 'דרימוורקס',
    'warner bros', 'וורנר'
]

// Check if text contains blocked terms
export const checkForCopyrightIssues = (text: string): {
    isBlocked: boolean
    blockedTerm?: string
} => {
    const lowerText = text.toLowerCase()

    // Check characters
    for (const char of BLOCKED_CHARACTERS) {
        if (lowerText.includes(char.toLowerCase())) {
            return { isBlocked: true, blockedTerm: char }
        }
    }

    // Check brands
    for (const brand of BLOCKED_BRANDS) {
        if (lowerText.includes(brand.toLowerCase())) {
            return { isBlocked: true, blockedTerm: brand }
        }
    }

    return { isBlocked: false }
}

// Get list of all blocked terms for display
export const getAllBlockedTerms = (): string[] => {
    return [...BLOCKED_CHARACTERS, ...BLOCKED_BRANDS]
}
