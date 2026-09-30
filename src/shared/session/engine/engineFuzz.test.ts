import { describe, expect, it } from 'vitest';
import { createRng, randInt, type Rng } from '../rng';
import type { SessionState, StrokeTier } from '../types';
import { head, readyToRoll, run } from './engineTestKit';
import { reduce, type EngineEvent } from './reduce';

const MAX_EVENTS_PER_GAME = 5000;
const END_EARLY_CHANCE = 0.0005;
const GAMES = 100;
const FUZZ_TIMEOUT_MS = 60_000;

/** Picks a random valid event for the current state (like a player mashing buttons). */
function randomEvent(state: SessionState, rng: Rng): EngineEvent {
  if (rng.next() < END_EARLY_CHANCE) return { type: 'endEarly' };
  if (state.phase === 'roll') {
    return state.chooseNextRoll ? { type: 'chooseRoll', value: randInt(rng, 1, 6) } : { type: 'roll' };
  }
  if (state.phase === 'choose_direction')
    return { type: 'chooseDirection', direction: rng.next() < 0.5 ? 'left' : 'right' };
  const step = head(state);
  switch (step?.kind) {
    case 'pick_effect':
      return {
        type: 'pickEffect',
        effect: step.options[randInt(rng, 0, step.options.length - 1)] ?? 'pixelate',
      };
    case 'guess': {
      const first = randInt(rng, 1, 6);
      return { type: 'guess', numbers: [first, (first % 6) + 1] };
    }
    case 'choose_reward':
      return {
        type: 'chooseReward',
        reward: step.canRemoveEffect && rng.next() < 0.5 ? 'remove_effect' : 'remove_penalty_fields',
      };
    case 'switcheroo_pool':
      return {
        type: 'switcherooPool',
        categoryId: step.categoryIds[randInt(rng, 0, step.categoryIds.length - 1)] ?? '',
      };
    case 'switcheroo_folder':
      return {
        type: 'switcherooFolder',
        folderId: step.folderIds[randInt(rng, 0, step.folderIds.length - 1)] ?? '',
      };
    case 'task':
      return step.tierable
        ? { type: 'confirm', tier: randInt(rng, 1, 3) as StrokeTier }
        : { type: 'confirm' };
    default:
      return { type: 'confirm' };
  }
}

/** Plain checks (not expect) – called after every event, so it must be cheap. Returns a violation or null. */
function invariantViolation(state: SessionState): string | null {
  const goals = state.cards.filter((card) => card.kind === 'goal');
  if (goals.length !== 1 || goals[0]?.field !== state.goalField) return 'goal card and goalField disagree';
  if (state.cards.some((card, index) => card.field !== index + 1)) return 'card field/index mismatch';
  if (state.position < 1 || state.position > 100) return 'position out of range';
  if (state.phase !== 'resolve_card' && state.pending.length > 0) return 'pending steps outside resolve_card';
  if (state.phase === 'resolve_card' && state.pending.length === 0) return 'resolve_card without steps';
  const collected = state.cards.filter((card) => card.kind === 'collectible' && card.collected).length;
  if (collected !== state.collected) return 'collected counter and cards disagree';
  if (state.cards.some((card) => card.kind === 'collectible' && card.collected && !card.discovered))
    return 'collected but undiscovered';
  if (state.forcedDirection !== null && state.phase !== 'roll' && state.phase !== 'choose_direction')
    return 'forced direction outside a move';
  return null;
}

describe(`engine fuzz – ${GAMES} random games`, () => {
  it(
    'never rejects a valid event and keeps the session consistent',
    () => {
      const endings = { win: 0, mistress: 0, endEarly: 0, stuck: 0 };
      let totalEvents = 0;
      for (let seed = 1; seed <= GAMES; seed++) {
        const rng = createRng(seed * 7919);
        const game = readyToRoll({ seed, goalValue: randInt(rng, 1, 100) });
        const { context } = game;
        let state = game.session;
        let events = 0;
        while (state.phase !== 'final_wheel' && state.phase !== 'ended' && events < MAX_EVENTS_PER_GAME) {
          const event = randomEvent(state, rng);
          const result = reduce(state, event, context);
          if (result.error === 'direction_blocked' && event.type === 'chooseDirection') {
            state = run(state, context, {
              type: 'chooseDirection',
              direction: event.direction === 'left' ? 'right' : 'left',
            });
          } else {
            if (result.error)
              throw new Error(
                `seed ${seed}: ${event.type} rejected (${result.error}) in ${state.phase}/${head(state)?.kind ?? '-'}`,
              );
            state = result.state;
          }
          const violation = invariantViolation(state);
          if (violation) throw new Error(`seed ${seed} after ${event.type}: ${violation}`);
          events++;
        }
        if (state.phase === 'final_wheel') endings.win++;
        else if (state.endReason === 'mistress_says_no') endings.mistress++;
        else if (state.endReason === 'ended_early') endings.endEarly++;
        else endings.stuck++;
        totalEvents += events;
      }
      console.log(`fuzz endings ${JSON.stringify(endings)}, avg events ${(totalEvents / GAMES).toFixed(0)}`);
      expect(endings.stuck).toBe(0);
      expect(endings.win).toBeGreaterThan(GAMES / 2);
    },
    FUZZ_TIMEOUT_MS,
  );
});
