import type { Muscle } from '../../domain/types';
import { BACK, FRONT, type MapShape } from './bodyMapShapes';

/** Colour step for a muscle's weighted sets relative to the busiest muscle (steps printed under the map). */
export function mapLevel(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (!(value > 0) || !(max > 0)) return 0;
  const r = value / max;
  return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1;
}
const OPACITY = [0, 0.25, 0.5, 0.75, 1];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Figure({ label, shapes, values, max }: { label: string; shapes: MapShape[]; values: ReadonlyMap<Muscle, number>; max: number }) {
  return (
    <figure className="flex-1">
      <svg viewBox="0 0 100 190" role="img" aria-label={`${label} muscle map`} className="w-full">
        <circle cx="50" cy="12" r="9" className="fill-surface-2" />
        <rect x="30" y="30" width="40" height="55" rx="10" className="fill-surface" />
        {shapes.map((s, i) => {
          const v = values.get(s.muscle) ?? 0;
          const lvl = mapLevel(v, max);
          const common = { className: 'fill-surface-2 stroke-line', strokeWidth: 0.6 } as const;
          return (
            <g key={i}>
              {s.kind === 'ellipse' ? (
                <ellipse cx={s.v[0]} cy={s.v[1]} rx={s.v[2]} ry={s.v[3]} {...common} />
              ) : (
                <rect x={s.v[0]} y={s.v[1]} width={s.v[2]} height={s.v[3]} rx={s.v[4] ?? 0} {...common} />
              )}
              {lvl > 0 &&
                (s.kind === 'ellipse' ? (
                  <ellipse cx={s.v[0]} cy={s.v[1]} rx={s.v[2]} ry={s.v[3]} className="fill-accent" fillOpacity={OPACITY[lvl]} />
                ) : (
                  <rect x={s.v[0]} y={s.v[1]} width={s.v[2]} height={s.v[3]} rx={s.v[4] ?? 0} className="fill-accent" fillOpacity={OPACITY[lvl]} />
                ))}
              <title>{`${cap(s.muscle)}: ${Math.round(v * 10) / 10} weighted sets`}</title>
            </g>
          );
        })}
      </svg>
      <figcaption className="text-center text-xs text-muted">{label}</figcaption>
    </figure>
  );
}

/** Front and back muscle map shaded by weighted hard sets. */
export function BodyMap({ values }: { values: ReadonlyMap<Muscle, number> }) {
  const max = Math.max(0, ...values.values());
  return (
    <div>
      <div className="flex gap-4">
        <Figure label="Front" shapes={FRONT} values={values} max={max} />
        <Figure label="Back" shapes={BACK} values={values} max={max} />
      </div>
      <p className="mt-1 text-xs text-muted">
        Shade = weighted sets relative to the busiest muscle this week (max {Math.round(max * 10) / 10}): above 0, 25%, 50%, 75% of it. Schematic, not anatomical.
        Muscles with no sets stay grey.
      </p>
    </div>
  );
}
