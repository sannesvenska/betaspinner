import { describe, expect, it } from 'vitest';
import { shortDistance, wrapField } from '../track';
import type { Direction, SessionState, StrokeTier } from '../types';
import type { EngineContext } from './context';
import { readyToRoll, run } from './engineTestKit';
import { isDirectionBlocked, type EngineEvent } from './reduce';
import { computeReleaseChance } from './releaseChance';

const GAMES = 200;
const MAX_EVENTS = 4000;
/** The bot explores until the release chance reaches this, then heads for the goal. */
const TARGET_CHANCE = 25;
const DIE_MAX = 6;
const SIMULATION_TIMEOUT_MS = 60_000;

const sign = (direction: Direction) => (direction === 'right' ? 1 : -1);
const DIRECTIONS: readonly Direction[] = ['left', 'right'];

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

/** Simple, plausible strategy: explore unknown fields (detours welcome), then go for the goal. */
function botEvent(state: SessionState, context: EngineContext): EngineEvent {
  const chance = computeReleaseChance(state, context.rules).finalChance;
  const exploring = chance < TARGET_CHANCE;
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
        const score = exploring
          ? (card?.discovered ? 0 : 10) + (target === state.goalField ? -100 : 0) + distance / 100
          : (target === state.goalField ? 1000 : 0) - distance;
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

interface GameResult {
  reachedGoal: boolean;
  rounds: number;
  finalChance: number;
  badShareSeen: number;
  detourConversions: number;
  revisitConversions: number;
  goalDrifts: number;
  collected: number;
}

function playGame(seed: number): GameResult {
  const { session, context } = readyToRoll({ seed, goalValue: ((seed * 29) % 100) + 1 });
  let state = session;
  let good = 0;
  let bad = 0;
  for (
    let events = 0;
    events < MAX_EVENTS && state.phase !== 'ended' && state.phase !== 'final_wheel';
    events++
  ) {
    const event = botEvent(state, context);
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

const average = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

describe(`balancing simulation – ${GAMES} bot games (AP9.9)`, () => {
  it(
    'keeps the v2 defaults in a playable range',
    () => {
      const results = Array.from({ length: GAMES }, (_, index) => playGame(index + 1));
      const finished = results.filter((result) => result.reachedGoal);
      const summary = {
        reachedGoal: finished.length,
        avgRounds: average(finished.map((result) => result.rounds)).toFixed(1),
        avgFinalChance: average(finished.map((result) => result.finalChance)).toFixed(1),
        avgBadShareSeen: average(results.map((result) => result.badShareSeen)).toFixed(2),
        avgDetourConversions: average(results.map((result) => result.detourConversions)).toFixed(1),
        avgRevisitConversions: average(results.map((result) => result.revisitConversions)).toFixed(1),
        avgGoalDrifts: average(results.map((result) => result.goalDrifts)).toFixed(1),
        avgCollected: average(results.map((result) => result.collected)).toFixed(1),
      };
      console.log(`balancing ${JSON.stringify(summary)}`);

      // Almost every game reaches the goal (the rest ends by Mistress Says No)
      expect(finished.length).toBeGreaterThan(GAMES * 0.85);
      // Guard rail, not a target: measured ≈ 126 rounds with the 2026-09-30 defaults (see ROADMAP AP9.9)
      expect(Number(summary.avgRounds)).toBeLessThan(150);
      expect(Number(summary.avgFinalChance)).toBeGreaterThanOrEqual(TARGET_CHANCE);
      // Detours actually change the board; drifts happen but stay rare
      expect(Number(summary.avgDetourConversions)).toBeGreaterThan(2);
      expect(Number(summary.avgGoalDrifts)).toBeLessThan(10);
    },
    SIMULATION_TIMEOUT_MS,
  );
});
