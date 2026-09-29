import { createRng, randInt, type Rng } from '../rng';
import { wrapField } from '../track';
import type { Direction, EffectType, ResolutionStep, SessionState, SwitcherooPool } from '../types';
import { rangeParam, type EngineContext } from './context';
import { activeNegativeEffects, directionSign, getBlockedDirection, tickRound } from './effects';
import { findRelocationTarget, swapGoal } from './relocation';
import { afterClearingEdges, landOn, removeChosenEffect } from './resolveCard';
import { applySwitcheroo, drawSwitcherooAlternatives } from './switcheroo';

const DIE_SIDES = 6;
const GUESS_PENALTY_FIELDS = 2;
const DEFAULT_SAFETY_ZONE = 12;

export type EngineEvent =
  | { type: 'confirm' }
  | { type: 'roll' }
  | { type: 'chooseRoll'; value: number }
  | { type: 'chooseDirection'; direction: Direction }
  | { type: 'pickEffect'; effect: EffectType }
  | { type: 'guess'; numbers: readonly [number, number] }
  | { type: 'chooseReward'; reward: 'remove_effect' | 'remove_penalty_fields' }
  | { type: 'switcherooPool'; pool: SwitcherooPool }
  | { type: 'switcherooFolder'; folderId: string }
  | { type: 'endEarly' };

export type EngineErrorCode = 'invalid_event' | 'invalid_value' | 'direction_blocked';

export interface EngineResult {
  state: SessionState;
  /** Set when the event was rejected; `state` is then the unchanged input. */
  error?: EngineErrorCode;
}

const isDieValue = (value: number): boolean => Number.isInteger(value) && value >= 1 && value <= DIE_SIDES;

/**
 * The game engine: a pure reducer over the session (game-design §8). Invalid events never throw –
 * they return the unchanged state with an error code, so the UI can't corrupt a session.
 */
export function reduce(state: SessionState, event: EngineEvent, context: EngineContext): EngineResult {
  if (
    state.phase === 'ended' ||
    state.phase === 'win_check' ||
    state.phase === 'final_wheel' ||
    state.phase === 'outcome'
  ) {
    return { state, error: 'invalid_event' };
  }
  const draft = structuredClone(state);
  const rng = createRng(draft.rngState);
  const error = apply(draft, rng, event, context);
  if (error) return { state, error };
  draft.rngState = rng.state;
  return { state: draft };
}

function apply(
  draft: SessionState,
  rng: Rng,
  event: EngineEvent,
  context: EngineContext,
): EngineErrorCode | undefined {
  if (event.type === 'endEarly') {
    draft.phase = 'ended';
    draft.endReason = 'ended_early';
    draft.pending = [];
    return undefined;
  }

  switch (draft.phase) {
    case 'initial_task':
      if (event.type !== 'confirm') return 'invalid_event';
      draft.stats.tasksPerformed += draft.initialTaskCount;
      // The start card is already discovered; resolve it like a landing without re-rolling
      draft.reveal = draft.cards[draft.startField - 1] ?? null;
      draft.phase = 'resolve_card';
      draft.pending = [
        {
          kind: 'task',
          count: draft.reveal?.taskCount ?? 0,
          pace: null,
        },
      ];
      return undefined;

    case 'roll':
      if (event.type === 'roll' && !draft.chooseNextRoll) {
        startMove(draft, randInt(rng, 1, DIE_SIDES));
        return undefined;
      }
      if (event.type === 'chooseRoll' && draft.chooseNextRoll) {
        if (!isDieValue(event.value)) return 'invalid_value';
        draft.chooseNextRoll = false;
        startMove(draft, event.value);
        return undefined;
      }
      return 'invalid_event';

    case 'choose_direction': {
      if (event.type !== 'chooseDirection') return 'invalid_event';
      if (getBlockedDirection(draft.effects) === event.direction) return 'direction_blocked';
      const steps = draft.lastRoll ?? 0;
      const from = draft.position;
      const to = wrapField(from + directionSign(event.direction) * steps);
      draft.lastMove = { from, to, direction: event.direction, steps };
      draft.pending = landOn(draft, rng, context, to);
      finishIfResolved(draft);
      return undefined;
    }

    case 'resolve_card':
    case 'moving':
      return resolveStep(draft, rng, event, context);
  }
  return 'invalid_event';
}

function startMove(draft: SessionState, value: number): void {
  draft.lastRoll = value;
  draft.stats.rolls++;
  draft.round++;
  draft.phase = 'choose_direction';
}

/** Ends the round once the queue is empty: effects tick (§8.2), then the next roll. */
function finishIfResolved(draft: SessionState): void {
  if (draft.phase !== 'resolve_card' || draft.pending.length > 0) return;
  draft.effects = tickRound(draft.effects, draft.round);
  draft.phase = 'roll';
}

function resolveStep(
  draft: SessionState,
  rng: Rng,
  event: EngineEvent,
  context: EngineContext,
): EngineErrorCode | undefined {
  const [head, ...rest] = draft.pending;
  if (!head) return 'invalid_event';
  let next: ResolutionStep[] = [];

  switch (head.kind) {
    case 'task':
      if (event.type !== 'confirm') return 'invalid_event';
      draft.stats.tasksPerformed += head.count;
      draft.pending = rest;
      if (head.followUp) next = runFollowUp(draft, rng, context, head.followUp);
      break;
    case 'timed_task':
      if (event.type !== 'confirm') return 'invalid_event';
      break;
    case 'hold':
      if (event.type !== 'confirm') return 'invalid_event';
      draft.stats.holdTasks++;
      draft.stats.holdSeconds += head.seconds;
      if (head.thenPickEffect) next = afterClearingEdges(draft);
      break;
    case 'notice':
      if (event.type !== 'confirm') return 'invalid_event';
      break;
    case 'pick_effect':
      if (event.type !== 'pickEffect') return 'invalid_event';
      if (!head.options.includes(event.effect)) return 'invalid_value';
      removeChosenEffect(draft, event.effect);
      break;
    case 'guess': {
      if (event.type !== 'guess') return 'invalid_event';
      const [first, second] = event.numbers;
      if (!isDieValue(first) || !isDieValue(second) || first === second) return 'invalid_value';
      const roll = randInt(rng, 1, DIE_SIDES);
      const match = roll === first || roll === second;
      next = [{ kind: 'notice', notice: { type: 'guess_result', numbers: [first, second], roll, match } }];
      if (match) {
        next.push({
          kind: 'choose_reward',
          canRemoveEffect: activeNegativeEffects(draft.effects).length > 0,
        });
      } else {
        // No match: roll two dice, perform d1 × d2 tasks
        const count = randInt(rng, 1, DIE_SIDES) * randInt(rng, 1, DIE_SIDES);
        next.push({ kind: 'task', count, pace: null });
      }
      break;
    }
    case 'choose_reward':
      if (event.type !== 'chooseReward') return 'invalid_event';
      if (event.reward === 'remove_effect') {
        if (!head.canRemoveEffect) return 'invalid_value';
        next = [{ kind: 'pick_effect', options: activeNegativeEffects(draft.effects) }];
      } else {
        draft.penaltyFieldsRemoved += GUESS_PENALTY_FIELDS;
        next = [{ kind: 'notice', notice: { type: 'penalty_fields_removed', count: GUESS_PENALTY_FIELDS } }];
      }
      break;
    case 'switcheroo_pool':
      if (event.type !== 'switcherooPool') return 'invalid_event';
      if (!head.pools.includes(event.pool)) return 'invalid_value';
      next = [
        {
          kind: 'switcheroo_folder',
          pool: event.pool,
          folderIds: drawSwitcherooAlternatives(draft, rng, context, event.pool),
        },
      ];
      break;
    case 'switcheroo_folder': {
      if (event.type !== 'switcherooFolder') return 'invalid_event';
      if (!head.folderIds.includes(event.folderId)) return 'invalid_value';
      const { changed, total } = applySwitcheroo(draft, rng, context, head.pool, event.folderId);
      next = [
        {
          kind: 'notice',
          notice: { type: 'switcheroo_done', pool: head.pool, folderId: event.folderId, changed, total },
        },
      ];
      break;
    }
  }

  if (head.kind !== 'task') draft.pending = rest;
  // Follow-up steps run before the remaining queue (e.g. the card landed on by Moving Day)
  if (draft.phase === 'resolve_card') draft.pending = [...next, ...draft.pending];
  else draft.pending = [];
  finishIfResolved(draft);
  return undefined;
}

function runFollowUp(
  draft: SessionState,
  rng: Rng,
  context: EngineContext,
  followUp: 'teleport_goal' | 'move_player',
): ResolutionStep[] {
  const action = followUp === 'teleport_goal' ? 'goal_teleport' : 'moving_day';
  const [zone] = rangeParam(context, action, 'safetyZone', [DEFAULT_SAFETY_ZONE, DEFAULT_SAFETY_ZONE]);
  const target = findRelocationTarget(draft, rng, zone);
  if (target === undefined) return [{ kind: 'notice', notice: { type: 'relocation_skipped' } }];

  if (followUp === 'teleport_goal') {
    const from = draft.goalField;
    swapGoal(draft, target);
    return [{ kind: 'notice', notice: { type: 'goal_moved', from, to: target } }];
  }
  const from = draft.position;
  const landingSteps = landOn(draft, rng, context, target);
  return [{ kind: 'notice', notice: { type: 'player_moved', from, to: target } }, ...landingSteps];
}
