import { useCallback, useEffect, useState } from 'react';
import { coachRepo, syncRepo, type ProposalPreview } from '../../db/repositories';
import type { AiDecision } from '../../domain/types';
import { PROGRAM_FORMAT_PROMPT } from '../../domain/programProposal';

const mark = { added: '+', removed: '−', changed: '~' } as const;

async function copyText(t: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    return false;
  }
}

/** Paste Claude's program → validate → diff → approve or reject. Nothing is saved before approval. */
export function ProposalPanel() {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ProposalPreview | null>(null);
  const [mode, setMode] = useState<'update' | 'new'>('update');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [inbox, setInbox] = useState<AiDecision[]>([]);
  const [decisionId, setDecisionId] = useState<string>();
  const [syncing, setSyncing] = useState(false);
  const [canSync, setCanSync] = useState(false);

  const refreshInbox = useCallback(async () => setInbox(await coachRepo.pendingProposals()), []);
  useEffect(() => {
    void refreshInbox();
    void syncRepo.status().then((s) => setCanSync(s.configured));
  }, [refreshInbox]);

  async function checkForProposals() {
    setSyncing(true);
    const r = await syncRepo.sync();
    setStatus(r.error ?? '');
    await refreshInbox();
    setSyncing(false);
  }
  async function openProposal(d: AiDecision) {
    setStatus('');
    setText(d.payload ?? '');
    setDecisionId(d.id);
    setPreview(await coachRepo.prepareProposal(d.payload ?? ''));
    setMode('update');
  }
  async function dismiss(d: AiDecision) {
    await coachRepo.dismissProposal(d.id);
    if (decisionId === d.id) { setText(''); setPreview(null); setDecisionId(undefined); }
    setStatus('Rejected. Nothing was changed.');
    await refreshInbox();
  }

  const ready = !!preview?.proposal && !preview.errors.length && !preview.missing.length;

  async function check() {
    setStatus('');
    setPreview(await coachRepo.prepareProposal(text));
    setMode('update');
  }
  async function approve() {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const p = await coachRepo.approveProposal(preview, mode, text, decisionId);
      setStatus(`Saved "${p.name}" as version ${p.version}. Find it under Train → Programs.`);
      setText('');
      setPreview(null);
      setDecisionId(undefined);
      await refreshInbox();
    } finally {
      setBusy(false);
    }
  }
  async function reject() {
    if (!preview) return;
    await coachRepo.rejectProposal(preview, text, decisionId);
    setStatus('Rejected. Nothing was changed.');
    setText('');
    setPreview(null);
    setDecisionId(undefined);
    await refreshInbox();
  }

  return (
    <section className="mt-4 rounded-card border border-line bg-surface p-4" aria-label="Program from Claude">
      <h2 className="font-display text-xl">Program from Claude</h2>
      {(inbox.length > 0 || canSync) && (
        <div className="mt-2" aria-label="Proposals from Claude">
          <h3 className="text-sm text-muted">Proposals waiting ({inbox.length})</h3>
          {inbox.length === 0 && <p className="text-sm text-muted">None right now.</p>}
          <ul className="divide-y divide-line">
            {inbox.map((d) => (
              <li key={d.id} className="py-2">
                <p className="text-sm">{d.summary.replace(': proposed by Claude', '')} <span className="text-muted">· {new Date(d.date).toLocaleDateString()}</span></p>
                <p className="text-sm text-muted">Why: {d.reason}</p>
                <div className="mt-1 flex gap-2">
                  <button type="button" onClick={() => void openProposal(d)} className="min-h-tap flex-1 rounded-card border border-line px-4 text-sm">Review</button>
                  <button type="button" onClick={() => void dismiss(d)} className="min-h-tap rounded-card border border-line px-4 text-sm text-muted">Reject</button>
                </div>
              </li>
            ))}
          </ul>
          {canSync && <button type="button" disabled={syncing} onClick={() => void checkForProposals()} className="mt-2 min-h-tap rounded-card border border-line px-4 text-sm disabled:opacity-50">{syncing ? 'Checking…' : 'Check for proposals'}</button>}
        </div>
      )}
      <p className="mt-1 text-sm text-muted">Paste the JSON Claude gives you. You see exactly what would change before anything is saved.</p>
      <button
        type="button" className="mt-3 min-h-tap rounded-card border border-line px-4 text-sm"
        onClick={() => void copyText(PROGRAM_FORMAT_PROMPT).then((ok) => setStatus(ok ? 'Format copied. Paste it into your Claude chat before asking for a program.' : 'Could not copy automatically.'))}
      >Copy format for Claude</button>
      <textarea
        value={text} onChange={(e) => { setText(e.target.value); setPreview(null); setDecisionId(undefined); }} rows={6} aria-label="Pasted program"
        placeholder="Paste Claude's JSON here"
        className="mt-3 w-full rounded-card border border-line bg-bg p-3 text-base text-fg"
      />
      <button type="button" disabled={!text.trim()} onClick={() => void check()} className="mt-2 min-h-tap w-full rounded-card border border-line px-4 text-sm disabled:opacity-40">Check proposal</button>

      {preview && preview.errors.length > 0 && (
        <div role="alert" className="mt-3 text-sm">
          <p className="text-accent-text">Cannot use this yet:</p>
          <ul className="mt-1 list-disc pl-5 text-muted">{preview.errors.slice(0, 12).map((e) => <li key={e}>{e}</li>)}</ul>
          {preview.errors.length > 12 && <p className="text-muted">…and {preview.errors.length - 12} more.</p>}
          <p className="mt-1 text-muted">Ask Claude to fix these and paste the corrected JSON.</p>
        </div>
      )}

      {preview?.proposal && !preview.errors.length && (
        <div className="mt-3 text-sm">
          <h3 className="font-display text-lg">{preview.proposal.name}</h3>
          <p className="text-muted">Why: {preview.proposal.reason}</p>
          <p className="mt-1 text-muted">{preview.proposal.weeks.length} week(s), {preview.proposal.weeks.reduce((n, w) => n + w.sessions.length, 0)} session(s).</p>
          {preview.missing.length > 0 && (
            <div role="alert" className="mt-2">
              <p className="text-accent-text">These exercises are not in your library, so the program cannot be saved:</p>
              <ul className="list-disc pl-5 text-muted">{preview.missing.map((m) => <li key={m}>{m}</li>)}</ul>
              <p className="text-muted">Add them in the exercise library (or add the name as an alias), then check again.</p>
            </div>
          )}
          {preview.current ? (
            <p className="mt-2 text-muted">Compared with your active program "{preview.current.name}" (version {preview.current.version}).</p>
          ) : (
            <p className="mt-2 text-muted">You have no active program, so this would be saved as a new draft.</p>
          )}
          {preview.diff.length > 0 ? (
            <ul className="mt-2 divide-y divide-line">
              {preview.diff.map((d, i) => (
                <li key={i} className="flex gap-2 py-1">
                  <span className={`w-4 shrink-0 text-center font-display ${d.kind === 'added' ? 'text-accent-text' : 'text-muted'}`} aria-label={d.kind}>{mark[d.kind]}</span>
                  <span>{d.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            preview.current && <p className="mt-2 text-muted">No differences from the active program.</p>
          )}
          {ready && preview.current && (
            <fieldset className="mt-3 flex flex-col gap-1">
              <legend className="text-muted">Save as</legend>
              <label className="flex min-h-tap items-center gap-2"><input type="radio" name="saveMode" checked={mode === 'update'} onChange={() => setMode('update')} /> New version of "{preview.current.name}" (history kept)</label>
              <label className="flex min-h-tap items-center gap-2"><input type="radio" name="saveMode" checked={mode === 'new'} onChange={() => setMode('new')} /> Separate new program (draft)</label>
            </fieldset>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void reject()} className="min-h-tap flex-1 rounded-card border border-line px-4 text-sm">Reject</button>
            <button type="button" disabled={!ready || busy} onClick={() => void approve()} className="min-h-tap flex-1 rounded-card bg-accent px-4 font-display text-xl uppercase text-white disabled:opacity-40">Approve</button>
          </div>
        </div>
      )}
      {status && <p role="status" className="mt-2 text-sm text-muted">{status}</p>}
    </section>
  );
}
