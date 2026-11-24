import { useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';
import type { Exercise } from '../../domain/types';
import { ExerciseBrowser } from '../exercises/ExerciseBrowser';
import { ExerciseForm } from '../exercises/ExerciseForm';

type View = { kind: 'home' } | { kind: 'library' } | { kind: 'form'; exercise?: Exercise };

export function TrainScreen() {
  const [view, setView] = useState<View>({ kind: 'home' });

  if (view.kind === 'library') {
    return (
      <ExerciseBrowser
        title="Exercises"
        onSelect={(exercise) => setView({ kind: 'form', exercise })}
        onCreate={() => setView({ kind: 'form' })}
        onBack={() => setView({ kind: 'home' })}
      />
    );
  }
  if (view.kind === 'form') {
    return <ExerciseForm key={view.exercise?.id ?? 'new'} exercise={view.exercise} onDone={() => setView({ kind: 'library' })} />;
  }

  return (
    <div className="flex min-h-full flex-col pb-6">
      <ScreenHeader title="Train" />
      <EmptyState title="No workout in progress" body="Start an empty workout or pick a routine." />
      <button
        type="button"
        onClick={() => setView({ kind: 'library' })}
        className="mt-3 min-h-tap rounded-card border border-line bg-surface px-4 text-left text-base text-fg"
      >
        Exercise library
      </button>
      {/* Primary action sits in the bottom third for one-handed use. */}
      <div className="mt-auto pt-6">
        <button
          type="button"
          disabled
          className="num min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg disabled:opacity-60"
        >
          Start workout
        </button>
        <p className="pt-2 text-center text-xs text-muted">Logging arrives in the next milestone (1a-ii).</p>
      </div>
    </div>
  );
}
