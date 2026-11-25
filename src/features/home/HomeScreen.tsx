import { useEffect, useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useUi } from '../../app/uiStore';
import { BackupReminder } from '../data/BackupReminder';
import { achievementsRepo } from '../../db/repositories';
import type { StreakSummary } from '../../domain/streaks';
import { HistoryCalendar } from '../train/HistoryCalendar';
import { HistoryList } from '../train/HistoryList';

/** Home = your training log (like the History/Profile tab in Strong and Hevy): one status line, then workouts. */
export function HomeScreen() {
  const [streak, setStreak] = useState<StreakSummary>();
  const [mode, setMode] = useState<'list' | 'calendar'>('list');

  useEffect(() => {
    let live = true;
    void (async () => {
      await achievementsRepo.sync(); // records milestones; they are shown after a workout and under Strength → Insights
      const s = await achievementsRepo.streak();
      if (live) setStreak(s);
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="flex flex-col pb-6">
      <div className="flex items-center justify-between">
        <ScreenHeader title="Forge" />
        <button type="button" aria-label="Settings" onClick={() => useUi.getState().setSettingsOpen(true)} className="min-h-tap min-w-tap px-2 text-sm text-muted">
          Settings
        </button>
      </div>
      {streak && (
        <p className="num pb-3 text-base">
          <span className="text-fg">{streak.thisWeekDays} of {streak.target} days this week</span>
          {streak.current > 0 && <span className="text-muted"> · {streak.current}-week streak</span>}
        </p>
      )}
      <BackupReminder
        onOpen={() => {
          useUi.getState().setOpenBackup(true);
          useUi.getState().setTab('train');
        }}
      />
      <div className="flex items-baseline justify-between pb-2">
        <h2 className="text-2xl uppercase">History</h2>
        <div className="flex gap-1" role="group" aria-label="History view">
          {(['list', 'calendar'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`min-h-tap rounded-card border border-line px-3 text-sm capitalize ${mode === m ? 'bg-surface-2 text-fg' : 'text-muted'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>
      {mode === 'list' ? <HistoryList /> : <HistoryCalendar />}
    </div>
  );
}
