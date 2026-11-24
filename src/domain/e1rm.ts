/**
 * Estimated one-rep max. Only Epley exists so far (needed by progression rules);
 * Milestone 4 adds the other formulas next to it.
 */

/** Epley: e1RM = weight × (1 + reps / 30); a single is its own max. 0 for no weight or reps. */
export function epley(weight: number, reps: number): number {
  if (!(weight > 0) || !(reps >= 1)) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

/** Inverse of Epley: the weight that gives `e1rm` at `reps`. */
export function weightForE1rm(e1rm: number, reps: number): number {
  if (!(e1rm > 0) || !(reps >= 1)) return 0;
  return reps === 1 ? e1rm : e1rm / (1 + reps / 30);
}
