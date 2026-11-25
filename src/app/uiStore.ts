import { create } from 'zustand';

export const TABS = ['home', 'train', 'strength', 'progress', 'coach'] as const;
export type Tab = (typeof TABS)[number];
export type Theme = 'dark' | 'light';

interface UiState {
  tab: Tab;
  theme: Theme;
  /** Set by shortcuts (backup reminder) so the Train tab opens its Backup screen. */
  openBackup: boolean;
  setOpenBackup: (v: boolean) => void;
  /** Set by Settings so the Train tab opens one of its utility screens. */
  openTrain: 'library' | 'import' | 'data' | null;
  setOpenTrain: (v: 'library' | 'import' | 'data' | null) => void;
  /** Settings screen is shown over the current tab. */
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
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
  openBackup: false,
  openTrain: null,
  setOpenTrain: (openTrain) => set({ openTrain }),
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setOpenBackup: (openBackup) => set({ openBackup }),
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
