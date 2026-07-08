/** @type {import('tailwindcss').Config} */
const { tailwindColors } = require('./src/config/themeColors')

module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // All color values live in src/config/themeColors.js — edit them there.
      colors: tailwindColors,
    },
  },
  plugins: [],
};
