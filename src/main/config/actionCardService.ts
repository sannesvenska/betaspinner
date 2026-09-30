import { randomUUID } from 'node:crypto';
import { hasErrors, validateActionCard } from '@shared/config/gameConfig';
import type { ActionArtImage } from '@shared/content';
import type { ActionCardPatch } from '@shared/ipc';
import { DEFAULT_ACTION_CARDS } from '@shared/session/defaults';
import type { ActionCardDefinition } from '@shared/session/types';
import type { ActionArtStore } from '../content/actionArtStore';
import { normalizeActionCards } from './actionCardsConfig';
import type { ConfigService } from './configService';

export class ActionCardError extends Error {
  constructor(readonly code: 'not_found' | 'built_in' | 'image_in_use' | 'invalid_card') {
    super(code);
    this.name = 'ActionCardError';
  }
}

export interface ActionCardService {
  list: () => ActionCardDefinition[];
  update: (id: string, patch: ActionCardPatch) => Promise<ActionCardDefinition[]>;
  /** Creates a user variant of `id` with its own name (game-design §10.4). */
  duplicate: (id: string, name: string) => Promise<ActionCardDefinition[]>;
  /** User cards only; built-ins are reset instead. */
  remove: (id: string) => Promise<ActionCardDefinition[]>;
  /** Built-in back to its defaults; the image is kept. */
  reset: (id: string) => Promise<ActionCardDefinition[]>;
  /** Copies `sourcePath` into the action-art store and assigns it (unique per card). */
  assignImage: (id: string, sourcePath: string) => Promise<ActionCardDefinition[]>;
  clearImage: (id: string) => Promise<ActionCardDefinition[]>;
}

export function createActionCardService(config: ConfigService, art: ActionArtStore): ActionCardService {
  const list = () => config.get().actionCards;

  const find = (id: string): ActionCardDefinition => {
    const card = list().find((candidate) => candidate.id === id);
    if (!card) throw new ActionCardError('not_found');
    return card;
  };

  async function save(change: (cards: ActionCardDefinition[]) => ActionCardDefinition[]) {
    const next = await config.update((current) => ({
      ...current,
      actionCards: normalizeActionCards(change(current.actionCards)),
    }));
    return next.actionCards;
  }

  async function replaceImage(id: string, image: ActionArtImage | null): Promise<ActionCardDefinition[]> {
    const previous = find(id).image;
    const cards = await save((current) =>
      current.map((card) => (card.id === id ? { ...card, image } : card)),
    );
    if (previous && previous.fileName !== image?.fileName) await art.removeIfUnused(previous, cards);
    return cards;
  }

  return {
    list,
    update: async (id, patch) => {
      const card = find(id);
      const merged = { ...card, ...patch };
      // Same rules as the admin form – invalid values are rejected, never silently clamped
      if (hasErrors(validateActionCard(merged))) throw new ActionCardError('invalid_card');
      return await save((cards) => cards.map((entry) => (entry.id === id ? merged : entry)));
    },
    duplicate: (id, name) => {
      const source = find(id);
      return save((cards) => [...cards, { ...source, id: randomUUID(), builtIn: false, name, image: null }]);
    },
    remove: async (id) => {
      const card = find(id);
      if (card.builtIn) throw new ActionCardError('built_in');
      const cards = await save((current) => current.filter((entry) => entry.id !== id));
      if (card.image) await art.removeIfUnused(card.image, cards);
      return cards;
    },
    reset: (id) => {
      const card = find(id);
      const base = DEFAULT_ACTION_CARDS.find((entry) => entry.id === id);
      if (!card.builtIn || !base) throw new ActionCardError('not_found');
      return save((cards) =>
        cards.map((entry) => (entry.id === id ? { ...base, image: card.image } : entry)),
      );
    },
    assignImage: async (id, sourcePath) => {
      find(id);
      const image = await art.importFile(sourcePath);
      const owner = list().find((card) => card.image?.hash === image.hash);
      if (owner && owner.id !== id) {
        await art.removeIfUnused(image, list());
        throw new ActionCardError('image_in_use');
      }
      return replaceImage(id, image);
    },
    clearImage: (id) => replaceImage(id, null),
  };
}
