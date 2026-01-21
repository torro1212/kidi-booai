'use client'

const API_KEY_STORAGE_KEY = 'kidcraft_gemini_api_key'

export const apiKeyManager = {
    getKey: (): string | null => {
        if (typeof window === 'undefined') return null
        return localStorage.getItem(API_KEY_STORAGE_KEY)
    },

    setKey: (key: string): void => {
        if (typeof window === 'undefined') return
        localStorage.setItem(API_KEY_STORAGE_KEY, key)
    },

    removeKey: (): void => {
        if (typeof window === 'undefined') return
        localStorage.removeItem(API_KEY_STORAGE_KEY)
    },

    hasKey: (): boolean => {
        return !!apiKeyManager.getKey()
    }
}
