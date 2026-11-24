import type { Equipment, Exercise, ID, Muscle } from './types';

export interface ExerciseFilter {
  query?: string;
  muscle?: Muscle;
  equipment?: Equipment;
  /** Exercise IDs, most recently used first. */
  recentIds?: ID[];
}

type Searchable = Pick<Exercise, 'id' | 'name' | 'aliases' | 'equipment' | 'primaryMuscles' | 'secondaryMuscles' | 'archived'>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Lower is better; null means no match. Every query word must appear in the name or an alias. */
function score(e: Searchable, words: string[]): number | null {
  const name = norm(e.name);
  const aliases = e.aliases.map(norm);
  let total = 0;
  for (const w of words) {
    let best: number | null = null;
    const consider = (n: number) => {
      best = best === null ? n : Math.min(best, n);
    };
    if (name.startsWith(w)) consider(0);
    else if (name.split(' ').some((t) => t.startsWith(w))) consider(1);
    else if (name.includes(w)) consider(2);
    if (aliases.some((a) => a.startsWith(w) || a.split(' ').some((t) => t.startsWith(w)))) consider(3);
    else if (aliases.some((a) => a.includes(w))) consider(4);
    if (best === null) return null;
    total += best;
  }
  return total;
}

/**
 * Filter and rank exercises for the picker.
 * No query: recently used first (in recency order), then alphabetical.
 * With a query: best text match first, recency breaks ties, then alphabetical.
 */
export function searchExercises<T extends Searchable>(all: T[], f: ExerciseFilter): T[] {
  const words = norm(f.query ?? '').split(' ').filter(Boolean);
  const recentRank = new Map((f.recentIds ?? []).map((id, i) => [id, i]));
  const rows: { e: T; s: number; r: number }[] = [];
  for (const e of all) {
    if (e.archived) continue;
    if (f.muscle && !e.primaryMuscles.includes(f.muscle) && !e.secondaryMuscles.includes(f.muscle)) continue;
    if (f.equipment && e.equipment !== f.equipment) continue;
    const s = words.length ? score(e, words) : 0;
    if (s === null) continue;
    rows.push({ e, s, r: recentRank.get(e.id) ?? Infinity });
  }
  rows.sort((a, b) => a.s - b.s || a.r - b.r || a.e.name.localeCompare(b.e.name));
  return rows.map((x) => x.e);
}
