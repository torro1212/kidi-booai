'use client'

// Google Drive service for uploading files
// Uses OAuth2 to authenticate and upload files

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''

interface DriveUploadResult {
    fileId: string
    webViewLink: string
    webContentLink: string
}

// Store access token
let accessToken: string | null = null

export const setDriveAccessToken = (token: string) => {
    accessToken = token
    // Also store in sessionStorage for persistence
    if (typeof window !== 'undefined') {
        sessionStorage.setItem('drive_access_token', token)
    }
}

export const getDriveAccessToken = (): string | null => {
    if (accessToken) return accessToken
    if (typeof window !== 'undefined') {
        return sessionStorage.getItem('drive_access_token')
    }
    return null
}

export const hasDriveAccess = (): boolean => {
    return !!getDriveAccessToken()
}

export const clearDriveAccess = () => {
    accessToken = null
    if (typeof window !== 'undefined') {
        sessionStorage.removeItem('drive_access_token')
    }
}

// Create or get the KidCraft folder in Drive
const getOrCreateFolder = async (token: string): Promise<string> => {
    const folderName = 'KidCraft AI Books'

    // Search for existing folder
    const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        {
            headers: { Authorization: `Bearer ${token}` }
        }
    )

    const searchResult = await searchResponse.json()

    if (searchResult.files && searchResult.files.length > 0) {
        return searchResult.files[0].id
    }

    // Create new folder
    const createResponse = await fetch(
        'https://www.googleapis.com/drive/v3/files',
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder'
            })
        }
    )

    const folder = await createResponse.json()
    return folder.id
}

// Upload file to Google Drive
export const uploadToDrive = async (
    file: Blob,
    fileName: string,
    mimeType: string
): Promise<DriveUploadResult> => {
    const token = getDriveAccessToken()
    if (!token) {
        throw new Error('לא מחובר ל-Google Drive')
    }

    try {
        // Get or create the KidCraft folder
        const folderId = await getOrCreateFolder(token)

        // Create multipart upload body
        const metadata = {
            name: fileName,
            parents: [folderId]
        }

        const form = new FormData()
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
        form.append('file', file)

        // Upload file
        const uploadResponse = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`
                },
                body: form
            }
        )

        if (!uploadResponse.ok) {
            const error = await uploadResponse.json()
            throw new Error(error.error?.message || 'Upload failed')
        }

        const result = await uploadResponse.json()

        // Make file publicly accessible
        await fetch(
            `https://www.googleapis.com/drive/v3/files/${result.id}/permissions`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    role: 'reader',
                    type: 'anyone'
                })
            }
        )

        return {
            fileId: result.id,
            webViewLink: result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`,
            webContentLink: result.webContentLink || `https://drive.google.com/uc?id=${result.id}&export=download`
        }
    } catch (error: any) {
        console.error('Drive upload error:', error)
        throw error
    }
}

// Upload ZIP and PDF to Drive and return links
export const uploadBookToDrive = async (
    zipBlob: Blob,
    pdfBlob: Blob,
    bookTitle: string
): Promise<{ zipLink: string; pdfLink: string }> => {
    const safeTitle = bookTitle.replace(/[\\/:*?"<>|]/g, '_')
    const timestamp = new Date().toISOString().split('T')[0]

    const [zipResult, pdfResult] = await Promise.all([
        uploadToDrive(zipBlob, `${safeTitle}_${timestamp}.zip`, 'application/zip'),
        uploadToDrive(pdfBlob, `${safeTitle}_${timestamp}.pdf`, 'application/pdf')
    ])

    return {
        zipLink: zipResult.webViewLink,
        pdfLink: pdfResult.webViewLink
    }
}

export { GOOGLE_CLIENT_ID }
