import { useEffect } from 'react';
import { TabBar } from './TabBar';
import { useUi } from './uiStore';
import { HomeScreen } from '../features/home/HomeScreen';
import { TrainScreen } from '../features/train/TrainScreen';
import { StrengthScreen } from '../features/strength/StrengthScreen';
import { ProgressScreen } from '../features/progress/ProgressScreen';
import { CoachScreen } from '../features/coach/CoachScreen';

const SCREENS = {
  home: HomeScreen,
  train: TrainScreen,
  strength: StrengthScreen,
  progress: ProgressScreen,
  coach: CoachScreen,
};

export function AppShell() {
  const tab = useUi((s) => s.tab);
  const theme = useUi((s) => s.theme);
  const Screen = SCREENS[tab];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="flex h-full flex-col">
      <main className="pt-safe px-safe flex-1 overflow-y-auto overscroll-contain">
        <Screen />
      </main>
      <TabBar />
    </div>
  );
}
