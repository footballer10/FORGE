import { useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import type { Exercise, ID } from '../../domain/types';
import { ExerciseBrowser } from '../exercises/ExerciseBrowser';
import { ExerciseForm } from '../exercises/ExerciseForm';
import { ActiveWorkout } from './ActiveWorkout';
import { HistoryList } from './HistoryList';
import { useWorkout } from './workoutStore';

type View =
  | { kind: 'home' }
  | { kind: 'library' }
  | { kind: 'form'; exercise?: Exercise; returnTo: 'library' | 'pick'; swapWeId?: ID }
  | { kind: 'pick'; swapWeId?: ID };

export function TrainScreen() {
  const [view, setView] = useState<View>({ kind: 'home' });
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
      <ScreenHeader title="Train" />
      <button
        type="button"
        onClick={() => setView({ kind: 'library' })}
        className="mb-4 min-h-tap rounded-card border border-line bg-surface px-4 text-left text-base text-fg"
      >
        Exercise library
      </button>
      <h2 className="pb-2 text-2xl uppercase">History</h2>
      <HistoryList />
      {/* Primary action sits in the bottom third for one-handed use. */}
      <div className="sticky bottom-0 mt-auto bg-bg pt-4">
        <button
          type="button"
          onClick={() => void start().then(() => setView({ kind: 'pick' }))}
          className="num min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg"
        >
          Start workout
        </button>
      </div>
    </div>
  );
}
