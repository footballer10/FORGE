import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';

export function ProgressScreen() {
  return (
    <div className="pb-6">
      <ScreenHeader title="Progress" />
      <EmptyState title="Nothing tracked yet" body="Bodyweight, fitness tests, calendar and weekly volume will live here." />
    </div>
  );
}
