import { useEffect, useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useUi } from '../../app/uiStore';
import { BackupReminder } from '../data/BackupReminder';
import { achievementsRepo, coachRepo, fitnessRepo } from '../../db/repositories';
import { BATTERIES, batterySummary, daysLabel, type BatterySummary } from '../../domain/fitness';
import { localDateKey } from '../../domain/calendar';
import type { StreakSummary } from '../../domain/streaks';
import { NextUpCard } from './NextUpCard';
import { InsightNotes } from './InsightNotes';
import { HistoryCalendar } from '../train/HistoryCalendar';
import { HistoryList } from '../train/HistoryList';

/** Home = your training log (like the History/Profile tab in Strong and Hevy): one status line, then workouts. */
export function HomeScreen() {
  const [streak, setStreak] = useState<StreakSummary>();
  const [mode, setMode] = useState<'list' | 'calendar'>('list');
  const [proposals, setProposals] = useState(0);
  const [academy, setAcademy] = useState<BatterySummary>();

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

  useEffect(() => {
    void fitnessRepo.load().then((d) => setAcademy(batterySummary(BATTERIES[0]!, d.tests, d.results, localDateKey(new Date())))).catch(() => undefined);
  }, []);

  useEffect(() => {
    void coachRepo.pendingProposals().then((p) => setProposals(p.length)).catch(() => undefined);
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
      <InsightNotes />
      <NextUpCard />
      {academy && (
        <button type="button" onClick={() => useUi.getState().setTab('progress')} className="num mb-3 min-h-tap text-left text-sm text-muted">
          {academy.withTarget > 0 ? `${academy.atTarget} of ${academy.withTarget} academy events at target` : 'Academy tests'}
          {academy.daysLeft !== undefined ? ` · test ${daysLabel(academy.daysLeft)}` : ''}
        </button>
      )}
      {proposals > 0 && (
        <button
          type="button"
          onClick={() => {
            useUi.getState().setSettingsPage('claude');
            useUi.getState().setSettingsOpen(true);
          }}
          className="mb-3 flex min-h-tap items-center justify-between rounded-card border border-accent bg-surface px-3 py-2 text-left text-sm"
        >
          <span>Claude sent {proposals === 1 ? 'a program change' : `${proposals} program changes`} for you to review</span>
          <span className="font-semibold text-accent-text">Review</span>
        </button>
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
