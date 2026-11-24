import { useEffect, useState } from 'react';
import { useUi } from '../../app/uiStore';
import { BackupReminder } from '../data/BackupReminder';
import { ScreenHeader } from '../../components/ScreenHeader';
import type { Exercise, ID, Routine } from '../../domain/types';
import { ExerciseBrowser } from '../exercises/ExerciseBrowser';
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
import { HistoryCalendar } from './HistoryCalendar';
import { HistoryList } from './HistoryList';
import { useWorkout } from './workoutStore';

type View =
  | { kind: 'home' }
  | { kind: 'library' }
  | { kind: 'import' }
  | { kind: 'data' }
  | { kind: 'routine'; routine?: Routine }
  | { kind: 'program'; programId: string }
  | { kind: 'programEdit'; tree?: ProgramTree }
  | { kind: 'form'; exercise?: Exercise; returnTo: 'library' | 'pick'; swapWeId?: ID }
  | { kind: 'pick'; swapWeId?: ID };

export function TrainScreen() {
  const [view, setView] = useState<View>({ kind: 'home' });
  const [historyMode, setHistoryMode] = useState<'list' | 'calendar'>('list');
  const openBackup = useUi((s) => s.openBackup);
  useEffect(() => {
    if (openBackup) {
      useUi.getState().setOpenBackup(false);
      setView({ kind: 'data' });
    }
  }, [openBackup]);
  const loaded = useWorkout((s) => s.loaded);
  const active = useWorkout((s) => s.workout);
  const start = useWorkout((s) => s.start);
  const addExercise = useWorkout((s) => s.addExercise);
  const swapExercise = useWorkout((s) => s.swapExercise);
  const showPairTotal = useWorkout((s) => s.showPairTotal);
  const setShowPairTotal = useWorkout((s) => s.setShowPairTotal);

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
      <ScreenHeader title="Train" />
      <BackupReminder onOpen={() => setView({ kind: 'data' })} />
      <button
        type="button"
        onClick={() => setView({ kind: 'library' })}
        className="mb-4 min-h-tap rounded-card border border-line bg-surface px-4 text-left text-base text-fg"
      >
        Exercise library
      </button>
      <button
        type="button"
        onClick={() => setView({ kind: 'import' })}
        className="mb-4 min-h-tap rounded-card border border-line bg-surface px-4 text-left text-base text-fg"
      >
        Import from Strong
      </button>
      <button
        type="button"
        onClick={() => setView({ kind: 'data' })}
        className="mb-4 min-h-tap rounded-card border border-line bg-surface px-4 text-left text-base text-fg"
      >
        Backup &amp; restore
      </button>
      <label className="mb-4 flex min-h-tap items-center justify-between rounded-card border border-line bg-surface px-4 text-base text-fg">
        <span>Show dumbbell pair total</span>
        <input type="checkbox" className="h-6 w-6" checked={showPairTotal} onChange={(e) => void setShowPairTotal(e.target.checked)} />
      </label>
      <ProgramList onOpen={(programId) => setView({ kind: 'program', programId })} onNew={() => setView({ kind: 'programEdit' })} onStarted={() => setView({ kind: 'home' })} />
      <RoutineList onEdit={(routine) => setView({ kind: 'routine', ...(routine ? { routine } : {}) })} onStarted={() => setView({ kind: 'home' })} />
      <div className="flex items-baseline justify-between pb-2">
        <h2 className="text-2xl uppercase">History</h2>
        <div className="flex gap-1" role="group" aria-label="History view">
          {(['list', 'calendar'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={historyMode === m} onClick={() => setHistoryMode(m)} className={`min-h-tap rounded-card border border-line px-3 text-sm capitalize ${historyMode === m ? 'bg-surface-2 text-fg' : 'text-muted'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>
      {historyMode === 'list' ? <HistoryList /> : <HistoryCalendar />}
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
