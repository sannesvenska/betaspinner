import type { ActionId } from '../actions';
import type { ActionCardDefinition, PenaltyRules, Progression, SessionRules } from './types';

/** game-design §6 defaults. */
export const DEFAULT_SESSION_RULES: SessionRules = {
  wheelRange: [1, 100],
  startJitter: 15,
  minGoalDistance: 25,
  categoriesPerSession: { good: [2, 3], bad: [2, 3] },
  cooldownSessions: 2,
  freshnessBonus: 0.5,
  freshnessCap: 6,
  allowReroll: false,
  actionCardCount: [14, 22],
  actionGoodShare: 'linked',
  actionPoolSize: [8, 10],
  startProtection: 2,
  goalProtection: 2,
  minActionGap: 2,
  imageRecencySessions: 3,
  actionRetrigger: 'once',
  consumedTaskRange: [6, 20],
  actionHint: 'split_by_side',
  winChanceBounds: [1, 95],
  chancePerDiscovered: 0.4,
  holdSecondsCap: 60,
  detourConversion: 2,
  maxDetourConversions: null,
  goalDriftRange: [3, 8],
  goalDriftWidenStep: 4,
  goalDriftMaxDistance: 20,
  strokeTierMax: 3,
  forcedReversalChance: 0.1,
  collectibleCount: [6, 8],
  collectibleRevisitTaskRange: [10, 25],
  collectibleTiers: [
    { collected: 3, bonus: { type: 'convert_bad', count: 5 } },
    { collected: 4, bonus: { type: 'release_chance', percent: 5 } },
    { collected: 5, bonus: { type: 'release_chance', percent: 10 } },
  ],
};

/** game-design §13, §14.3 defaults. */
export const DEFAULT_PENALTY_RULES: PenaltyRules = {
  lockoutMinutes: 15,
  penaltyStep: 2,
  maxPenaltyFields: 40,
  decayAmount: 2,
  goodChanceStep: 0.03,
  goodChanceBounds: [0.2, 0.7],
  successRemoveFields: 4,
  partialRemoveFields: 2,
};

/** game-design §12.4: blockSizes has 6 entries → levels 0..5. Configurable with visual effects (AP8/AP10). */
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
  lastAppliedSessionId: null,
};

const builtIn = (
  type: ActionId,
  weight: number,
  params: ActionCardDefinition['params'] = {},
  extra: Partial<ActionCardDefinition> = {},
): ActionCardDefinition => ({
  id: type,
  type,
  builtIn: true,
  name: null,
  description: null,
  image: null,
  enabled: true,
  weight,
  minPerSession: 0,
  maxPerSession: null,
  params,
  ...extra,
});

/** game-design §10 / §10.4: one built-in action card per resolver type with default weights and params. */
export const DEFAULT_ACTION_CARDS: readonly ActionCardDefinition[] = [
  // Good
  builtIn('clearing_edges', 20, { holdSeconds: [15, 35] }),
  builtIn('good_fairy', 15, { shieldEnabled: 1 }),
  builtIn('decision_maker', 20),
  builtIn('cleaning_lady', 15, {}, { requires: ['pixelate', 'splatter'] }),
  builtIn('hail_mary', 10, { multiplier: [1.5, 3], multiplierStep: 0.5 }),
  builtIn('switcheroo', 10, { alternatives: 3 }),
  builtIn('redemption', 10, { count: [3, 5] }),
  // Bad
  builtIn('pixelate', 15),
  builtIn('splatter', 10, { cardCount: [3, 10] }),
  builtIn('squeeze_task', 12, { count: [5, 20] }),
  builtIn('edge_and_hold', 12, { holdSeconds: [15, 35] }),
  builtIn('double_trouble', 10, { rounds: [2, 8] }),
  builtIn('mistress_says_no', 100, {}, { sessionChance: 0.05, maxPerSession: 1 }),
  builtIn('guessing_game', 8),
  builtIn('goal_teleport', 5, { taskCount: [15, 35], safetyZone: 12 }),
  builtIn('u_turn', 8, { rounds: [2, 4] }),
  builtIn('moving_day', 5, { taskCount: [15, 35], safetyZone: 12 }),
  builtIn('highperformer', 8, { seconds: [5, 15] }),
  builtIn('bad_luck', 5, {}, { requires: ['hail_mary'] }),
  builtIn('take_it_slow', 6, { rounds: [2, 5] }),
  builtIn('speed_it_up', 6, { rounds: [2, 5] }),
];
