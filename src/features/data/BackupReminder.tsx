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
    <div className="mb-3 flex items-center gap-2 rounded-card border border-line bg-surface px-3 py-2">
      <p className="flex-1 text-sm text-fg">{days === null ? 'No backup yet' : `Last backup ${days} days ago`}</p>
      <button type="button" onClick={onOpen} className="num min-h-tap rounded-card bg-accent px-4 text-sm font-semibold uppercase tracking-wider text-accent-fg">Back up</button>
      <button
        type="button"
        onClick={() => {
          void metaRepo.set('backupSnoozedUntil', new Date(Date.now() + 86_400_000).toISOString());
          setDays(undefined);
        }}
        className="min-h-tap px-2 text-sm text-muted"
      >
        Later
      </button>
    </div>
  );
}
