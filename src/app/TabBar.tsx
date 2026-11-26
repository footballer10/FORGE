import { TABS, useUi, type Tab } from './uiStore';

const LABELS: Record<Tab, string> = {
  home: 'Home',
  train: 'Train',
  strength: 'Strength',
  progress: 'Progress',
  nutrition: 'Nutrition',
};

// Simple 24px stroke icons, inline to avoid an icon dependency.
const ICONS: Record<Tab, JSX.Element> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  train: <path d="M2 12h3M19 12h3M5 8v8M19 8v8M8 6v12M16 6v12M8 12h8" />,
  strength: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  progress: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  nutrition: <path d="M7 3v7a3 3 0 0 0 3 3v8M7 3v4M10 3v4M17 3c-2 2-3.5 5-3.5 8H17v10" />,
};

export function TabBar() {
  const tab = useUi((s) => s.tab);
  const setTab = useUi((s) => s.setTab);

  return (
    <nav
      className="pb-safe border-t border-line bg-surface/95 backdrop-blur"
      aria-label="Main"
    >
      <ul className="flex h-[var(--tabbar-h)]">
        {TABS.map((t) => {
          const active = t === tab;
          return (
            <li key={t} className="flex-1">
              <button
                type="button"
                onClick={() => {
                  useUi.getState().setSettingsOpen(false);
                  setTab(t);
                }}
                aria-current={active ? 'page' : undefined}
                className={`flex h-full min-h-tap w-full flex-col items-center justify-center gap-0.5 transition-colors duration-quick ${
                  active ? 'text-fg' : 'text-muted'
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2.2 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {ICONS[t]}
                </svg>
                <span className="font-display text-[13px] font-semibold uppercase tracking-wider">
                  {LABELS[t]}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
