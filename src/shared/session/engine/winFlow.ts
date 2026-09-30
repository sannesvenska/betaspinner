import { BAD_ACTION_IDS } from '../../actions';
import { randInt, type Rng } from '../rng';
import type { RewardChoice, SessionState } from '../types';
import type { EngineContext } from './context';
import { computeReleaseChance } from './releaseChance';

const PERCENT = 100;
/** Landing spot stays away from the area borders so the result is unambiguous. */
const LANDING_MARGIN = 0.1;
const MIN_HOLD_SECONDS = 1;

export type WinFlowEvent =
  | { type: 'startFinalWheel' }
  | { type: 'finishFinalWheel' }
  | { type: 'chooseOutcome'; outcome: 'success' | 'interrupted' | 'no_result'; reward?: RewardChoice }
  | { type: 'confirm' };

/** Landing on the goal (§14.1 v2): no roll – the release chance is fixed and the final wheel starts. */
export function enterFinalWheel(draft: SessionState, context: EngineContext): void {
  draft.winCheck = computeReleaseChance(draft, context.rules);
  draft.phase = 'final_wheel';
}

/** Handles the phases after the Goal Field was reached (§14). Returns an error code or undefined. */
export function applyWinFlow(
  draft: SessionState,
  rng: Rng,
  event: WinFlowEvent,
  context: EngineContext,
): 'invalid_event' | 'invalid_value' | undefined {
  switch (draft.phase) {
    case 'final_wheel': {
      if (event.type === 'startFinalWheel' && !draft.finalWheel && draft.winCheck) {
        // §14.2 [RULE]: the result is decided when "Start Task" is pressed
        const allowed = rng.next() * PERCENT < draft.winCheck.finalChance;
        draft.finalWheel = {
          result: allowed ? 'allowed' : 'denied',
          landing: LANDING_MARGIN + (1 - 2 * LANDING_MARGIN) * rng.next(),
          holdSeconds: Math.max(
            MIN_HOLD_SECONDS,
            Math.min(draft.winCheck.discovered, context.rules.holdSecondsCap),
          ),
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
          // Random enabled bad card for the next session; never Mistress Says No (it is gated already)
          const candidates = context.actionCards.filter(
            (card) =>
              card.enabled &&
              card.type !== 'mistress_says_no' &&
              (BAD_ACTION_IDS as readonly string[]).includes(card.type),
          );
          const card = candidates[randInt(rng, 0, Math.max(0, candidates.length - 1))];
          draft.reward = card ? { type: 'block_bad_action', actionCardId: card.id, action: card.type } : null;
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
