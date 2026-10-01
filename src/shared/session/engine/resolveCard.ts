import { actionGroup } from '../../actions';
import { randInt, shuffle, type Rng } from '../rng';
import type { ActionCardDefinition, Card, ResolutionStep, SessionState, TaskFollowUp } from '../types';
import { collect, convertBadToGood } from './boardChanges';
import { convertConsumedActionCard, freshNormalCard } from './cardImages';
import { definitionOf, numberParam, rangeParam, rollRange, type EngineContext } from './context';
import {
  activeNegativeEffects,
  applyEffect,
  canSplatter,
  getPace,
  getPixelLevel,
  getTaskMultiplier,
  hasEffect,
  removeEffect,
} from './effects';
import { availableSwitcherooCategories } from './switcheroo';
import { enterFinalWheel } from './winFlow';

const SPLATTER_SEED_MAX = 2 ** 31 - 1;
const DEFAULT_SAFETY_ZONE = 12;
const DEFAULT_ALTERNATIVES = 3;
const DEFAULT_FRESHEN_SPLATTER_SHARE = 0.3;

type TaskStep = Extract<ResolutionStep, { kind: 'task' }>;

const task = (draft: SessionState, baseCount: number, followUp?: TaskFollowUp): TaskStep => ({
  kind: 'task',
  count: baseCount * getTaskMultiplier(draft.effects),
  pace: getPace(draft.effects),
  ...(followUp ? { followUp } : {}),
});

/** Hail Mary multiplier: a value on the configured step grid, e.g. 1.5 / 2.0 / 2.5 / 3.0. */
function rollMultiplier(rng: Rng, definition: ActionCardDefinition | undefined): number {
  const [min, max] = rangeParam(definition, 'multiplier', [1.5, 3]);
  const step = numberParam(definition, 'multiplierStep', 0.5);
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

/**
 * Cleans a share of the splattered cards (at least one); the splatter effect ends with the last one.
 * Returns the number of cleaned cards.
 */
export function cleanSplatterShare(draft: SessionState, rng: Rng, share: number): number {
  const splattered = draft.cards.filter((card) => card.splatterSeed !== undefined).map((card) => card.field);
  if (splattered.length === 0) return 0;
  const count = Math.min(splattered.length, Math.max(1, Math.round(splattered.length * share)));
  const targets = new Set(shuffle(rng, splattered).slice(0, count));
  draft.cards = draft.cards.map((card) => {
    if (!targets.has(card.field)) return card;
    const cleaned = { ...card };
    delete cleaned.splatterSeed;
    return cleaned;
  });
  if (count === splattered.length) draft.effects = removeEffect(draft.effects, 'splatter');
  return count;
}

/** Freshen Up (§6.7): pixelate loses one level or a share of the splattered cards is cleaned. */
export function freshenUp(
  draft: SessionState,
  rng: Rng,
  effect: 'pixelate' | 'splatter',
  splatterShare: number,
): ResolutionStep[] {
  if (effect === 'pixelate') {
    draft.effects = removeEffect(draft.effects, 'pixelate');
    return [{ kind: 'notice', notice: { type: 'pixelate_relief', level: getPixelLevel(draft.effects) } }];
  }
  const count = cleanSplatterShare(draft, rng, splatterShare);
  return [{ kind: 'notice', notice: { type: 'splatter_cleaned', count } }];
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

/**
 * game-design §10: the steps an action card produces when triggered (params from its definition, §10.4).
 * Mutates the draft for instant effects.
 */
export function triggerAction(
  draft: SessionState,
  rng: Rng,
  context: EngineContext,
  card: Pick<Card, 'action' | 'actionCardId'>,
): ResolutionStep[] {
  const definition = definitionOf(context, card);
  const action = definition?.type ?? card.action;
  if (!action) return [];
  const actionCardId = definition?.id ?? action;
  draft.stats.actionsTriggered[action] = (draft.stats.actionsTriggered[action] ?? 0) + 1;
  draft.stats.actionCardsTriggered[actionCardId] = (draft.stats.actionCardsTriggered[actionCardId] ?? 0) + 1;

  // Shield (Good Fairy) blocks the next bad action – never Mistress Says No (§11)
  if (actionGroup(action) === 'bad' && action !== 'mistress_says_no' && hasEffect(draft.effects, 'shield')) {
    draft.effects = removeEffect(draft.effects, 'shield');
    return [{ kind: 'notice', notice: { type: 'shield_blocked', action, actionCardId } }];
  }

  const round = draft.round;
  const param = (key: string, fallback: readonly [number, number]) =>
    rollRange(rng, rangeParam(definition, key, fallback));
  const rounds = () => param('rounds', [2, 4]);
  const followUp = (kind: TaskFollowUp['kind']): TaskFollowUp => ({
    kind,
    safetyZone: rangeParam(definition, 'safetyZone', [DEFAULT_SAFETY_ZONE, DEFAULT_SAFETY_ZONE])[0],
  });

  switch (action) {
    case 'clearing_edges':
      return [{ kind: 'hold', seconds: param('holdSeconds', [15, 35]), thenPickEffect: true }];
    case 'good_fairy': {
      if (activeNegativeEffects(draft.effects).length > 0) return removeNegativeSteps(draft);
      if (numberParam(definition, 'shieldEnabled', 1) === 0) return removeNegativeSteps(draft);
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
    case 'freshen_up': {
      const share = numberParam(definition, 'splatterShare', DEFAULT_FRESHEN_SPLATTER_SHARE);
      const options = (['pixelate', 'splatter'] as const).filter((type) => hasEffect(draft.effects, type));
      const [only] = options;
      if (only === undefined) return [{ kind: 'notice', notice: { type: 'nothing_to_remove' } }];
      if (options.length > 1) return [{ kind: 'pick_effect', options: [...options], splatterShare: share }];
      return freshenUp(draft, rng, only, share);
    }
    case 'hail_mary': {
      const value = rollMultiplier(rng, definition);
      draft.effects = applyEffect(draft.effects, { type: 'success_multiplier', value }, round);
      return [{ kind: 'notice', notice: { type: 'effect_applied', effect: 'success_multiplier', value } }];
    }
    case 'switcheroo': {
      const categoryIds = availableSwitcherooCategories(draft, context);
      const alternatives = numberParam(definition, 'alternatives', DEFAULT_ALTERNATIVES);
      return categoryIds.length > 0
        ? [{ kind: 'switcheroo_pool', categoryIds, alternatives }]
        : [{ kind: 'notice', notice: { type: 'switcheroo_unavailable' } }];
    }
    case 'redemption': {
      const converted = convertBadToGood(draft, rng, context, param('count', [3, 5]));
      return [
        {
          kind: 'notice',
          notice:
            converted > 0
              ? { type: 'cards_converted', count: converted, source: 'redemption' }
              : { type: 'nothing_to_convert' },
        },
      ];
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
      const count = param('cardCount', [3, 10]);
      const targets = new Set(
        shuffle(
          rng,
          draft.cards.filter(canSplatter).map((card) => card.field),
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
      return [task(draft, param('count', [5, 20]))];
    case 'edge_and_hold':
      return [{ kind: 'hold', seconds: param('holdSeconds', [15, 35]), thenPickEffect: false }];
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
      return [task(draft, param('taskCount', [15, 35]), followUp('teleport_goal'))];
    case 'u_turn': {
      const value = rounds();
      // Blocks the current direction of travel
      const blocked = draft.lastMove?.direction ?? 'right';
      draft.effects = applyEffect(draft.effects, { type: 'u_turn', rounds: value, blocked }, round);
      return [{ kind: 'notice', notice: { type: 'effect_applied', effect: 'u_turn', rounds: value } }];
    }
    case 'moving_day':
      return [task(draft, param('taskCount', [15, 35]), followUp('move_player'))];
    case 'highperformer':
      return [{ kind: 'timed_task', seconds: param('seconds', [5, 15]), pace: getPace(draft.effects) }];
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

/** Task of a normal card: the player may pick a stroke tier (§8.6). */
export function normalTask(
  draft: SessionState,
  context: EngineContext,
  baseCount: number,
  revisit = false,
  revisitPenalty = 0,
): ResolutionStep {
  return {
    ...task(draft, baseCount),
    ...(context.rules.strokeTierMax > 1 ? { tierable: true } : {}),
    ...(revisit ? { revisit: 'converted' as const } : {}),
    ...(revisitPenalty > 0 ? { revisitPenalty } : {}),
  };
}

/**
 * Lands on a field: reveal + discover + queue its resolution (§8.2 v2).
 * The Goal Field starts the final wheel with the current release chance instead (§14).
 */
export function landOn(
  draft: SessionState,
  rng: Rng,
  context: EngineContext,
  field: number,
): ResolutionStep[] {
  draft.position = field;
  if (field === draft.goalField) {
    draft.reveal = draft.cards[field - 1] ?? null;
    enterFinalWheel(draft, context);
    return [];
  }

  const original = draft.cards[field - 1];
  if (!original) return [];
  let card: Card = { ...original };
  let revisit = false;
  let revisitPenalty = 0;

  if (card.discovered && card.kind === 'collectible') {
    // §9.4 revisit: no bonus again, only a stroke task
    card = { ...card, taskCount: rollRange(rng, context.rules.collectibleRevisitTaskRange) };
    draft.cards[field - 1] = card;
    draft.reveal = card;
    draft.phase = 'resolve_card';
    return [{ ...task(draft, card.taskCount ?? 0), revisit: 'collectible' }];
  }
  if (card.discovered && card.kind === 'normal') {
    // §8.5 revisit conversion: the field turns into a bad card with a new image;
    // a good field lost this way also costs release chance (§14.1)
    if (card.group === 'good' && context.rules.revisitChancePenalty > 0) {
      draft.stats.revisitPenalties++;
      revisitPenalty = context.rules.revisitChancePenalty;
    }
    card = freshNormalCard(draft, rng, context, card, 'bad');
    draft.stats.revisitConversions++;
    revisit = true;
  }
  card.discovered = true;
  if (card.kind === 'collectible') card.collected = true;
  draft.cards[field - 1] = card;
  draft.reveal = card;
  draft.phase = 'resolve_card';

  if (card.kind === 'action' && card.action) {
    const steps = triggerAction(draft, rng, context, card);
    if (context.rules.actionRetrigger === 'once') {
      const current = draft.cards[field - 1] ?? card;
      draft.cards[field - 1] = convertConsumedActionCard(draft, rng, context, current);
    }
    return steps;
  }
  if (card.kind === 'collectible') return [task(draft, card.taskCount ?? 0), ...collect(draft, rng, context)];
  return [normalTask(draft, context, card.taskCount ?? 0, revisit, revisitPenalty)];
}
