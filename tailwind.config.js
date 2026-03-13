/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        v: {
          charcoal: '#0F1117',
          navy: '#0D1B2A',
          surface: '#1A2236',
          'surface-light': '#1E2A40',
          gold: '#C9A84C',
          'gold-dim': '#A68A3E',
          'gold-muted': '#8B7433',
          border: '#2A3A50',
          'text-primary': '#F5F5F5',
          'text-secondary': '#8A9BB0',
          success: '#2ECC71',
          danger: '#E74C3C',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
}
