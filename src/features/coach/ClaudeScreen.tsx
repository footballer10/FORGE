import { useEffect, useRef, useState } from 'react';
import { SubScreen } from '../../components/SubScreen';
import { SyncPanel } from '../settings/SyncPanel';
import { coachRepo, insightsRepo } from '../../db/repositories';
import { SUMMARY_RANGES } from '../../domain/coachSummary';
import { buildWeeklyReview, REVIEW_DAYS } from '../../domain/weeklyReview';
import { ProfileEditor } from './ProfileEditor';
import { ProposalPanel } from './ProposalPanel';

/** Everything about working with Claude. The conversation happens in the Claude app; this page is the connection, the approval inbox and the profile. */
export function ClaudeScreen({ onBack }: { onBack: () => void }) {
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState<number>(56);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) return;
    let live = true;
    void coachRepo.summaryText(days).then((t) => live && setText(t));
    return () => {
      live = false;
    };
  }, [days, editing]);

  if (editing) return <ProfileEditor onDone={() => setEditing(false)} />;

  async function copy(content = text, done = 'Copied. Paste it into a Claude chat.') {
    try {
      await navigator.clipboard.writeText(content);
      setStatus(done);
    } catch {
      // Clipboard API can be blocked; select the text so the user can copy by hand.
      box.current?.focus();
      box.current?.select();
      setStatus('Could not copy automatically. The text is selected: use Copy from the menu.');
    }
  }

  async function copyReview() {
    const [summary, notes] = await Promise.all([coachRepo.summaryText(REVIEW_DAYS), insightsRepo.current(true)]);
    await copy(buildWeeklyReview(summary, notes), 'Weekly review copied. Paste it into a Claude chat.');
  }

  return (
    <SubScreen title="Claude" onBack={onBack} backLabel="Settings">
      <p className="pb-4 text-sm text-muted">
        Talk to Claude in the Claude app: with the connector on, it reads your training from here. When Claude proposes a program change it
        lands below, and nothing changes until you approve it.
      </p>

      <ProposalPanel />

      <div className="mt-4">
        <SyncPanel />
      </div>

      <section className="mt-4 rounded-card border border-line bg-surface p-4" aria-label="Training profile">
        <h2 className="font-display text-xl">Training profile</h2>
        <p className="mt-1 text-sm text-muted">Goals, phase, constraints and equipment. Claude reads this too.</p>
        <button type="button" onClick={() => setEditing(true)} className="mt-3 min-h-tap rounded-card border border-line px-4 text-sm">Edit profile</button>
      </section>

      <details className="mt-4 rounded-card border border-line bg-surface p-4">
        <summary className="min-h-tap cursor-pointer py-2 font-display text-xl">Copy and paste instead</summary>
        <p className="mt-1 text-sm text-muted">For a Claude chat that is not connected to Forge.</p>
        <button type="button" onClick={() => void copyReview()} className="mt-3 min-h-tap w-full rounded-card border border-line px-4 text-base">Copy weekly review</button>
        <div className="mt-3 flex gap-2" role="group" aria-label="Window">
          {SUMMARY_RANGES.map((r) => (
            <button
              key={r.days} type="button" aria-pressed={days === r.days} onClick={() => { setDays(r.days); setStatus(''); }}
              className={`min-h-tap flex-1 rounded-card border px-3 text-sm ${days === r.days ? 'border-accent text-fg' : 'border-line text-muted'}`}
            >{r.label}</button>
          ))}
        </div>
        <button type="button" onClick={() => void copy()} className="mt-3 min-h-tap w-full rounded-card border border-line px-4 text-base">Copy summary</button>
        <textarea
          ref={box} readOnly value={text} rows={8} aria-label="Summary text"
          className="mt-3 w-full rounded-card border border-line bg-bg p-3 text-base tabular-nums text-fg"
        />
        {status && <p role="status" className="mt-2 text-sm text-muted">{status}</p>}
      </details>
    </SubScreen>
  );
}
