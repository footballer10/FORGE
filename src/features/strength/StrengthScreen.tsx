import { useEffect, useState } from 'react';
import { analyticsRepo, type LiftedExercise } from '../../db/repositories';
import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ExerciseStrength } from './ExerciseStrength';

/** Strength tab: lifts you have trained; tap one for its e1RM chart and PRs. */
export function StrengthScreen() {
  const [lifts, setLifts] = useState<LiftedExercise[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void analyticsRepo.liftedExercises().then((l) => live && setLifts(l));
    return () => {
      live = false;
    };
  }, []);

  if (openId) return <ExerciseStrength exerciseId={openId} onBack={() => setOpenId(null)} />;
  if (lifts === null) return null;

  return (
    <div className="pb-6">
      <ScreenHeader title="Strength" />
      {lifts.length === 0 ? (
        <EmptyState title="No lifts yet" body="e1RM charts and PRs appear here once you have finished a workout with weighted sets." />
      ) : (
        <ul className="flex flex-col gap-2">
          {lifts.map((l) => (
            <li key={l.exercise.id}>
              <button
                type="button"
                onClick={() => setOpenId(l.exercise.id)}
                className="flex min-h-tap w-full items-center justify-between rounded-card border border-line bg-surface px-4 py-3 text-left"
              >
                <span className="text-base font-medium">{l.exercise.name}</span>
                <span className="text-sm tabular-nums text-muted">
                  {l.sets} sets · {new Date(l.lastDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
