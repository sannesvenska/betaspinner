import { useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TRACK_LENGTH, wrapField } from '@shared/session/track';
import type { Card, Direction } from '@shared/session/types';
import { ACTION_ICON_PATHS, UI_ICON_PATHS } from '@renderer/ui/icons/iconPaths';

/** Geometry from design-system §5 (viewBox units). */
const VIEW = 520;
const CENTER = VIEW / 2;
const R_INNER = 184;
const R_OUTER = 214;
const CURRENT_LIFT = 14;
const TARGET_LIFT = 8;
const SEGMENT_DEG = 360 / TRACK_LENGTH;
const SEGMENT_GAP_DEG = 0.8;
const MARKER_RADIUS = R_INNER - 14;
const LABEL_RADIUS = R_OUTER + 30;
const GOAL_ICON_RADIUS = R_OUTER + 26;
const GOAL_ICON_SIZE = 20;
const BLOCK_ARC_RADIUS = R_INNER - 30;
const BLOCK_ARC_MARGIN_DEG = 6;
const BLOCK_ICON_SIZE = 22;
const STAR_SIZE = 6;
const STAR_WAIST = 1.8;
const HIDDEN_COLLECTIBLE_OPACITY = 0.45;

interface RingProps {
  cards: readonly Card[];
  position: number;
  goalField: number;
  /** Cumulative rotation in degrees (keeps wrap-around moves continuous). */
  rotation: number;
  /** ms for the rotation transition; 0 = instant */
  rotationMs: number;
  targets?: { left: number; right: number; blocked: Direction | null } | null;
  previewField: number | null;
  onPreview: (field: number | null) => void;
  /** U Turn / forced reversal: the blocked half of the ring gets a dashed inner arc (design-system §5, §10). */
  blocked: { side: Direction; reason: 'u_turn' | 'forced' } | null;
  /** Goal Teleport or goal drift just happened – the goal segment pulses. */
  goalPulse: boolean;
  /** Beta mode (§6.7): performer cards are shown before they are discovered */
  collectiblesVisible?: boolean;
  center: ReactNode;
}

const polar = (radius: number, degrees: number): [number, number] => {
  const radians = (degrees * Math.PI) / 180;
  return [CENTER + radius * Math.sin(radians), CENTER - radius * Math.cos(radians)];
};

function segmentPath(field: number, lift: number): string {
  const start = (field - 1) * SEGMENT_DEG + SEGMENT_GAP_DEG / 2;
  const end = field * SEGMENT_DEG - SEGMENT_GAP_DEG / 2;
  const outer = R_OUTER + lift;
  const [x0, y0] = polar(outer, start);
  const [x1, y1] = polar(outer, end);
  const [x2, y2] = polar(R_INNER, end);
  const [x3, y3] = polar(R_INNER, start);
  return `M${x0} ${y0} A${outer} ${outer} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${R_INNER} ${R_INNER} 0 0 0 ${x3} ${y3} Z`;
}

const fieldAngle = (field: number): number => (field - 0.5) * SEGMENT_DEG;

/** Fields between position and a target, exclusive (path preview). */
function pathFields(position: number, target: number, sign: 1 | -1): number[] {
  const fields: number[] = [];
  for (let field = wrapField(position + sign); field !== target; field = wrapField(field + sign))
    fields.push(field);
  return fields;
}

/** design-system §5 ring. The current field stays at 12 o'clock by rotating the whole track. */
export function Ring({
  cards,
  position,
  goalField,
  rotation,
  rotationMs,
  targets,
  previewField,
  onPreview,
  center,
  blocked,
  goalPulse,
  collectiblesVisible = false,
}: RingProps) {
  const { t } = useTranslation();
  const hatchId = useId();
  const ringRef = useRef<HTMLDivElement>(null);
  const transition = { transition: `transform ${rotationMs}ms linear` };
  const pathSet = new Set(
    targets ? [...pathFields(position, targets.right, 1), ...pathFields(position, targets.left, -1)] : [],
  );
  const targetSet = new Set(targets ? [targets.left, targets.right] : []);
  const discovered = cards
    .filter((card) => card.discovered && card.kind !== 'goal')
    .map((card) => card.field);

  // Keyboard preview: ←/→ while the ring itself has focus walks through discovered fields
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    if (discovered.length === 0) return;
    const ordered = [...discovered].sort((a, b) => a - b);
    const current = previewField ?? position;
    const next =
      event.key === 'ArrowRight'
        ? (ordered.find((field) => field > current) ?? ordered[0])
        : ([...ordered].reverse().find((field) => field < current) ?? ordered[ordered.length - 1]);
    onPreview(next ?? null);
  };

  return (
    <div
      ref={ringRef}
      tabIndex={0}
      role="group"
      aria-label={t('game.ringLabel', { position, goal: goalField })}
      onKeyDown={onKeyDown}
      onBlur={() => {
        onPreview(null);
      }}
      className="relative aspect-square w-full rounded-full"
    >
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="absolute inset-0 h-full w-full overflow-visible"
        aria-hidden
      >
        <defs>
          <pattern
            id={hatchId}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="5" height="5" fill="var(--color-bad)" />
            <rect width="2" height="5" fill="var(--color-panel)" />
          </pattern>
        </defs>
        <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: 'center', ...transition }}>
          {cards.map((card) => {
            const isCurrent = card.field === position;
            const isGoal = card.field === goalField;
            const isTarget = targetSet.has(card.field);
            let fill = 'var(--color-ring-empty)';
            // Visible but not yet collected performer cards stay translucent (design-system §10)
            const hiddenCollectible = card.kind === 'collectible' && !card.discovered && collectiblesVisible;
            if (card.kind === 'collectible' && (card.discovered || collectiblesVisible))
              fill = 'var(--color-collectible)';
            else if (card.discovered && card.kind !== 'goal')
              fill = card.group === 'good' ? 'var(--color-good)' : `url(#${hatchId})`;
            if (isCurrent) fill = 'var(--color-ink)';
            if (isGoal) fill = 'var(--color-bg)';
            const outlined = isGoal || isTarget || card.field === previewField;
            const stroke = outlined
              ? 'var(--color-ink)'
              : pathSet.has(card.field)
                ? 'var(--color-ink-muted)'
                : 'none';
            const previewable = card.discovered && card.kind !== 'goal';
            return (
              <path
                key={card.field}
                d={segmentPath(card.field, isCurrent ? CURRENT_LIFT : isTarget ? TARGET_LIFT : 0)}
                fill={fill}
                stroke={stroke}
                strokeWidth={stroke === 'none' ? 0 : 2}
                fillOpacity={hiddenCollectible && !isCurrent ? HIDDEN_COLLECTIBLE_OPACITY : undefined}
                className={isGoal && goalPulse ? 'animate-[cr-pulse_800ms_ease-in-out_infinite]' : undefined}
                onPointerEnter={
                  previewable
                    ? () => {
                        onPreview(card.field);
                      }
                    : undefined
                }
                onPointerLeave={
                  previewable
                    ? () => {
                        onPreview(null);
                      }
                    : undefined
                }
              />
            );
          })}
          {cards
            .filter(
              (card) =>
                card.kind === 'action' && card.discovered && card.field !== position && !card.actionConsumed,
            )
            .map((card) => {
              const [x, y] = polar(MARKER_RADIUS, fieldAngle(card.field));
              const color = card.group === 'good' ? 'var(--color-good)' : 'var(--color-bad)';
              // Shape encodes the group: circle = good, diamond = bad (never color-only)
              return card.group === 'good' ? (
                <circle key={card.field} cx={x} cy={y} r={4} fill={color} />
              ) : (
                <rect
                  key={card.field}
                  x={x - 3.5}
                  y={y - 3.5}
                  width={7}
                  height={7}
                  fill={color}
                  transform={`rotate(45 ${x} ${y})`}
                />
              );
            })}
          {cards
            .filter(
              (card) =>
                card.kind === 'collectible' &&
                (card.discovered || collectiblesVisible) &&
                card.field !== position,
            )
            .map((card) => {
              const [x, y] = polar(MARKER_RADIUS, fieldAngle(card.field));
              // 4-point star = collectible (design-system §10), distinct from circle/diamond
              return (
                <path
                  key={card.field}
                  d={`M${x} ${y - STAR_SIZE}L${x + STAR_WAIST} ${y - STAR_WAIST}L${x + STAR_SIZE} ${y}L${x + STAR_WAIST} ${y + STAR_WAIST}L${x} ${y + STAR_SIZE}L${x - STAR_WAIST} ${y + STAR_WAIST}L${x - STAR_SIZE} ${y}L${x - STAR_WAIST} ${y - STAR_WAIST}Z`}
                  fill="var(--color-collectible)"
                  fillOpacity={card.discovered ? undefined : HIDDEN_COLLECTIBLE_OPACITY}
                />
              );
            })}
          {(() => {
            const [x, y] = polar(GOAL_ICON_RADIUS, fieldAngle(goalField));
            return (
              <g
                style={{
                  transform: `rotate(${-rotation}deg)`,
                  transformOrigin: `${x}px ${y}px`,
                  ...transition,
                }}
              >
                <svg
                  x={x - GOAL_ICON_SIZE / 2}
                  y={y - GOAL_ICON_SIZE / 2}
                  width={GOAL_ICON_SIZE}
                  height={GOAL_ICON_SIZE}
                  viewBox="0 0 24 24"
                >
                  <path
                    d={UI_ICON_PATHS.goal}
                    fill="none"
                    stroke="var(--color-ink)"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </g>
            );
          })()}
          {targets &&
            [targets.left, targets.right].map((field) => {
              const [x, y] = polar(LABEL_RADIUS, fieldAngle(field));
              return (
                <text
                  key={field}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="var(--color-ink)"
                  className="font-label"
                  fontSize={15}
                  style={{
                    transform: `rotate(${-rotation}deg)`,
                    transformOrigin: `${x}px ${y}px`,
                    ...transition,
                  }}
                >
                  {field}
                </text>
              );
            })}
        </g>
        {blocked && <BlockedArc side={blocked.side} reason={blocked.reason} />}
      </svg>
      <div className="pointer-events-none absolute inset-[22%] flex flex-col items-center justify-center gap-1 text-center">
        {center}
      </div>
    </div>
  );
}

/** Screen-space arc on the blocked side (the ring keeps the current field at 12 o'clock). */
function BlockedArc({ side, reason }: { side: Direction; reason: 'u_turn' | 'forced' }) {
  const sign = side === 'right' ? 1 : -1;
  const start = sign * BLOCK_ARC_MARGIN_DEG;
  const end = sign * (180 - BLOCK_ARC_MARGIN_DEG);
  const [x0, y0] = polar(BLOCK_ARC_RADIUS, start);
  const [x1, y1] = polar(BLOCK_ARC_RADIUS, end);
  const [iconX, iconY] = polar(BLOCK_ARC_RADIUS, sign * 90);
  return (
    <g>
      <path
        d={`M${x0} ${y0} A${BLOCK_ARC_RADIUS} ${BLOCK_ARC_RADIUS} 0 0 ${side === 'right' ? 1 : 0} ${x1} ${y1}`}
        fill="none"
        stroke="var(--color-bad)"
        strokeWidth={2}
        strokeDasharray="6 6"
      />
      <svg
        x={iconX - BLOCK_ICON_SIZE / 2}
        y={iconY - BLOCK_ICON_SIZE / 2}
        width={BLOCK_ICON_SIZE}
        height={BLOCK_ICON_SIZE}
        viewBox="0 0 24 24"
      >
        <rect width="24" height="24" fill="var(--color-panel)" />
        <path
          d={reason === 'u_turn' ? ACTION_ICON_PATHS.u_turn : UI_ICON_PATHS.reverse}
          fill="none"
          stroke="var(--color-bad)"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </g>
  );
}
