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
        'accent-text': v('accent-text'),
      },
      fontFamily: {
        display: ['"Barlow Condensed"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      minHeight: { tap: '44px' },
      minWidth: { tap: '44px' },
      borderRadius: { card: '14px' },
      transitionDuration: { quick: '180ms' },
      keyframes: { pr: { '0%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.03)' }, '100%': { transform: 'scale(1)' } } },
      animation: { pr: 'pr 240ms ease-out 1' },
    },
  },
  plugins: [],
} satisfies Config;
