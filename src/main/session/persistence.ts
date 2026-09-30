import { DEFAULT_PROGRESSION, DEFAULT_SESSION_RULES, GOOD_CHANCE_BOUNDS } from '@shared/session/defaults';
import { TRACK_LENGTH } from '@shared/session/track';
import type { SessionRecord } from '@shared/session/history';
import type { Progression, SessionState } from '@shared/session/types';

export const PROGRESSION_SCHEMA_VERSION = 1;
/** v2 = game-design Revision 3 (gameplay v2; older sessions cannot be resumed), v3 = rules snapshot (AP10). */
export const SESSION_SCHEMA_VERSION = 3;
export const HISTORY_SCHEMA_VERSION = 1;

/** Marker for a session of an older schema: discarded without scoring on load (§8.3 v2). */
export interface LegacySessionMarker {
  legacyDiscarded: true;
}
export type StoredSession = SessionState | LegacySessionMarker | null;

export const SESSION_MIGRATIONS: Readonly<Record<number, (data: unknown) => unknown>> = {
  1: (data) => (data === null ? null : { legacyDiscarded: true }),
  // v3: running v2 sessions keep playing with the rules that were the defaults then
  2: (data) =>
    isRecord(data) && data.legacyDiscarded !== true
      ? { rules: DEFAULT_SESSION_RULES, rerolled: false, ...data }
      : data,
};

export const isLegacySessionMarker = (value: StoredSession): value is LegacySessionMarker =>
  value !== null && 'legacyDiscarded' in value;

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
    // Action card definition ids (built-ins use their type as id, so v1 values stay valid)
    blockedActionsNextSession: Array.isArray(data.blockedActionsNextSession)
      ? data.blockedActionsNextSession.filter((id): id is string => typeof id === 'string')
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
    lastAppliedSessionId: stringOrNull(data.lastAppliedSessionId),
  };
}

/**
 * The current session is written by this app only; a structurally broken file is quarantined by the store.
 * `null` = no active session.
 */
export function normalizeSessionFile(data: unknown): StoredSession {
  if (data === null) return null;
  if (isRecord(data) && data.legacyDiscarded === true) return { legacyDiscarded: true };
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

/** history.json is append-only data written by this app; non-array roots are quarantined. */
export function normalizeHistory(data: unknown): SessionRecord[] {
  if (!Array.isArray(data)) throw new Error('History root must be an array');
  return data.filter((entry): entry is SessionRecord => isRecord(entry) && typeof entry.id === 'string');
}
