import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';

export function CoachScreen() {
  return (
    <div className="pb-6">
      <ScreenHeader title="Coach" />
      <EmptyState title="Coach" body="Copy your training summary for Claude and import Claude's programs for review. Nothing changes without your approval." />
    </div>
  );
}
