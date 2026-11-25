/** Value for an `<input type="datetime-local">` (local wall-clock time, minutes) from an ISO timestamp. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export type DetailsResult = { ok: true; name: string; startedAt: string; endedAt: string } | { ok: false; error: string };

/** Validates edited name and start/end (datetime-local strings). End must be after start; the future is not allowed. */
export function parseWorkoutDetails(name: string, start: string, end: string, now: Date = new Date()): DetailsResult {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Give the workout a name.' };
  const s = new Date(start);
  const e = new Date(end);
  if (!start || !end || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return { ok: false, error: 'Enter a start and an end time.' };
  if (e.getTime() <= s.getTime()) return { ok: false, error: 'The end must be after the start.' };
  if (e.getTime() > now.getTime() + 60_000) return { ok: false, error: 'The end cannot be in the future.' };
  return { ok: true, name: trimmed, startedAt: s.toISOString(), endedAt: e.toISOString() };
}
