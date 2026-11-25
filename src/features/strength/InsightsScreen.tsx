import { useEffect, useState } from 'react';
import { MenuRow, SubScreen } from '../../components/SubScreen';
import { achievementsRepo, analyticsRepo, type NamedPr, type TrainingData } from '../../db/repositories';
import type { Achievement, E1rmFormula } from '../../domain/types';
import { VolumePanel } from '../progress/VolumePanel';
import { prLabel } from '../home/prLabel';
import { ScorePanel } from './ScorePanel';

type Page = 'menu' | 'score' | 'volume' | 'prs' | 'achievements';

function ScorePage() {
  const [data, setData] = useState<{ t: TrainingData; formula: E1rmFormula } | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([analyticsRepo.trainingData(), analyticsRepo.e1rmFormula()]).then(([t, formula]) => live && setData({ t, formula }));
    return () => {
      live = false;
    };
  }, []);
  return data ? <ScorePanel data={data.t} formula={data.formula} /> : null;
}

function PrsPage() {
  const [prs, setPrs] = useState<NamedPr[] | null>(null);
  useEffect(() => {
    let live = true;
    void achievementsRepo.recentPrs(20).then((p) => live && setPrs(p));
    return () => {
      live = false;
    };
  }, []);
  if (!prs) return null;
  if (prs.length === 0) return <p className="text-sm text-muted">No PRs yet. They appear as you beat earlier lifts.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {prs.map((p, i) => (
        <li key={i} className="rounded-card border border-line bg-surface p-3 text-sm">
          <span className="font-semibold text-accent-text">PR</span> {p.exerciseName}: {prLabel(p)} <span className="block text-muted">{new Date(p.date).toLocaleDateString()}</span>
        </li>
      ))}
    </ul>
  );
}

function AchievementsPage() {
  const [items, setItems] = useState<Achievement[] | null>(null);
  const [unseen, setUnseen] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    void (async () => {
      await achievementsRepo.sync();
      const [all, un] = await Promise.all([achievementsRepo.listNewestFirst(), achievementsRepo.unseen()]);
      if (!live) return;
      setItems(all);
      setUnseen(new Set(un.map((a) => a.id)));
      if (un.length) void achievementsRepo.markSeen(un.map((a) => a.id));
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!items) return null;
  if (items.length === 0) return <p className="text-sm text-muted">Milestones show up here as you train.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((a) => (
        <li key={a.id} className="rounded-card border border-line bg-surface p-3 text-sm">
          <span className="font-semibold">{a.title}</span>
          {unseen.has(a.id) && <span className="ml-2 text-xs text-accent-text">New</span>}
          <span className="block text-muted">{a.description} {new Date(a.achievedAt).toLocaleDateString()}</span>
        </li>
      ))}
    </ul>
  );
}

const TITLES: Record<Exclude<Page, 'menu'>, string> = { score: 'Strength score', volume: 'Weekly sets', prs: 'Recent PRs', achievements: 'Achievements' };

/** Optional extras, one tap away from the Strength list. Nothing here is on the main screen. */
export function InsightsScreen({ onBack }: { onBack: () => void }) {
  const [page, setPage] = useState<Page>('menu');
  if (page === 'menu') {
    return (
      <SubScreen title="Insights" onBack={onBack} backLabel="Strength">
        <div className="flex flex-col gap-2">
          <MenuRow title="Weekly sets" detail="Sets per muscle, push:pull and squat:hinge balance, body map" onClick={() => setPage('volume')} />
          <MenuRow title="Recent PRs" detail="Records you have set" onClick={() => setPage('prs')} />
          <MenuRow title="Achievements" detail="Milestones" onClick={() => setPage('achievements')} />
          <MenuRow title="Strength score and tiers" detail="Optional. Set up your lifts first" onClick={() => setPage('score')} />
        </div>
      </SubScreen>
    );
  }
  return (
    <SubScreen title={TITLES[page]} onBack={() => setPage('menu')} backLabel="Insights">
      {page === 'score' && <ScorePage />}
      {page === 'volume' && <VolumePanel />}
      {page === 'prs' && <PrsPage />}
      {page === 'achievements' && <AchievementsPage />}
    </SubScreen>
  );
}
