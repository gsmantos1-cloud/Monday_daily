/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#D4AF37',
        'primary-dark': '#B8960C',
        'primary-light': '#F5E6A3',
        success: '#00c875',
        warning: '#fdab3d',
        danger: '#e2445c',
        purple: '#a78bfa',
        surface: '#111111',
        'surface-2': '#1a1a1a',
        sidebar: '#0a0a0a',
        gold: '#D4AF37',
        'gold-dark': '#B8960C',
      }
    }
  },
  plugins: []
};
