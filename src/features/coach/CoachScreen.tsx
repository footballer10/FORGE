import { useEffect, useRef, useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { coachRepo } from '../../db/repositories';
import { SUMMARY_RANGES } from '../../domain/coachSummary';
import { ProfileEditor } from './ProfileEditor';
import { ProposalPanel } from './ProposalPanel';

export function CoachScreen() {
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

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Copied. Paste it into a Claude chat.');
    } catch {
      // Clipboard API can be blocked; select the text so the user can copy by hand.
      box.current?.focus();
      box.current?.select();
      setStatus('Could not copy automatically. The text is selected: use Copy from the menu.');
    }
  }

  return (
    <div className="pb-6">
      <ScreenHeader title="Coach" />
      <section className="rounded-card border border-line bg-surface p-4" aria-label="Summary for Claude">
        <h2 className="font-display text-xl">Copy for Claude</h2>
        <p className="mt-1 text-sm text-muted">
          A summary of your training with the numbers and rules behind each figure. Claude only proposes; nothing changes until you approve it here.
        </p>
        <div className="mt-3 flex gap-2" role="group" aria-label="Window">
          {SUMMARY_RANGES.map((r) => (
            <button
              key={r.days} type="button" aria-pressed={days === r.days} onClick={() => { setDays(r.days); setStatus(''); }}
              className={`min-h-tap flex-1 rounded-card border px-3 text-sm ${days === r.days ? 'border-accent text-fg' : 'border-line text-muted'}`}
            >{r.label}</button>
          ))}
        </div>
        <textarea
          ref={box} readOnly value={text} rows={12} aria-label="Summary text"
          className="mt-3 w-full rounded-card border border-line bg-bg p-3 text-base tabular-nums text-fg"
        />
        <button type="button" onClick={() => void copy()} className="mt-3 min-h-tap w-full rounded-card bg-accent px-4 font-display text-xl uppercase text-white">Copy summary</button>
        {status && <p role="status" className="mt-2 text-sm text-muted">{status}</p>}
      </section>

      <ProposalPanel />

      <section className="mt-4 rounded-card border border-line bg-surface p-4" aria-label="Training profile">
        <h2 className="font-display text-xl">Training profile</h2>
        <p className="mt-1 text-sm text-muted">Goals, phase, constraints and equipment. Included in the summary.</p>
        <button type="button" onClick={() => setEditing(true)} className="mt-3 min-h-tap rounded-card border border-line px-4 text-sm">Edit profile</button>
      </section>
    </div>
  );
}
