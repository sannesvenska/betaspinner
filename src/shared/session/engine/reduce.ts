import { chance, createRng, randInt, type Rng } from '../rng';
import { wrapField } from '../track';
import type { Direction, EffectType, ResolutionStep, SessionState, StrokeTier, TaskFollowUp } from '../types';
import { applyDetour, applyGoalDrift, isDetour, passesOver } from './boardChanges';
import type { EngineContext } from './context';
import { activeNegativeEffects, directionSign, getBlockedDirection, hasEffect, tickRound } from './effects';
import { findRelocationTarget, swapGoal } from './relocation';
import { afterClearingEdges, freshenUp, landOn, normalTask, removeChosenEffect } from './resolveCard';
import { applySwitcheroo, drawSwitcherooAlternatives } from './switcheroo';
import { applyWinFlow, type WinFlowEvent } from './winFlow';

const DIE_SIDES = 6;
const GUESS_PENALTY_FIELDS = 2;

export type EngineEvent =
  /** `tier` only on a tierable task (normal card, §8.6); defaults to ×1 */
  | { type: 'confirm'; tier?: StrokeTier }
  | { type: 'roll' }
  | { type: 'chooseRoll'; value: number }
  | { type: 'chooseDirection'; direction: Direction }
  | { type: 'pickEffect'; effect: EffectType }
  | { type: 'guess'; numbers: readonly [number, number] }
  | { type: 'chooseReward'; reward: 'remove_effect' | 'remove_penalty_fields' }
  | { type: 'switcherooPool'; categoryId: string }
  | { type: 'switcherooFolder'; folderId: string }
  | { type: 'endEarly' }
  | Exclude<WinFlowEvent, { type: 'confirm' }>;

export type EngineErrorCode = 'invalid_event' | 'invalid_value' | 'direction_blocked';

export interface EngineResult {
  state: SessionState;
  /** Set when the event was rejected; `state` is then the unchanged input. */
  error?: EngineErrorCode;
}

const isDieValue = (value: number): boolean => Number.isInteger(value) && value >= 1 && value <= DIE_SIDES;

const opposite = (direction: Direction): Direction => (direction === 'left' ? 'right' : 'left');

/** Directions the player may not choose now: U Turn (§11) or the forced reversal (§8.7). */
export function isDirectionBlocked(
  state: Pick<SessionState, 'effects' | 'forcedDirection'>,
  direction: Direction,
): boolean {
  if (getBlockedDirection(state.effects) === direction) return true;
  return state.forcedDirection !== null && state.forcedDirection !== direction;
}

/**
 * The game engine: a pure reducer over the session (game-design §8). Invalid events never throw –
 * they return the unchanged state with an error code, so the UI can't corrupt a session.
 */
export function reduce(state: SessionState, event: EngineEvent, context: EngineContext): EngineResult {
  if (state.phase === 'ended') return { state, error: 'invalid_event' };
  const draft = structuredClone(state);
  const rng = createRng(draft.rngState);
  const afterGoal = state.phase === 'final_wheel' || state.phase === 'outcome';
  // End Early is only available until the Goal Field is reached (§7.2)
  const error = afterGoal
    ? event.type === 'endEarly'
      ? 'invalid_event'
      : applyWinFlow(draft, rng, event as WinFlowEvent, context)
    : apply(draft, rng, event, context);
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
    draft.forcedDirection = null;
    return undefined;
  }

  switch (draft.phase) {
    case 'initial_task':
      if (event.type !== 'confirm') return 'invalid_event';
      draft.stats.tasksPerformed += draft.initialTaskCount;
      // The start card is already discovered; resolve it like a landing without re-rolling
      draft.reveal = draft.cards[draft.startField - 1] ?? null;
      draft.phase = 'resolve_card';
      draft.pending = [normalTask(draft, context, draft.reveal?.taskCount ?? 0)];
      return undefined;

    case 'roll':
      if (event.type === 'roll' && !draft.chooseNextRoll) {
        const dice = Array.from({ length: Math.max(1, draft.nextDice) }, () => randInt(rng, 1, DIE_SIDES));
        startMove(draft, dice);
        return undefined;
      }
      if (event.type === 'chooseRoll' && draft.chooseNextRoll) {
        if (!isDieValue(event.value)) return 'invalid_value';
        draft.chooseNextRoll = false;
        startMove(draft, [], event.value);
        return undefined;
      }
      return 'invalid_event';

    case 'choose_direction': {
      if (event.type !== 'chooseDirection') return 'invalid_event';
      if (isDirectionBlocked(draft, event.direction)) return 'direction_blocked';
      move(draft, rng, context, event.direction);
      finishIfResolved(draft, rng, context);
      return undefined;
    }

    case 'resolve_card':
    case 'moving':
      return resolveStep(draft, rng, event, context);
  }
  return 'invalid_event';
}

/** `dice` = rolled dice; a chosen value (Decision Maker) has no dice. */
function startMove(draft: SessionState, dice: number[], chosen?: number): void {
  draft.lastDice = dice;
  draft.lastRoll = chosen ?? dice.reduce((sum, die) => sum + die, 0);
  draft.nextDice = 1;
  draft.stats.rolls++;
  draft.round++;
  draft.phase = 'choose_direction';
}

/** §8.2 v2 order after the move: overshoot → detour → landing. */
function move(draft: SessionState, rng: Rng, context: EngineContext, direction: Direction): void {
  const steps = draft.lastRoll ?? 0;
  const from = draft.position;
  const goalBefore = draft.goalField;
  const to = wrapField(from + directionSign(direction) * steps);
  draft.lastMove = { from, to, direction, steps };
  if (draft.forcedDirection) draft.stats.forcedReversals++;
  draft.forcedDirection = null;
  draft.position = to;

  const moveSteps: ResolutionStep[] = [];
  if (passesOver(from, direction, steps, goalBefore)) moveSteps.push(...applyGoalDrift(draft, rng, context));
  if (isDetour(from, to, goalBefore)) moveSteps.push(...applyDetour(draft, rng, context));
  const landing = landOn(draft, rng, context, to);
  draft.pending = draft.phase === 'resolve_card' ? [...moveSteps, ...landing] : [];
}

/**
 * Ends the round once the queue is empty: effects tick (§8.2), then the next roll.
 * Before that roll a forced reversal may trigger (§8.7).
 */
function finishIfResolved(draft: SessionState, rng: Rng, context: EngineContext): void {
  if (draft.phase !== 'resolve_card' || draft.pending.length > 0) return;
  draft.effects = tickRound(draft.effects, draft.round);
  draft.phase = 'roll';
  const eligible =
    draft.lastMove !== null && !hasEffect(draft.effects, 'u_turn') && draft.lastForcedRound !== draft.round;
  if (eligible && chance(rng, context.rules.forcedReversalChance) && draft.lastMove) {
    draft.forcedDirection = opposite(draft.lastMove.direction);
    draft.lastForcedRound = draft.round + 1;
  }
}

const validTier = (tier: number | undefined, max: number): tier is StrokeTier =>
  tier !== undefined && Number.isInteger(tier) && tier >= 1 && tier <= max;

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
    case 'task': {
      if (event.type !== 'confirm') return 'invalid_event';
      let tier: StrokeTier = 1;
      if (event.tier !== undefined) {
        if (!head.tierable || !validTier(event.tier, context.rules.strokeTierMax)) return 'invalid_value';
        tier = event.tier;
      }
      draft.stats.tasksPerformed += head.count * tier;
      if (head.tierable) {
        // §8.6: ×n strokes → n dice on the next roll
        draft.nextDice = tier;
        draft.stats.strokeTiers[tier - 1] = (draft.stats.strokeTiers[tier - 1] ?? 0) + 1;
      }
      draft.pending = rest;
      if (head.followUp) next = runFollowUp(draft, rng, context, head.followUp);
      break;
    }
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
      if (head.splatterShare !== undefined && (event.effect === 'pixelate' || event.effect === 'splatter'))
        next = freshenUp(draft, rng, event.effect, head.splatterShare);
      else removeChosenEffect(draft, event.effect);
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
      if (!head.categoryIds.includes(event.categoryId)) return 'invalid_value';
      next = [
        {
          kind: 'switcheroo_folder',
          categoryId: event.categoryId,
          folderIds: drawSwitcherooAlternatives(draft, rng, context, event.categoryId, head.alternatives),
        },
      ];
      break;
    case 'switcheroo_folder': {
      if (event.type !== 'switcherooFolder') return 'invalid_event';
      if (!head.folderIds.includes(event.folderId)) return 'invalid_value';
      const { changed, total } = applySwitcheroo(draft, rng, context, head.categoryId, event.folderId);
      next = [
        {
          kind: 'notice',
          notice: {
            type: 'switcheroo_done',
            categoryId: head.categoryId,
            folderId: event.folderId,
            changed,
            total,
          },
        },
      ];
      break;
    }
  }

  if (head.kind !== 'task') draft.pending = rest;
  // Follow-up steps run before the remaining queue (e.g. the card landed on by Moving Day)
  if (draft.phase === 'resolve_card') draft.pending = [...next, ...draft.pending];
  else draft.pending = [];
  finishIfResolved(draft, rng, context);
  return undefined;
}

function runFollowUp(
  draft: SessionState,
  rng: Rng,
  context: EngineContext,
  followUp: TaskFollowUp,
): ResolutionStep[] {
  const target = findRelocationTarget(draft, rng, followUp.safetyZone);
  if (target === undefined) return [{ kind: 'notice', notice: { type: 'relocation_skipped' } }];

  if (followUp.kind === 'teleport_goal') {
    const from = draft.goalField;
    swapGoal(draft, target);
    return [{ kind: 'notice', notice: { type: 'goal_moved', from, to: target } }];
  }
  const from = draft.position;
  const landingSteps = landOn(draft, rng, context, target);
  return [{ kind: 'notice', notice: { type: 'player_moved', from, to: target } }, ...landingSteps];
}
