import { randInt, type Rng } from '../rng';
import { shortDistance } from '../track';
import type { SessionState } from '../types';

const ZONE_RELAX_STEP = 2;

/**
 * game-design §10.3 safety zones (Goal Teleport, Moving Day): an undiscovered, non-goal field at least
 * `zone` fields (shorter way) away from both the position and the goal. The zone shrinks by 2 until a
 * field is found; undefined if none exists at all.
 */
export function findRelocationTarget(
  state: Pick<SessionState, 'cards' | 'position' | 'goalField'>,
  rng: Rng,
  zone: number,
): number | undefined {
  for (let current = zone; current >= 0; current -= ZONE_RELAX_STEP) {
    const candidates = state.cards
      .filter(
        (card) =>
          card.kind !== 'goal' &&
          !card.discovered &&
          card.field !== state.position &&
          shortDistance(card.field, state.position) >= current &&
          shortDistance(card.field, state.goalField) >= current,
      )
      .map((card) => card.field);
    if (candidates.length > 0) return candidates[randInt(rng, 0, candidates.length - 1)];
  }
  return undefined;
}

/** Goal Teleport: the goal swaps places with `target` (both cards keep their content). */
export function swapGoal(draft: SessionState, target: number): void {
  const goalCard = draft.cards[draft.goalField - 1];
  const targetCard = draft.cards[target - 1];
  if (!goalCard || !targetCard) return;
  draft.cards[target - 1] = { ...goalCard, field: target };
  draft.cards[draft.goalField - 1] = { ...targetCard, field: draft.goalField };
  draft.goalField = target;
}
