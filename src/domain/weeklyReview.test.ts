import { describe, expect, it } from 'vitest';
import { buildWeeklyReview } from './weeklyReview';

describe('buildWeeklyReview', () => {
  it('lists notes with their detail, then the summary', () => {
    const t = buildWeeklyReview('# Forge training summary\nbody', [{ id: 'x', kind: 'missed', text: 'Last week you trained 1 of 3 planned days.', detail: 'Rule.' }]);
    expect(t).toContain('# Weekly review request');
    expect(t).toContain('- Last week you trained 1 of 3 planned days. (Rule.)');
    expect(t.indexOf('## Notes from Forge')).toBeLessThan(t.indexOf('# Forge training summary'));
  });
  it('says so when there are no notes', () => {
    expect(buildWeeklyReview('S', [])).toContain('No flags this week');
  });
});
