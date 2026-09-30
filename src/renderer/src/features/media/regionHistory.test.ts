import { describe, expect, it } from 'vitest';
import type { MaskRegion } from '@shared/masks';
import { commit, redo, startHistory, undo } from './regionHistory';

const region = (id: string): MaskRegion => ({
  id,
  shape: 'rect',
  rect: { x: 0, y: 0, w: 0.5, h: 0.5 },
  effects: ['pixelate'],
  feather: 0,
});

describe('mask editor history', () => {
  it('undoes and redoes commits; a new commit clears the redo stack', () => {
    let history = startHistory([]);
    history = commit(history, [region('a')]);
    history = commit(history, [region('a'), region('b')]);
    history = undo(history);
    expect(history.present.map((entry) => entry.id)).toEqual(['a']);
    history = redo(history);
    expect(history.present).toHaveLength(2);
    history = undo(undo(history));
    expect(history.present).toEqual([]);
    expect(undo(history)).toBe(history);
    history = commit(history, [region('c')]);
    expect(history.future).toEqual([]);
    expect(redo(history)).toBe(history);
  });

  it('ignores commits that change nothing', () => {
    const history = commit(startHistory([region('a')]), [region('a')]);
    expect(history.past).toEqual([]);
  });
});
