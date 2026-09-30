import { BAD_ACTION_IDS } from '../../actions';
import { randInt, type Rng } from '../rng';
import type { RewardChoice, SessionState } from '../types';
import type { EngineContext } from './context';
import { getSuccessMultiplier } from './effects';

const DIE_SIDES = 6;
const PERCENT = 100;
/** Landing spot stays away from the area borders so the result is unambiguous. */
const LANDING_MARGIN = 0.1;

export type WinFlowEvent =
  | { type: 'winRoll' }
  | { type: 'startFinalWheel' }
  | { type: 'finishFinalWheel' }
  | { type: 'chooseOutcome'; outcome: 'success' | 'interrupted' | 'no_result'; reward?: RewardChoice }
  | { type: 'confirm' };

/** game-design §14.1: floor(discovered / roll) × multiplier, clamped. Pure for previews. */
export function computeFinalChance(
  discovered: number,
  roll: number,
  multiplier: number,
  bounds: readonly [number, number],
) {
  const baseChance = Math.floor(discovered / roll);
  const finalChance = Math.min(bounds[1], Math.max(bounds[0], Math.floor(baseChance * multiplier)));
  return { baseChance, finalChance };
}

/** Handles the phases after the Goal Field was reached (§14). Returns an error code or undefined. */
export function applyWinFlow(
  draft: SessionState,
  rng: Rng,
  event: WinFlowEvent,
  context: EngineContext,
): 'invalid_event' | 'invalid_value' | undefined {
  switch (draft.phase) {
    case 'win_check': {
      if (event.type !== 'winRoll') return 'invalid_event';
      const discovered = draft.cards.filter((card) => card.discovered).length;
      const roll = randInt(rng, 1, DIE_SIDES);
      const multiplier = getSuccessMultiplier(draft.effects);
      const { baseChance, finalChance } = computeFinalChance(
        discovered,
        roll,
        multiplier,
        context.rules.winChanceBounds,
      );
      draft.winCheck = { discovered, roll, baseChance, multiplier, finalChance };
      draft.phase = 'final_wheel';
      return undefined;
    }
    case 'final_wheel': {
      if (event.type === 'startFinalWheel' && !draft.finalWheel && draft.winCheck) {
        // §14.2 [RULE]: the result is decided when "Start Task" is pressed
        const allowed = rng.next() * PERCENT < draft.winCheck.finalChance;
        draft.finalWheel = {
          result: allowed ? 'allowed' : 'denied',
          landing: LANDING_MARGIN + (1 - 2 * LANDING_MARGIN) * rng.next(),
          holdSeconds: Math.max(1, draft.winCheck.discovered),
        };
        return undefined;
      }
      if (event.type === 'finishFinalWheel' && draft.finalWheel) {
        draft.phase = 'outcome';
        return undefined;
      }
      return 'invalid_event';
    }
    case 'outcome': {
      if (!draft.finalWheel) return 'invalid_event';
      if (draft.finalWheel.result === 'denied') {
        if (event.type !== 'confirm') return 'invalid_event';
        draft.endReason = 'denied';
        draft.phase = 'ended';
        return undefined;
      }
      if (event.type !== 'chooseOutcome') return 'invalid_event';
      if (event.outcome === 'success') {
        if (!event.reward) return 'invalid_value';
        if (event.reward === 'block_bad_action') {
          // Random enabled bad action for the next session; never Mistress Says No (it is gated already)
          const candidates = BAD_ACTION_IDS.filter(
            (id) =>
              id !== 'mistress_says_no' &&
              context.actions.some((config) => config.id === id && config.enabled),
          );
          const action = candidates[randInt(rng, 0, Math.max(0, candidates.length - 1))];
          draft.reward = action ? { type: 'block_bad_action', action } : null;
        } else {
          draft.reward = { type: event.reward };
        }
      }
      draft.endReason = event.outcome;
      draft.phase = 'ended';
      return undefined;
    }
    default:
      return 'invalid_event';
  }
}
