import type { MediaEntry } from '../content';
import { shuffle, type Rng } from './rng';

/**
 * game-design §6.6 shuffle bag: no repeats until the bag is empty, then it refills.
 * Images shown within the last `recencySessions` sessions go to the end of every (re)fill.
 */
export interface ImageBag {
  /** Next entry matching `accept`; undefined when the source has no acceptable entry at all. */
  draw: (accept?: (entry: MediaEntry) => boolean) => MediaEntry | undefined;
}

interface ImageBagOptions {
  entries: readonly MediaEntry[];
  imageRecency: Readonly<Record<string, number>>;
  sessionIndex: number;
  recencySessions: number;
  /** Hashes already used elsewhere in this session (shared across bags). */
  usedHashes: Set<string>;
}

export function createImageBag(rng: Rng, options: ImageBagOptions): ImageBag {
  const isRecent = (entry: MediaEntry): boolean => {
    const lastShown = options.imageRecency[entry.hash];
    return lastShown !== undefined && options.sessionIndex - lastShown <= options.recencySessions;
  };

  // Same file in two folders must still appear once per session
  const unique = [...new Map(options.entries.map((entry) => [entry.hash, entry])).values()];
  const freshFirst = (entries: readonly MediaEntry[]): MediaEntry[] => [
    ...shuffle(
      rng,
      entries.filter((entry) => !isRecent(entry)),
    ),
    ...shuffle(rng, entries.filter(isRecent)),
  ];
  let bag: MediaEntry[] = [];

  const takeUnused = (accept: (entry: MediaEntry) => boolean): MediaEntry | undefined => {
    const index = bag.findIndex((entry) => accept(entry) && !options.usedHashes.has(entry.hash));
    if (index < 0) return undefined;
    const [entry] = bag.splice(index, 1);
    if (entry) options.usedHashes.add(entry.hash);
    return entry;
  };

  return {
    draw: (accept = () => true) => {
      const acceptable = unique.filter(accept);
      if (acceptable.length === 0) return undefined;
      const fromBag = takeUnused(accept);
      if (fromBag) return fromBag;
      bag = freshFirst(unique.filter((entry) => !options.usedHashes.has(entry.hash)));
      const refilled = takeUnused(accept);
      if (refilled) return refilled;
      // Library too small: repeating is allowed only now (game-design §6.6)
      return freshFirst(acceptable)[0];
    },
  };
}
