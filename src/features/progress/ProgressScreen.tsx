import { ScreenHeader } from '../../components/ScreenHeader';
import { BodyweightPanel } from './BodyweightPanel';
import { ConditioningPanel } from './ConditioningPanel';
import { FitnessPanel } from './FitnessPanel';
import { PhotosPanel } from './PhotosPanel';
import { VolumePanel } from './VolumePanel';

export function ProgressScreen() {
  return (
    <div className="pb-6">
      <ScreenHeader title="Progress" />
      <BodyweightPanel />
      <VolumePanel />
      <ConditioningPanel />
      <FitnessPanel />
      <PhotosPanel />
    </div>
  );
}
