import type { Group } from '../../game';
import { randInt, shuffle, type Rng } from '../rng';
import type { SessionState } from '../types';
import { sessionBag } from './cardImages';
import { mediaOf, type EngineContext } from './context';

export function categoryGroup(
  draft: Pick<SessionState, 'categories'>,
  categoryId: string,
): Group | undefined {
  if (draft.categories.good.includes(categoryId)) return 'good';
  if (draft.categories.bad.includes(categoryId)) return 'bad';
  return undefined;
}

/**
 * game-design §10.3 v2: alternative folders for an active category – enabled content folders of the same
 * group that are not active (cooldown ignored, `minImages` applies).
 */
export function switcherooCandidates(
  draft: SessionState,
  context: EngineContext,
  categoryId: string,
): string[] {
  const group = categoryGroup(draft, categoryId);
  if (!group) return [];
  return context.folders
    .filter(
      (folder) =>
        folder.role === 'content' &&
        folder.group === group &&
        folder.enabled &&
        !draft.categories[group].includes(folder.id) &&
        mediaOf(context, folder.id).length >= folder.minImages,
    )
    .map((folder) => folder.id);
}

/** Active categories (good first) with at least one alternative; the others are hidden. */
export function availableSwitcherooCategories(draft: SessionState, context: EngineContext): string[] {
  return [...draft.categories.good, ...draft.categories.bad].filter(
    (id) => switcherooCandidates(draft, context, id).length > 0,
  );
}

export function drawSwitcherooAlternatives(
  draft: SessionState,
  rng: Rng,
  context: EngineContext,
  categoryId: string,
  count: number,
): string[] {
  return shuffle(rng, switcherooCandidates(draft, context, categoryId)).slice(0, count);
}

/**
 * Replaces `categoryId` by `folderId`: all undiscovered normal cards of that category get new images and
 * task counts. Collectibles and action cards are never touched. Returns changed / total card counts.
 */
export function applySwitcheroo(
  draft: SessionState,
  rng: Rng,
  context: EngineContext,
  categoryId: string,
  folderId: string,
): { changed: number; total: number } {
  const group = categoryGroup(draft, categoryId);
  const folder = context.folders.find((candidate) => candidate.id === folderId);
  if (!group || !folder) return { changed: 0, total: 0 };
  const bag = sessionBag(draft, rng, context, folderId);
  let changed = 0;
  let total = 0;

  draft.stats.switches.push({ group, from: categoryId, to: folderId });
  draft.cards = draft.cards.map((card) => {
    if (card.kind !== 'normal' || card.folderId !== categoryId || card.discovered) return card;
    total++;
    const entry = bag.draw();
    if (!entry) return card;
    changed++;
    return {
      ...card,
      folderId,
      imageHash: entry.hash,
      taskCount: randInt(rng, folder.taskRange[0], folder.taskRange[1]),
    };
  });
  draft.categories[group] = draft.categories[group].map((id) => (id === categoryId ? folderId : id));
  return { changed, total };
}
