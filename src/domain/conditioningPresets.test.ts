import { describe, expect, it } from 'vitest';
import { CONDITIONING_PRESETS } from './conditioningPresets';

describe('conditioning presets', () => {
  it('use exact distances', () => {
    const by = (id: string) => CONDITIONING_PRESETS.find((p) => p.id === id)!;
    expect(by('sprints-40yd').distanceM).toBeCloseTo(36.576, 3);
    expect(by('pft-600yd').distanceM).toBeCloseTo(548.64, 2);
    expect(by('aft-1.5mi').distanceM).toBeCloseTo(2414.016, 3);
  });
  it('have unique ids and sensible counts and rests', () => {
    expect(new Set(CONDITIONING_PRESETS.map((p) => p.id)).size).toBe(CONDITIONING_PRESETS.length);
    for (const p of CONDITIONING_PRESETS) {
      expect(p.count).toBeGreaterThan(0);
      expect(p.restSec).toBeGreaterThanOrEqual(0);
    }
  });
});
