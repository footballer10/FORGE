import { useEffect, useState } from 'react';
import { useUi } from '../../app/uiStore';
import { ScreenHeader } from '../../components/ScreenHeader';
import type { Exercise, ID, Routine } from '../../domain/types';
import { ExerciseBrowser } from '../exercises/ExerciseBrowser';
import { TraitReview } from '../exercises/TraitReview';
import { ExerciseForm } from '../exercises/ExerciseForm';
import { ActiveWorkout } from './ActiveWorkout';
import { DataScreen } from '../data/DataScreen';
import { ImportScreen } from '../import/ImportScreen';
import { ProgramEditor } from '../programs/ProgramEditor';
import { ProgramList } from '../programs/ProgramList';
import { ProgramView } from '../programs/ProgramView';
import type { ProgramTree } from '../../domain/program';
import { RoutineEditor } from '../routines/RoutineEditor';
import { RoutineList } from '../routines/RoutineList';
import { useWorkout } from './workoutStore';

type View =
  | { kind: 'home' }
  | { kind: 'library' }
  | { kind: 'import' }
  | { kind: 'data' }
  | { kind: 'review' }
  | { kind: 'routine'; routine?: Routine }
  | { kind: 'program'; programId: string }
  | { kind: 'programEdit'; tree?: ProgramTree }
  | { kind: 'form'; exercise?: Exercise; returnTo: 'library' | 'pick'; swapWeId?: ID }
  | { kind: 'pick'; swapWeId?: ID };

export function TrainScreen() {
  const [view, setView] = useState<View>({ kind: 'home' });
  const openBackup = useUi((s) => s.openBackup);
  useEffect(() => {
    if (openBackup) {
      useUi.getState().setOpenBackup(false);
      setView({ kind: 'data' });
    }
  }, [openBackup]);
  const openTrain = useUi((s) => s.openTrain);
  useEffect(() => {
    if (openTrain) {
      useUi.getState().setOpenTrain(null);
      setView({ kind: openTrain });
    }
  }, [openTrain]);
  const loaded = useWorkout((s) => s.loaded);
  const active = useWorkout((s) => s.workout);
  const start = useWorkout((s) => s.start);
  const addExercise = useWorkout((s) => s.addExercise);
  const swapExercise = useWorkout((s) => s.swapExercise);

  if (view.kind === 'pick') {
    return (
      <ExerciseBrowser
        title={view.swapWeId ? 'Swap exercise' : 'Add exercise'}
        onSelect={(e) => {
          void (view.swapWeId ? swapExercise(view.swapWeId, e.id) : addExercise(e.id));
          setView({ kind: 'home' });
        }}
        onCreate={() => setView({ kind: 'form', returnTo: 'pick', ...(view.swapWeId ? { swapWeId: view.swapWeId } : {}) })}
        onBack={() => setView({ kind: 'home' })}
      />
    );
  }
  if (view.kind === 'routine') return <RoutineEditor key={view.routine?.id ?? 'new'} routine={view.routine} onDone={() => setView({ kind: 'home' })} />;
  if (view.kind === 'programEdit') {
    return (
      <ProgramEditor
        key={view.tree?.program.id ?? 'new'}
        {...(view.tree ? { tree: view.tree } : {})}
        onDone={(id) => setView(id ? { kind: 'program', programId: id } : view.tree ? { kind: 'program', programId: view.tree.program.id } : { kind: 'home' })}
      />
    );
  }
  if (view.kind === 'program') {
    return <ProgramView key={view.programId} programId={view.programId} onBack={() => setView({ kind: 'home' })} onEdit={(tree) => setView({ kind: 'programEdit', tree })} onStarted={() => setView({ kind: 'home' })} />;
  }
  if (view.kind === 'data') return <DataScreen onBack={() => setView({ kind: 'home' })} />;
  if (view.kind === 'review') return <TraitReview onBack={() => setView({ kind: 'home' })} />;
  if (view.kind === 'import') return <ImportScreen onBack={() => setView({ kind: 'home' })} />;
  if (view.kind === 'library') {
    return (
      <ExerciseBrowser
        title="Exercises"
        onSelect={(exercise) => setView({ kind: 'form', exercise, returnTo: 'library' })}
        onCreate={() => setView({ kind: 'form', returnTo: 'library' })}
        onBack={() => setView({ kind: 'home' })}
      />
    );
  }
  if (view.kind === 'form') {
    return <ExerciseForm key={view.exercise?.id ?? 'new'} exercise={view.exercise} onDone={() => setView(view.returnTo === 'pick' ? { kind: 'pick', ...(view.swapWeId ? { swapWeId: view.swapWeId } : {}) } : { kind: 'library' })} />;
  }

  if (!loaded) return <div className="min-h-full" />;
  if (active) return <ActiveWorkout onAddExercise={() => setView({ kind: 'pick' })} onSwapExercise={(swapWeId) => setView({ kind: 'pick', swapWeId })} />;

  return (
    <div className="flex min-h-full flex-col pb-6">
      <ScreenHeader title="Start workout" />
      <ProgramList onOpen={(programId) => setView({ kind: 'program', programId })} onNew={() => setView({ kind: 'programEdit' })} onStarted={() => setView({ kind: 'home' })} />
      <RoutineList onEdit={(routine) => setView({ kind: 'routine', ...(routine ? { routine } : {}) })} onStarted={() => setView({ kind: 'home' })} />
      {/* Primary action sits in the bottom third for one-handed use. */}
      <div className="sticky bottom-0 mt-auto bg-bg pt-4">
        <button
          type="button"
          onClick={() => void start().then(() => setView({ kind: 'pick' }))}
          className="num min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg"
        >
          Start workout
        </button>
        <button
          type="button"
          onClick={() => void start('conditioning').then(() => setView({ kind: 'pick' }))}
          className="min-h-tap w-full text-sm text-muted"
        >
          Start a conditioning session instead
        </button>
      </div>
    </div>
  );
}
