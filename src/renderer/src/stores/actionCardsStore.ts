import type { TFunction } from 'i18next';
import { create } from 'zustand';
import type { ActionId } from '@shared/actions';
import type { ActionCardPatch, IpcRequest } from '@shared/ipc';
import type { ActionCardDefinition } from '@shared/session/types';

interface ActionCardsState {
  cards: ActionCardDefinition[];
  /** Last failed operation, shown inline until dismissed or the next success. */
  error: string | null;
  load: () => Promise<void>;
  update: (id: string, patch: ActionCardPatch) => Promise<void>;
  duplicate: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reset: (id: string) => Promise<void>;
  pickImage: (id: string) => Promise<void>;
  clearImage: (id: string) => Promise<void>;
  dismissError: () => void;
}

type CardsChannel =
  | 'actionCards:list'
  | 'actionCards:update'
  | 'actionCards:duplicate'
  | 'actionCards:remove'
  | 'actionCards:reset'
  | 'actionCards:pickImage'
  | 'actionCards:clearImage';

/** game-design §10.4 action card definitions, edited in the library (full editor with the admin, AP10). */
export const useActionCardsStore = create<ActionCardsState>()((set) => {
  async function apply<C extends CardsChannel>(channel: C, request: IpcRequest<C>): Promise<void> {
    const result = await window.api.invoke(channel, request);
    set(result.ok ? { cards: result.data, error: null } : { error: result.error });
  }

  return {
    cards: [],
    error: null,
    load: () => apply('actionCards:list', undefined),
    update: (id, patch) => apply('actionCards:update', { id, patch }),
    duplicate: (id, name) => apply('actionCards:duplicate', { id, name }),
    remove: (id) => apply('actionCards:remove', { id }),
    reset: (id) => apply('actionCards:reset', { id }),
    pickImage: (id) => apply('actionCards:pickImage', { id }),
    clearImage: (id) => apply('actionCards:clearImage', { id }),
    dismissError: () => {
      set({ error: null });
    },
  };
});

/** Display name: user text for custom cards, the i18n name of the type otherwise. */
export function actionCardName(
  t: TFunction,
  cards: readonly ActionCardDefinition[],
  actionCardId: string | undefined,
  type: ActionId | undefined,
): string {
  const card = cards.find((candidate) => candidate.id === actionCardId);
  if (card?.name) return card.name;
  const actionType = card?.type ?? type;
  return actionType ? t(`action.${actionType}.name`) : '';
}

export function actionCardDescription(
  t: TFunction,
  cards: readonly ActionCardDefinition[],
  actionCardId: string | undefined,
  type: ActionId | undefined,
): string {
  const card = cards.find((candidate) => candidate.id === actionCardId);
  if (card?.description) return card.description;
  const actionType = card?.type ?? type;
  return actionType ? t(`action.${actionType}.description`) : '';
}
