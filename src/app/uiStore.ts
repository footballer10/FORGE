import { create } from 'zustand';

export const TABS = ['home', 'train', 'strength', 'progress', 'nutrition'] as const;
export type Tab = (typeof TABS)[number];
export type Theme = 'dark' | 'light';

interface UiState {
  tab: Tab;
  theme: Theme;
  /** Set by shortcuts (backup reminder) so the Train tab opens its Backup screen. */
  openBackup: boolean;
  setOpenBackup: (v: boolean) => void;
  /** Open Settings straight to a sub-page (Home notice for a waiting proposal). */
  settingsPage: 'claude' | null;
  /** Set by the Train tab so Settings → Claude opens with the A/B/C starter program ready to review. */
  starterRequest: boolean;
  setStarterRequest: (v: boolean) => void;
  setSettingsPage: (v: 'claude' | null) => void;
  /** Set by Settings so the Train tab opens one of its utility screens. */
  openTrain: 'library' | 'import' | 'data' | 'review' | null;
  setOpenTrain: (v: 'library' | 'import' | 'data' | 'review' | null) => void;
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
  settingsPage: null,
  starterRequest: false,
  setStarterRequest: (starterRequest) => set({ starterRequest }),
  setSettingsPage: (settingsPage) => set({ settingsPage }),
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
