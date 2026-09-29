import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react';
import { TRACK_LENGTH } from '@shared/session/track';

const VIEW = 900;
const CENTER = VIEW / 2;
const R_INNER = 296;
const R_OUTER = 412;
const LABEL_RADIUS = 434;
const LABEL_EVERY = 10;
const SEGMENT_DEG = 360 / TRACK_LENGTH;
const SEGMENT_GAP_DEG = 0.3;
const FULL_TURN = 360;
const MIN_TURNS = 4;
const EXTRA_TURNS = 2;
const MIN_SPIN_MS = 4500;
const EXTRA_SPIN_MS = 1500;
/** design-system §7 "Start wheel" easing */
const SPIN_EASING = 'cubic-bezier(.12,.72,.18,1)';

const polar = (radius: number, degrees: number): [number, number] => {
  const radians = (degrees * Math.PI) / 180;
  return [CENTER + radius * Math.sin(radians), CENTER - radius * Math.cos(radians)];
};

function segmentPath(value: number): string {
  const start = (value - 1) * SEGMENT_DEG + SEGMENT_GAP_DEG;
  const end = value * SEGMENT_DEG - SEGMENT_GAP_DEG;
  const [x0, y0] = polar(R_OUTER, start);
  const [x1, y1] = polar(R_OUTER, end);
  const [x2, y2] = polar(R_INNER, end);
  const [x3, y3] = polar(R_INNER, start);
  return `M${x0} ${y0} A${R_OUTER} ${R_OUTER} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${R_INNER} ${R_INNER} 0 0 0 ${x3} ${y3} Z`;
}

export interface StartWheelHandle {
  /** Animates to `value` (decided before); resolves when the wheel stops or the animation is skipped. */
  spinTo: (value: number, scale: number) => Promise<void>;
  skip: () => void;
}

interface StartWheelProps {
  penaltyFields: readonly number[];
  highlight: number | null;
  hub: ReactNode;
}

/** Start wheel (game-design §8.1) – red segments are penalty fields, labeled by number (never color-only). */
export const StartWheel = forwardRef<StartWheelHandle, StartWheelProps>(function StartWheel(
  { penaltyFields, highlight, hub },
  ref,
) {
  const wheelRef = useRef<SVGGElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const angleRef = useRef(0);

  useImperativeHandle(ref, () => ({
    spinTo: (value, scale) => {
      const wheel = wheelRef.current;
      const valueCenter = (value - 0.5) * SEGMENT_DEG;
      const turns = MIN_TURNS + Math.floor(Math.random() * (EXTRA_TURNS + 1));
      const from = angleRef.current;
      const base = from - (((from % FULL_TURN) + FULL_TURN) % FULL_TURN);
      const target = base - turns * FULL_TURN - valueCenter;
      angleRef.current = target;
      const duration = (MIN_SPIN_MS + Math.random() * EXTRA_SPIN_MS) * scale;
      if (!wheel || duration === 0) {
        wheel?.style.setProperty('transform', `rotate(${target}deg)`);
        return Promise.resolve();
      }
      const animation = wheel.animate(
        [{ transform: `rotate(${from}deg)` }, { transform: `rotate(${target}deg)` }],
        { duration, easing: SPIN_EASING, fill: 'forwards' },
      );
      animationRef.current = animation;
      return animation.finished.then(
        () => undefined,
        () => undefined,
      );
    },
    skip: () => {
      animationRef.current?.finish();
    },
  }));

  return (
    <div className="relative aspect-square h-full max-h-full">
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="absolute inset-0 h-full w-full" aria-hidden>
        <g ref={wheelRef} style={{ transformOrigin: 'center', transformBox: 'view-box' }}>
          {Array.from({ length: TRACK_LENGTH }, (_, index) => {
            const value = index + 1;
            const penalty = penaltyFields.includes(value);
            const fill = penalty
              ? 'var(--color-penalty)'
              : value % 2
                ? 'var(--color-surface)'
                : 'var(--color-ring-empty)';
            return (
              <path
                key={value}
                d={segmentPath(value)}
                fill={fill}
                stroke={value === highlight ? 'var(--color-ink)' : 'none'}
                strokeWidth={3}
              />
            );
          })}
          {Array.from({ length: TRACK_LENGTH / LABEL_EVERY }, (_, index) => {
            const value = (index + 1) * LABEL_EVERY;
            const [x, y] = polar(LABEL_RADIUS, (value - 0.5) * SEGMENT_DEG);
            return (
              <text
                key={value}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--color-ink-muted)"
                className="font-label"
                fontSize={15}
              >
                {value}
              </text>
            );
          })}
        </g>
        {/* Pointer at 12 o'clock */}
        <path d={`M${CENTER - 16} 10 L${CENTER + 16} 10 L${CENTER} 40 Z`} fill="var(--color-ink)" />
      </svg>
      <div className="absolute inset-[34%] flex items-center justify-center">{hub}</div>
    </div>
  );
});
