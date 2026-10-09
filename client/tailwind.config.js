/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        guardian: {
          light: '#60a5fa',
          DEFAULT: '#2563eb',
          dark: '#1e3a8a',
        },
        infiltrator: {
          light: '#f87171',
          DEFAULT: '#dc2626',
          dark: '#7f1d1d',
        },
      },
    },
  },
  plugins: [],
}
