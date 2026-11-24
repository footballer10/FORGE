import type { NamedPr } from '../../db/repositories';

const num = (v: number) => String(Math.round(v * 10) / 10);

/** One-line description of a PR with the value and the record it beat. Units follow the profile unit (not shown here: values are in it). */
export function prLabel(p: NamedPr): string {
  if (p.kind === 'rep') return `${p.reps}-rep best ${num(p.value)} (was ${num(p.previous)})`;
  if (p.kind === 'e1rm') return `e1RM ${num(p.value)} (was ${num(p.previous)})`;
  return `session volume ${Math.round(p.value).toLocaleString('en-US')} (was ${Math.round(p.previous).toLocaleString('en-US')})`;
}
