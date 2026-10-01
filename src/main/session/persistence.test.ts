import { describe, expect, it } from 'vitest';
import { SESSION_MIGRATIONS, SESSION_SCHEMA_VERSION } from './persistence';

describe('session migrations', () => {
  it('v5 → v6 gives running sessions no revisit penalty', () => {
    expect(SESSION_MIGRATIONS[5]?.({ id: 'session-1', rules: {}, stats: { rolls: 3 } })).toMatchObject({
      rules: { revisitChancePenalty: 0 },
      stats: { rolls: 3, revisitPenalties: 0 },
    });
  });

  it('v4 → v5 adds the beta fields to the rules snapshot and the draft outcome', () => {
    expect(SESSION_SCHEMA_VERSION).toBe(6);
    const migrated = SESSION_MIGRATIONS[4]?.({
      id: 'session-1',
      rules: { chancePerDiscovered: 0.5 },
      draft: { goodShare: 0.4, pixelLevel: 1, winMultiplier: 1 },
    });
    expect(migrated).toMatchObject({
      rules: {
        chancePerDiscovered: 0.5,
        collectiblesVisible: false,
        collectiblePixelateRelief: 0,
        betaMode: false,
      },
      draft: { goodShare: 0.4, splatterShare: 0 },
    });
  });

  it('keeps a missing draft and the legacy marker as they are', () => {
    expect(SESSION_MIGRATIONS[4]?.({ id: 'session-1', rules: {}, draft: null })).toMatchObject({
      draft: null,
    });
    expect(SESSION_MIGRATIONS[4]?.({ legacyDiscarded: true })).toEqual({ legacyDiscarded: true });
    expect(SESSION_MIGRATIONS[4]?.(null)).toBeNull();
  });
});
