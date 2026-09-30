import type { Group } from './game';

export const GOOD_ACTION_IDS = [
  'clearing_edges',
  'good_fairy',
  'decision_maker',
  'cleaning_lady',
  'hail_mary',
  'switcheroo',
  'redemption',
] as const;

export const BAD_ACTION_IDS = [
  'pixelate',
  'splatter',
  'squeeze_task',
  'edge_and_hold',
  'double_trouble',
  'mistress_says_no',
  'guessing_game',
  'goal_teleport',
  'u_turn',
  'moving_day',
  'highperformer',
  'bad_luck',
  'take_it_slow',
  'speed_it_up',
] as const;

/** Resolver type of an action card (game-design §10). Several card definitions may share one type (§10.4). */
export type ActionId = (typeof GOOD_ACTION_IDS)[number] | (typeof BAD_ACTION_IDS)[number];

export const ACTION_IDS: readonly ActionId[] = [...GOOD_ACTION_IDS, ...BAD_ACTION_IDS];

export const actionGroup = (id: ActionId): Group =>
  (GOOD_ACTION_IDS as readonly string[]).includes(id) ? 'good' : 'bad';
