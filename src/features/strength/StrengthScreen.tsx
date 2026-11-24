import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';

export function StrengthScreen() {
  return (
    <div className="pb-6">
      <ScreenHeader title="Strength" />
      <EmptyState title="No lifts yet" body="e1RM charts, PRs, strength score and tiers appear here once you have logged workouts." />
    </div>
  );
}
