import { randomInt, randomUUID } from 'node:crypto';
import { actionGroup, type ActionId } from '@shared/actions';
import type { FolderConfig, MediaEntry } from '@shared/content';
import type { SessionMediaKinds, SessionSnapshot, SessionView, SpinResult } from '@shared/ipc';
import type { GameConfig } from '@shared/config/gameConfig';
import {
  createDraft,
  DRAFT_FIELD_TYPES,
  draftOutcome,
  isDraftComplete,
  pickDraftField,
  type DraftConfig,
  type DraftState,
} from '@shared/draft';
import { DEFAULT_PROGRESSION } from '@shared/session/defaults';
import type { EngineContext } from '@shared/session/engine/context';
import { reduce, type EngineEvent } from '@shared/session/engine/reduce';
import { generateSession, GenerationError } from '@shared/session/generateSession';
import { spinStartWheel } from '@shared/session/goalAndStart';
import { toSessionRecord, type SessionRecord } from '@shared/session/history';
import { applyDecay, applySessionOutcome } from '@shared/session/progressionRules';
import { createRng } from '@shared/session/rng';
import type { ActionCardDefinition, Progression, SessionState } from '@shared/session/types';
import type { JsonStore } from '../storage/jsonStore';
import { isLegacySessionMarker, type StoredSession } from './persistence';

const MS_PER_MINUTE = 60_000;
/** Seeds stay within int32 so they round-trip through JSON and the PRNG unchanged. */
const MAX_SEED = 2 ** 31 - 1;

export class SessionServiceError extends Error {
  constructor(
    readonly code:
      | 'session_active'
      | 'locked_out'
      | 'no_session'
      | 'not_finished'
      | 'rejected'
      | 'reroll_unavailable'
      | 'draft_incomplete',
  ) {
    super(code);
    this.name = 'SessionServiceError';
  }
}

interface SessionServiceOptions {
  progressionStore: JsonStore<Progression>;
  sessionStore: JsonStore<StoredSession>;
  historyStore: JsonStore<SessionRecord[]>;
  /** Progression changed outside a request (decay timer) – push it to the UI. */
  onProgressionChanged?: (progression: Progression) => void;
  folders: () => readonly FolderConfig[];
  media: () => readonly MediaEntry[];
  actionCards: () => readonly ActionCardDefinition[];
  /** Admin-configurable rules (AP10); a running session keeps its own rules snapshot. */
  game: () => GameConfig;
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
  /** §6.0: deals a draft if none is pending (and none is needed for a running session). */
  dealDraft: () => Promise<SessionSnapshot>;
  pickDraft: (index: number) => Promise<SessionSnapshot>;
  /** §6.2 `allowReroll`: once per session on the briefing – a fresh board without the current categories. */
  reroll: () => Promise<SessionView>;
  /** Admin (§16): penalty fields, good chance, loss streak, lockout and blocks back to defaults. */
  resetProgression: () => Promise<SessionSnapshot>;
  /** QA helper for dev builds: next field becomes `action`, the next roll can be chosen. */
  devPlaceAction: (action: ActionId) => Promise<SessionView>;
}

const isActive = (session: SessionState | null): session is SessionState =>
  session !== null && session.phase !== 'ended';

export async function createSessionService(options: SessionServiceOptions): Promise<SessionService> {
  const now = options.now ?? (() => new Date());
  const randomSeed = options.randomSeed ?? (() => randomInt(1, MAX_SEED));
  const newId = options.newId ?? randomUUID;

  let progression = await options.progressionStore.read();
  const stored = await options.sessionStore.read();
  let session: SessionState | null = isLegacySessionMarker(stored) ? null : stored;
  // §8.3 v2: an older session is discarded without scoring; the start screen shows a notice
  let discardedLegacySession = isLegacySessionMarker(stored);
  if (discardedLegacySession) await options.sessionStore.write(null);

  const penalties = () => options.game().penalties;
  const context = (): EngineContext => ({
    rules: session?.rules ?? options.game().rules,
    actionCards: options.actionCards(),
    folders: options.folders(),
    media: options.media(),
    imageRecency: progression.imageRecency,
    pixelateMaxLevel: options.game().visualEffects.pixelBlockFractions.length,
  });

  function mediaKindsFor(state: SessionState | null): SessionMediaKinds {
    if (!state) return {};
    const hashes = new Set(state.cards.flatMap((card) => (card.imageHash ? [card.imageHash] : [])));
    const kinds: SessionMediaKinds = {};
    for (const entry of options.media()) if (hashes.has(entry.hash)) kinds[entry.hash] = entry.kind;
    for (const card of options.actionCards())
      if (card.image && hashes.has(card.image.hash)) kinds[card.image.hash] = card.image.kind;
    return kinds;
  }

  const snapshot = (): SessionSnapshot => ({
    session,
    progression,
    mediaKinds: mediaKindsFor(session),
    discardedLegacySession,
  });

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

    // §6.0: the draft must be complete first; its result stays pending until a session starts
    const draftConfig = options.game().draft;
    const pending = progression.pendingDraft;
    if (draftConfig.enabled && (!pending || !isDraftComplete(pending)))
      throw new SessionServiceError('draft_incomplete');
    const draft =
      draftConfig.enabled && pending ? draftOutcome(pending, draftConfig, progression.goodChance) : null;

    const wheel = spinStartWheel(createRng(randomSeed()), options.game().rules, progression.penaltyFields);
    if (wheel.penalty) {
      const lockoutUntil = new Date(
        current.getTime() + penalties().lockoutMinutes * MS_PER_MINUTE,
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
        rules: options.game().rules,
        actionCards: options.actionCards(),
        folders: options.folders(),
        media: options.media(),
        progression,
        draft,
      });
      // Session first: a crash in between must not burn a session index without a session
      await saveSession(generated);
      await saveProgression({
        ...progression,
        sessionCounter: generated.sessionIndex,
        categoryUsage,
        blockedActionsNextSession: [],
        pendingDraft: null,
      });
      discardedLegacySession = false;
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
      penalties(),
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
    const next = applyDecay(progression, now(), penalties(), createRng(randomSeed()));
    if (next === progression) return;
    await saveProgression(next);
    options.onProgressionChanged?.(next);
  }

  async function reroll(): Promise<SessionView> {
    const current = session;
    if (
      current?.phase !== 'resolve_card' ||
      current.round !== 0 ||
      current.rerolled ||
      !current.rules.allowReroll
    ) {
      throw new SessionServiceError('reroll_unavailable');
    }
    // The current categories count as used in this session → cooldown excludes them where possible
    const { session: generated, categoryUsage } = generateSession({
      seed: randomSeed(),
      sessionId: current.id,
      now: current.startedAt,
      goalValue: current.goalValue,
      rules: current.rules,
      actionCards: options.actionCards(),
      folders: options.folders(),
      media: options.media(),
      progression: { ...progression, sessionCounter: current.sessionIndex - 1 },
      draft: current.draft,
    });
    // The initial task was already done – continue on the new start card
    const started = reduce(generated, { type: 'confirm' }, context());
    if (started.error) throw new SessionServiceError('rejected');
    const next: SessionState = { ...started.state, rerolled: true };
    await saveSession(next);
    await saveProgression({ ...progression, categoryUsage });
    return { session: next, mediaKinds: mediaKindsFor(next) };
  }

  /** A pending draft is re-dealt only while untouched, e.g. after the admin changed the composition. */
  function draftMatches(draft: DraftState, config: DraftConfig): boolean {
    if (draft.picked.length > 0) return true;
    return (
      draft.picks === Math.min(config.picks, draft.board.length) &&
      DRAFT_FIELD_TYPES.every(
        (type) => draft.board.filter((entry) => entry === type).length === config.composition[type],
      )
    );
  }

  async function dealDraft(): Promise<SessionSnapshot> {
    const config = options.game().draft;
    const pending = progression.pendingDraft;
    if (!config.enabled || isActive(session) || (pending && draftMatches(pending, config))) return snapshot();
    await saveProgression({ ...progression, pendingDraft: createDraft(createRng(randomSeed()), config) });
    return snapshot();
  }

  async function pickDraft(index: number): Promise<SessionSnapshot> {
    const pending = progression.pendingDraft;
    const next = pending ? pickDraftField(pending, index) : null;
    if (!next) throw new SessionServiceError('rejected');
    await saveProgression({ ...progression, pendingDraft: next });
    return snapshot();
  }

  async function resetProgression(): Promise<SessionSnapshot> {
    await saveProgression({
      ...progression,
      goodChance: DEFAULT_PROGRESSION.goodChance,
      penaltyFields: [],
      lastDecayAt: null,
      lossStreak: 0,
      lockoutUntil: null,
      blockedActionsNextSession: [],
    });
    options.onProgressionChanged?.(progression);
    return snapshot();
  }

  async function devPlaceAction(action: ActionId): Promise<SessionView> {
    if (session?.phase !== 'roll') throw new SessionServiceError('rejected');
    const length = session.cards.length;
    // Both neighbours, so the test works even while U Turn blocks one direction
    const fields = new Set([(session.position % length) + 1, ((session.position - 2 + length) % length) + 1]);
    fields.delete(session.goalField);
    const definition = options.actionCards().find((card) => card.type === action);
    const cards = session.cards.map((card) =>
      fields.has(card.field)
        ? {
            field: card.field,
            kind: 'action' as const,
            action,
            actionCardId: definition?.id ?? action,
            group: actionGroup(action),
            ...(definition?.image ? { imageHash: definition.image.hash } : {}),
            discovered: false,
          }
        : card,
    );
    const next: SessionState = { ...session, cards, chooseNextRoll: true };
    await saveSession(next);
    return { session: next, mediaKinds: mediaKindsFor(next) };
  }

  return {
    snapshot,
    spin,
    dispatch,
    close,
    tickDecay,
    dealDraft,
    pickDraft,
    reroll,
    resetProgression,
    devPlaceAction,
  };
}
