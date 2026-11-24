import { useEffect, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useUi } from '../../app/uiStore';
import { BackupReminder } from '../data/BackupReminder';
import { achievementsRepo, type NamedPr } from '../../db/repositories';
import type { Achievement } from '../../domain/types';
import type { StreakSummary } from '../../domain/streaks';
import { prLabel } from './prLabel';

interface HomeData {
  streak?: StreakSummary;
  prs: NamedPr[];
  achievements: Achievement[];
  unseen: Set<string>;
}

export function HomeScreen() {
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const [data, setData] = useState<HomeData>();

  useEffect(() => {
    let live = true;
    void (async () => {
      await achievementsRepo.sync();
      const [streak, prs, achievements, unseen] = await Promise.all([
        achievementsRepo.streak(),
        achievementsRepo.recentPrs(3),
        achievementsRepo.listNewestFirst(),
        achievementsRepo.unseen(),
      ]);
      if (live) setData({ streak, prs, achievements, unseen: new Set(unseen.map((a) => a.id)) });
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const empty = data && !data.streak && !data.prs.length && !data.achievements.length;
  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-center justify-between">
        <ScreenHeader title="Forge" />
        <button type="button" aria-label="Settings" onClick={() => useUi.getState().setSettingsOpen(true)} className="min-h-tap min-w-tap px-2 text-sm text-muted">
          Settings
        </button>
      </div>
      <BackupReminder
        onOpen={() => {
          useUi.getState().setOpenBackup(true);
          useUi.getState().setTab('train');
        }}
      />
      {empty && <EmptyState title="Welcome" body="Your streaks, recent PRs and achievements will show here." />}
      {data?.streak && (
        <section className="rounded-card border border-line bg-surface p-4" aria-label="Weekly streak">
          <h2 className="text-sm text-muted">Weekly streak</h2>
          <p className="num text-4xl">
            {data.streak.current} <span className="text-base text-muted">{data.streak.current === 1 ? 'week' : 'weeks'}</span>
          </p>
          <p className="text-sm text-muted">
            This week {data.streak.thisWeekDays} of {data.streak.target} planned days{data.streak.thisWeekHit ? ' · done' : ''} · longest {data.streak.longest}
          </p>
          <p className="mt-1 text-xs text-muted">A week counts when you train on at least {data.streak.target} different days (Mon–Sun). The week in progress never breaks the streak.</p>
        </section>
      )}
      {!!data?.prs.length && (
        <section className="rounded-card border border-line bg-surface p-4" aria-label="Recent PRs">
          <h2 className="text-sm text-muted">Recent PRs</h2>
          <ul className="mt-1 flex flex-col gap-1">
            {data.prs.map((p, i) => (
              <li key={i} className="text-sm">
                <span className="font-semibold text-accent-text">PR</span> {p.exerciseName}: {prLabel(p)}{' '}
                <span className="text-muted">{new Date(p.date).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!!data?.achievements.length && (
        <section className="rounded-card border border-line bg-surface p-4" aria-label="Achievements">
          <h2 className="text-sm text-muted">Achievements</h2>
          <ul className="mt-1 flex flex-col gap-2">
            {data.achievements.slice(0, 6).map((a) => (
              <li key={a.id} className="text-sm">
                <span className="font-semibold">{a.title}</span>
                {data.unseen.has(a.id) && <span className="ml-2 text-xs text-accent-text">New</span>}
                <span className="block text-muted">
                  {a.description} {new Date(a.achievedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
          {data.achievements.length > 6 && <p className="mt-2 text-xs text-muted">{data.achievements.length - 6} earlier achievements not shown.</p>}
          {data.unseen.size > 0 && (
            <button
              type="button"
              onClick={() => {
                void achievementsRepo.markSeen([...data.unseen]).then(() => setData({ ...data, unseen: new Set() }));
              }}
              className="mt-2 min-h-tap rounded-card border border-line px-4 text-sm"
            >
              Mark all seen
            </button>
          )}
        </section>
      )}
      <button
        type="button"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="min-h-tap self-start rounded-card border border-line bg-surface-2 px-4 text-sm"
      >
        Theme: {theme === 'dark' ? 'Dark' : 'Light'}
      </button>
    </div>
  );
}
