import { actionGroup, type ActionId } from '../../actions';
import { randInt, shuffle, type Rng } from '../rng';
import type { Card, ResolutionStep, SessionState } from '../types';
import { convertConsumedActionCard } from './cardImages';
import { numberParam, rangeParam, rollRange, type EngineContext } from './context';
import {
  activeNegativeEffects,
  applyEffect,
  getPace,
  getPixelLevel,
  getTaskMultiplier,
  hasEffect,
  removeEffect,
} from './effects';
import { availableSwitcherooPools } from './switcheroo';

const SPLATTER_SEED_MAX = 2 ** 31 - 1;

const task = (
  draft: SessionState,
  baseCount: number,
  followUp?: 'teleport_goal' | 'move_player',
): ResolutionStep => ({
  kind: 'task',
  count: baseCount * getTaskMultiplier(draft.effects),
  pace: getPace(draft.effects),
  ...(followUp ? { followUp } : {}),
});

/** Hail Mary multiplier: a value on the configured step grid, e.g. 1.5 / 2.0 / 2.5 / 3.0. */
function rollMultiplier(rng: Rng, context: EngineContext): number {
  const [min, max] = rangeParam(context, 'hail_mary', 'multiplier', [1.5, 3]);
  const step = numberParam(context, 'hail_mary', 'multiplierStep', 0.5);
  const steps = Math.max(0, Math.round((max - min) / step));
  return min + step * randInt(rng, 0, steps);
}

function removeSplatterFromCards(draft: SessionState): void {
  draft.cards = draft.cards.map((card) => {
    if (card.splatterSeed === undefined) return card;
    const cleaned = { ...card };
    delete cleaned.splatterSeed;
    return cleaned;
  });
}

/** Removes one negative effect chosen by the player (§11); splatter also clears the cards. */
export function removeChosenEffect(draft: SessionState, effect: Parameters<typeof removeEffect>[1]): void {
  draft.effects = removeEffect(draft.effects, effect);
  if (effect === 'splatter') removeSplatterFromCards(draft);
}

function removeNegativeSteps(draft: SessionState): ResolutionStep[] {
  const options = activeNegativeEffects(draft.effects);
  return options.length > 0
    ? [{ kind: 'pick_effect', options }]
    : [{ kind: 'notice', notice: { type: 'nothing_to_remove' } }];
}

/** game-design §10: the steps an action produces when triggered. Mutates the draft for instant effects. */
export function triggerAction(
  draft: SessionState,
  rng: Rng,
  context: EngineContext,
  action: ActionId,
): ResolutionStep[] {
  draft.stats.actionsTriggered[action] = (draft.stats.actionsTriggered[action] ?? 0) + 1;

  // Shield (Good Fairy) blocks the next bad action – never Mistress Says No (§11)
  if (actionGroup(action) === 'bad' && action !== 'mistress_says_no' && hasEffect(draft.effects, 'shield')) {
    draft.effects = removeEffect(draft.effects, 'shield');
    return [{ kind: 'notice', notice: { type: 'shield_blocked', action } }];
  }

  const round = draft.round;
  const rounds = (key = 'rounds') => rollRange(rng, rangeParam(context, action, key, [2, 4]));

  switch (action) {
    case 'clearing_edges':
      return [
        {
          kind: 'hold',
          seconds: rollRange(rng, rangeParam(context, action, 'holdSeconds', [15, 35])),
          thenPickEffect: true,
        },
      ];
    case 'good_fairy': {
      if (activeNegativeEffects(draft.effects).length > 0) return removeNegativeSteps(draft);
      if (numberParam(context, action, 'shieldEnabled', 1) === 0) return removeNegativeSteps(draft);
      draft.effects = applyEffect(draft.effects, { type: 'shield' }, round);
      return [{ kind: 'notice', notice: { type: 'effect_applied', effect: 'shield' } }];
    }
    case 'decision_maker':
      draft.chooseNextRoll = true;
      return [{ kind: 'notice', notice: { type: 'decision_maker' } }];
    case 'cleaning_lady': {
      const cleared = (['pixelate', 'splatter'] as const).filter((type) => hasEffect(draft.effects, type));
      draft.effects = draft.effects.filter(
        (effect) => effect.type !== 'pixelate' && effect.type !== 'splatter',
      );
      removeSplatterFromCards(draft);
      return [
        {
          kind: 'notice',
          notice:
            cleared.length > 0
              ? { type: 'effects_cleared', effects: cleared }
              : { type: 'nothing_to_remove' },
        },
      ];
    }
    case 'hail_mary': {
      const value = rollMultiplier(rng, context);
      draft.effects = applyEffect(draft.effects, { type: 'success_multiplier', value }, round);
      return [{ kind: 'notice', notice: { type: 'effect_applied', effect: 'success_multiplier', value } }];
    }
    case 'switcheroo': {
      const pools = availableSwitcherooPools(draft, context);
      return pools.length > 0
        ? [{ kind: 'switcheroo_pool', pools }]
        : [{ kind: 'notice', notice: { type: 'switcheroo_unavailable' } }];
    }
    case 'pixelate': {
      draft.effects = applyEffect(
        draft.effects,
        { type: 'pixelate', maxLevel: context.pixelateMaxLevel },
        round,
      );
      const level = getPixelLevel(draft.effects);
      draft.stats.maxPixelLevel = Math.max(draft.stats.maxPixelLevel, level);
      return [{ kind: 'notice', notice: { type: 'effect_applied', effect: 'pixelate', value: level } }];
    }
    case 'splatter': {
      const count = rollRange(rng, rangeParam(context, action, 'cardCount', [3, 10]));
      const targets = new Set(
        shuffle(
          rng,
          draft.cards.filter((card) => card.kind !== 'goal').map((card) => card.field),
        ).slice(0, count),
      );
      draft.cards = draft.cards.map((card) =>
        targets.has(card.field) ? { ...card, splatterSeed: randInt(rng, 1, SPLATTER_SEED_MAX) } : card,
      );
      draft.effects = applyEffect(draft.effects, { type: 'splatter' }, round);
      return [
        { kind: 'notice', notice: { type: 'effect_applied', effect: 'splatter', value: targets.size } },
      ];
    }
    case 'squeeze_task':
      return [task(draft, rollRange(rng, rangeParam(context, action, 'count', [5, 20])))];
    case 'edge_and_hold':
      return [
        {
          kind: 'hold',
          seconds: rollRange(rng, rangeParam(context, action, 'holdSeconds', [15, 35])),
          thenPickEffect: false,
        },
      ];
    case 'double_trouble': {
      const value = rounds();
      draft.effects = applyEffect(draft.effects, { type: 'double_trouble', rounds: value }, round);
      return [
        { kind: 'notice', notice: { type: 'effect_applied', effect: 'double_trouble', rounds: value } },
      ];
    }
    case 'mistress_says_no':
      draft.phase = 'ended';
      draft.endReason = 'mistress_says_no';
      return [];
    case 'guessing_game':
      return [{ kind: 'guess' }];
    case 'goal_teleport':
      return [
        task(draft, rollRange(rng, rangeParam(context, action, 'taskCount', [15, 35])), 'teleport_goal'),
      ];
    case 'u_turn': {
      const value = rounds();
      // Blocks the current direction of travel
      const blocked = draft.lastMove?.direction ?? 'right';
      draft.effects = applyEffect(draft.effects, { type: 'u_turn', rounds: value, blocked }, round);
      return [{ kind: 'notice', notice: { type: 'effect_applied', effect: 'u_turn', rounds: value } }];
    }
    case 'moving_day':
      return [task(draft, rollRange(rng, rangeParam(context, action, 'taskCount', [15, 35])), 'move_player')];
    case 'highperformer':
      return [
        {
          kind: 'timed_task',
          seconds: rollRange(rng, rangeParam(context, action, 'seconds', [5, 15])),
          pace: getPace(draft.effects),
        },
      ];
    case 'bad_luck': {
      if (!hasEffect(draft.effects, 'success_multiplier'))
        return [{ kind: 'notice', notice: { type: 'nothing_to_remove' } }];
      draft.effects = removeEffect(draft.effects, 'success_multiplier');
      return [{ kind: 'notice', notice: { type: 'effect_removed', effect: 'success_multiplier' } }];
    }
    case 'take_it_slow':
    case 'speed_it_up': {
      const value = rounds();
      const type = action === 'take_it_slow' ? 'pace_slow' : 'pace_fast';
      draft.effects = applyEffect(draft.effects, { type, rounds: value }, round);
      return [{ kind: 'notice', notice: { type: 'effect_applied', effect: type, rounds: value } }];
    }
  }
}

/** Steps after a successful hold of Clearing Edges. */
export const afterClearingEdges = (draft: SessionState): ResolutionStep[] => removeNegativeSteps(draft);

/**
 * Lands on a field: reveal + discover + queue its resolution (§8.2).
 * The Goal Field switches to the win check instead (AP6).
 */
export function landOn(
  draft: SessionState,
  rng: Rng,
  context: EngineContext,
  field: number,
): ResolutionStep[] {
  draft.position = field;
  if (field === draft.goalField) {
    draft.phase = 'win_check';
    draft.reveal = draft.cards[field - 1] ?? null;
    return [];
  }

  const original = draft.cards[field - 1];
  if (!original) return [];
  let card: Card = { ...original };

  // §6.6 revisit: same task, new count
  if (card.kind === 'normal' && card.discovered) {
    const folder = context.folders.find((candidate) => candidate.id === card.folderId);
    const range = card.actionConsumed
      ? context.rules.consumedTaskRange
      : (folder?.taskRange ?? context.rules.consumedTaskRange);
    card = { ...card, taskCount: rollRange(rng, range) };
  }
  card.discovered = true;
  draft.cards[field - 1] = card;
  draft.reveal = card;
  draft.phase = 'resolve_card';

  if (card.kind === 'action' && card.action) {
    const steps = triggerAction(draft, rng, context, card.action);
    if (context.rules.actionRetrigger === 'once') {
      const current = draft.cards[field - 1] ?? card;
      draft.cards[field - 1] = convertConsumedActionCard(draft, rng, context, current);
    }
    return steps;
  }
  return [task(draft, card.taskCount ?? 0)];
}
