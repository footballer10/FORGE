/** Pure helpers for the safety net: backup reminder, trash expiry, undo window. */

export const BACKUP_INTERVAL_DAYS = 7;
export const TRASH_DAYS = 30;
/** How long the undo bar stays on screen after an action. */
export const UNDO_BAR_SECONDS = 20;
/** Entries kept in the undo stack. */
export const UNDO_STACK_SIZE = 10;

const DAY_MS = 86_400_000;

/**
 * Reminder is due when the last backup is at least 7 days old, or there has never been one and
 * there is something to lose. A snooze ("later") hides it until `snoozedUntil`.
 */
export function backupDue(opts: { lastBackupAt?: string; snoozedUntil?: string; hasData: boolean; now: Date }): boolean {
  const { lastBackupAt, snoozedUntil, hasData, now } = opts;
  if (!hasData) return false;
  if (snoozedUntil && Date.parse(snoozedUntil) > now.getTime()) return false;
  if (!lastBackupAt) return true;
  return now.getTime() - Date.parse(lastBackupAt) >= BACKUP_INTERVAL_DAYS * DAY_MS;
}

export function daysSince(iso: string | undefined, now: Date): number | undefined {
  return iso ? Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS) : undefined;
}

export const isExpired = (deletedAt: string, now: Date, days = TRASH_DAYS) => now.getTime() - Date.parse(deletedAt) >= days * DAY_MS;

/** Whole days left before the purge, never below 0. */
export const trashDaysLeft = (deletedAt: string, now: Date, days = TRASH_DAYS) =>
  Math.max(0, Math.ceil((Date.parse(deletedAt) + days * DAY_MS - now.getTime()) / DAY_MS));

export const isUndoFresh = (createdAt: string, now: Date, seconds = UNDO_BAR_SECONDS) => now.getTime() - Date.parse(createdAt) < seconds * 1000;
