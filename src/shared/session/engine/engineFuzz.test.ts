import { describe, expect, it } from 'vitest';
import { createRng, randInt, type Rng } from '../rng';
import { folder, mediaFor } from '../testFixtures';
import type { SessionState } from '../types';
import { head, landOnAction, readyToRoll, run } from './engineTestKit';
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
        pool: step.pools[randInt(rng, 0, step.pools.length - 1)] ?? 'good_content',
      };
    case 'switcheroo_folder':
      return {
        type: 'switcherooFolder',
        folderId: step.folderIds[randInt(rng, 0, step.folderIds.length - 1)] ?? '',
      };
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
        while (state.phase !== 'win_check' && state.phase !== 'ended' && events < MAX_EVENTS_PER_GAME) {
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
        if (state.phase === 'win_check') endings.win++;
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

describe('Switcheroo action pools (§10.3)', () => {
  it('swaps only action cards the new folder allows and reports X of Y', () => {
    const extraFolder = folder('act-bad-2', 'bad', 'action', { allowedActions: ['pixelate'] });
    const base = readyToRoll();
    const folders = [...base.input.folders, extraFolder];
    const media = [...base.input.media, ...mediaFor('act-bad-2', 20)];
    const { session, context } = readyToRoll({ folders, media });

    let state = landOnAction(session, context, 'switcheroo');
    const poolStep = head(state);
    if (poolStep?.kind !== 'switcheroo_pool') throw new Error('expected pool choice');
    expect(poolStep.pools).toContain('bad_action');

    const hidden = state.cards.filter(
      (card) => card.kind === 'action' && card.group === 'bad' && !card.discovered,
    );
    const allowed = hidden.filter((card) => card.action === 'pixelate');
    state = run(state, context, { type: 'switcherooPool', pool: 'bad_action' });
    const folderStep = head(state);
    if (folderStep?.kind !== 'switcheroo_folder') throw new Error('expected folder choice');
    expect(folderStep.folderIds).toEqual(expect.arrayContaining(['act-bad-2']));
    state = run(state, context, { type: 'switcherooFolder', folderId: 'act-bad-2' });

    expect(head(state)).toMatchObject({
      kind: 'notice',
      notice: { type: 'switcheroo_done', changed: allowed.length, total: hidden.length },
    });
    expect(state.activeActionFolders.bad).toBe('act-bad-2');
    // Action types never change
    const actionsBefore = hidden.map((card) => card.action);
    const actionsAfter = state.cards
      .filter((card) => card.kind === 'action' && card.group === 'bad' && !card.discovered)
      .map((card) => card.action);
    expect(actionsAfter).toEqual(actionsBefore);
  });
});
