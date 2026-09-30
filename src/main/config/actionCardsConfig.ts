import { ACTION_IDS, type ActionId } from '@shared/actions';
import type { ActionArtImage, MediaKind } from '@shared/content';
import { DEFAULT_ACTION_CARDS } from '@shared/session/defaults';
import type { ActionCardDefinition, Range } from '@shared/session/types';

const MAX_WEIGHT = 100;
const MAX_PER_SESSION = 50;
const MAX_NAME_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 240;
const HASH_PATTERN = /^[0-9a-f]{40}$/;
const ART_FILE_PATTERN = /^[0-9a-f]{40}\.(jpe?g|png|webp|gif|webm|mp4)$/;
const MEDIA_KINDS: readonly MediaKind[] = ['image', 'animated', 'video'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isActionId = (value: unknown): value is ActionId =>
  typeof value === 'string' && (ACTION_IDS as readonly string[]).includes(value);

const clampNumber = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed === '' ? null : trimmed;
}

export function normalizeActionArtImage(value: unknown): ActionArtImage | null {
  if (!isRecord(value)) return null;
  const { hash, fileName, mimeType, kind } = value;
  if (typeof hash !== 'string' || !HASH_PATTERN.test(hash)) return null;
  if (typeof fileName !== 'string' || !ART_FILE_PATTERN.test(fileName) || !fileName.startsWith(hash))
    return null;
  if (typeof mimeType !== 'string' || !MEDIA_KINDS.includes(kind as MediaKind)) return null;
  return { hash, fileName, mimeType, kind: kind as MediaKind };
}

function normalizeParams(
  value: unknown,
  fallback: ActionCardDefinition['params'],
): ActionCardDefinition['params'] {
  if (!isRecord(value)) return fallback;
  const params: Record<string, number | Range> = { ...fallback };
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) params[key] = raw;
    else if (Array.isArray(raw) && raw.length === 2 && raw.every((entry) => Number.isFinite(entry))) {
      const [a, b] = raw as [number, number];
      params[key] = a <= b ? [a, b] : [b, a];
    }
  }
  return params;
}

/** One stored definition merged onto its base (the built-in default of its type). */
function normalizeCard(value: Record<string, unknown>, base: ActionCardDefinition): ActionCardDefinition {
  const maxPerSession =
    value.maxPerSession === null
      ? null
      : typeof value.maxPerSession === 'number'
        ? Math.round(clampNumber(value.maxPerSession, 1, MAX_PER_SESSION, 1))
        : base.maxPerSession;
  // null = no gate (kept in the JSON), a number sets it, a missing key keeps the base
  const sessionChance =
    value.sessionChance === null
      ? null
      : typeof value.sessionChance === 'number'
        ? clampNumber(value.sessionChance, 0, 1, 1)
        : base.sessionChance;
  const requires = Array.isArray(value.requires) ? value.requires.filter(isActionId) : base.requires;
  return {
    id: base.id,
    type: base.type,
    builtIn: base.builtIn,
    name: 'name' in value ? text(value.name, MAX_NAME_LENGTH) : base.name,
    description: 'description' in value ? text(value.description, MAX_DESCRIPTION_LENGTH) : base.description,
    image: 'image' in value ? normalizeActionArtImage(value.image) : base.image,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : base.enabled,
    weight: clampNumber(value.weight, 0, MAX_WEIGHT, base.weight),
    minPerSession: Math.round(clampNumber(value.minPerSession, 0, MAX_PER_SESSION, base.minPerSession)),
    maxPerSession,
    sessionChance,
    ...(requires && requires.length > 0 ? { requires } : {}),
    params: normalizeParams(value.params, base.params),
  };
}

/**
 * game-design §10.4: every built-in card exists exactly once (missing ones are added, e.g. after an app
 * update); user cards need a unique id and a valid type. An image can belong to one card only.
 */
export function normalizeActionCards(value: unknown): ActionCardDefinition[] {
  const stored = Array.isArray(value) ? value.filter(isRecord) : [];
  const builtIns = DEFAULT_ACTION_CARDS.map((base) => {
    const saved = stored.find((entry) => entry.id === base.id && entry.builtIn !== false);
    return saved ? normalizeCard(saved, base) : base;
  });
  const usedIds = new Set(builtIns.map((card) => card.id));
  const userCards = stored.flatMap((entry) => {
    const { id, type } = entry;
    if (typeof id !== 'string' || id.trim() === '' || usedIds.has(id) || !isActionId(type)) return [];
    const base = DEFAULT_ACTION_CARDS.find((card) => card.type === type);
    if (!base) return [];
    usedIds.add(id);
    return [normalizeCard(entry, { ...base, id, builtIn: false })];
  });

  const usedHashes = new Set<string>();
  return [...builtIns, ...userCards].map((card) => {
    if (!card.image) return card;
    if (usedHashes.has(card.image.hash)) return { ...card, image: null };
    usedHashes.add(card.image.hash);
    return card;
  });
}
