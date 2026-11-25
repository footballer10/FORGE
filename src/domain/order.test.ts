import { describe, expect, it } from 'vitest';
import { moveItem, moveTo } from './order';

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

describe('moveTo', () => {
  it('drags an item to a new position', () => {
    expect(moveTo(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveTo(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });
  it('ignores equal or out-of-range positions and never mutates', () => {
    const src = ['a', 'b', 'c'];
    expect(moveTo(src, 1, 1)).toEqual(['a', 'b', 'c']);
    expect(moveTo(src, -1, 1)).toEqual(['a', 'b', 'c']);
    expect(moveTo(src, 0, 9)).toEqual(['a', 'b', 'c']);
    expect(src).toEqual(['a', 'b', 'c']);
  });
});
