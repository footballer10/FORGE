import { describe, expect, it } from 'vitest';
import { moveItem } from './order';

describe('moveItem', () => {
  it('moves up and down', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });
  it('is a no-op at the edges and does not mutate', () => {
    const src = ['a', 'b'];
    expect(moveItem(src, 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(src, 1, 1)).toEqual(['a', 'b']);
    expect(moveItem(src, 5, 1)).toEqual(['a', 'b']);
    expect(src).toEqual(['a', 'b']);
  });
});
