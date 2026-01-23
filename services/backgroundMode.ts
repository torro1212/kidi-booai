'use client'

// Background processing utilities for mobile devices
// Prevents the browser from suspending generation when switching apps

let wakeLock: WakeLockSentinel | null = null

// Request a wake lock to prevent screen from sleeping during generation
export const requestWakeLock = async (): Promise<boolean> => {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen')
            console.log('Wake lock acquired - screen will stay on during generation')

            // Re-acquire wake lock if page becomes visible again after being hidden
            document.addEventListener('visibilitychange', async () => {
                if (document.visibilityState === 'visible' && wakeLock === null) {
                    try {
                        wakeLock = await navigator.wakeLock.request('screen')
                        console.log('Wake lock re-acquired')
                    } catch (e) {
                        console.warn('Failed to re-acquire wake lock')
                    }
                }
            })

            return true
        } catch (err) {
            console.warn('Wake lock not available:', err)
            return false
        }
    }
    return false
}

// Release the wake lock
export const releaseWakeLock = () => {
    if (wakeLock) {
        wakeLock.release()
        wakeLock = null
        console.log('Wake lock released')
    }
}

// Keep-alive ping to prevent tab from being suspended
let keepAliveInterval: NodeJS.Timeout | null = null

export const startKeepAlive = () => {
    if (keepAliveInterval) return

    // Ping every 10 seconds to keep the tab active
    keepAliveInterval = setInterval(() => {
        // Small activity to prevent suspension
        const now = Date.now()
        localStorage.setItem('_keepalive', now.toString())
    }, 10000)

    console.log('Keep-alive started')
}

export const stopKeepAlive = () => {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval)
        keepAliveInterval = null
        console.log('Keep-alive stopped')
    }
}

// Combined helper for generation tasks
export const startBackgroundMode = async (): Promise<void> => {
    await requestWakeLock()
    startKeepAlive()
}

export const stopBackgroundMode = (): void => {
    releaseWakeLock()
    stopKeepAlive()
}

// Check if page is visible
export const isPageVisible = (): boolean => {
    return document.visibilityState === 'visible'
}

// Add visibility change listener
export const onVisibilityChange = (callback: (isVisible: boolean) => void): (() => void) => {
    const handler = () => {
        callback(document.visibilityState === 'visible')
    }

    document.addEventListener('visibilitychange', handler)

    // Return cleanup function
    return () => document.removeEventListener('visibilitychange', handler)
}
