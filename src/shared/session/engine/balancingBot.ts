import { shortDistance, wrapField } from '../track';
import type { Direction, SessionRules, SessionState, StrokeTier } from '../types';
import type { EngineContext } from './context';
import { readyToRoll, run } from './engineTestKit';
import { isDirectionBlocked, type EngineEvent } from './reduce';
import { computeReleaseChance } from './releaseChance';

/** Test support for the balancing simulation (AP9.9): a simple, plausible player. */

const MAX_EVENTS = 4000;
const DIE_MAX = 6;
/** Score malus for landing on a discovered good field (worth a few fields of distance) */
const REVISIT_AVOIDANCE = 5;
/** Extra score for landing on a visible, not yet collected performer card */
const PERFORMER_BONUS = 10;
const DIRECTIONS: readonly Direction[] = ['left', 'right'];
const sign = (direction: Direction) => (direction === 'right' ? 1 : -1);

/** Fewest dice whose reach (n..6n) contains an undiscovered field – bigger jumps out of explored areas. */
function tierForExploring(state: SessionState, maxTier: number): StrokeTier {
  for (let tier = 1; tier <= maxTier; tier++) {
    for (let steps = tier; steps <= DIE_MAX * tier; steps++) {
      for (const direction of DIRECTIONS) {
        const card = state.cards[wrapField(state.position + sign(direction) * steps) - 1];
        if (card && !card.discovered && card.kind !== 'goal') return tier as StrokeTier;
      }
    }
  }
  return 1;
}

/** Explores unknown fields (detours welcome) until the release chance reaches `targetChance`, then goes for the goal. */
function botEvent(state: SessionState, context: EngineContext, targetChance: number): EngineEvent {
  const exploring = computeReleaseChance(state, context.rules).finalChance < targetChance;
  if (state.phase === 'roll') {
    if (!state.chooseNextRoll) return { type: 'roll' };
    const distance = shortDistance(state.position, state.goalField);
    return { type: 'chooseRoll', value: !exploring && distance <= DIE_MAX ? distance : DIE_MAX };
  }
  if (state.phase === 'choose_direction') {
    const steps = state.lastRoll ?? 0;
    const options = DIRECTIONS.filter((direction) => !isDirectionBlocked(state, direction)).map(
      (direction) => {
        const target = wrapField(state.position + sign(direction) * steps);
        const card = state.cards[target - 1];
        const distance = shortDistance(target, state.goalField);
        // Revisiting a good field costs release chance (§8.5) – avoided when there is a choice
        const costly =
          card?.discovered === true && card.kind === 'normal' && card.group === 'good'
            ? REVISIT_AVOIDANCE
            : 0;
        // Performer cards are visible on the ring (§9.4) – a player aims for them while exploring
        const performer = card?.kind === 'collectible' && !card.discovered ? PERFORMER_BONUS : 0;
        const score = exploring
          ? (card?.discovered ? 0 : 10) +
            performer +
            (target === state.goalField ? -100 : 0) +
            distance / 100 -
            costly
          : (target === state.goalField ? 1000 : 0) - distance - costly;
        return { direction, score };
      },
    );
    const best = options.sort((a, b) => b.score - a.score)[0];
    return { type: 'chooseDirection', direction: best?.direction ?? 'right' };
  }
  const step = state.pending[0];
  switch (step?.kind) {
    case 'pick_effect':
      return { type: 'pickEffect', effect: step.options[0] ?? 'pixelate' };
    case 'guess':
      return { type: 'guess', numbers: [1, 2] };
    case 'choose_reward':
      return { type: 'chooseReward', reward: 'remove_penalty_fields' };
    case 'switcheroo_pool':
      return { type: 'switcherooPool', categoryId: step.categoryIds.at(-1) ?? '' };
    case 'switcheroo_folder':
      return { type: 'switcherooFolder', folderId: step.folderIds[0] ?? '' };
    case 'task':
      if (!step.tierable) return { type: 'confirm' };
      return { type: 'confirm', tier: exploring ? tierForExploring(state, context.rules.strokeTierMax) : 1 };
    default:
      return { type: 'confirm' };
  }
}

export interface GameResult {
  reachedGoal: boolean;
  rounds: number;
  finalChance: number;
  badShareSeen: number;
  detourConversions: number;
  revisitConversions: number;
  goalDrifts: number;
  collected: number;
}

export function playGame(seed: number, targetChance: number, rules: Partial<SessionRules> = {}): GameResult {
  const base = readyToRoll({ seed, goalValue: ((seed * 29) % 100) + 1 });
  const context = { ...base.context, rules: { ...base.context.rules, ...rules } };
  let state = base.session;
  let good = 0;
  let bad = 0;
  for (
    let events = 0;
    events < MAX_EVENTS && state.phase !== 'ended' && state.phase !== 'final_wheel';
    events++
  ) {
    const event = botEvent(state, context, targetChance);
    state = run(state, context, event);
    // The card revealed by a move (normal cards only)
    if (event.type === 'chooseDirection' && state.reveal?.kind === 'normal') {
      if (state.reveal.group === 'good') good++;
      else bad++;
    }
  }
  return {
    reachedGoal: state.phase === 'final_wheel',
    rounds: state.round,
    finalChance: state.winCheck?.finalChance ?? 0,
    badShareSeen: good + bad > 0 ? bad / (good + bad) : 0,
    detourConversions: state.stats.detourConversions,
    revisitConversions: state.stats.revisitConversions,
    goalDrifts: state.stats.goalDrifts,
    collected: state.collected,
  };
}

export const average = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

export function summarize(results: readonly GameResult[]) {
  const finished = results.filter((result) => result.reachedGoal);
  return {
    reachedGoal: finished.length,
    avgRounds: average(finished.map((result) => result.rounds)),
    avgFinalChance: average(finished.map((result) => result.finalChance)),
    avgBadShareSeen: average(results.map((result) => result.badShareSeen)),
    avgDetourConversions: average(results.map((result) => result.detourConversions)),
    avgRevisitConversions: average(results.map((result) => result.revisitConversions)),
    avgGoalDrifts: average(results.map((result) => result.goalDrifts)),
    avgCollected: average(results.map((result) => result.collected)),
  };
}
