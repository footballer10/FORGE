import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useUi } from '../../app/uiStore';

export function HomeScreen() {
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  return (
    <div className="flex flex-col gap-4 pb-6">
      <ScreenHeader title="Forge" />
      <EmptyState
        title="Welcome"
        body="Your streaks, recent PRs and achievements will show here."
      />
      <button
        type="button"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="min-h-tap self-start rounded-card border border-line bg-surface-2 px-4 text-sm"
      >
        Theme: {theme === 'dark' ? 'Dark' : 'Light'}
      </button>
    </div>
  );
}
