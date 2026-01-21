import type { Config } from 'tailwindcss'

const config: Config = {
    content: [
        './app/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Nunito', 'sans-serif'],
                fredoka: ['Fredoka', 'sans-serif'],
                serif: ['"Frank Ruhl Libre"', 'serif'],
                rubik: ['Rubik', 'sans-serif'],
            },
            colors: {
                kid: {
                    blue: '#40E0D0', // Turquoise
                    yellow: '#FFD700', // Sun Yellow
                    mint: '#98FF98', // Mint
                    orange: '#FFB347', // Gentle Orange
                    text: '#2D3748',
                    paper: '#fffbf0', // Warm paper color
                }
            }
        }
    },
    plugins: [],
}

export default config
