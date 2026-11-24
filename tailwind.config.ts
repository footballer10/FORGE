import type { Config } from 'tailwindcss';

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        'surface-2': v('surface-2'),
        line: v('line'),
        fg: v('fg'),
        muted: v('muted'),
        accent: v('accent'),
        'accent-fg': v('accent-fg'),
      },
      fontFamily: {
        display: ['"Barlow Condensed"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      minHeight: { tap: '44px' },
      minWidth: { tap: '44px' },
      borderRadius: { card: '14px' },
      transitionDuration: { quick: '180ms' },
    },
  },
  plugins: [],
} satisfies Config;
