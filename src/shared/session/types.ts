import type { ActionId } from '../actions';
import type { Group } from '../game';

/** Inclusive integer or float range. */
export type Range = readonly [number, number];

/** game-design §6.4 – configurable per action (admin, AP9). Group is derived from the id. */
export interface ActionConfig {
  id: ActionId;
  enabled: boolean;
  weight: number;
  minPerSession: number;
  /** null = unlimited */
  maxPerSession: number | null;
  /** Rolled once per session; failing excludes the action (rare actions). */
  sessionChance?: number;
  /** Any-of dependency: only eligible if one of these is present in the session. */
  requires?: readonly ActionId[];
  /** Action-specific values, rolled when the action triggers (AP4). */
  params: Readonly<Record<string, number | Range>>;
}

export type ActionRetrigger = 'always' | 'once';
export type ActionHintMode = 'off' | 'total' | 'split' | 'split_by_side';

/** game-design §6 session generation rules. All values are admin-configurable. */
export interface SessionRules {
  wheelRange: Range;
  initialTaskRange: Range;
  startJitter: number;
  minGoalDistance: number;
  categoriesPerSession: Readonly<Record<Group, number>>;
  cooldownSessions: number;
  freshnessBonus: number;
  freshnessCap: number;
  allowReroll: boolean;
  actionCardCount: Range;
  /** 'linked' = use progression.goodChance */
  actionGoodShare: 'linked' | number;
  startProtection: number;
  goalProtection: number;
  minActionGap: number;
  imageRecencySessions: number;
  actionRetrigger: ActionRetrigger;
  consumedTaskRange: Range;
  actionHint: ActionHintMode;
}

/** game-design §15 – persisted between sessions. */
export interface Progression {
  goodChance: number;
  penaltyFields: number[];
  lastDecayAt: string | null;
  lossStreak: number;
  lockoutUntil: string | null;
  blockedActionsNextSession: ActionId[];
  categoryUsage: Record<string, { lastUsedSessionIndex: number; timesUsed: number }>;
  /** image hash → index of the last session it was shown in */
  imageRecency: Record<string, number>;
  /** Number of sessions started so far; the next session gets index sessionCounter + 1. */
  sessionCounter: number;
}

export type CardKind = 'normal' | 'action' | 'goal';

/** game-design §20 */
export interface Card {
  /** 1..100 */
  field: number;
  kind: CardKind;
  group?: Group;
  folderId?: string;
  /** undefined on action cards = built-in neutral action design */
  imageHash?: string;
  taskCount?: number;
  action?: ActionId;
  actionConsumed?: boolean;
  discovered: boolean;
  splatterSeed?: number;
}

export type SessionPhase =
  | 'initial_task'
  | 'resolve_card'
  | 'roll'
  | 'choose_direction'
  | 'moving'
  | 'win_check'
  | 'final_wheel'
  | 'outcome'
  | 'ended';

export type EffectType =
  | 'double_trouble'
  | 'pace_slow'
  | 'pace_fast'
  | 'u_turn'
  | 'pixelate'
  | 'splatter'
  | 'success_multiplier'
  | 'shield';

export interface ActiveEffect {
  id: string;
  type: EffectType;
  remainingRounds?: number;
  /** multiplier, pixel level, blocked direction (-1 / 1) */
  value?: number;
}

/** Session state as created by the generator; the engine (AP4) evolves it. */
export interface SessionState {
  id: string;
  seed: number;
  /** RNG state after generation – the engine continues from here. */
  rngState: number;
  sessionIndex: number;
  startedAt: string;
  goalValue: number;
  goalField: number;
  startField: number;
  position: number;
  initialTaskCount: number;
  categories: Record<Group, string[]>;
  /** null = all eligible action folders of the group */
  activeActionFolders: Record<Group, string | null>;
  cards: Card[];
  effects: ActiveEffect[];
  round: number;
  phase: SessionPhase;
}
