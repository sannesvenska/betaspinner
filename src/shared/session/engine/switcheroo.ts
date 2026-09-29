import type { Group } from '../../game';
import { randInt, shuffle, type Rng } from '../rng';
import type { SessionState, SwitcherooPool } from '../types';
import { sessionBag } from './cardImages';
import { mediaOf, numberParam, type EngineContext } from './context';

const DEFAULT_ALTERNATIVES = 3;

const poolGroup = (pool: SwitcherooPool): Group => (pool.startsWith('good') ? 'good' : 'bad');
const isContentPool = (pool: SwitcherooPool): boolean => pool.endsWith('content');

/** game-design §10.3: alternative folders for a pool (cooldown ignored, minImages applies to content). */
export function switcherooCandidates(
  draft: SessionState,
  context: EngineContext,
  pool: SwitcherooPool,
): string[] {
  const group = poolGroup(pool);
  const role = isContentPool(pool) ? 'content' : 'action';
  const usable = context.folders.filter((folder) => {
    if (folder.group !== group || folder.role !== role || !folder.enabled) return false;
    const count = mediaOf(context, folder.id).length;
    return role === 'content' ? count >= folder.minImages : count > 0;
  });
  if (role === 'content') {
    return usable.filter((folder) => !draft.categories[group].includes(folder.id)).map((folder) => folder.id);
  }
  const active = draft.activeActionFolders[group];
  // null = all action folders are active; narrowing to the only one would change nothing
  if (active === null && usable.length < 2) return [];
  return usable.filter((folder) => folder.id !== active).map((folder) => folder.id);
}

/** Pools with at least one alternative; empty pools are hidden from the choice. */
export function availableSwitcherooPools(draft: SessionState, context: EngineContext): SwitcherooPool[] {
  const pools: SwitcherooPool[] = ['good_content', 'bad_content', 'good_action', 'bad_action'];
  return pools.filter((pool) => switcherooCandidates(draft, context, pool).length > 0);
}

export function drawSwitcherooAlternatives(
  draft: SessionState,
  rng: Rng,
  context: EngineContext,
  pool: SwitcherooPool,
): string[] {
  const count = numberParam(context, 'switcheroo', 'alternatives', DEFAULT_ALTERNATIVES);
  return shuffle(rng, switcherooCandidates(draft, context, pool)).slice(0, count);
}

/** Applies the swap to all undiscovered cards of the pool. Returns changed / total card counts. */
export function applySwitcheroo(
  draft: SessionState,
  rng: Rng,
  context: EngineContext,
  pool: SwitcherooPool,
  folderId: string,
): { changed: number; total: number } {
  const group = poolGroup(pool);
  const folder = context.folders.find((candidate) => candidate.id === folderId);
  if (!folder) return { changed: 0, total: 0 };
  const bag = sessionBag(draft, rng, context, folderId);
  let changed = 0;
  let total = 0;

  if (isContentPool(pool)) {
    draft.stats.switches.push({ pool, from: draft.categories[group][0] ?? null, to: folderId });
    draft.cards = draft.cards.map((card) => {
      if (card.kind !== 'normal' || card.group !== group || card.discovered) return card;
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
    draft.categories[group] = [folderId];
    return { changed, total };
  }

  draft.stats.switches.push({ pool, from: draft.activeActionFolders[group], to: folderId });
  draft.cards = draft.cards.map((card) => {
    if (card.kind !== 'action' || card.group !== group || card.discovered || card.actionConsumed) return card;
    total++;
    const action = card.action;
    const allowed =
      folder.allowedActions === null || (action !== undefined && folder.allowedActions.includes(action));
    const entry = allowed ? bag.draw() : undefined;
    if (!entry) return card; // keeps its current image (§10.3)
    changed++;
    return { ...card, folderId, imageHash: entry.hash };
  });
  draft.activeActionFolders[group] = folderId;
  return { changed, total };
}
