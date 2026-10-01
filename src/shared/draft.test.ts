import { describe, expect, it } from 'vitest';
import {
  centeredSquareCrop,
  countPicks,
  createDraft,
  DEFAULT_DRAFT_CONFIG,
  draftGoodShare,
  draftOutcome,
  draftPixelLevel,
  isDraftComplete,
  pickDraftField,
  type DraftState,
} from './draft';
import { createRng } from './session/rng';

describe('session draft (§6.0)', () => {
  it('shuffles the configured composition deterministically', () => {
    const a = createDraft(createRng(7), DEFAULT_DRAFT_CONFIG);
    expect(a.board).toHaveLength(12);
    expect(a.board.filter((type) => type === 'bad')).toHaveLength(6);
    expect(a.board.filter((type) => type === 'double')).toHaveLength(1);
    expect(createDraft(createRng(7), DEFAULT_DRAFT_CONFIG)).toEqual(a);
    expect(a.picks).toBe(6);
  });

  it('accepts each field once and stops after the required picks', () => {
    let draft: DraftState | null = createDraft(createRng(1), DEFAULT_DRAFT_CONFIG);
    for (const index of [0, 1, 2, 3, 4, 5]) draft = draft && pickDraftField(draft, index);
    expect(draft && isDraftComplete(draft)).toBe(true);
    expect(draft && pickDraftField(draft, 6)).toBeNull();
    const fresh = createDraft(createRng(1), DEFAULT_DRAFT_CONFIG);
    const once = pickDraftField(fresh, 3);
    expect(once && pickDraftField(once, 3)).toBeNull();
    expect(pickDraftField(fresh, 12)).toBeNull();
  });

  it('computes the good share from the base split (both shifts at once)', () => {
    const config = DEFAULT_DRAFT_CONFIG;
    expect(draftGoodShare(0.4, 0, 6, config)).toBe(0);
    expect(draftGoodShare(0.4, 2, 0, config)).toBeCloseTo(0.8, 6);
    expect(draftGoodShare(0.4, 1, 3, config)).toBeCloseTo(0.4, 6); // average case keeps the base
    expect(draftGoodShare(0.4, 0, 0, config)).toBeCloseTo(0.4, 6);
  });

  it('maps pixelate fields to start levels 1 / 3 / 5 and multiplies the win chance per double field', () => {
    const levels = DEFAULT_DRAFT_CONFIG.pixelateLevels;
    expect([0, 1, 2, 3].map((count) => draftPixelLevel(count, levels))).toEqual([0, 1, 3, 5]);
    const draft: DraftState = {
      id: 'd',
      board: [
        'double',
        'pixelate',
        'pixelate',
        'bad',
        'good',
        'bad',
        'bad',
        'bad',
        'bad',
        'good',
        'bad',
        'pixelate',
      ],
      picked: [0, 1, 2, 3, 4, 5],
      picks: 6,
    };
    expect(countPicks(draft)).toEqual({ bad: 2, good: 1, pixelate: 2, splash: 0, double: 1 });
    expect(draftOutcome(draft, DEFAULT_DRAFT_CONFIG, 0.4)).toMatchObject({ pixelLevel: 3, winMultiplier: 2 });
  });

  it('finds the largest centered square crop', () => {
    expect(centeredSquareCrop(200, 100)).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 });
    expect(centeredSquareCrop(null, null)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});
