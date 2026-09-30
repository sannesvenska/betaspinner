import type { ActionId } from '../../actions';
import { actionGroup } from '../../actions';
import { DEFAULT_PIXELATE_MAX_LEVEL } from '../defaults';
import { generateSession, type GenerateSessionInput } from '../generateSession';
import { standardInput } from '../testFixtures';
import { wrapField } from '../track';
import type { Card, SessionState } from '../types';
import type { EngineContext } from './context';
import { reduce, type EngineEvent } from './reduce';

export function contextFor(input: GenerateSessionInput): EngineContext {
  return {
    rules: input.rules,
    actionCards: input.actionCards,
    folders: input.folders,
    media: input.media,
    imageRecency: input.progression.imageRecency,
    pixelateMaxLevel: DEFAULT_PIXELATE_MAX_LEVEL,
  };
}

export function setup(overrides: Partial<GenerateSessionInput> = {}) {
  const input = standardInput(overrides);
  const context = contextFor(input);
  const { session } = generateSession(input);
  return { input, context, session };
}

/** Dispatches events and fails loudly on engine errors. */
export function run(state: SessionState, context: EngineContext, ...events: EngineEvent[]): SessionState {
  return events.reduce((current, event) => {
    const result = reduce(current, event, context);
    if (result.error) throw new Error(`${event.type} rejected: ${result.error} (phase ${current.phase})`);
    return result.state;
  }, state);
}

/** Session in the `roll` phase (initial task and start card done). */
export function readyToRoll(overrides: Partial<GenerateSessionInput> = {}) {
  const base = setup(overrides);
  const session = run(base.session, base.context, { type: 'confirm' }, { type: 'confirm' });
  return { ...base, session };
}

export function withCard(state: SessionState, card: Partial<Card> & { field: number }): SessionState {
  const cards = state.cards.map((existing) =>
    existing.field === card.field ? { ...existing, ...card } : existing,
  );
  return { ...state, cards };
}

/** Places an undiscovered action card one field to the right and moves onto it. */
export function landOnAction(state: SessionState, context: EngineContext, action: ActionId): SessionState {
  const target = wrapField(state.position + 1);
  const prepared = withCard(
    {
      ...state,
      phase: 'roll',
      chooseNextRoll: true,
      forcedDirection: null,
      goalField: wrapField(state.position + 50),
    },
    {
      field: target,
      kind: 'action',
      action,
      actionCardId: action,
      group: actionGroup(action),
      discovered: false,
    },
  );
  // Keep the goal card consistent with goalField
  const goalFixed = prepared.cards.map((card) =>
    card.kind === 'goal' && card.field !== prepared.goalField
      ? { ...card, kind: 'normal' as const, group: 'good' as const, folderId: 'good-a', taskCount: 5 }
      : card,
  );
  goalFixed[prepared.goalField - 1] = { field: prepared.goalField, kind: 'goal', discovered: false };
  return run(
    { ...prepared, cards: goalFixed },
    context,
    { type: 'chooseRoll', value: 1 },
    { type: 'chooseDirection', direction: 'right' },
  );
}

export const head = (state: SessionState) => state.pending[0];
