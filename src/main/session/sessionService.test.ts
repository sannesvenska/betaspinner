import { describe, expect, it } from 'vitest';
import { DEFAULT_PROGRESSION } from '@shared/session/defaults';
import { standardInput } from '@shared/session/testFixtures';
import type { Progression, SessionState } from '@shared/session/types';
import type { JsonStore } from '../storage/jsonStore';
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

async function setup(progression: Progression = DEFAULT_PROGRESSION) {
  const fixture = standardInput();
  const progressionStore = memoryStore(progression);
  const sessionStore = memoryStore<SessionState | null>(null);
  let seed = 100;
  const service = await createSessionService({
    progressionStore,
    sessionStore,
    folders: () => fixture.folders,
    media: () => fixture.media,
    now: () => new Date('2026-09-29T20:00:00.000Z'),
    randomSeed: () => seed++,
    newId: () => 'session-id',
  });
  return { service, progressionStore, sessionStore };
}

describe('sessionService', () => {
  it('spins, generates, persists the session and updates progression', async () => {
    const { service, progressionStore, sessionStore } = await setup();
    const result = await service.spin();

    expect(result.session?.goalField).toBe(result.wheel.value);
    expect(sessionStore.current()?.id).toBe('session-id');
    expect(progressionStore.current().sessionCounter).toBe(1);
    expect(Object.keys(progressionStore.current().categoryUsage)).toHaveLength(2);
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
    expect(Object.values(mediaKinds).length).toBeGreaterThan(90);
    expect(sessionStore.writes()).toBe(writesBefore + 1);

    await expect(service.dispatch({ type: 'roll' })).rejects.toMatchObject({ code: 'rejected' });
    expect(sessionStore.writes()).toBe(writesBefore + 1);
  });

  it('closes only finished sessions and records shown images', async () => {
    const { service, progressionStore, sessionStore } = await setup();
    const { session } = await service.spin();
    await expect(service.close()).rejects.toMatchObject({ code: 'not_finished' });

    await service.dispatch({ type: 'endEarly' });
    await service.close();
    expect(sessionStore.current()).toBeNull();
    const startHash = session ? (session.cards[session.startField - 1]?.imageHash ?? '') : '';
    expect(progressionStore.current().imageRecency[startHash]).toBe(1);
  });
});
