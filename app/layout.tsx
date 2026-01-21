import type { Metadata } from 'next'
import { Nunito, Fredoka, Rubik } from 'next/font/google'
import './globals.css'

const nunito = Nunito({
    subsets: ['latin'],
    variable: '--font-nunito',
    display: 'swap',
})

const fredoka = Fredoka({
    subsets: ['latin'],
    variable: '--font-fredoka',
    display: 'swap',
})

const rubik = Rubik({
    subsets: ['latin', 'hebrew'],
    variable: '--font-rubik',
    display: 'swap',
})

export const metadata: Metadata = {
    title: 'KidCraft AI - Create. Learn. Grow.',
    description: 'Create magical children\'s books with AI',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="he" dir="rtl">
            <body className={`${nunito.variable} ${fredoka.variable} ${rubik.variable} font-sans`}>
                {children}
            </body>
        </html>
    )
}
