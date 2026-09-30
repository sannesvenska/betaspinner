import type { MaskRegion } from '@shared/masks';

/** Undo/redo stack of the Mask Editor (game-design §12.3). Pure – every edit is one `commit`. */
export interface RegionHistory {
  past: MaskRegion[][];
  present: MaskRegion[];
  future: MaskRegion[][];
}

const HISTORY_LIMIT = 100;

export const startHistory = (regions: MaskRegion[]): RegionHistory => ({
  past: [],
  present: regions,
  future: [],
});

export function commit(history: RegionHistory, regions: MaskRegion[]): RegionHistory {
  if (JSON.stringify(regions) === JSON.stringify(history.present)) return history;
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: regions, future: [] };
}

export function undo(history: RegionHistory): RegionHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo(history: RegionHistory): RegionHistory {
  const [next, ...rest] = history.future;
  if (!next) return history;
  return { past: [...history.past, history.present], present: next, future: rest };
}
