import { useState } from 'react';
import { MenuRow, SubScreen } from '../../components/SubScreen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { BodyweightPanel } from './BodyweightPanel';
import { ConditioningPanel } from './ConditioningPanel';
import { FitnessPanel } from './FitnessPanel';
import { PhotosPanel } from './PhotosPanel';

type Page = 'bodyweight' | 'tests' | 'conditioning' | 'photos';

const PAGES: { id: Page; title: string; detail: string }[] = [
  { id: 'bodyweight', title: 'Bodyweight', detail: 'Weigh-ins and trend' },
  { id: 'tests', title: 'Fitness tests', detail: 'Air Force Academy PFT and AFT, plus your own tests' },
  { id: 'conditioning', title: 'Conditioning', detail: 'Runs, sprints and intervals' },
  { id: 'photos', title: 'Progress photos', detail: 'Kept on this device only' },
];

/** Progress = a short menu (like Measure in Strong); each item opens on its own screen. */
export function ProgressScreen() {
  const [page, setPage] = useState<Page | null>(null);
  if (page) {
    const p = PAGES.find((x) => x.id === page)!;
    return (
      <SubScreen title={p.title} onBack={() => setPage(null)} backLabel="Progress">
        {page === 'bodyweight' && <BodyweightPanel />}
        {page === 'tests' && <FitnessPanel />}
        {page === 'conditioning' && <ConditioningPanel />}
        {page === 'photos' && <PhotosPanel />}
      </SubScreen>
    );
  }
  return (
    <div className="pb-6">
      <ScreenHeader title="Progress" />
      <div className="flex flex-col gap-2">
        {PAGES.map((p) => (
          <MenuRow key={p.id} title={p.title} detail={p.detail} onClick={() => setPage(p.id)} />
        ))}
      </div>
    </div>
  );
}
