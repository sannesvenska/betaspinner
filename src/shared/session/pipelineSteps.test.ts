import { describe, expect, it } from 'vitest';
import { assignActionSlots } from './assignActionSlots';
import { DEFAULT_ACTION_CARDS, DEFAULT_SESSION_RULES } from './defaults';
import { placeStart, spinStartWheel } from './goalAndStart';
import { createImageBag } from './imageBags';
import { eligibleActionFields, placeActions } from './placeActions';
import { createRng } from './rng';
import { cardGroup, selectActionPool } from './selectActionPool';
import { selectCategories } from './selectCategories';
import { mediaFor } from './testFixtures';
import { shortDistance } from './track';
import type { ActionCardDefinition } from './types';

const SEEDS = Array.from({ length: 1000 }, (_, index) => index + 1);

describe('spinStartWheel / placeStart (§6.1)', () => {
  it('flags penalty fields', () => {
    const rng = createRng(5);
    const results = Array.from({ length: 200 }, () => spinStartWheel(rng, { wheelRange: [1, 10] }, [3]));
    expect(results.every((result) => result.penalty === (result.value === 3))).toBe(true);
    expect(results.some((result) => result.penalty)).toBe(true);
  });

  it('places the start roughly opposite the goal and at least minGoalDistance away', () => {
    for (const seed of SEEDS) {
      const goal = (seed % 100) + 1;
      const start = placeStart(createRng(seed), goal, DEFAULT_SESSION_RULES);
      const distance = shortDistance(start, goal);
      expect(distance).toBeGreaterThanOrEqual(DEFAULT_SESSION_RULES.minGoalDistance);
      expect(distance).toBeGreaterThanOrEqual(50 - DEFAULT_SESSION_RULES.startJitter);
    }
  });
});

describe('selectCategories (§6.2)', () => {
  const rules = { cooldownSessions: 2, freshnessBonus: 0.5, freshnessCap: 6 };
  const candidates = ['a', 'b', 'c', 'd'].map((id) => ({ id, selectionWeight: 50 }));

  it('never repeats a category within the cooldown when the library is large enough', () => {
    const rng = createRng(11);
    const usage: Record<string, { lastUsedSessionIndex: number; timesUsed: number }> = {};
    const history: string[] = [];
    for (let sessionIndex = 1; sessionIndex <= 200; sessionIndex++) {
      const [picked] = selectCategories(rng, { candidates, count: 1, usage, sessionIndex, rules });
      if (!picked) throw new Error('nothing picked');
      history.push(picked);
      usage[picked] = { lastUsedSessionIndex: sessionIndex, timesUsed: (usage[picked]?.timesUsed ?? 0) + 1 };
    }
    for (let i = 1; i < history.length; i++) {
      expect(history[i]).not.toBe(history[i - 1]);
      if (i > 1) expect(history[i]).not.toBe(history[i - 2]);
    }
    // Rotation stays fair: every category is used regularly
    for (const { id } of candidates)
      expect(history.filter((entry) => entry === id).length).toBeGreaterThan(30);
  });

  it('relaxes the cooldown for small libraries, preferring the longest-unused category', () => {
    const usage = {
      a: { lastUsedSessionIndex: 9, timesUsed: 1 },
      b: { lastUsedSessionIndex: 8, timesUsed: 1 },
    };
    const picked = selectCategories(createRng(1), {
      candidates: candidates.slice(0, 2),
      count: 1,
      usage,
      sessionIndex: 10,
      rules,
    });
    expect(picked).toEqual(['b']);
  });

  it('favors higher selection weights', () => {
    const weighted = [
      { id: 'heavy', selectionWeight: 90 },
      { id: 'light', selectionWeight: 10 },
    ];
    const rng = createRng(3);
    const heavyCount = SEEDS.filter(
      () =>
        selectCategories(rng, { candidates: weighted, count: 1, usage: {}, sessionIndex: 1, rules })[0] ===
        'heavy',
    ).length;
    expect(heavyCount).toBeGreaterThan(850);
  });
});

describe('selectActionPool (§6.4 v2)', () => {
  const pool = (
    seed: number,
    cards: readonly ActionCardDefinition[] = DEFAULT_ACTION_CARDS,
    blocked: string[] = [],
  ) => selectActionPool(createRng(seed), { cards, blocked, size: DEFAULT_SESSION_RULES.actionPoolSize });

  it('draws 8–10 distinct cards with both groups and met requirements', () => {
    for (const seed of SEEDS) {
      const picked = pool(seed);
      const types = new Set(picked.map((card) => card.type));
      expect(new Set(picked.map((card) => card.id)).size).toBe(picked.length);
      expect(picked.length).toBeGreaterThanOrEqual(7);
      expect(picked.length).toBeLessThanOrEqual(10);
      expect(picked.some((card) => cardGroup(card) === 'good')).toBe(true);
      expect(picked.some((card) => cardGroup(card) === 'bad')).toBe(true);
      if (types.has('cleaning_lady')) expect(types.has('pixelate') || types.has('splatter')).toBe(true);
      if (types.has('bad_luck')) expect(types.has('hail_mary')).toBe(true);
    }
  });

  it('includes mistress_says_no in about 5 % of sessions (sessionChance gate)', () => {
    const withMistress = SEEDS.filter((seed) =>
      pool(seed).some((card) => card.type === 'mistress_says_no'),
    ).length;
    expect(withMistress).toBeGreaterThan(25);
    expect(withMistress).toBeLessThan(80);
  });

  it('respects blocked, disabled and guaranteed cards', () => {
    const cards = DEFAULT_ACTION_CARDS.map((card) => {
      if (card.id === 'pixelate') return { ...card, enabled: false };
      if (card.id === 'u_turn') return { ...card, minPerSession: 1 };
      return card;
    });
    for (const seed of SEEDS.slice(0, 200)) {
      const ids = pool(seed, cards, ['splatter']).map((card) => card.id);
      expect(ids).not.toContain('pixelate');
      expect(ids).not.toContain('splatter');
      expect(ids).toContain('u_turn');
      // cleaning_lady's requirements are gone, so it can never appear
      expect(ids).not.toContain('cleaning_lady');
    }
  });

  it('treats user variants as separate cards of the same type', () => {
    const variant: ActionCardDefinition = {
      ...(DEFAULT_ACTION_CARDS.find((card) => card.id === 'squeeze_task') as ActionCardDefinition),
      id: 'squeeze-hard',
      builtIn: false,
      name: 'Squeeze – hard',
      weight: 1000,
    };
    const withVariant = SEEDS.slice(0, 50).filter((seed) =>
      pool(seed, [...DEFAULT_ACTION_CARDS, variant]).some((card) => card.id === 'squeeze-hard'),
    ).length;
    expect(withVariant).toBe(50);
  });
});

describe('assignActionSlots (§6.4)', () => {
  const run = (seed: number, pool: readonly ActionCardDefinition[] = DEFAULT_ACTION_CARDS) =>
    assignActionSlots(createRng(seed), { slotCounts: { good: 7, bad: 11 }, pool });

  it('fills slots with cards of the right group and never violates requires or max', () => {
    const byId = new Map(DEFAULT_ACTION_CARDS.map((card) => [card.id, card]));
    for (const seed of SEEDS) {
      const slots = run(seed);
      const types = new Set([...slots.good, ...slots.bad].map((id) => byId.get(id)?.type));
      expect(slots.good).toHaveLength(7);
      expect(slots.bad).toHaveLength(11);
      expect(
        slots.good.every((id) => byId.get(id) && cardGroup(byId.get(id) as ActionCardDefinition) === 'good'),
      ).toBe(true);
      if (types.has('cleaning_lady')) expect(types.has('pixelate') || types.has('splatter')).toBe(true);
      if (types.has('bad_luck')) expect(types.has('hail_mary')).toBe(true);
      expect(slots.bad.filter((id) => id === 'mistress_says_no').length).toBeLessThanOrEqual(1);
    }
  });

  it('fills minimums first', () => {
    const pool = DEFAULT_ACTION_CARDS.map((card) =>
      card.id === 'u_turn' ? { ...card, minPerSession: 3 } : card,
    );
    for (const seed of SEEDS.slice(0, 100))
      expect(run(seed, pool).bad.filter((id) => id === 'u_turn').length).toBeGreaterThanOrEqual(3);
  });

  it('drops slots that cannot be filled', () => {
    const onlyTwo = DEFAULT_ACTION_CARDS.flatMap((card) => {
      if (card.id === 'good_fairy') return [{ ...card, maxPerSession: 2 }];
      return card.id === 'pixelate' ? [card] : [];
    });
    const slots = run(1, onlyTwo);
    expect(slots.good).toEqual(['good_fairy', 'good_fairy']);
    expect(slots.bad.every((id) => id === 'pixelate')).toBe(true);
  });
});

describe('placeActions (§6.5)', () => {
  it('keeps protected zones free, respects the gap and spreads cards around the ring', () => {
    let gapViolations = 0;
    let unevenSessions = 0;
    for (const seed of SEEDS) {
      const rng = createRng(seed);
      const goalField = (seed % 100) + 1;
      const startField = placeStart(rng, goalField, DEFAULT_SESSION_RULES);
      const fields = placeActions(rng, { startField, goalField, count: 22, rules: DEFAULT_SESSION_RULES });

      expect(fields).toHaveLength(22);
      expect(new Set(fields).size).toBe(22);
      for (const field of fields) {
        expect(shortDistance(field, startField)).toBeGreaterThan(2);
        expect(shortDistance(field, goalField)).toBeGreaterThan(2);
      }
      const sorted = [...fields].sort((a, b) => a - b);
      const gaps = sorted.map(
        (field, i) =>
          (sorted[(i + 1) % sorted.length] as number) - field + (i === sorted.length - 1 ? 100 : 0),
      );
      if (gaps.some((gap) => gap < DEFAULT_SESSION_RULES.minActionGap)) gapViolations++;
      // Every quarter of the ring gets action cards
      const quarters = new Set(fields.map((field) => Math.floor((field - 1) / 25)));
      if (quarters.size < 4) unevenSessions++;
    }
    expect(gapViolations).toBe(0);
    expect(unevenSessions).toBe(0);
  });

  it('only uses eligible fields', () => {
    const eligible = eligibleActionFields({ startField: 10, goalField: 60, rules: DEFAULT_SESSION_RULES });
    expect(eligible).toHaveLength(100 - 2 * 5);
  });
});

describe('createImageBag (§6.6)', () => {
  const baseOptions = { imageRecency: {}, sessionIndex: 10, recencySessions: 3 };

  it('never repeats until exhausted, then repeats', () => {
    const bag = createImageBag(createRng(1), {
      ...baseOptions,
      entries: mediaFor('f', 5),
      usedHashes: new Set(),
    });
    const first = Array.from({ length: 5 }, () => bag.draw()?.hash);
    expect(new Set(first).size).toBe(5);
    expect(bag.draw()).toBeDefined();
  });

  it('prefers images not shown in recent sessions', () => {
    const entries = mediaFor('f', 10);
    const recent = Object.fromEntries(entries.slice(0, 5).map((entry) => [entry.hash, 9]));
    const bag = createImageBag(createRng(2), {
      ...baseOptions,
      entries,
      imageRecency: recent,
      usedHashes: new Set(),
    });
    const drawn = Array.from({ length: 5 }, () => bag.draw()?.hash);
    expect(drawn.every((hash) => hash && !(hash in recent))).toBe(true);
  });

  it('shares used hashes across bags and honors filters', () => {
    const usedHashes = new Set<string>();
    const entries = mediaFor('f', 3);
    const bagA = createImageBag(createRng(3), { ...baseOptions, entries, usedHashes });
    const bagB = createImageBag(createRng(4), { ...baseOptions, entries, usedHashes });
    const a = bagA.draw();
    expect(bagB.draw((entry) => entry.hash === a?.hash)).toEqual(a); // only acceptable one → repeat allowed
    expect(bagB.draw((entry) => entry.hash === 'missing')).toBeUndefined();
  });
});
