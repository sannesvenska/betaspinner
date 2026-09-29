import type { ActionId } from '../actions';
import type { ActionConfig, Progression, SessionRules } from './types';

/** game-design §6 defaults. */
export const DEFAULT_SESSION_RULES: SessionRules = {
  wheelRange: [1, 100],
  initialTaskRange: [10, 40],
  startJitter: 15,
  minGoalDistance: 25,
  categoriesPerSession: { good: 1, bad: 1 },
  cooldownSessions: 2,
  freshnessBonus: 0.5,
  freshnessCap: 6,
  allowReroll: false,
  actionCardCount: [14, 22],
  actionGoodShare: 'linked',
  startProtection: 2,
  goalProtection: 2,
  minActionGap: 2,
  imageRecencySessions: 3,
  actionRetrigger: 'once',
  consumedTaskRange: [6, 20],
  actionHint: 'split_by_side',
};

/** game-design §12.4: blockSizes has 6 entries → levels 0..5. Configurable with visual effects (AP8/AP9). */
export const DEFAULT_PIXELATE_MAX_LEVEL = 5;

/** game-design §13, §15 defaults. */
export const GOOD_CHANCE_BOUNDS = [0.2, 0.7] as const;

export const DEFAULT_PROGRESSION: Progression = {
  goodChance: 0.4,
  penaltyFields: [],
  lastDecayAt: null,
  lossStreak: 0,
  lockoutUntil: null,
  blockedActionsNextSession: [],
  categoryUsage: {},
  imageRecency: {},
  sessionCounter: 0,
};

const action = (
  id: ActionId,
  weight: number,
  params: ActionConfig['params'] = {},
  extra: Partial<ActionConfig> = {},
): ActionConfig => ({
  id,
  enabled: true,
  weight,
  minPerSession: 0,
  maxPerSession: null,
  params,
  ...extra,
});

/** game-design §10 action catalog with default weights and params. */
export const DEFAULT_ACTIONS: readonly ActionConfig[] = [
  // Good
  action('clearing_edges', 20, { holdSeconds: [15, 35] }),
  action('good_fairy', 15, { shieldEnabled: 1 }),
  action('decision_maker', 20),
  action('cleaning_lady', 15, {}, { requires: ['pixelate', 'splatter'] }),
  action('hail_mary', 10, { multiplier: [1.5, 3], multiplierStep: 0.5 }),
  action('switcheroo', 10, { alternatives: 3 }),
  // Bad
  action('pixelate', 15),
  action('splatter', 10, { cardCount: [3, 10] }),
  action('squeeze_task', 12, { count: [5, 20] }),
  action('edge_and_hold', 12, { holdSeconds: [15, 35] }),
  action('double_trouble', 10, { rounds: [2, 8] }),
  action('mistress_says_no', 100, {}, { sessionChance: 0.05, maxPerSession: 1 }),
  action('guessing_game', 8),
  action('goal_teleport', 5, { taskCount: [15, 35], safetyZone: 12 }),
  action('u_turn', 8, { rounds: [2, 4] }),
  action('moving_day', 5, { taskCount: [15, 35], safetyZone: 12 }),
  action('highperformer', 8, { seconds: [5, 15] }),
  action('bad_luck', 5, {}, { requires: ['hail_mary'] }),
  action('take_it_slow', 6, { rounds: [2, 5] }),
  action('speed_it_up', 6, { rounds: [2, 5] }),
];
