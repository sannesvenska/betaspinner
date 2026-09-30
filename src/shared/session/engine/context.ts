import type { FolderConfig, MediaEntry } from '../../content';
import type { Group } from '../../game';
import { DEFAULT_ACTION_CARDS } from '../defaults';
import { pickWeighted, randInt, type Rng } from '../rng';
import type { ActionCardDefinition, Card, Range, SessionRules, SessionState } from '../types';

/** Everything the engine needs besides the session itself (read-only). */
export interface EngineContext {
  rules: SessionRules;
  actionCards: readonly ActionCardDefinition[];
  folders: readonly FolderConfig[];
  media: readonly MediaEntry[];
  imageRecency: Readonly<Record<string, number>>;
  pixelateMaxLevel: number;
}

const FALLBACK_RANGE: Range = [1, 1];

/**
 * The definition behind an action card. A definition deleted mid-session falls back to the built-in
 * card of the same type, so a running session never breaks.
 */
export function definitionOf(
  context: EngineContext,
  card: Pick<Card, 'actionCardId' | 'action'>,
): ActionCardDefinition | undefined {
  return (
    context.actionCards.find((definition) => definition.id === card.actionCardId) ??
    DEFAULT_ACTION_CARDS.find((definition) => definition.type === card.action)
  );
}

/** Action params: a number is a fixed value, a tuple an inclusive integer range. */
export function rangeParam(
  definition: ActionCardDefinition | undefined,
  key: string,
  fallback: Range = FALLBACK_RANGE,
): Range {
  const value = definition?.params[key];
  if (value === undefined) return fallback;
  return typeof value === 'number' ? [value, value] : value;
}

export function numberParam(
  definition: ActionCardDefinition | undefined,
  key: string,
  fallback: number,
): number {
  const value = definition?.params[key];
  return typeof value === 'number' ? value : fallback;
}

export const rollRange = (rng: Rng, [min, max]: Range): number =>
  randInt(rng, Math.round(min), Math.round(max));

export function mediaOf(context: EngineContext, folderId: string): MediaEntry[] {
  return context.media.filter((entry) => entry.folderId === folderId);
}

/** An active category of the group, picked by `shareWeight` (§6.2 v2). */
export function pickCategory(
  draft: Pick<SessionState, 'categories'>,
  rng: Rng,
  context: EngineContext,
  group: Group,
): string | undefined {
  return pickWeighted(
    rng,
    draft.categories[group],
    (id) => context.folders.find((folder) => folder.id === id)?.shareWeight ?? 1,
  );
}
