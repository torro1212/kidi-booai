'use client'

import { initializeApp, getApps } from 'firebase/app'
import { getFirestore, collection, addDoc, query, where, getDocs, Timestamp, doc, setDoc } from 'firebase/firestore'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'

const firebaseConfig = {
    apiKey: "AIzaSyApO7AYdRZJwORAdoRnB1vjPGtFMcP0j4E",
    authDomain: "kidi-books.firebaseapp.com",
    projectId: "kidi-books",
    storageBucket: "kidi-books.firebasestorage.app",
    messagingSenderId: "346803654720",
    appId: "1:346803654720:web:361e1abea9c8c42e6c0fa5",
    measurementId: "G-XP7XC41LPY"
}

// Initialize Firebase only once
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
const db = getFirestore(app)
const storage = getStorage(app)

export interface PromptRecord {
    bookTitle: string
    mainCharacter: string
    secondaryCharacter?: string
    artStyle: string
    topic: string
    createdAt: Timestamp
    imagePrompts: string[]
    driveZipUrl?: string
    drivePdfUrl?: string
}

export interface SavedBook {
    id: string
    title: string
    pdfUrl: string
    driveZipUrl?: string
    drivePdfUrl?: string
    audioUrls?: string[]
    thumbnailUrl?: string
    createdAt: Timestamp
}

// Save a book's prompts to Firebase
export const saveBookPrompts = async (record: Omit<PromptRecord, 'createdAt'>): Promise<string> => {
    try {
        const docRef = await addDoc(collection(db, 'prompts'), {
            ...record,
            createdAt: Timestamp.now()
        })
        console.log('Saved prompts to Firebase:', docRef.id)
        return docRef.id
    } catch (error) {
        console.error('Error saving to Firebase:', error)
        throw error
    }
}

// Upload PDF to Firebase Storage
export const uploadPdf = async (
    pdfBlob: Blob,
    bookTitle: string
): Promise<string> => {
    try {
        const safeTitle = bookTitle.replace(/[\\/:*?"<>|]/g, '_')
        const timestamp = Date.now()
        const fileName = `books/${timestamp}_${safeTitle}.pdf`

        const storageRef = ref(storage, fileName)
        await uploadBytes(storageRef, pdfBlob, {
            contentType: 'application/pdf'
        })

        const downloadUrl = await getDownloadURL(storageRef)
        console.log('PDF uploaded to Firebase:', downloadUrl)
        return downloadUrl
    } catch (error) {
        console.error('Error uploading PDF:', error)
        throw error
    }
}

// Upload Audio file to Firebase Storage
export const uploadAudio = async (
    audioBlob: Blob,
    bookTitle: string,
    pageNumber: number
): Promise<string> => {
    try {
        const safeTitle = bookTitle.replace(/[\\/:*?"<>|]/g, '_')
        const timestamp = Date.now()
        const fileName = `audio/${timestamp}_${safeTitle}_page_${pageNumber}.wav`

        const storageRef = ref(storage, fileName)
        await uploadBytes(storageRef, audioBlob, {
            contentType: 'audio/wav'
        })

        const downloadUrl = await getDownloadURL(storageRef)
        console.log('Audio uploaded to Firebase:', downloadUrl)
        return downloadUrl
    } catch (error) {
        console.error('Error uploading audio:', error)
        throw error
    }
}

// Upload cover image as thumbnail
export const uploadThumbnail = async (
    imageDataUrl: string,
    bookTitle: string
): Promise<string> => {
    try {
        // Convert data URL to blob
        const response = await fetch(imageDataUrl)
        const blob = await response.blob()

        const safeTitle = bookTitle.replace(/[\\/:*?"<>|]/g, '_')
        const timestamp = Date.now()
        const fileName = `thumbnails/${timestamp}_${safeTitle}.jpg`

        const storageRef = ref(storage, fileName)
        await uploadBytes(storageRef, blob, {
            contentType: 'image/jpeg'
        })

        const downloadUrl = await getDownloadURL(storageRef)
        console.log('Thumbnail uploaded to Firebase:', downloadUrl)
        return downloadUrl
    } catch (error) {
        console.error('Error uploading thumbnail:', error)
        throw error
    }
}

// Save complete book record to Firestore
export const saveBookRecord = async (
    bookTitle: string,
    pdfUrl: string,
    thumbnailUrl?: string,
    audioUrls?: string[]
): Promise<string> => {
    try {
        const bookData: Omit<SavedBook, 'id'> = {
            title: bookTitle,
            pdfUrl,
            thumbnailUrl,
            audioUrls,
            createdAt: Timestamp.now()
        }

        const docRef = await addDoc(collection(db, 'books'), bookData)
        console.log('Book saved to Firebase:', docRef.id)
        return docRef.id
    } catch (error) {
        console.error('Error saving book:', error)
        throw error
    }
}

// Get all saved books (from prompts collection)
export const getSavedBooks = async (): Promise<SavedBook[]> => {
    try {
        // Read from prompts collection since that's where we save
        const promptsQuery = query(collection(db, 'prompts'))
        const snapshot = await getDocs(promptsQuery)

        return snapshot.docs.map(doc => {
            const data = doc.data()
            return {
                id: doc.id,
                title: data.bookTitle || 'ללא כותרת',
                pdfUrl: data.drivePdfUrl || '',
                driveZipUrl: data.driveZipUrl,
                drivePdfUrl: data.drivePdfUrl,
                thumbnailUrl: undefined,
                createdAt: data.createdAt
            } as SavedBook
        })
    } catch (error) {
        console.error('Error getting saved books:', error)
        return []
    }
}

// Check if a similar character/book already exists
export const checkSimilarPrompts = async (
    mainCharacter: string,
    bookTitle: string
): Promise<{ exists: boolean; similarTo?: string }> => {
    try {
        const titleQuery = query(
            collection(db, 'prompts'),
            where('bookTitle', '==', bookTitle)
        )
        const titleSnapshot = await getDocs(titleQuery)

        if (!titleSnapshot.empty) {
            return { exists: true, similarTo: 'כותרת דומה כבר קיימת' }
        }

        const charQuery = query(
            collection(db, 'prompts'),
            where('mainCharacter', '==', mainCharacter)
        )
        const charSnapshot = await getDocs(charQuery)

        if (!charSnapshot.empty) {
            return { exists: true, similarTo: 'דמות ראשית דומה כבר קיימת' }
        }

        return { exists: false }
    } catch (error) {
        console.error('Error checking Firebase:', error)
        return { exists: false }
    }
}

export { db, storage }
