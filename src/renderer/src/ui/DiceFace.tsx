import { classNames } from './classNames';

/** Pip positions on a 3×3 grid (0..2) per die value. */
const PIPS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
};

const GRID_OFFSET = 7;
const GRID_STEP = 8;
const PIP_RADIUS = 2.2;

interface DiceFaceProps {
  value: number;
  size?: number;
  tone?: 'ink' | 'good' | 'bad' | 'muted';
  label?: string;
}

/** Die face with pips (the number is also exposed as text for assistive tech). */
export function DiceFace({ value, size = 56, tone = 'ink', label }: DiceFaceProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 30 30"
      role="img"
      aria-label={label ?? String(value)}
      className={classNames(
        tone === 'good'
          ? 'text-good'
          : tone === 'bad'
            ? 'text-bad'
            : tone === 'muted'
              ? 'text-ink-muted'
              : 'text-ink',
      )}
    >
      <rect x="1" y="1" width="28" height="28" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {(PIPS[value] ?? []).map(([column, row]) => (
        <circle
          key={`${column}-${row}`}
          cx={GRID_OFFSET + column * GRID_STEP}
          cy={GRID_OFFSET + row * GRID_STEP}
          r={PIP_RADIUS}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
