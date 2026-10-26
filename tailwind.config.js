/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bred: '#d62828',
        bblue: '#1d4ed8',
      },
    },
  },
  plugins: [],
};
