import { describe, expect, it } from 'vitest';
import { actionGroup } from '../actions';
import { DEFAULT_PROGRESSION, DEFAULT_SESSION_RULES } from './defaults';
import { allocateByWeight, generateSession, GenerationError } from './generateSession';
import { folder, mediaFor, standardInput } from './testFixtures';
import { shortDistance } from './track';

const SEEDS = Array.from({ length: 1000 }, (_, index) => index + 1);

describe('generateSession – determinism', () => {
  it('returns identical sessions for identical input and different ones for other seeds', () => {
    const a = generateSession(standardInput({ seed: 77 }));
    const b = generateSession(standardInput({ seed: 77 }));
    const c = generateSession(standardInput({ seed: 78 }));
    expect(b).toEqual(a);
    expect(c.session.cards).not.toEqual(a.session.cards);
  });
});

describe('generateSession – invariants over 1,000 seeds', () => {
  it('builds a valid track every time', () => {
    for (const seed of SEEDS) {
      const goalValue = ((seed * 37) % 100) + 1;
      const { session } = generateSession(standardInput({ seed, goalValue }));
      const { cards, goalField, startField } = session;
      const actions = cards.filter((card) => card.kind === 'action');
      const normals = cards.filter((card) => card.kind === 'normal');

      expect(cards).toHaveLength(100);
      cards.forEach((card, index) => {
        expect(card.field).toBe(index + 1);
      });
      expect(goalField).toBe(goalValue);
      expect(cards[goalField - 1]?.kind).toBe('goal');
      expect(cards.filter((card) => card.kind === 'goal')).toHaveLength(1);
      expect(cards[startField - 1]).toMatchObject({ kind: 'normal', discovered: true });
      expect(cards.filter((card) => card.discovered)).toHaveLength(1);
      expect(shortDistance(startField, goalField)).toBeGreaterThanOrEqual(
        DEFAULT_SESSION_RULES.minGoalDistance,
      );
      expect(session.initialTaskCount).toBeGreaterThanOrEqual(10);
      expect(session.initialTaskCount).toBeLessThanOrEqual(40);

      // §6.3 action count range, groups match action ids
      expect(actions.length).toBeGreaterThanOrEqual(14);
      expect(actions.length).toBeLessThanOrEqual(22);
      for (const card of actions) expect(card.group).toBe(card.action && actionGroup(card.action));

      // §6.6 every normal card has an image from one of the session's categories and a task count in range
      for (const card of normals) {
        expect(session.categories[card.group ?? 'good']).toContain(card.folderId);
        expect(card.imageHash).toBeDefined();
        expect(card.taskCount).toBeGreaterThanOrEqual(6);
        expect(card.taskCount).toBeLessThanOrEqual(18);
      }
      // No image repeats within the session (library is large enough)
      const hashes = cards.flatMap((card) => (card.imageHash ? [card.imageHash] : []));
      expect(new Set(hashes).size).toBe(hashes.length);
    }
  });

  it('matches goodChance for normal cards and links the good action share', () => {
    let goodNormals = 0;
    let allNormals = 0;
    let goodActions = 0;
    let allActions = 0;
    for (const seed of SEEDS) {
      const { cards } = generateSession(standardInput({ seed })).session;
      for (const card of cards) {
        if (card.kind === 'normal') {
          allNormals++;
          if (card.group === 'good') goodNormals++;
        } else if (card.kind === 'action') {
          allActions++;
          if (card.group === 'good') goodActions++;
        }
      }
    }
    expect(goodNormals / allNormals).toBeCloseTo(DEFAULT_PROGRESSION.goodChance, 2);
    expect(goodActions / allActions).toBeGreaterThan(0.37);
    expect(goodActions / allActions).toBeLessThan(0.43);
  });
});

describe('generateSession – categories and images', () => {
  it('splits normal cards across several categories by shareWeight', () => {
    const base = standardInput();
    const folders = base.folders.map((entry) =>
      entry.id === 'bad-a'
        ? { ...entry, shareWeight: 75 }
        : entry.id === 'bad-b'
          ? { ...entry, shareWeight: 25 }
          : entry,
    );
    const { session } = generateSession({
      ...base,
      folders,
      rules: { ...DEFAULT_SESSION_RULES, categoriesPerSession: { good: 1, bad: 2 } },
    });
    const badCards = session.cards.filter((card) => card.kind === 'normal' && card.group === 'bad');
    const fromA = badCards.filter((card) => card.folderId === 'bad-a').length;
    expect(session.categories.bad.sort()).toEqual(['bad-a', 'bad-b']);
    expect(fromA / badCards.length).toBeCloseTo(0.75, 1);
  });

  it('updates category usage for the picked categories', () => {
    const { session, categoryUsage } = generateSession(
      standardInput({ progression: { ...DEFAULT_PROGRESSION, sessionCounter: 4 } }),
    );
    expect(session.sessionIndex).toBe(5);
    for (const id of [...session.categories.good, ...session.categories.bad]) {
      expect(categoryUsage[id]).toEqual({ lastUsedSessionIndex: 5, timesUsed: 1 });
    }
  });

  it('ignores disabled folders and folders below minImages', () => {
    const base = standardInput();
    const folders = base.folders.map((entry) =>
      entry.id === 'good-a' ? { ...entry, enabled: false } : entry,
    );
    const media = base.media.filter((entry) => entry.folderId !== 'bad-b').concat(mediaFor('bad-b', 3));
    for (const seed of SEEDS.slice(0, 50)) {
      const { session } = generateSession({ ...base, seed, folders, media });
      expect(session.categories).toEqual({ good: ['good-b'], bad: ['bad-a'] });
    }
  });

  it('throws a typed error when a group has no eligible category', () => {
    const base = standardInput();
    const folders = base.folders.filter((entry) => entry.group !== 'bad' || entry.role !== 'content');
    expect(() => generateSession({ ...base, folders })).toThrow(GenerationError);
    try {
      generateSession({ ...base, folders });
    } catch (error) {
      expect(error).toBeInstanceOf(GenerationError);
      expect((error as GenerationError).code).toBe('no_bad_category');
    }
  });

  it('uses the neutral action design without action images and honors allowedActions', () => {
    const base = standardInput();
    const withoutActionFolders = base.folders.filter((entry) => entry.role !== 'action');
    const neutral = generateSession({ ...base, folders: withoutActionFolders }).session.cards.filter(
      (card) => card.kind === 'action',
    );
    expect(neutral.every((card) => card.imageHash === undefined)).toBe(true);

    const restricted = [
      ...withoutActionFolders,
      folder('only-pixelate', 'bad', 'action', { allowedActions: ['pixelate'] }),
    ];
    const media = [...base.media, ...mediaFor('only-pixelate', 50)];
    for (const seed of SEEDS.slice(0, 100)) {
      const cards = generateSession({ ...base, seed, folders: restricted, media }).session.cards;
      for (const card of cards.filter((entry) => entry.kind === 'action' && entry.imageHash)) {
        expect(card.action).toBe('pixelate');
      }
    }
  });

  it('prefers images not shown in recent sessions', () => {
    const base = standardInput();
    const recentHashes = base.media.filter((entry) => entry.folderId.startsWith('good')).slice(0, 40);
    const imageRecency = Object.fromEntries(recentHashes.map((entry) => [entry.hash, 1]));
    const { cards } = generateSession({
      ...base,
      progression: { ...DEFAULT_PROGRESSION, sessionCounter: 1, imageRecency },
    }).session;
    // 2 good categories × 80 images, one category per session → 40 good cards fit into fresh images
    const reused = cards.filter((card) => card.imageHash && card.imageHash in imageRecency);
    expect(reused).toHaveLength(0);
  });
});

describe('allocateByWeight', () => {
  it('splits exactly with largest remainders', () => {
    expect(allocateByWeight(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocateByWeight(59, [75, 25])).toEqual([44, 15]);
    expect(allocateByWeight(5, [0, 0])).toEqual([5, 0]);
  });
});
