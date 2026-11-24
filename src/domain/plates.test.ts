import { describe, expect, it } from 'vitest';
import { platesPerSide } from './plates';

const LB = [45, 35, 25, 10, 5, 2.5];

describe('platesPerSide', () => {
  it('225 lb on a 45 lb bar is two 45s a side', () => {
    expect(platesPerSide(225, 45, LB)).toEqual({ perSide: [45, 45], loaded: 225, remainder: 0 });
  });
  it('mixes plates and uses small ones', () => {
    expect(platesPerSide(185, 45, LB).perSide).toEqual([45, 25]);
    expect(platesPerSide(145, 45, LB).perSide).toEqual([45, 5]);
  });
  it('reports a remainder when the target is not reachable', () => {
    const r = platesPerSide(137, 45, LB);
    expect(r.loaded).toBe(135);
    expect(r.remainder).toBe(2);
  });
  it('loads nothing at or below the bar; ignores duplicate/zero plates', () => {
    expect(platesPerSide(45, 45, LB).perSide).toEqual([]);
    expect(platesPerSide(30, 45, LB).perSide).toEqual([]);
    expect(platesPerSide(65, 20, [20, 20, 0, 10, 5])).toEqual({ perSide: [20], loaded: 60, remainder: 5 });
  });
  it('works in kg', () => {
    expect(platesPerSide(100, 20, [25, 20, 15, 10, 5, 2.5, 1.25]).perSide).toEqual([25, 15]);
  });
});
