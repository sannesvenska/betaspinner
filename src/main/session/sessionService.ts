import { randomInt, randomUUID } from 'node:crypto';
import type { FolderConfig, MediaEntry } from '@shared/content';
import type { SessionMediaKinds, SessionSnapshot, SessionView, SpinResult } from '@shared/ipc';
import {
  DEFAULT_ACTIONS,
  DEFAULT_PENALTY_RULES,
  DEFAULT_PIXELATE_MAX_LEVEL,
  DEFAULT_SESSION_RULES,
} from '@shared/session/defaults';
import type { EngineContext } from '@shared/session/engine/context';
import { reduce, type EngineEvent } from '@shared/session/engine/reduce';
import { generateSession, GenerationError } from '@shared/session/generateSession';
import { spinStartWheel } from '@shared/session/goalAndStart';
import { toSessionRecord, type SessionRecord } from '@shared/session/history';
import { applyDecay, applySessionOutcome } from '@shared/session/progressionRules';
import { createRng } from '@shared/session/rng';
import type { Progression, SessionState } from '@shared/session/types';
import type { JsonStore } from '../storage/jsonStore';

const MS_PER_MINUTE = 60_000;
/** Seeds stay within int32 so they round-trip through JSON and the PRNG unchanged. */
const MAX_SEED = 2 ** 31 - 1;

export class SessionServiceError extends Error {
  constructor(readonly code: 'session_active' | 'locked_out' | 'no_session' | 'not_finished' | 'rejected') {
    super(code);
    this.name = 'SessionServiceError';
  }
}

interface SessionServiceOptions {
  progressionStore: JsonStore<Progression>;
  sessionStore: JsonStore<SessionState | null>;
  historyStore: JsonStore<SessionRecord[]>;
  /** Progression changed outside a request (decay timer) – push it to the UI. */
  onProgressionChanged?: (progression: Progression) => void;
  folders: () => readonly FolderConfig[];
  media: () => readonly MediaEntry[];
  now?: () => Date;
  randomSeed?: () => number;
  newId?: () => string;
}

export interface SessionService {
  snapshot: () => SessionSnapshot;
  spin: () => Promise<SpinResult>;
  dispatch: (event: EngineEvent) => Promise<SessionView>;
  /** Applies a finished session to progression, writes history and clears it (idempotent). */
  close: () => Promise<SessionSnapshot>;
  /** §13.3 lazy decay – call on start and periodically. */
  tickDecay: () => Promise<void>;
}

const isActive = (session: SessionState | null): session is SessionState =>
  session !== null && session.phase !== 'ended';

export async function createSessionService(options: SessionServiceOptions): Promise<SessionService> {
  const now = options.now ?? (() => new Date());
  const randomSeed = options.randomSeed ?? (() => randomInt(1, MAX_SEED));
  const newId = options.newId ?? randomUUID;

  let progression = await options.progressionStore.read();
  let session = await options.sessionStore.read();

  const context = (): EngineContext => ({
    rules: DEFAULT_SESSION_RULES,
    actions: DEFAULT_ACTIONS,
    folders: options.folders(),
    media: options.media(),
    imageRecency: progression.imageRecency,
    pixelateMaxLevel: DEFAULT_PIXELATE_MAX_LEVEL,
  });

  function mediaKindsFor(state: SessionState | null): SessionMediaKinds {
    if (!state) return {};
    const hashes = new Set(state.cards.flatMap((card) => (card.imageHash ? [card.imageHash] : [])));
    const kinds: SessionMediaKinds = {};
    for (const entry of options.media()) if (hashes.has(entry.hash)) kinds[entry.hash] = entry.kind;
    return kinds;
  }

  const snapshot = (): SessionSnapshot => ({ session, progression, mediaKinds: mediaKindsFor(session) });

  async function saveProgression(next: Progression): Promise<void> {
    await options.progressionStore.write(next);
    progression = next;
  }

  async function saveSession(next: SessionState | null): Promise<void> {
    await options.sessionStore.write(next);
    session = next;
  }

  async function spin(): Promise<SpinResult> {
    if (isActive(session)) throw new SessionServiceError('session_active');
    const current = now();
    if (progression.lockoutUntil && new Date(progression.lockoutUntil) > current) {
      throw new SessionServiceError('locked_out');
    }

    const wheel = spinStartWheel(createRng(randomSeed()), DEFAULT_SESSION_RULES, progression.penaltyFields);
    if (wheel.penalty) {
      const lockoutUntil = new Date(
        current.getTime() + DEFAULT_PENALTY_RULES.lockoutMinutes * MS_PER_MINUTE,
      ).toISOString();
      await saveProgression({ ...progression, lockoutUntil });
      return { wheel, session: null, mediaKinds: {}, lockoutUntil };
    }

    try {
      const { session: generated, categoryUsage } = generateSession({
        seed: randomSeed(),
        sessionId: newId(),
        now: current.toISOString(),
        goalValue: wheel.value,
        rules: DEFAULT_SESSION_RULES,
        actions: DEFAULT_ACTIONS,
        folders: options.folders(),
        media: options.media(),
        progression,
      });
      // Session first: a crash in between must not burn a session index without a session
      await saveSession(generated);
      await saveProgression({
        ...progression,
        sessionCounter: generated.sessionIndex,
        categoryUsage,
        blockedActionsNextSession: [],
      });
      return { wheel, session: generated, mediaKinds: mediaKindsFor(generated), lockoutUntil: null };
    } catch (error) {
      if (error instanceof GenerationError) {
        return { wheel, session: null, mediaKinds: {}, lockoutUntil: null, generationError: error.code };
      }
      throw error;
    }
  }

  async function dispatch(event: EngineEvent): Promise<SessionView> {
    if (!session) throw new SessionServiceError('no_session');
    const result = reduce(session, event, context());
    if (result.error) throw new SessionServiceError('rejected');
    // game-design §8.3: autosave after every state change
    await saveSession(result.state);
    return { session: result.state, mediaKinds: mediaKindsFor(result.state) };
  }

  async function close(): Promise<SessionSnapshot> {
    if (!session) return snapshot();
    const finished = session;
    if (finished.phase !== 'ended') throw new SessionServiceError('not_finished');
    const endedAt = now();

    const { progression: applied, change } = applySessionOutcome(
      progression,
      finished,
      DEFAULT_PENALTY_RULES,
      createRng(randomSeed()),
    );
    if (progression.lastAppliedSessionId !== finished.id) {
      const shown = finished.cards.flatMap((card) =>
        card.discovered && card.imageHash ? [card.imageHash] : [],
      );
      await saveProgression({
        ...applied,
        imageRecency: {
          ...progression.imageRecency,
          ...Object.fromEntries(shown.map((hash) => [hash, finished.sessionIndex])),
        },
        lastAppliedSessionId: finished.id,
      });
    }

    const history = await options.historyStore.read();
    if (!history.some((record) => record.id === finished.id)) {
      await options.historyStore.write([...history, toSessionRecord(finished, endedAt, change)]);
    }
    await saveSession(null);
    return snapshot();
  }

  async function tickDecay(): Promise<void> {
    const next = applyDecay(progression, now(), DEFAULT_PENALTY_RULES, createRng(randomSeed()));
    if (next === progression) return;
    await saveProgression(next);
    options.onProgressionChanged?.(next);
  }

  return { snapshot, spin, dispatch, close, tickDecay };
}
