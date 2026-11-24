import { create } from 'zustand';

export const TABS = ['home', 'train', 'strength', 'progress', 'coach'] as const;
export type Tab = (typeof TABS)[number];
export type Theme = 'dark' | 'light';

interface UiState {
  tab: Tab;
  theme: Theme;
  setTab: (tab: Tab) => void;
  setTheme: (theme: Theme) => void;
}

const THEME_KEY = 'forge.theme';

function initialTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export const useUi = create<UiState>((set) => ({
  tab: 'home',
  theme: initialTheme(),
  setTab: (tab) => set({ tab }),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage unavailable: theme still applies for this session */
    }
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },
}));
