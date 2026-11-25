/** Progress photo helpers. Pure; image decoding lives in the UI layer. */
import type { ProgressPhoto } from './types';

export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_JPEG_QUALITY = 0.85;

export type Pose = NonNullable<ProgressPhoto['pose']>;
export const POSES: { id: Pose; label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'back', label: 'Back' },
  { id: 'other', label: 'Other' },
];
export const poseLabel = (p: Pose | undefined): string => POSES.find((x) => x.id === p)?.label ?? 'Unlabelled';

/** Size that fits the longest edge into `max`, keeping the ratio. Never enlarges. */
export function fitWithin(width: number, height: number, max = PHOTO_MAX_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max || longest <= 0) return { width, height };
  const k = max / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

type PhotoMeta = Pick<ProgressPhoto, 'id' | 'date' | 'createdAt' | 'deletedAt'>;

/** Newest first (date, then creation); trashed rows left out. */
export function sortPhotos<T extends PhotoMeta>(photos: T[]): T[] {
  return photos
    .filter((p) => !p.deletedAt)
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
}

/** Days between two local date keys (b − a), by calendar date. */
export function daysBetween(a: string, b: string): number {
  const t = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86_400_000);
}
