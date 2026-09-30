import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG, type GameConfig } from '@shared/config/gameConfig';
import { DEFAULT_PROGRESSION } from '@shared/session/defaults';
import { standardInput } from '@shared/session/testFixtures';
import type { SessionRecord } from '@shared/session/history';
import type { Progression, SessionState } from '@shared/session/types';
import type { JsonStore } from '../storage/jsonStore';
import type { StoredSession } from './persistence';
import { createSessionService, SessionServiceError } from './sessionService';

function memoryStore<T>(initial: T): JsonStore<T> & { current: () => T; writes: () => number } {
  let value = initial;
  let writes = 0;
  return {
    filePath: 'memory',
    read: () => Promise.resolve(value),
    write: (next) => {
      value = next;
      writes++;
      return Promise.resolve();
    },
    current: () => value,
    writes: () => writes,
  };
}

async function setup(
  progression: Progression = DEFAULT_PROGRESSION,
  storedSession: StoredSession = null,
  game: GameConfig = DEFAULT_GAME_CONFIG,
) {
  const fixture = standardInput();
  const progressionStore = memoryStore(progression);
  const sessionStore = memoryStore<StoredSession>(storedSession);
  const historyStore = memoryStore<SessionRecord[]>([]);
  let seed = 100;
  const service = await createSessionService({
    progressionStore,
    sessionStore,
    historyStore,
    folders: () => fixture.folders,
    media: () => fixture.media,
    actionCards: () => fixture.actionCards,
    game: () => game,
    now: () => new Date('2026-09-29T20:00:00.000Z'),
    randomSeed: () => seed++,
    newId: () => 'session-id',
  });
  return { service, progressionStore, sessionStore, historyStore };
}

describe('sessionService', () => {
  it('spins, generates, persists the session and updates progression', async () => {
    const { service, progressionStore, sessionStore } = await setup();
    const result = await service.spin();

    expect(result.session?.goalField).toBe(result.wheel.value);
    expect(sessionStore.current()).toMatchObject({ id: 'session-id' });
    expect(progressionStore.current().sessionCounter).toBe(1);
    // 2-3 categories per group + the performer
    expect(Object.keys(progressionStore.current().categoryUsage).length).toBeGreaterThanOrEqual(5);
    expect(progressionStore.current().categoryUsage['perf-a']).toBeDefined();
    await expect(service.spin()).rejects.toBeInstanceOf(SessionServiceError);
  });

  it('locks out on a penalty field without creating a session', async () => {
    const allPenalty = {
      ...DEFAULT_PROGRESSION,
      penaltyFields: Array.from({ length: 100 }, (_, index) => index + 1),
    };
    const { service, progressionStore, sessionStore } = await setup(allPenalty);
    const result = await service.spin();

    expect(result.wheel.penalty).toBe(true);
    expect(result.session).toBeNull();
    expect(result.lockoutUntil).toBe('2026-09-29T20:15:00.000Z');
    expect(sessionStore.current()).toBeNull();
    await expect(service.spin()).rejects.toMatchObject({ code: 'locked_out' });
    expect(progressionStore.current().lockoutUntil).toBe(result.lockoutUntil);
  });

  it('autosaves after every accepted event and rejects invalid ones without saving', async () => {
    const { service, sessionStore } = await setup();
    await service.spin();
    const writesBefore = sessionStore.writes();

    const { session: state, mediaKinds } = await service.dispatch({ type: 'confirm' });
    expect(state.phase).toBe('resolve_card');
    // Every normal card and collectible has an image; built-in action cards use the neutral design
    expect(Object.values(mediaKinds).length).toBeGreaterThan(70);
    expect(sessionStore.writes()).toBe(writesBefore + 1);

    await expect(service.dispatch({ type: 'roll' })).rejects.toMatchObject({ code: 'rejected' });
    expect(sessionStore.writes()).toBe(writesBefore + 1);
  });

  it('closes only finished sessions, applies the loss once, records history and shown images', async () => {
    const { service, progressionStore, sessionStore, historyStore } = await setup();
    const { session } = await service.spin();
    await expect(service.close()).rejects.toMatchObject({ code: 'not_finished' });

    await service.dispatch({ type: 'endEarly' });
    await service.close();
    expect(sessionStore.current()).toBeNull();
    const startHash = session ? (session.cards[session.startField - 1]?.imageHash ?? '') : '';
    expect(progressionStore.current().imageRecency[startHash]).toBe(1);
    // Loss: streak 1 → 2 penalty fields
    expect(progressionStore.current()).toMatchObject({ lossStreak: 1, lastAppliedSessionId: 'session-id' });
    expect(progressionStore.current().penaltyFields).toHaveLength(2);
    expect(historyStore.current()).toHaveLength(1);
    expect(historyStore.current()[0]).toMatchObject({ id: 'session-id', outcome: 'ended_early' });
  });

  it('discards a session of the old schema without scoring and reports it once (8.3 v2)', async () => {
    const { service, sessionStore, progressionStore, historyStore } = await setup(DEFAULT_PROGRESSION, {
      legacyDiscarded: true,
    });
    expect(service.snapshot()).toMatchObject({ session: null, discardedLegacySession: true });
    expect(sessionStore.current()).toBeNull();
    expect(progressionStore.current().lossStreak).toBe(0);
    expect(historyStore.current()).toHaveLength(0);
    await service.spin();
    expect(service.snapshot().discardedLegacySession).toBe(false);
  });
});

describe('sessionService idempotency and decay', () => {
  it('never applies the same session twice (crash between writes)', async () => {
    const { service, progressionStore, sessionStore, historyStore } = await setup();
    const { session } = await service.spin();
    const ended = {
      ...(session as SessionState),
      phase: 'ended' as const,
      endReason: 'ended_early' as const,
    };
    // Simulate: progression already applied, then crash before the session was cleared
    await progressionStore.write({
      ...progressionStore.current(),
      lossStreak: 1,
      penaltyFields: [5, 6],
      lastAppliedSessionId: ended.id,
    });
    await sessionStore.write(ended);
    const restarted = await createSessionService({
      progressionStore,
      sessionStore,
      historyStore,
      folders: () => [],
      media: () => [],
      actionCards: () => [],
      game: () => DEFAULT_GAME_CONFIG,
    });
    await restarted.close();
    expect(progressionStore.current()).toMatchObject({ lossStreak: 1, penaltyFields: [5, 6] });
    expect(historyStore.current()).toHaveLength(1);
  });

  it('decays penalty fields and reports the change', async () => {
    const progression = {
      ...DEFAULT_PROGRESSION,
      penaltyFields: [1, 2, 3, 4],
      lastDecayAt: '2026-09-29T18:00:00.000Z',
    };
    const changes: Progression[] = [];
    const service = await createSessionService({
      progressionStore: memoryStore<Progression>(progression),
      sessionStore: memoryStore<StoredSession>(null),
      historyStore: memoryStore<SessionRecord[]>([]),
      folders: () => [],
      media: () => [],
      actionCards: () => [],
      game: () => DEFAULT_GAME_CONFIG,
      now: () => new Date('2026-09-29T20:00:00.000Z'),
      onProgressionChanged: (next) => changes.push(next),
    });
    await service.tickDecay();
    expect(service.snapshot().progression.penaltyFields).toEqual([]);
    expect(changes).toHaveLength(1);
  });
});

describe('sessionService admin features (AP10)', () => {
  it('snapshots the configured rules into a new session', async () => {
    const game = { ...DEFAULT_GAME_CONFIG, rules: { ...DEFAULT_GAME_CONFIG.rules, holdSecondsCap: 30 } };
    const { service } = await setup(DEFAULT_PROGRESSION, null, game);
    const { session } = await service.spin();
    expect(session?.rules.holdSecondsCap).toBe(30);
  });

  it('rerolls once on the briefing when allowed, with new categories where possible', async () => {
    // One category per group: the cooldown forces different ones on the reroll
    const rules = {
      ...DEFAULT_GAME_CONFIG.rules,
      allowReroll: true,
      categoriesPerSession: { good: [1, 1], bad: [1, 1] } as const,
    };
    const { service } = await setup(DEFAULT_PROGRESSION, null, { ...DEFAULT_GAME_CONFIG, rules });
    const { session } = await service.spin();
    await service.dispatch({ type: 'confirm' }); // initial task → briefing
    const { session: rerolled } = await service.reroll();
    expect(rerolled).toMatchObject({ id: session?.id, goalValue: session?.goalValue, rerolled: true });
    expect(rerolled.phase).toBe('resolve_card');
    const before = [...(session?.categories.good ?? []), ...(session?.categories.bad ?? [])];
    const after = [...rerolled.categories.good, ...rerolled.categories.bad];
    expect(after.every((id) => !before.includes(id))).toBe(true);
    await expect(service.reroll()).rejects.toMatchObject({ code: 'reroll_unavailable' });
  });

  it('rejects a reroll when the rules do not allow it', async () => {
    const { service } = await setup();
    await service.spin();
    await service.dispatch({ type: 'confirm' });
    await expect(service.reroll()).rejects.toMatchObject({ code: 'reroll_unavailable' });
  });

  it('resets progression but keeps counters and history data', async () => {
    const progression = {
      ...DEFAULT_PROGRESSION,
      goodChance: 0.61,
      penaltyFields: [3, 4],
      lossStreak: 3,
      sessionCounter: 9,
      imageRecency: { abc: 8 },
    };
    const { service } = await setup(progression);
    const snapshot = await service.resetProgression();
    expect(snapshot.progression).toMatchObject({
      goodChance: 0.4,
      penaltyFields: [],
      lossStreak: 0,
      sessionCounter: 9,
      imageRecency: { abc: 8 },
    });
  });
});
