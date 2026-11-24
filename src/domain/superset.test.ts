import { describe, expect, it } from 'vitest';
import { nextGroupLabel, restAfterExercise, toggleSupersetLink } from './superset';

const ex = (id: string, g?: string) => ({ id, supersetGroup: g });

describe('supersets', () => {
  it('links an exercise with the next one', () => {
    expect(toggleSupersetLink([ex('a'), ex('b'), ex('c')], 'a')).toEqual({ a: 'A', b: 'A', c: undefined });
  });
  it('extends an existing group', () => {
    expect(toggleSupersetLink([ex('a', 'A'), ex('b', 'A'), ex('c')], 'b')).toEqual({ a: 'A', b: 'A', c: 'A' });
  });
  it('unlinks, clearing singleton groups', () => {
    expect(toggleSupersetLink([ex('a', 'A'), ex('b', 'A'), ex('c')], 'a')).toEqual({ a: undefined, b: undefined, c: undefined });
    expect(toggleSupersetLink([ex('a', 'A'), ex('b', 'A'), ex('c', 'A')], 'a')).toEqual({ a: undefined, b: 'B', c: 'B' });
  });
  it('does nothing for the last exercise', () => {
    expect(toggleSupersetLink([ex('a'), ex('b')], 'b')).toEqual({ a: undefined, b: undefined });
  });
  it('picks unused labels', () => {
    expect(nextGroupLabel([ex('a', 'A'), ex('b', 'C')])).toBe('B');
  });
  it('rests only after the last exercise in a group', () => {
    const items = [ex('a', 'A'), ex('b', 'A'), ex('c')];
    expect(restAfterExercise(items, 'a')).toBe(false);
    expect(restAfterExercise(items, 'b')).toBe(true);
    expect(restAfterExercise(items, 'c')).toBe(true);
  });
});
