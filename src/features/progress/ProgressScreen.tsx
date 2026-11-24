import { ScreenHeader } from '../../components/ScreenHeader';
import { BodyweightPanel } from './BodyweightPanel';
import { FitnessPanel } from './FitnessPanel';
import { VolumePanel } from './VolumePanel';

export function ProgressScreen() {
  return (
    <div className="pb-6">
      <ScreenHeader title="Progress" />
      <BodyweightPanel />
      <VolumePanel />
      <FitnessPanel />
    </div>
  );
}
