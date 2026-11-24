export interface Linkable {
  id: string;
  supersetGroup?: string | undefined;
}

/** Next unused group label: A, B, C, ... */
export function nextGroupLabel(items: Linkable[]): string {
  const used = new Set(items.map((i) => i.supersetGroup).filter(Boolean));
  for (let n = 0; n < 26; n++) {
    const l = String.fromCharCode(65 + n);
    if (!used.has(l)) return l;
  }
  return `G${used.size + 1}`;
}

/**
 * Toggle the link between an exercise and the one after it (items are in workout order).
 * Linking puts the next exercise in this one's group (creating it if needed). Unlinking when the
 * two already share a group splits the later part off. Groups left with one member are cleared.
 * Returns the new group per exercise id (undefined = not grouped).
 */
export function toggleSupersetLink(items: Linkable[], id: string): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = Object.fromEntries(items.map((i) => [i.id, i.supersetGroup]));
  const idx = items.findIndex((i) => i.id === id);
  const next = items[idx + 1];
  if (idx < 0 || !next) return out;
  const cur = items[idx]!;

  if (cur.supersetGroup && cur.supersetGroup === next.supersetGroup) {
    // Unlink: everything after this point in the group becomes its own group.
    const label = nextGroupLabel(items);
    for (let i = idx + 1; i < items.length && items[i]!.supersetGroup === cur.supersetGroup; i++) out[items[i]!.id] = label;
  } else {
    const label = cur.supersetGroup ?? nextGroupLabel(items);
    out[cur.id] = label;
    out[next.id] = label;
  }
  // Clear singleton groups.
  const counts = new Map<string, number>();
  for (const g of Object.values(out)) if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
  for (const k of Object.keys(out)) if (out[k] && counts.get(out[k]!) === 1) out[k] = undefined;
  return out;
}

/** Rest starts after the last exercise of a superset round; ungrouped exercises always rest. */
export function restAfterExercise(items: Linkable[], id: string): boolean {
  const idx = items.findIndex((i) => i.id === id);
  const cur = items[idx];
  if (!cur?.supersetGroup) return true;
  const rest = items.slice(idx + 1);
  return !rest.some((i) => i.supersetGroup === cur.supersetGroup);
}
