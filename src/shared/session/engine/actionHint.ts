import type { Group } from '../../game';
import { clockwiseDistance, wrapField } from '../track';
import type { Card, SessionState } from '../types';

export type GroupCounts = Record<Group, number>;

export interface ActionHint {
  total: GroupCounts;
  /** Undiscovered action cards between position and goal going left (counter-clockwise). */
  left: GroupCounts;
  /** … going right (clockwise). */
  right: GroupCounts;
}

const counts = (cards: readonly Card[]): GroupCounts => ({
  good: cards.filter((card) => card.group === 'good').length,
  bad: cards.filter((card) => card.group === 'bad').length,
});

const isHiddenAction = (card: Card | undefined): card is Card =>
  card?.kind === 'action' && !card.discovered && !card.actionConsumed;

/**
 * game-design §7.4 `split_by_side`: position and goal cut the ring into two arcs (both exclusive).
 * Positions are never revealed – only counts.
 */
export function computeActionHint(state: Pick<SessionState, 'cards' | 'position' | 'goalField'>): ActionHint {
  const { cards, position, goalField } = state;
  const arc = (sign: 1 | -1): Card[] => {
    const length =
      sign === 1 ? clockwiseDistance(position, goalField) : clockwiseDistance(goalField, position);
    const fields = Array.from({ length: Math.max(0, length - 1) }, (_, index) =>
      wrapField(position + sign * (index + 1)),
    );
    return fields.map((field) => cards[field - 1]).filter(isHiddenAction);
  };
  return {
    total: counts(cards.filter(isHiddenAction)),
    left: counts(arc(-1)),
    right: counts(arc(1)),
  };
}
