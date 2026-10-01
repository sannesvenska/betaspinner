import type { ActionId } from '../actions';
import type { ActionArtImage } from '../content';
import type { DraftOutcome, DraftState } from '../draft';
import type { Group } from '../game';

/** Inclusive integer or float range. */
export type Range = readonly [number, number];

/**
 * game-design §10.4 – one uniquely defined action card (admin-configurable, AP10).
 * `type` selects the resolver; the group is derived from it. Built-ins use their type as id.
 */
export interface ActionCardDefinition {
  id: string;
  type: ActionId;
  builtIn: boolean;
  /** null = i18n `action.<type>.name` */
  name: string | null;
  /** null = i18n `action.<type>.description` */
  description: string | null;
  /** null = built-in neutral action design */
  image: ActionArtImage | null;
  enabled: boolean;
  weight: number;
  minPerSession: number;
  /** null = unlimited */
  maxPerSession: number | null;
  /** Rolled once per session; failing excludes the card (rare actions). null = no gate. */
  sessionChance: number | null;
  /** Any-of dependency on resolver types that must be in the session's action pool. */
  requires?: readonly ActionId[];
  /** Type-specific values, rolled when the card triggers. */
  params: Readonly<Record<string, number | Range>>;
}

export type ActionRetrigger = 'always' | 'once';
export type ActionHintMode = 'off' | 'total' | 'split' | 'split_by_side';

/** game-design §9.4 bonus tier of the performer collection; each tier triggers once. */
export type CollectibleBonus =
  { type: 'convert_bad'; count: number } | { type: 'release_chance'; percent: number };

export interface CollectibleTier {
  collected: number;
  bonus: CollectibleBonus;
}

/** game-design §6 session generation rules. All values are admin-configurable. */
export interface SessionRules {
  wheelRange: Range;
  startJitter: number;
  minGoalDistance: number;
  /** Rolled per session and group (§6.2 v2) */
  categoriesPerSession: Readonly<Record<Group, Range>>;
  cooldownSessions: number;
  freshnessBonus: number;
  freshnessCap: number;
  allowReroll: boolean;
  actionCardCount: Range;
  /** 'linked' = use progression.goodChance */
  actionGoodShare: 'linked' | number;
  /** Distinct action card definitions per session (§6.4 v2) */
  actionPoolSize: Range;
  startProtection: number;
  goalProtection: number;
  minActionGap: number;
  imageRecencySessions: number;
  actionRetrigger: ActionRetrigger;
  consumedTaskRange: Range;
  actionHint: ActionHintMode;
  /** game-design §14.1 clamp for the final chance in percent */
  winChanceBounds: Range;
  /** Release chance in percent per discovered card (§14.1 v2) */
  chancePerDiscovered: number;
  /** Percentage points lost per revisited good field that turns bad (§8.5, §14.1) */
  revisitChancePenalty: number;
  /** Final wheel Hold Position countdown cap in seconds (§14.2 v2) */
  holdSecondsCap: number;
  /** Bad → good conversions per detour (§8.4) */
  detourConversion: number;
  /** null = unlimited converted cards per session */
  maxDetourConversions: number | null;
  /** Goal drift on overshoot: target distance from the current goal (§8.8) */
  goalDriftRange: Range;
  goalDriftWidenStep: number;
  goalDriftMaxDistance: number;
  /** Stroke tiers on normal cards (§8.6); max 1 disables them */
  strokeTierMax: number;
  /** Chance per roll that only the reverse direction is allowed (§8.7) */
  forcedReversalChance: number;
  /** Performer collectibles (§6.3, §9.4) */
  collectibleCount: Range;
  collectibleRevisitTaskRange: Range;
  collectibleTiers: readonly CollectibleTier[];
  /** Pixelate levels removed when a collectible is collected for the first time (§9.4) */
  collectiblePixelateRelief: number;
}

/** game-design §13 / §14.3 – admin-configurable (AP10). */
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
  /** Action card definition ids */
  blockedActionsNextSession: string[];
  /** Content and performer folders */
  categoryUsage: Record<string, { lastUsedSessionIndex: number; timesUsed: number }>;
  /** image hash → index of the last session it was shown in */
  imageRecency: Record<string, number>;
  /** Number of sessions started so far; the next session gets index sessionCounter + 1. */
  sessionCounter: number;
  /** Written together with the outcome, so closing a session twice never applies it twice. */
  lastAppliedSessionId: string | null;
  /** Session draft in progress (§6.0) – kept until a session actually starts */
  pendingDraft: DraftState | null;
}

export type CardKind = 'normal' | 'action' | 'goal' | 'collectible';

/** game-design §20 */
export interface Card {
  /** 1..100 */
  field: number;
  kind: CardKind;
  /** normal and action cards; collectibles have no group */
  group?: Group;
  folderId?: string;
  /** undefined on action cards = built-in neutral action design */
  imageHash?: string;
  taskCount?: number;
  /** Resolver type of an action card (denormalized from its definition) */
  action?: ActionId;
  /** Action card definition id (§10.4) */
  actionCardId?: string;
  actionConsumed?: boolean;
  /** Collectible already collected (first landing) */
  collected?: boolean;
  discovered: boolean;
  splatterSeed?: number;
}

export type SessionPhase =
  | 'initial_task'
  | 'resolve_card'
  | 'roll'
  | 'choose_direction'
  | 'moving'
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
export type StrokeTier = 1 | 2 | 3;
export type ConversionSource = 'detour' | 'redemption' | 'collectible';

/** Acknowledge-only messages shown in the task bar. */
export type Notice =
  | { type: 'effect_applied'; effect: EffectType; value?: number; rounds?: number }
  | { type: 'effects_cleared'; effects: EffectType[] }
  | { type: 'effect_removed'; effect: EffectType }
  | { type: 'nothing_to_remove' }
  | { type: 'shield_blocked'; action: ActionId; actionCardId: string }
  | { type: 'decision_maker' }
  | { type: 'guess_result'; numbers: readonly [number, number]; roll: number; match: boolean }
  | { type: 'goal_moved'; from: number; to: number }
  | { type: 'goal_drifted'; from: number; to: number }
  | { type: 'player_moved'; from: number; to: number }
  | { type: 'relocation_skipped' }
  | { type: 'cards_converted'; count: number; source: ConversionSource }
  | { type: 'nothing_to_convert' }
  | { type: 'collectible_tier'; collected: number; bonus: CollectibleBonus }
  | { type: 'pixelate_relief'; level: number }
  | { type: 'splatter_cleaned'; count: number }
  | { type: 'switcheroo_done'; categoryId: string; folderId: string; changed: number; total: number }
  | { type: 'switcheroo_unavailable' }
  | { type: 'penalty_fields_removed'; count: number };

/** Follow-up executed automatically when a task step is confirmed (safety zone rolled at trigger). */
export type TaskFollowUp = { kind: 'teleport_goal' | 'move_player'; safetyZone: number };

/** One unit of card resolution; the head of `pending` is what the player sees now. */
export type ResolutionStep =
  | {
      kind: 'task';
      count: number;
      pace: Pace | null;
      followUp?: TaskFollowUp;
      /** Normal cards: the player picks a stroke tier (§8.6) */
      tierable?: boolean;
      /** Revisit: the field turned into a bad card (§8.5) or a collected card shows a plain task (§9.4) */
      revisit?: 'converted' | 'collectible';
      /** Release chance points this revisit cost (a good field turned bad, §8.5) */
      revisitPenalty?: number;
    }
  | { kind: 'hold'; seconds: number; thenPickEffect: boolean }
  | { kind: 'timed_task'; seconds: number; pace: Pace | null }
  | {
      kind: 'pick_effect';
      options: EffectType[];
      /** Freshen Up: choosing splatter cleans only this share of the splattered cards */
      splatterShare?: number;
    }
  | { kind: 'notice'; notice: Notice }
  | { kind: 'guess' }
  | { kind: 'choose_reward'; canRemoveEffect: boolean }
  | { kind: 'switcheroo_pool'; categoryIds: string[]; alternatives: number }
  | { kind: 'switcheroo_folder'; categoryId: string; folderIds: string[] };

/** Why a session ended – also the outcome recorded in history (game-design §17). */
export type EndReason =
  'success' | 'interrupted' | 'no_result' | 'denied' | 'ended_early' | 'mistress_says_no';

export type RewardChoice = 'remove_penalty_fields' | 'increase_good_chance' | 'block_bad_action';
export type Reward =
  | { type: 'remove_penalty_fields' }
  | { type: 'increase_good_chance' }
  | { type: 'block_bad_action'; actionCardId: string; action: ActionId };

/** game-design §14.1 v2 – deterministic release chance, shown live during the session. */
export interface ReleaseChance {
  discovered: number;
  /** Percent per discovered card */
  rate: number;
  /** discovered × rate, percent (unrounded) */
  base: number;
  /** Collectible tier bonus in percent */
  bonus: number;
  /** Revisited good fields that turned bad (§8.5) */
  revisits: number;
  /** revisits × penalty, percent */
  penalty: number;
  /** Hail Mary success multiplier */
  multiplier: number;
  /** Draft "double the win chance" factor (§6.0), stacks with Hail Mary */
  draftMultiplier: number;
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
  /** Per resolver type */
  actionsTriggered: Partial<Record<ActionId, number>>;
  /** Per action card definition id */
  actionCardsTriggered: Record<string, number>;
  maxPixelLevel: number;
  switches: { group: Group; from: string; to: string }[];
  /** Cards converted bad → good by detours (§8.4) */
  detourConversions: number;
  detours: number;
  /** Revisited fields turned bad (§8.5) */
  revisitConversions: number;
  /** Of those, fields that were good – each costs release chance (§14.1) */
  revisitPenalties: number;
  goalDrifts: number;
  forcedReversals: number;
  /** Confirmed normal-card tasks per stroke tier, index 0 = ×1 */
  strokeTiers: number[];
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
  /** Rules this session was generated with (admin changes apply to the next session, AP10). */
  rules: SessionRules;
  /** The category selection was rerolled once on the briefing (`allowReroll`). */
  rerolled: boolean;
  /** Result of the session draft (§6.0); null = no draft */
  draft: DraftOutcome | null;
  /** Release chance factor from the draft (1 = none); Bad Luck never removes it */
  draftMultiplier: number;
  categories: Record<Group, string[]>;
  /** Performer folder of this session (§6.2.1); null = no collectibles */
  performerFolderId: string | null;
  /** Action card definition ids that can appear in this session (§6.4 v2) */
  actionPool: string[];
  cards: Card[];
  effects: ActiveEffect[];
  round: number;
  phase: SessionPhase;
  /** Resolution queue of the current card; head = current step. */
  pending: ResolutionStep[];
  /** Snapshot of the card being resolved (before a consumed action card is converted). */
  reveal: Card | null;
  /** Sum of the last roll (or the chosen value) */
  lastRoll: number | null;
  /** Individual dice of the last roll; empty for a chosen value */
  lastDice: number[];
  /** Dice for the next roll, set by the stroke tier (§8.6) */
  nextDice: number;
  /** Decision Maker: the next move uses a chosen value instead of a roll. */
  chooseNextRoll: boolean;
  /** Forced reversal (§8.7): the only allowed direction for the current move */
  forcedDirection: Direction | null;
  /** Round of the last forced reversal – never two in a row */
  lastForcedRound: number | null;
  lastMove: { from: number; to: number; direction: Direction; steps: number } | null;
  /** Collectibles collected (first landings) */
  collected: number;
  /** `collected` thresholds of the tiers already granted */
  reachedTiers: number[];
  endReason: EndReason | null;
  /** Progression changes earned during the session, applied at session end (AP6). */
  penaltyFieldsRemoved: number;
  winCheck: ReleaseChance | null;
  finalWheel: FinalWheel | null;
  reward: Reward | null;
  stats: SessionStats;
}
