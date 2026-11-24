import type { Muscle } from '../../domain/types';

/** Schematic muscle regions on a 100 × 190 canvas. Not anatomical; each region is one tappable-size shape. */
export interface MapShape {
  muscle: Muscle;
  kind: 'ellipse' | 'rect';
  /** ellipse: cx, cy, rx, ry · rect: x, y, w, h, r */
  v: [number, number, number, number, number?];
}

const mirror = (m: Muscle, cx: number, cy: number, rx: number, ry: number): MapShape[] => [
  { muscle: m, kind: 'ellipse', v: [cx, cy, rx, ry] },
  { muscle: m, kind: 'ellipse', v: [100 - cx, cy, rx, ry] },
];

export const FRONT: MapShape[] = [
  { muscle: 'neck', kind: 'rect', v: [45, 22, 10, 7, 2] },
  ...mirror('traps', 39, 31, 7, 3.5),
  ...mirror('shoulders', 28, 38, 8, 8),
  ...mirror('chest', 41, 45, 10, 8),
  ...mirror('biceps', 20, 56, 5, 10),
  ...mirror('forearms', 15, 80, 4.5, 12),
  { muscle: 'abdominals', kind: 'rect', v: [42, 55, 16, 28, 4] },
  ...mirror('abductors', 29, 98, 4, 8),
  ...mirror('adductors', 46, 108, 3.5, 12),
  ...mirror('quadriceps', 38, 115, 8, 20),
  ...mirror('calves', 38, 160, 5.5, 14),
];

export const BACK: MapShape[] = [
  { muscle: 'neck', kind: 'rect', v: [45, 22, 10, 7, 2] },
  { muscle: 'traps', kind: 'rect', v: [38, 30, 24, 12, 4] },
  ...mirror('shoulders', 28, 38, 8, 8),
  ...mirror('triceps', 20, 56, 5, 10),
  ...mirror('forearms', 15, 80, 4.5, 12),
  { muscle: 'middle back', kind: 'rect', v: [39, 43, 22, 12, 3] },
  ...mirror('lats', 35, 62, 7, 11),
  { muscle: 'lower back', kind: 'rect', v: [41, 70, 18, 12, 3] },
  ...mirror('glutes', 41, 93, 9, 8),
  ...mirror('abductors', 29, 98, 4, 8),
  ...mirror('hamstrings', 38, 120, 8, 18),
  ...mirror('calves', 38, 160, 5.5, 14),
];
