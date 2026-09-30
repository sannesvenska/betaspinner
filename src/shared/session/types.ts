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
  /** game-design §14.1 clamp for the final chance in percent */
  winChanceBounds: Range;
}

/** game-design §13 / §14.3 – admin-configurable (AP9). */
export interface PenaltyRules {
  lockoutMinutes: number;
  /** Fields added per loss = step × loss streak */
  penaltyStep: number;
  maxPenaltyFields: number;
  /** Fields removed per full hour */
  decayAmount: number;
  goodChanceStep: number;
  goodChanceBounds: Range;
  successRemoveFields: number;
  partialRemoveFields: number;
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
  /** Written together with the outcome, so closing a session twice never applies it twice. */
  lastAppliedSessionId: string | null;
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
  /** One instance per type, so the type doubles as id. */
  id: EffectType;
  type: EffectType;
  remainingRounds?: number;
  /** multiplier, pixel level or blocked direction (-1 left / 1 right) */
  value?: number;
  /** Round in which the effect was created or refreshed – it starts ticking after this round (§8.2). */
  createdRound: number;
}

/** left = counter-clockwise (-1), right = clockwise (+1) */
export type Direction = 'left' | 'right';
export type Pace = 'slow' | 'fast';
export type SwitcherooPool = 'good_content' | 'bad_content' | 'good_action' | 'bad_action';

/** Acknowledge-only messages shown in the task bar. */
export type Notice =
  | { type: 'effect_applied'; effect: EffectType; value?: number; rounds?: number }
  | { type: 'effects_cleared'; effects: EffectType[] }
  | { type: 'effect_removed'; effect: EffectType }
  | { type: 'nothing_to_remove' }
  | { type: 'shield_blocked'; action: ActionId }
  | { type: 'decision_maker' }
  | { type: 'guess_result'; numbers: readonly [number, number]; roll: number; match: boolean }
  | { type: 'goal_moved'; from: number; to: number }
  | { type: 'player_moved'; from: number; to: number }
  | { type: 'relocation_skipped' }
  | { type: 'switcheroo_done'; pool: SwitcherooPool; folderId: string; changed: number; total: number }
  | { type: 'switcheroo_unavailable' }
  | { type: 'penalty_fields_removed'; count: number };

/** Follow-up executed automatically when a task step is confirmed. */
export type TaskFollowUp = 'teleport_goal' | 'move_player';

/** One unit of card resolution; the head of `pending` is what the player sees now. */
export type ResolutionStep =
  | { kind: 'task'; count: number; pace: Pace | null; followUp?: TaskFollowUp }
  | { kind: 'hold'; seconds: number; thenPickEffect: boolean }
  | { kind: 'timed_task'; seconds: number; pace: Pace | null }
  | { kind: 'pick_effect'; options: EffectType[] }
  | { kind: 'notice'; notice: Notice }
  | { kind: 'guess' }
  | { kind: 'choose_reward'; canRemoveEffect: boolean }
  | { kind: 'switcheroo_pool'; pools: SwitcherooPool[] }
  | { kind: 'switcheroo_folder'; pool: SwitcherooPool; folderIds: string[] };

/** Why a session ended – also the outcome recorded in history (game-design §17). */
export type EndReason =
  'success' | 'interrupted' | 'no_result' | 'denied' | 'ended_early' | 'mistress_says_no';

export type RewardChoice = 'remove_penalty_fields' | 'increase_good_chance' | 'block_bad_action';
export type Reward =
  | { type: 'remove_penalty_fields' }
  | { type: 'increase_good_chance' }
  | { type: 'block_bad_action'; action: ActionId };

/** game-design §14.1 */
export interface WinCheck {
  discovered: number;
  roll: number;
  baseChance: number;
  multiplier: number;
  finalChance: number;
}

/** Decided when the wheel starts (§14.2); the animation is choreographed to it. */
export interface FinalWheel {
  result: 'allowed' | 'denied';
  /** 0..1 position inside the winning area where the pointer stops */
  landing: number;
  holdSeconds: number;
}

export interface SessionStats {
  rolls: number;
  /** Sum of confirmed task counts (incl. initial task) */
  tasksPerformed: number;
  holdTasks: number;
  holdSeconds: number;
  actionsTriggered: Partial<Record<ActionId, number>>;
  maxPixelLevel: number;
  switches: { pool: SwitcherooPool; from: string | null; to: string }[];
}

/** Session state as created by the generator and evolved by the engine (`reduce`). */
export interface SessionState {
  id: string;
  seed: number;
  /** RNG state – every engine step continues from here (deterministic reloads). */
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
  /** Resolution queue of the current card; head = current step. */
  pending: ResolutionStep[];
  /** Snapshot of the card being resolved (before a consumed action card is converted). */
  reveal: Card | null;
  lastRoll: number | null;
  /** Decision Maker: the next move uses a chosen value instead of a roll. */
  chooseNextRoll: boolean;
  lastMove: { from: number; to: number; direction: Direction; steps: number } | null;
  endReason: EndReason | null;
  /** Progression changes earned during the session, applied at session end (AP6). */
  penaltyFieldsRemoved: number;
  winCheck: WinCheck | null;
  finalWheel: FinalWheel | null;
  reward: Reward | null;
  stats: SessionStats;
}
