import { forwardRef, useId, useImperativeHandle, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

const VIEW = 900;
const CENTER = VIEW / 2;
const R_INNER = 296;
const R_OUTER = 412;
const TICK_INNER = 418;
const TICK_OUTER = 424;
const TICK_OUTER_LONG = 432;
const TICK_COUNT = 100;
const LONG_TICK_EVERY = 5;
const LABEL_RADIUS = (R_INNER + R_OUTER) / 2;
const FULL_TURN = 360;

/** Labels on the lower half are turned so they never read upside down. */
const readableAngle = (angle: number): number => (angle > 90 && angle < 270 ? angle - 180 : angle);

const polar = (radius: number, degrees: number): [number, number] => {
  const radians = (degrees * Math.PI) / 180;
  return [CENTER + radius * Math.sin(radians), CENTER - radius * Math.cos(radians)];
};

function arcPath(start: number, end: number): string {
  const large = end - start > FULL_TURN / 2 ? 1 : 0;
  const [x0, y0] = polar(R_OUTER, start);
  const [x1, y1] = polar(R_OUTER, end);
  const [x2, y2] = polar(R_INNER, end);
  const [x3, y3] = polar(R_INNER, start);
  return `M${x0} ${y0} A${R_OUTER} ${R_OUTER} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${R_INNER} ${R_INNER} 0 ${large} 0 ${x3} ${y3} Z`;
}

export interface FinalWheelHandle {
  setRotation: (degrees: number) => void;
}

interface FinalWheelProps {
  finalChance: number;
  hub: ReactNode;
}

/**
 * game-design §14.2: white = allowed (finalChance %), red = denied. Red is also hatched and both areas
 * are labeled, so the result never depends on color alone. Rotation is driven imperatively (60 fps).
 */
export const FinalWheel = forwardRef<FinalWheelHandle, FinalWheelProps>(function FinalWheel(
  { finalChance, hub },
  ref,
) {
  const { t } = useTranslation();
  const hatchId = useId();
  const wheelRef = useRef<SVGGElement>(null);
  const allowedDeg = (finalChance / 100) * FULL_TURN;

  useImperativeHandle(ref, () => ({
    setRotation: (degrees) => {
      wheelRef.current?.style.setProperty('transform', `rotate(${degrees}deg)`);
    },
  }));

  const label = (text: string, angle: number, fill: string) => {
    const [x, y] = polar(LABEL_RADIUS, angle);
    return (
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fill={fill}
        className="font-display"
        fontWeight={700}
        fontSize={30}
        letterSpacing="0.12em"
        transform={`rotate(${readableAngle(angle)} ${x} ${y})`}
      >
        {text.toUpperCase()}
      </text>
    );
  };

  return (
    <div className="relative aspect-square h-full max-h-full">
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <pattern
            id={hatchId}
            width="12"
            height="12"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="12" height="12" fill="var(--color-bad)" />
            <rect width="3" height="12" fill="rgb(0 0 0 / 0.18)" />
          </pattern>
        </defs>
        <g ref={wheelRef} style={{ transformOrigin: 'center', transformBox: 'view-box' }}>
          <path d={arcPath(allowedDeg, FULL_TURN)} fill={`url(#${hatchId})`} />
          {allowedDeg > 0 && <path d={arcPath(0, allowedDeg)} fill="var(--color-ink)" />}
          {allowedDeg >= 20 && label(t('win.areaAllowed'), allowedDeg / 2, 'var(--color-bg)')}
          {label(t('win.areaDenied'), allowedDeg + (FULL_TURN - allowedDeg) / 2, 'var(--color-ink)')}
          {Array.from({ length: TICK_COUNT }, (_, index) => {
            const angle = (index * FULL_TURN) / TICK_COUNT;
            const [x1, y1] = polar(TICK_INNER, angle);
            const [x2, y2] = polar(index % LONG_TICK_EVERY ? TICK_OUTER : TICK_OUTER_LONG, angle);
            return (
              <line
                key={index}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="var(--color-line-strong)"
                strokeWidth={1}
              />
            );
          })}
        </g>
        <path d={`M${CENTER - 16} 10 L${CENTER + 16} 10 L${CENTER} 40 Z`} fill="var(--color-ink)" />
      </svg>
      <div className="absolute inset-[34%] flex flex-col items-center justify-center text-center">{hub}</div>
    </div>
  );
});
