import type { Insight } from './insights';

/**
 * Weekly review message for Claude: a short ask, the notes Forge computed (with the rule and inputs),
 * then the standard training summary for the last 7 days. Claude may only propose changes; the user approves.
 */
export const REVIEW_DAYS = 7;

export function buildWeeklyReview(summary: string, notes: readonly Insight[]): string {
  const out: string[] = [
    '# Weekly review request',
    'Review my last week of training using the data below. Keep it short and plain:',
    '1. What went well and what slipped, with the numbers.',
    '2. One or two changes for next week, stated as a proposal I can approve or decline. Do not assume I accept anything.',
    '3. Say what data you would need if you cannot tell.',
    '',
    '## Notes from Forge',
  ];
  if (notes.length) {
    for (const n of notes) out.push(`- ${n.text} (${n.detail})`);
  } else {
    out.push('- No flags this week (no plateau, imbalance or missed week found by the app rules).');
  }
  out.push('', summary);
  return out.join('\n');
}
