import type { Group } from '../../game';
import { createImageBag, type ImageBag } from '../imageBags';
import { randInt, type Rng } from '../rng';
import type { Card, SessionState } from '../types';
import { mediaOf, rollRange, type EngineContext } from './context';

/** Image bag over one folder that avoids every image already on the track (no repeats, §6.6). */
export function sessionBag(
  draft: SessionState,
  rng: Rng,
  context: EngineContext,
  folderId: string,
): ImageBag {
  const usedHashes = new Set(draft.cards.flatMap((card) => (card.imageHash ? [card.imageHash] : [])));
  return createImageBag(rng, {
    entries: mediaOf(context, folderId),
    imageRecency: context.imageRecency,
    sessionIndex: draft.sessionIndex,
    recencySessions: context.rules.imageRecencySessions,
    usedHashes,
  });
}

/**
 * game-design §9.2 consumed action card (`actionRetrigger: once`): becomes a normal card of the same
 * group with a task from `consumedTaskRange` and a new image from an active content category.
 */
export function convertConsumedActionCard(
  draft: SessionState,
  rng: Rng,
  context: EngineContext,
  card: Card,
): Card {
  const group: Group = card.group ?? 'bad';
  const categories = draft.categories[group];
  const folderId = categories[randInt(rng, 0, categories.length - 1)];
  const entry = folderId ? sessionBag(draft, rng, context, folderId).draw() : undefined;
  return {
    field: card.field,
    kind: 'normal',
    group,
    ...(folderId ? { folderId } : {}),
    ...(entry ? { imageHash: entry.hash } : {}),
    taskCount: rollRange(rng, context.rules.consumedTaskRange),
    actionConsumed: true,
    discovered: card.discovered,
    ...(card.splatterSeed === undefined ? {} : { splatterSeed: card.splatterSeed }),
  };
}
