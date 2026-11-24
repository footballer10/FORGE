import { ScreenHeader } from '../../components/ScreenHeader';
import { VolumePanel } from './VolumePanel';

export function ProgressScreen() {
  return (
    <div className="pb-6">
      <ScreenHeader title="Progress" />
      <VolumePanel />
    </div>
  );
}
