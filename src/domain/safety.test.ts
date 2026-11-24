import { describe, expect, it } from 'vitest';
import { backupDue, daysSince, isExpired, isUndoFresh, trashDaysLeft } from './safety';

const now = new Date('2026-11-24T12:00:00Z');
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

describe('backupDue', () => {
  it('is due after 7 days, not before', () => {
    expect(backupDue({ lastBackupAt: ago(6.9), hasData: true, now })).toBe(false);
    expect(backupDue({ lastBackupAt: ago(7), hasData: true, now })).toBe(true);
  });
  it('is due when never backed up, but only if there is data', () => {
    expect(backupDue({ hasData: true, now })).toBe(true);
    expect(backupDue({ hasData: false, now })).toBe(false);
  });
  it('respects a snooze', () => {
    const later = new Date(now.getTime() + 3600_000).toISOString();
    expect(backupDue({ lastBackupAt: ago(30), snoozedUntil: later, hasData: true, now })).toBe(false);
    expect(backupDue({ lastBackupAt: ago(30), snoozedUntil: ago(1), hasData: true, now })).toBe(true);
  });
  it('counts days since', () => {
    expect(daysSince(ago(10), now)).toBe(10);
    expect(daysSince(undefined, now)).toBeUndefined();
  });
});

describe('trash expiry', () => {
  it('expires at 30 days', () => {
    expect(isExpired(ago(29.9), now)).toBe(false);
    expect(isExpired(ago(30), now)).toBe(true);
  });
  it('counts days left', () => {
    expect(trashDaysLeft(ago(0), now)).toBe(30);
    expect(trashDaysLeft(ago(29.5), now)).toBe(1);
    expect(trashDaysLeft(ago(40), now)).toBe(0);
  });
});

describe('isUndoFresh', () => {
  it('shows the bar for 20 seconds', () => {
    expect(isUndoFresh(new Date(now.getTime() - 19_000).toISOString(), now)).toBe(true);
    expect(isUndoFresh(new Date(now.getTime() - 21_000).toISOString(), now)).toBe(false);
  });
});
