import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';

export function TrainScreen() {
  return (
    <div className="flex min-h-full flex-col pb-6">
      <ScreenHeader title="Train" />
      <EmptyState title="No workout in progress" body="Start an empty workout or pick a routine." />
      {/* Primary action sits in the bottom third for one-handed use. */}
      <div className="mt-auto pt-6">
        <button
          type="button"
          disabled
          className="num min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg disabled:opacity-60"
        >
          Start workout
        </button>
        <p className="pt-2 text-center text-xs text-muted">Logging arrives in Milestone 1.</p>
      </div>
    </div>
  );
}
