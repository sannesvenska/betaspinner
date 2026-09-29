import { randomInt, randomUUID } from 'node:crypto';
import type { FolderConfig, MediaEntry } from '@shared/content';
import type { SessionMediaKinds, SessionSnapshot, SessionView, SpinResult } from '@shared/ipc';
import { DEFAULT_ACTIONS, DEFAULT_PIXELATE_MAX_LEVEL, DEFAULT_SESSION_RULES } from '@shared/session/defaults';
import type { EngineContext } from '@shared/session/engine/context';
import { reduce, type EngineEvent } from '@shared/session/engine/reduce';
import { generateSession, GenerationError } from '@shared/session/generateSession';
import { spinStartWheel } from '@shared/session/goalAndStart';
import { createRng } from '@shared/session/rng';
import type { Progression, SessionState } from '@shared/session/types';
import type { JsonStore } from '../storage/jsonStore';

/** game-design §13.1 – configurable with penalties in AP6/AP9. */
const PENALTY_LOCKOUT_MINUTES = 15;
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
  /** Clears a finished session (ended / goal reached) and records image recency. */
  close: () => Promise<SessionSnapshot>;
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
        current.getTime() + PENALTY_LOCKOUT_MINUTES * MS_PER_MINUTE,
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
    if (session.phase !== 'ended' && session.phase !== 'win_check')
      throw new SessionServiceError('not_finished');
    const index = session.sessionIndex;
    const shown = session.cards
      .filter((card) => card.discovered && card.imageHash)
      .map((card) => card.imageHash as string);
    await saveProgression({
      ...progression,
      imageRecency: {
        ...progression.imageRecency,
        ...Object.fromEntries(shown.map((hash) => [hash, index])),
      },
    });
    await saveSession(null);
    return snapshot();
  }

  return { snapshot, spin, dispatch, close };
}
