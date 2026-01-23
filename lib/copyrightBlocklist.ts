// רשימת מילים ודמויות חסומות מסיבות של זכויות יוצרים
// Copyright blocklist - characters and terms that should not be used

// Visual appearance blocklist - SPECIFIC descriptions that clearly reference copyrighted characters
// NOTE: We do NOT block common names (like "אנה", "אריאל") because they're regular names too!
// We ONLY block when the VISUAL DESCRIPTION clearly matches a copyrighted character

export const BLOCKED_VISUAL_DESCRIPTIONS = [
    // Disney - Frozen (only block if VISUAL description matches)
    'שמלה כחולה קפואה', 'ice powers', 'יכולת קרח', 'כוחות קרח',
    'קופצת צמות', 'braided hair with snow', 'שמלה ירוקה עם פרחים',

    // Disney - Princesses (only specific visual combos)
    'כדורי זכוכית ונעל זכוכית', 'glass slipper', 'נעל זכוכית',
    'שיער שחור ושבעה גמדים', 'seven dwarfs',
    'זנב של בת ים אדומים', 'red mermaid tail', 'purple seashell bra',

    // Disney - Lion King
    'אריה צהוב עם רעמה אדומה', 'lion with red mane', 'מלך האריות עם סימבה',

    // Marvel/DC - only if costume described
    'תלבושת אדום וכחול עכביש', 'spider web shooters', 'מקליע רשתות',
    'גלימה שחורה וסמל עטלף', 'bat symbol', 'סמל עטלף על החזה',
    'גלימה כחול אדום וסמל S', 'S symbol on chest', 'מעוף עם גלימה אדומה',
    'שריון אדום וזהב', 'iron man suit', 'שריון מתכת מעופף',
    'פטיש ענק וגלימה אדומה', 'mjolnir hammer', 'פטיש קסום תור',

    // Pokemon
    'עכבר חשמל צהוב עם זנב ברק', 'yellow electric mouse', 'פיקאצו בדיוק',
    'כדור פוקימון', 'pokeball', 'לתפוס פוקימון',

    // Other clear visual matches
    'ספוג צהוב מרובע עם מכנסיים', 'square yellow sponge',
    'חזיר ורוד בשמלה', 'pink pig with dress peppa',
    'אגר ירוק ענק', 'ogre with donkey shrek'
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

    // Check visual descriptions
    for (const desc of BLOCKED_VISUAL_DESCRIPTIONS) {
        if (lowerText.includes(desc.toLowerCase())) {
            return { isBlocked: true, blockedTerm: desc }
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
    return [...BLOCKED_VISUAL_DESCRIPTIONS, ...BLOCKED_BRANDS]
}
