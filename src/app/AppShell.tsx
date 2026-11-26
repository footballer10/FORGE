import { Suspense, lazy, useEffect } from 'react';
import { TabBar } from './TabBar';
import { useUi } from './uiStore';
import { HomeScreen } from '../features/home/HomeScreen';
import { TrainScreen } from '../features/train/TrainScreen';
import { Onboarding } from '../features/settings/Onboarding';
import { WorkoutSummarySheet } from '../features/home/WorkoutSummarySheet';
import { UndoBar } from './UndoBar';
import { trashRepo } from '../db/repositories';
import { RestTimer } from '../features/train/RestTimer';
import { WorkoutBar } from './WorkoutBar';
import { useWakeLock } from '../features/train/useWakeLock';
import { useWorkout } from '../features/train/workoutStore';
import { syncRestAudio, unlockRestAudio } from '../features/train/restAudio';
import { startAutoSync } from '../db/autoSync';
import { ensureLibrary } from '../db/seedLibrary';
import { fixLatPulldownGrip } from '../db/fixups';

const StrengthScreen = lazy(() => import('../features/strength/StrengthScreen').then((m) => ({ default: m.StrengthScreen })));
const ProgressScreen = lazy(() => import('../features/progress/ProgressScreen').then((m) => ({ default: m.ProgressScreen })));
const NutritionScreen = lazy(() => import('../features/nutrition/NutritionScreen').then((m) => ({ default: m.NutritionScreen })));
const SettingsScreen = lazy(() => import('../features/settings/SettingsScreen').then((m) => ({ default: m.SettingsScreen })));
const SCREENS = {
  home: HomeScreen,
  train: TrainScreen,
  strength: StrengthScreen,
  progress: ProgressScreen,
  nutrition: NutritionScreen,
};

export function AppShell() {
  const tab = useUi((s) => s.tab);
  const theme = useUi((s) => s.theme);
  const settingsOpen = useUi((s) => s.settingsOpen);
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

  // iOS only lets audio play after a tap: unlock on the first one, then resume a rest already running.
  useEffect(() => {
    const unlock = () => {
      void unlockRestAudio().then(() => syncRestAudio(useWorkout.getState().restEndsAt));
      window.removeEventListener('click', unlock, true);
      window.removeEventListener('touchend', unlock, true);
    };
    window.addEventListener('click', unlock, true);
    window.addEventListener('touchend', unlock, true);
    return () => {
      window.removeEventListener('click', unlock, true);
      window.removeEventListener('touchend', unlock, true);
    };
  }, []);

  // Keep the cloud copy (and so Claude's view of your training) fresh without tapping Sync.
  useEffect(() => startAutoSync(), []);

  // One-time data fixes, after the library is in place.
  useEffect(() => {
    void ensureLibrary().then(() => fixLatPulldownGrip()).catch(() => undefined);
  }, []);

  // Trash older than 30 days is removed for good on launch.
  useEffect(() => {
    void trashRepo.purgeExpired().catch(() => undefined);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <main className="pt-safe px-safe flex-1 overflow-y-auto overscroll-contain">
        <Suspense fallback={<p className="py-6 text-sm text-muted" role="status">Loading…</p>}>
          {settingsOpen ? <SettingsScreen /> : <Screen />}
        </Suspense>
      </main>
      <WorkoutSummarySheet />
      <Onboarding />
      <UndoBar />
      <WorkoutBar />
      <RestTimer />
      <TabBar />
    </div>
  );
}
