import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTION_CARDS, DEFAULT_PENALTY_RULES, DEFAULT_SESSION_RULES } from '../session/defaults';
import { simulateSessions } from '../session/simulateSessions';
import { standardInput } from '../session/testFixtures';
import {
  DEFAULT_VISUAL_EFFECTS,
  getField,
  normalizePenaltyRules,
  normalizeSessionRules,
  normalizeVisualEffects,
  setField,
  validatePenaltyRules,
  validateSessionRules,
  validateVisualEffects,
} from './gameConfig';

describe('game config field access', () => {
  it('reads and writes nested keys immutably', () => {
    const rules = DEFAULT_SESSION_RULES;
    expect(getField(rules, 'categoriesPerSession.good')).toEqual([2, 3]);
    const next = setField(rules, 'categoriesPerSession.good', [1, 1]);
    expect(next.categoriesPerSession).toEqual({ good: [1, 1], bad: [2, 3] });
    expect(rules.categoriesPerSession.good).toEqual([2, 3]);
  });
});

describe('validation (admin inline errors)', () => {
  it('accepts the defaults', () => {
    expect(validateSessionRules(DEFAULT_SESSION_RULES)).toEqual({});
    expect(validatePenaltyRules(DEFAULT_PENALTY_RULES)).toEqual({});
    expect(validateVisualEffects(DEFAULT_VISUAL_EFFECTS)).toEqual({});
  });

  it('reports bounds, integers, ranges and cross-field rules', () => {
    const errors = validateSessionRules({
      ...DEFAULT_SESSION_RULES,
      startJitter: 99,
      minGoalDistance: 2.5,
      actionCardCount: [30, 20],
      chancePerDiscovered: 0,
      goalDriftMaxDistance: 5,
      collectibleCount: [6, 60],
      collectibleTiers: [
        { collected: 3, bonus: { type: 'convert_bad', count: 5 } },
        { collected: 3, bonus: { type: 'release_chance', percent: 80 } },
      ],
    });
    expect(errors).toMatchObject({
      startJitter: 'tooLarge',
      minGoalDistance: 'integer',
      actionCardCount: 'minAboveMax',
      chancePerDiscovered: 'tooSmall',
      goalDriftMaxDistance: 'driftMax',
      'collectibleCount.1': 'tooLarge',
      'collectibleTiers.1.collected': 'notAscending',
      'collectibleTiers.1.amount': 'tooLarge',
    });
  });

  it('limits action + collectible cards so the track keeps room', () => {
    const errors = validateSessionRules({
      ...DEFAULT_SESSION_RULES,
      actionCardCount: [30, 40],
      collectibleCount: [15, 20],
      actionPoolSize: [8, 10],
    });
    expect(errors.actionCardCount).toBe('tooManySpecial');
  });

  it('requires growing pixelate levels', () => {
    expect(validateVisualEffects({ pixelBlockFractions: [0.01, 0.02, 0.02, 0.05, 0.3] })).toEqual({
      'pixelBlockFractions.2': 'notAscending',
      'pixelBlockFractions.4': 'tooLarge',
    });
  });
});

describe('normalization (stored config → always valid)', () => {
  it('fills missing values, clamps and orders ranges', () => {
    const rules = normalizeSessionRules({
      startJitter: 500,
      categoriesPerSession: { good: [4, 1] },
      actionGoodShare: 0.5,
      maxDetourConversions: null,
      actionHint: 'nope',
      goalDriftRange: [3, 25],
      goalDriftMaxDistance: 10,
    });
    expect(rules).toMatchObject({
      startJitter: 25,
      categoriesPerSession: { good: [1, 4], bad: [2, 3] },
      actionGoodShare: 0.5,
      maxDetourConversions: null,
      actionHint: 'split_by_side',
      goalDriftMaxDistance: 25,
      chancePerDiscovered: 0.5,
    });
    expect(normalizeSessionRules(undefined)).toEqual(DEFAULT_SESSION_RULES);
  });

  it('sorts and de-duplicates collectible tiers and drops broken ones', () => {
    const rules = normalizeSessionRules({
      collectibleTiers: [
        { collected: 5, bonus: { type: 'release_chance', percent: 10 } },
        { collected: 3, bonus: { type: 'convert_bad', count: 5 } },
        { collected: 3, bonus: { type: 'release_chance', percent: 1 } },
        { collected: 4, bonus: { type: 'magic' } },
      ],
    });
    expect(rules.collectibleTiers.map((tier) => tier.collected)).toEqual([3, 5]);
  });

  it('falls back for broken penalties and visual effects', () => {
    expect(normalizePenaltyRules({ penaltyStep: -4, goodChanceBounds: [0.9, 0.1] })).toMatchObject({
      penaltyStep: 0,
      goodChanceBounds: [0.1, 0.9],
      lockoutMinutes: 15,
    });
    expect(normalizeVisualEffects({ pixelBlockFractions: [0.05, 0.01, 0.02, 0.03, 0.04] })).toEqual(
      DEFAULT_VISUAL_EFFECTS,
    );
  });
});

describe('simulateSessions (§16 admin preview)', () => {
  it('summarizes action card distribution over many runs', () => {
    const input = standardInput();
    const result = simulateSessions(
      {
        rules: input.rules,
        actionCards: input.actionCards,
        folders: input.folders,
        media: input.media,
        progression: input.progression,
      },
      200,
    );
    expect(result.failed).toBe(0);
    expect(result.avgActionCards).toBeGreaterThanOrEqual(14);
    expect(result.avgActionCards).toBeLessThanOrEqual(22);
    expect(result.avgCollectibles).toBe(5);
    expect(result.performerShare).toBe(1);
    expect(result.avgPoolSize).toBeGreaterThanOrEqual(7);
    expect(result.cards).toHaveLength(DEFAULT_ACTION_CARDS.length);
    const mistress = result.cards.find((card) => card.id === 'mistress_says_no');
    expect(mistress?.poolShare).toBeLessThan(0.12);
  });

  it('counts failed runs instead of throwing', () => {
    const input = standardInput();
    const result = simulateSessions(
      {
        rules: input.rules,
        actionCards: input.actionCards,
        folders: input.folders.filter((folder) => folder.group !== 'bad'),
        media: input.media,
        progression: input.progression,
      },
      10,
    );
    expect(result.failed).toBe(10);
    expect(result.avgActionCards).toBe(0);
  });
});
