import { randInt, shuffle, type Rng } from './session/rng';

/**
 * Session draft (game-design §6.0): before the start wheel the player turns over `picks` of
 * `fieldCount` hidden fields. The revealed fields set the good/bad share of the normal cards, a start
 * pixelate level and an extra win multiplier for the coming session.
 */

export type DraftFieldType = 'bad' | 'good' | 'pixelate' | 'double';
export const DRAFT_FIELD_TYPES: readonly DraftFieldType[] = ['bad', 'good', 'pixelate', 'double'];

export interface DraftConfig {
  enabled: boolean;
  fieldCount: number;
  picks: number;
  /** Fields per type – must add up to `fieldCount` */
  composition: Record<DraftFieldType, number>;
  /** Each good field turns this share of the bad normal cards good */
  goodShift: number;
  /** Each bad field turns this share of the good normal cards bad */
  badShift: number;
  /** Start pixelate level for 1 / 2 / 3+ pixelate fields */
  pixelateLevels: { one: number; two: number; three: number };
  /** Extra release chance factor per revealed "double" field (stacks with Hail Mary) */
  winMultiplier: number;
}

export const DEFAULT_DRAFT_CONFIG: DraftConfig = {
  enabled: true,
  fieldCount: 12,
  picks: 6,
  composition: { bad: 6, pixelate: 3, good: 2, double: 1 },
  goodShift: 1 / 3,
  badShift: 1 / 6,
  pixelateLevels: { one: 1, two: 3, three: 5 },
  winMultiplier: 2,
};

/** Persisted until a session actually starts (§6.0: lockouts and restarts never re-roll it). */
export interface DraftState {
  id: string;
  board: DraftFieldType[];
  /** Field indices in pick order */
  picked: number[];
  /** Number of picks required when the draft was created */
  picks: number;
}

/** What the draft does to the session (stored on the session for briefing, console and history). */
export interface DraftOutcome {
  counts: Record<DraftFieldType, number>;
  /** Share of good normal cards for this session (0..1) */
  goodShare: number;
  pixelLevel: number;
  winMultiplier: number;
}

const DRAFT_ID_MAX = 2 ** 31 - 1;

export function createDraft(rng: Rng, config: DraftConfig): DraftState {
  const board = DRAFT_FIELD_TYPES.flatMap((type) =>
    Array<DraftFieldType>(config.composition[type]).fill(type),
  );
  return {
    id: `draft-${randInt(rng, 1, DRAFT_ID_MAX).toString(36)}`,
    board: shuffle(rng, board),
    picked: [],
    picks: Math.min(config.picks, board.length),
  };
}

export const isDraftComplete = (draft: DraftState): boolean => draft.picked.length >= draft.picks;

/** Returns the updated draft, or null for an invalid pick (taken, out of range, already complete). */
export function pickDraftField(draft: DraftState, index: number): DraftState | null {
  if (isDraftComplete(draft) || !Number.isInteger(index) || index < 0 || index >= draft.board.length)
    return null;
  if (draft.picked.includes(index)) return null;
  return { ...draft, picked: [...draft.picked, index] };
}

export function countPicks(draft: DraftState): Record<DraftFieldType, number> {
  const counts: Record<DraftFieldType, number> = { bad: 0, good: 0, pixelate: 0, double: 0 };
  for (const index of draft.picked) {
    const type = draft.board[index];
    if (type) counts[type]++;
  }
  return counts;
}

/**
 * Good share of the normal cards (decision 2026-10-01). Both shifts work on the base split at the same
 * time: each good field turns `goodShift` of the bad cards good, each bad field turns `badShift` of the
 * good cards bad. 6 × bad (1/6) = no good cards; 2 × good (1/3) = 0.8 from 0.4; the average draft
 * (3 bad, 1 good) keeps the base.
 */
export function draftGoodShare(
  base: number,
  good: number,
  bad: number,
  config: Pick<DraftConfig, 'goodShift' | 'badShift'>,
): number {
  const keptGood = base * Math.max(0, 1 - bad * config.badShift);
  const gainedGood = (1 - base) * Math.min(1, good * config.goodShift);
  return Math.min(1, Math.max(0, keptGood + gainedGood));
}

export function draftPixelLevel(pixelatePicks: number, levels: DraftConfig['pixelateLevels']): number {
  if (pixelatePicks <= 0) return 0;
  if (pixelatePicks === 1) return levels.one;
  return pixelatePicks === 2 ? levels.two : levels.three;
}

export function draftOutcome(draft: DraftState, config: DraftConfig, baseGoodChance: number): DraftOutcome {
  const counts = countPicks(draft);
  return {
    counts,
    goodShare: draftGoodShare(baseGoodChance, counts.good, counts.bad, config),
    pixelLevel: draftPixelLevel(counts.pixelate, config.pixelateLevels),
    winMultiplier: config.winMultiplier ** counts.double,
  };
}

/** Square crop of a draft image, normalized to the image (x/y/w/h 0..1, square in pixels). */
export interface DraftCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type DraftArtSlot = 'back' | DraftFieldType;
export const DRAFT_ART_SLOTS: readonly DraftArtSlot[] = ['back', 'bad', 'good', 'pixelate', 'double'];

/** Largest centered square of an image with the given natural size. */
export function centeredSquareCrop(width: number | null, height: number | null): DraftCrop {
  if (!width || !height) return { x: 0, y: 0, w: 1, h: 1 };
  const side = Math.min(width, height);
  return {
    x: (width - side) / 2 / width,
    y: (height - side) / 2 / height,
    w: side / width,
    h: side / height,
  };
}
