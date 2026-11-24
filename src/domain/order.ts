/** Move the item at `index` by `delta` positions (clamped). Returns a new array; the input is untouched. */
export function moveItem<T>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return [...items];
  const out = [...items];
  const [item] = out.splice(index, 1);
  out.splice(to, 0, item as T);
  return out;
}
