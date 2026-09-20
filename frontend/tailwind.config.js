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
        // Sleek dark-mode discord/whatsapp inspired colors
        dark: {
          50: '#4f545c',
          100: '#40444b',
          200: '#36393f',
          300: '#2f3136',
          400: '#292b2f',
          500: '#202225',
          600: '#18191c',
        },
        whatsapp: {
          light: '#efeae2',
          dark: '#0b141a',
          messageLight: '#d9fdd3',
          messageDark: '#005c4b',
          teal: '#00a884',
        }
      },
    },
  },
  plugins: [],
}
