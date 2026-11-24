import { useEffect, useState } from 'react';
import { metaRepo, workoutRepo } from '../../db/repositories';
import { backupDue, daysSince } from '../../domain/safety';

/** Weekly nudge to back up. "Later" snoozes for a day; a JSON export resets the clock. */
export function BackupReminder({ onOpen }: { onOpen: () => void }) {
  const [days, setDays] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [last, snoozed, any] = await Promise.all([
        metaRepo.get<string>('lastBackupAt'),
        metaRepo.get<string>('backupSnoozedUntil'),
        workoutRepo.listHistory(1),
      ]);
      const now = new Date();
      if (!live) return;
      setDays(backupDue({ ...(last ? { lastBackupAt: last } : {}), ...(snoozed ? { snoozedUntil: snoozed } : {}), hasData: any.length > 0, now }) ? (daysSince(last, now) ?? null) : undefined);
    })();
    return () => {
      live = false;
    };
  }, []);

  if (days === undefined) return null;
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
      <p className="text-base text-fg">{days === null ? 'No backup yet.' : `Last backup ${days} days ago.`} Save one so a lost phone does not lose your training.</p>
      <div className="flex gap-2">
        <button type="button" onClick={onOpen} className="num min-h-tap flex-1 rounded-card bg-accent text-base font-semibold uppercase tracking-wider text-accent-fg">Back up</button>
        <button
          type="button"
          onClick={() => {
            void metaRepo.set('backupSnoozedUntil', new Date(Date.now() + 86_400_000).toISOString());
            setDays(undefined);
          }}
          className="min-h-tap flex-1 rounded-card border border-line text-base text-fg"
        >
          Later
        </button>
      </div>
    </div>
  );
}
