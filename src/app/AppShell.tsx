import { useEffect } from 'react';
import { TabBar } from './TabBar';
import { useUi } from './uiStore';
import { HomeScreen } from '../features/home/HomeScreen';
import { TrainScreen } from '../features/train/TrainScreen';
import { StrengthScreen } from '../features/strength/StrengthScreen';
import { ProgressScreen } from '../features/progress/ProgressScreen';
import { CoachScreen } from '../features/coach/CoachScreen';
import { WorkoutSummarySheet } from '../features/home/WorkoutSummarySheet';
import { UndoBar } from './UndoBar';
import { trashRepo } from '../db/repositories';
import { RestTimer } from '../features/train/RestTimer';
import { useWakeLock } from '../features/train/useWakeLock';
import { useWorkout } from '../features/train/workoutStore';

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
  const workoutActive = useWorkout((s) => !!s.workout);

  // Keep the screen on for the whole workout, whichever tab is open.
  useWakeLock(workoutActive);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Resume: if a workout was left unfinished (app closed, phone locked), open straight into it.
  useEffect(() => {
    void useWorkout
      .getState()
      .load()
      .then(() => {
        if (useWorkout.getState().workout) useUi.getState().setTab('train');
      });
  }, []);

  // Trash older than 30 days is removed for good on launch.
  useEffect(() => {
    void trashRepo.purgeExpired().catch(() => undefined);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <main className="pt-safe px-safe flex-1 overflow-y-auto overscroll-contain">
        <Screen />
      </main>
      <WorkoutSummarySheet />
      <UndoBar />
      <RestTimer />
      <TabBar />
    </div>
  );
}
