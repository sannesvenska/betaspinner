import { ACTION_IDS, type ActionId } from '@shared/actions';
import { DEFAULT_PROGRESSION, GOOD_CHANCE_BOUNDS } from '@shared/session/defaults';
import { TRACK_LENGTH } from '@shared/session/track';
import type { Progression, SessionState } from '@shared/session/types';

export const PROGRESSION_SCHEMA_VERSION = 1;
export const SESSION_SCHEMA_VERSION = 1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const stringOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function numberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
  );
}

/** Tolerant progression reader (§15): invalid fields fall back individually. */
export function normalizeProgression(data: unknown): Progression {
  if (!isRecord(data)) throw new Error('Progression root must be an object');
  const usage = isRecord(data.categoryUsage) ? data.categoryUsage : {};
  return {
    goodChance: Math.min(
      GOOD_CHANCE_BOUNDS[1],
      Math.max(GOOD_CHANCE_BOUNDS[0], numberOr(data.goodChance, DEFAULT_PROGRESSION.goodChance)),
    ),
    penaltyFields: Array.isArray(data.penaltyFields)
      ? [
          ...new Set(
            data.penaltyFields.filter(
              (field): field is number => Number.isInteger(field) && field >= 1 && field <= TRACK_LENGTH,
            ),
          ),
        ]
      : [],
    lastDecayAt: stringOrNull(data.lastDecayAt),
    lossStreak: Math.max(0, Math.round(numberOr(data.lossStreak, 0))),
    lockoutUntil: stringOrNull(data.lockoutUntil),
    blockedActionsNextSession: Array.isArray(data.blockedActionsNextSession)
      ? ACTION_IDS.filter((id: ActionId) => (data.blockedActionsNextSession as unknown[]).includes(id))
      : [],
    categoryUsage: Object.fromEntries(
      Object.entries(usage).flatMap(([id, entry]) =>
        isRecord(entry) && typeof entry.lastUsedSessionIndex === 'number'
          ? [
              [
                id,
                { lastUsedSessionIndex: entry.lastUsedSessionIndex, timesUsed: numberOr(entry.timesUsed, 1) },
              ],
            ]
          : [],
      ),
    ),
    imageRecency: numberRecord(data.imageRecency),
    sessionCounter: Math.max(0, Math.round(numberOr(data.sessionCounter, 0))),
  };
}

/**
 * The current session is written by this app only; a structurally broken file is quarantined by the store.
 * `null` = no active session.
 */
export function normalizeSessionFile(data: unknown): SessionState | null {
  if (data === null) return null;
  if (
    !isRecord(data) ||
    typeof data.id !== 'string' ||
    !Array.isArray(data.cards) ||
    data.cards.length !== TRACK_LENGTH
  ) {
    throw new Error('Invalid session file');
  }
  return data as unknown as SessionState;
}
