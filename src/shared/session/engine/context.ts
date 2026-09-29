import type { ActionId } from '../../actions';
import type { FolderConfig, MediaEntry } from '../../content';
import { randInt, type Rng } from '../rng';
import type { ActionConfig, Range, SessionRules } from '../types';

/** Everything the engine needs besides the session itself (read-only). */
export interface EngineContext {
  rules: SessionRules;
  actions: readonly ActionConfig[];
  folders: readonly FolderConfig[];
  media: readonly MediaEntry[];
  imageRecency: Readonly<Record<string, number>>;
  pixelateMaxLevel: number;
}

const FALLBACK_RANGE: Range = [1, 1];

/** Action params: a number is a fixed value, a tuple an inclusive integer range. */
export function rangeParam(
  context: EngineContext,
  action: ActionId,
  key: string,
  fallback: Range = FALLBACK_RANGE,
): Range {
  const value = context.actions.find((config) => config.id === action)?.params[key];
  if (value === undefined) return fallback;
  return typeof value === 'number' ? [value, value] : value;
}

export function numberParam(context: EngineContext, action: ActionId, key: string, fallback: number): number {
  const value = context.actions.find((config) => config.id === action)?.params[key];
  return typeof value === 'number' ? value : fallback;
}

export const rollRange = (rng: Rng, [min, max]: Range): number =>
  randInt(rng, Math.round(min), Math.round(max));

export function mediaOf(context: EngineContext, folderId: string): MediaEntry[] {
  return context.media.filter((entry) => entry.folderId === folderId);
}
