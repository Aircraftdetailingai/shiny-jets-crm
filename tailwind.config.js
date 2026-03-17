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
          sidebar: '#080C12',
          surface: '#1A2236',
          'surface-light': '#1E2A40',
          gold: 'var(--v-gold, #C9A84C)',
          'gold-dim': 'var(--v-gold-dim, #A68A3E)',
          'gold-muted': '#8B7433',
          border: '#2A3A50',
          'border-subtle': '#1A2236',
          'text-primary': '#F5F5F5',
          'text-secondary': '#8A9BB0',
          success: '#2ECC71',
          danger: '#E74C3C',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['var(--font-playfair)', 'Playfair Display', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      gridTemplateColumns: {
        '14': 'repeat(14, minmax(0, 1fr))',
      },
    },
  },
  plugins: [],
}
