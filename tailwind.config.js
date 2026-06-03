/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        wallet: {
          bg: '#f0f3f8',
          navy: '#002887',
          card: '#002854',
          button: '#00247d',
        },
      },
    },
  },
  plugins: [],
};
