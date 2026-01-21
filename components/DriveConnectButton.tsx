'use client'

import React, { useState, useEffect } from 'react'
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google'
import { setDriveAccessToken, hasDriveAccess, clearDriveAccess } from '@/services/googleDrive'

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''

interface DriveConnectButtonProps {
    onConnect?: () => void
    onDisconnect?: () => void
}

const DriveConnectButtonInner: React.FC<DriveConnectButtonProps> = ({ onConnect, onDisconnect }) => {
    const [isConnected, setIsConnected] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        setIsConnected(hasDriveAccess())
    }, [])

    const login = useGoogleLogin({
        onSuccess: (response) => {
            setDriveAccessToken(response.access_token)
            setIsConnected(true)
            setIsLoading(false)
            onConnect?.()
        },
        onError: (error) => {
            console.error('Google login error:', error)
            setIsLoading(false)
            alert('ההתחברות נכשלה. וודא שהגדרת את Google Cloud Console נכון.')
        },
        scope: 'https://www.googleapis.com/auth/drive.file',
        flow: 'implicit',  // Use implicit flow - no redirect needed
    })

    const handleConnect = () => {
        setIsLoading(true)
        login()
    }

    const handleDisconnect = () => {
        clearDriveAccess()
        setIsConnected(false)
        onDisconnect?.()
    }

    if (isConnected) {
        return (
            <button
                onClick={handleDisconnect}
                className="flex items-center gap-2 px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-bold hover:bg-green-200 transition-colors"
            >
                <span>✓</span>
                <span className="hidden sm:inline">מחובר ל-Drive</span>
                <span className="text-xs opacity-60">|</span>
                <span className="text-xs text-green-600 hover:text-red-500">נתק</span>
            </button>
        )
    }

    return (
        <button
            onClick={handleConnect}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:border-blue-400 hover:bg-blue-50 transition-all disabled:opacity-50"
        >
            {isLoading ? (
                <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span>
            ) : (
                <svg className="w-5 h-5" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
                    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
                    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
                    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
                    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
                    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
                </svg>
            )}
            <span>התחבר ל-Drive</span>
        </button>
    )
}

// Wrapper with OAuth Provider
const DriveConnectButton: React.FC<DriveConnectButtonProps> = (props) => {
    if (!GOOGLE_CLIENT_ID) {
        return (
            <div className="text-xs text-slate-400">
                Google Drive לא מוגדר
            </div>
        )
    }

    return (
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <DriveConnectButtonInner {...props} />
        </GoogleOAuthProvider>
    )
}

export default DriveConnectButton
