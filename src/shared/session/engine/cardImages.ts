import type { Group } from '../../game';
import { createImageBag, type ImageBag } from '../imageBags';
import type { Rng } from '../rng';
import type { Card, Range, SessionState } from '../types';
import { mediaOf, pickCategory, rollRange, type EngineContext } from './context';

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
 * A fresh normal card of `group` on the same field: category by shareWeight, new image, task count from
 * `taskRange` (or the folder's range). Discovery and splatter carry over.
 */
export function freshNormalCard(
  draft: SessionState,
  rng: Rng,
  context: EngineContext,
  card: Card,
  group: Group,
  taskRange?: Range,
): Card {
  const folderId = pickCategory(draft, rng, context, group);
  const folder = context.folders.find((candidate) => candidate.id === folderId);
  const entry = folderId ? sessionBag(draft, rng, context, folderId).draw() : undefined;
  return {
    field: card.field,
    kind: 'normal',
    group,
    ...(folderId ? { folderId } : {}),
    ...(entry ? { imageHash: entry.hash } : {}),
    taskCount: rollRange(rng, taskRange ?? folder?.taskRange ?? context.rules.consumedTaskRange),
    discovered: card.discovered,
    ...(card.splatterSeed === undefined ? {} : { splatterSeed: card.splatterSeed }),
  };
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
  return {
    ...freshNormalCard(draft, rng, context, card, card.group ?? 'bad', context.rules.consumedTaskRange),
    actionConsumed: true,
  };
}
