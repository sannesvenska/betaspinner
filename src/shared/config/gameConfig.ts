import { DEFAULT_DRAFT_CONFIG, type DraftConfig, type DraftFieldType } from '../draft';
import { DEFAULT_PENALTY_RULES, DEFAULT_SESSION_RULES } from '../session/defaults';
import type { CollectibleTier, PenaltyRules, Range, SessionRules } from '../session/types';

/**
 * game-design §16 – admin-configurable game values (AP10). One declarative field list per section drives
 * validation (renderer: inline errors) and normalization (main: clamp + fallback), so both never disagree.
 */

/** game-design §12.4: block size per pixelate level 1..n as fraction of the image's short side. */
export interface VisualEffectsConfig {
  pixelBlockFractions: number[];
}

export const PIXELATE_LEVELS = 5;
export const DEFAULT_VISUAL_EFFECTS: VisualEffectsConfig = {
  pixelBlockFractions: [0.012, 0.022, 0.035, 0.05, 0.075],
};
const BLOCK_FRACTION_BOUNDS: Range = [0.002, 0.2];

/**
 * game-design §6.7 beta mode: a switchable variant to compare against the normal game. While enabled it
 * overrides parts of the rules and the draft at runtime (`effectiveGameConfig`); the base values stay.
 */
export interface BetaConfig {
  active: boolean;
  /** Exact number of performer cards, visible on the ring from the start */
  visibleCollectibles: number;
  /** Pixelate levels removed on the first landing on a performer card */
  collectiblePixelateRelief: number;
  /** Draft field mix in beta mode */
  draftComposition: Record<DraftFieldType, number>;
  /** Share of the cards splattered per revealed splash field */
  splashShare: number;
}

export const DEFAULT_BETA_CONFIG: BetaConfig = {
  active: false,
  visibleCollectibles: 5,
  collectiblePixelateRelief: 1,
  draftComposition: { pixelate: 6, splash: 3, bad: 2, good: 0, double: 1 },
  splashShare: 0.3,
};

export interface GameConfig {
  rules: SessionRules;
  penalties: PenaltyRules;
  visualEffects: VisualEffectsConfig;
  /** game-design §6.0 session draft */
  draft: DraftConfig;
  /** game-design §6.7 beta mode */
  beta: BetaConfig;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  rules: DEFAULT_SESSION_RULES,
  penalties: DEFAULT_PENALTY_RULES,
  visualEffects: DEFAULT_VISUAL_EFFECTS,
  draft: DEFAULT_DRAFT_CONFIG,
  beta: DEFAULT_BETA_CONFIG,
};

const compositionSize = (composition: Record<DraftFieldType, number>): number =>
  Object.values(composition).reduce((total, count) => total + count, 0);

/** The config the game actually plays with: the beta values replace their base counterparts. */
export function effectiveGameConfig(game: GameConfig): GameConfig {
  const { beta } = game;
  if (!beta.active) return game;
  const fieldCount = compositionSize(beta.draftComposition);
  return {
    ...game,
    rules: {
      ...game.rules,
      collectibleCount: [beta.visibleCollectibles, beta.visibleCollectibles],
      collectiblesVisible: true,
      collectiblePixelateRelief: beta.collectiblePixelateRelief,
      betaMode: true,
    },
    draft: {
      ...game.draft,
      enabled: true,
      composition: beta.draftComposition,
      fieldCount,
      picks: Math.min(game.draft.picks, fieldCount),
      splashShare: beta.splashShare,
    },
  };
}

export type FieldKind =
  'int' | 'float' | 'percent' | 'range' | 'boolean' | 'select' | 'optionalInt' | 'goodShare';

export interface FieldSpec {
  /** Key in the section object; nested keys use a dot (`categoriesPerSession.good`). */
  key: string;
  kind: FieldKind;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
  /** Admin grouping inside the section (i18n `admin.group.<group>`). */
  group: string;
}

const int = (key: string, group: string, min: number, max: number): FieldSpec => ({
  key,
  kind: 'int',
  group,
  min,
  max,
  step: 1,
});
const float = (key: string, group: string, min: number, max: number, step: number): FieldSpec => ({
  key,
  kind: 'float',
  group,
  min,
  max,
  step,
});
const range = (key: string, group: string, min: number, max: number, step = 1): FieldSpec => ({
  key,
  kind: 'range',
  group,
  min,
  max,
  step,
});

/** game-design §6 / §8 / §9.4 / §14 session rules. `collectibleTiers` has its own editor. */
export const SESSION_RULE_FIELDS: readonly FieldSpec[] = [
  range('wheelRange', 'setup', 1, 100),
  int('startJitter', 'setup', 0, 25),
  int('minGoalDistance', 'setup', 0, 50),
  range('categoriesPerSession.good', 'categories', 1, 10),
  range('categoriesPerSession.bad', 'categories', 1, 10),
  int('cooldownSessions', 'categories', 0, 20),
  float('freshnessBonus', 'categories', 0, 5, 0.1),
  int('freshnessCap', 'categories', 0, 50),
  { key: 'allowReroll', kind: 'boolean', group: 'categories' },
  range('actionCardCount', 'actions', 0, 40),
  { key: 'actionGoodShare', kind: 'goodShare', group: 'actions', min: 0, max: 1, step: 0.05 },
  range('actionPoolSize', 'actions', 1, 30),
  int('startProtection', 'actions', 0, 10),
  int('goalProtection', 'actions', 0, 10),
  int('minActionGap', 'actions', 1, 5),
  { key: 'actionRetrigger', kind: 'select', group: 'actions', options: ['once', 'always'] },
  range('consumedTaskRange', 'actions', 1, 200),
  {
    key: 'actionHint',
    kind: 'select',
    group: 'actions',
    options: ['off', 'total', 'split', 'split_by_side'],
  },
  int('imageRecencySessions', 'categories', 0, 20),
  float('chancePerDiscovered', 'release', 0.1, 2, 0.05),
  range('winChanceBounds', 'release', 0, 100),
  int('holdSecondsCap', 'release', 5, 300),
  int('detourConversion', 'board', 0, 10),
  { key: 'maxDetourConversions', kind: 'optionalInt', group: 'board', min: 0, max: 100, step: 1 },
  range('goalDriftRange', 'board', 1, 30),
  int('goalDriftWidenStep', 'board', 1, 10),
  int('goalDriftMaxDistance', 'board', 1, 50),
  int('strokeTierMax', 'board', 1, 3),
  { key: 'forcedReversalChance', kind: 'percent', group: 'board', min: 0, max: 1, step: 0.01 },
];

/** Performer section (§6.3, §9.4) – part of the session rules. */
export const PERFORMER_RULE_FIELDS: readonly FieldSpec[] = [
  range('collectibleCount', 'performer', 0, 20),
  range('collectibleRevisitTaskRange', 'performer', 1, 200),
];

/** game-design §6.0 session draft. */
export const DRAFT_FIELDS: readonly FieldSpec[] = [
  { key: 'enabled', kind: 'boolean', group: 'draft' },
  int('fieldCount', 'draft', 2, 24),
  int('picks', 'draft', 1, 24),
  int('composition.bad', 'draftFields', 0, 24),
  int('composition.good', 'draftFields', 0, 24),
  int('composition.pixelate', 'draftFields', 0, 24),
  int('composition.splash', 'draftFields', 0, 24),
  int('composition.double', 'draftFields', 0, 24),
  { key: 'goodShift', kind: 'percent', group: 'draftEffects', min: 0, max: 1, step: 0.01 },
  { key: 'badShift', kind: 'percent', group: 'draftEffects', min: 0, max: 1, step: 0.01 },
  int('pixelateLevels.one', 'draftEffects', 0, PIXELATE_LEVELS),
  int('pixelateLevels.two', 'draftEffects', 0, PIXELATE_LEVELS),
  int('pixelateLevels.three', 'draftEffects', 0, PIXELATE_LEVELS),
  float('winMultiplier', 'draftEffects', 1, 5, 0.5),
  { key: 'splashShare', kind: 'percent', group: 'draftEffects', min: 0, max: 1, step: 0.05 },
];

/** game-design §6.7 beta mode. */
export const BETA_FIELDS: readonly FieldSpec[] = [
  { key: 'active', kind: 'boolean', group: 'beta' },
  int('visibleCollectibles', 'betaPerformer', 0, 20),
  int('collectiblePixelateRelief', 'betaPerformer', 0, PIXELATE_LEVELS),
  int('draftComposition.pixelate', 'betaDraft', 0, 24),
  int('draftComposition.splash', 'betaDraft', 0, 24),
  int('draftComposition.bad', 'betaDraft', 0, 24),
  int('draftComposition.good', 'betaDraft', 0, 24),
  int('draftComposition.double', 'betaDraft', 0, 24),
  { key: 'splashShare', kind: 'percent', group: 'betaDraft', min: 0, max: 1, step: 0.05 },
];

/** game-design §13 / §14.3. */
export const PENALTY_RULE_FIELDS: readonly FieldSpec[] = [
  int('lockoutMinutes', 'penalties', 0, 1440),
  int('penaltyStep', 'penalties', 0, 20),
  int('maxPenaltyFields', 'penalties', 0, 100),
  int('decayAmount', 'penalties', 0, 50),
  int('successRemoveFields', 'rewards', 0, 40),
  int('partialRemoveFields', 'rewards', 0, 40),
  float('goodChanceStep', 'goodChance', 0, 0.2, 0.01),
  range('goodChanceBounds', 'goodChance', 0, 1, 0.01),
];

export const MAX_COLLECTIBLE_TIERS = 6;
const TIER_COLLECTED_BOUNDS: Range = [1, 20];
const TIER_CONVERT_BOUNDS: Range = [0, 30];
const TIER_PERCENT_BOUNDS: Range = [0, 50];
/** Action + collectible cards: ~90 free fields with `minActionGap` 2 fit about 45 non-adjacent cards. */
const MAX_SPECIAL_CARDS = 45;
const MIN_DRAFT_FIELDS = 2;

/** Error codes shown as i18n `admin.error.<code>`. */
export type FieldError =
  | 'required'
  | 'integer'
  | 'tooSmall'
  | 'tooLarge'
  | 'minAboveMax'
  | 'notAscending'
  | 'tooManySpecial'
  | 'driftMax'
  | 'compositionSum'
  | 'picksAboveFields'
  | 'compositionTooSmall';
export type FieldErrors = Record<string, FieldError>;

// --- generic access to (nested) keys ---

type Section = Record<string, unknown>;

export function getField(section: object, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (value, part) => (typeof value === 'object' && value !== null ? (value as Section)[part] : undefined),
      section,
    );
}

export function setField<T extends object>(section: T, key: string, value: unknown): T {
  const [head, ...rest] = key.split('.');
  if (head === undefined) return section;
  const current = section as Section;
  if (rest.length === 0) return { ...section, [head]: value };
  const child = current[head];
  const nested = typeof child === 'object' && child !== null ? child : {};
  return { ...section, [head]: setField(nested, rest.join('.'), value) };
}

// --- validation ---

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function numberError(spec: FieldSpec, value: unknown): FieldError | null {
  if (!isNumber(value)) return 'required';
  if (
    (spec.kind === 'int' || spec.kind === 'range' || spec.kind === 'optionalInt') &&
    spec.step === 1 &&
    !Number.isInteger(value)
  )
    return 'integer';
  if (spec.min !== undefined && value < spec.min) return 'tooSmall';
  if (spec.max !== undefined && value > spec.max) return 'tooLarge';
  return null;
}

/** Errors per key (range fields may report `<key>.0` / `<key>.1` / `<key>`). */
export function validateFields(section: object, fields: readonly FieldSpec[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const spec of fields) {
    const value = getField(section, spec.key);
    switch (spec.kind) {
      case 'boolean':
        if (typeof value !== 'boolean') errors[spec.key] = 'required';
        break;
      case 'select':
        if (typeof value !== 'string' || !spec.options?.includes(value)) errors[spec.key] = 'required';
        break;
      case 'goodShare':
        if (value !== 'linked') {
          const error = numberError(spec, value);
          if (error) errors[spec.key] = error;
        }
        break;
      case 'optionalInt':
        if (value !== null) {
          const error = numberError(spec, value);
          if (error) errors[spec.key] = error;
        }
        break;
      case 'range': {
        const pair = Array.isArray(value) ? value : [];
        const minError = numberError(spec, pair[0]);
        const maxError = numberError(spec, pair[1]);
        if (minError) errors[`${spec.key}.0`] = minError;
        if (maxError) errors[`${spec.key}.1`] = maxError;
        if (!minError && !maxError && (pair[0] as number) > (pair[1] as number))
          errors[spec.key] = 'minAboveMax';
        break;
      }
      default: {
        const error = numberError(spec, value);
        if (error) errors[spec.key] = error;
      }
    }
  }
  return errors;
}

export function validateCollectibleTiers(tiers: readonly CollectibleTier[]): FieldErrors {
  const errors: FieldErrors = {};
  tiers.forEach((tier, index) => {
    const collectedError = numberError(
      {
        key: '',
        kind: 'int',
        group: '',
        step: 1,
        min: TIER_COLLECTED_BOUNDS[0],
        max: TIER_COLLECTED_BOUNDS[1],
      },
      tier.collected,
    );
    if (collectedError) errors[`collectibleTiers.${index}.collected`] = collectedError;
    const [min, max] = tier.bonus.type === 'convert_bad' ? TIER_CONVERT_BOUNDS : TIER_PERCENT_BOUNDS;
    const amount = tier.bonus.type === 'convert_bad' ? tier.bonus.count : tier.bonus.percent;
    const amountError = numberError({ key: '', kind: 'int', group: '', step: 1, min, max }, amount);
    if (amountError) errors[`collectibleTiers.${index}.amount`] = amountError;
    const previous = tiers[index - 1];
    if (previous && !collectedError && tier.collected <= previous.collected)
      errors[`collectibleTiers.${index}.collected`] = 'notAscending';
  });
  return errors;
}

export function validateSessionRules(rules: SessionRules): FieldErrors {
  const errors: FieldErrors = {
    ...validateFields(rules, SESSION_RULE_FIELDS),
    ...validateFields(rules, PERFORMER_RULE_FIELDS),
    ...validateCollectibleTiers(rules.collectibleTiers),
  };
  if (!errors.actionCardCount && !errors.collectibleCount) {
    const special = rules.actionCardCount[1] + rules.collectibleCount[1];
    if (special > MAX_SPECIAL_CARDS) errors.actionCardCount = 'tooManySpecial';
  }
  if (
    !errors.goalDriftMaxDistance &&
    !errors.goalDriftRange &&
    rules.goalDriftMaxDistance < rules.goalDriftRange[1]
  )
    errors.goalDriftMaxDistance = 'driftMax';
  return errors;
}

export const validatePenaltyRules = (penalties: PenaltyRules): FieldErrors =>
  validateFields(penalties, PENALTY_RULE_FIELDS);

export function validateDraft(draft: DraftConfig): FieldErrors {
  const errors = validateFields(draft, DRAFT_FIELDS);
  const sum = compositionSize(draft.composition);
  if (!errors.fieldCount && sum !== draft.fieldCount) errors.fieldCount = 'compositionSum';
  if (!errors.picks && !errors.fieldCount && draft.picks > draft.fieldCount)
    errors.picks = 'picksAboveFields';
  return errors;
}

/** The beta draft needs at least two fields; the pick count comes from the draft section. */
export function validateBeta(beta: BetaConfig): FieldErrors {
  const errors = validateFields(beta, BETA_FIELDS);
  if (!errors['draftComposition.pixelate'] && compositionSize(beta.draftComposition) < MIN_DRAFT_FIELDS)
    errors['draftComposition.pixelate'] = 'compositionTooSmall';
  return errors;
}

export function validateVisualEffects(effects: VisualEffectsConfig): FieldErrors {
  const errors: FieldErrors = {};
  const spec: FieldSpec = {
    key: '',
    kind: 'float',
    group: '',
    min: BLOCK_FRACTION_BOUNDS[0],
    max: BLOCK_FRACTION_BOUNDS[1],
  };
  effects.pixelBlockFractions.forEach((fraction, index) => {
    const error = numberError(spec, fraction);
    if (error) errors[`pixelBlockFractions.${index}`] = error;
    const previous = effects.pixelBlockFractions[index - 1];
    if (!error && previous !== undefined && fraction <= previous)
      errors[`pixelBlockFractions.${index}`] = 'notAscending';
  });
  return errors;
}

// --- normalization (main process: stored data → always valid config) ---

const clamp = (value: number, min = -Infinity, max = Infinity): number => Math.min(max, Math.max(min, value));
const snap = (spec: FieldSpec, value: number): number =>
  spec.step === 1 ? Math.round(clamp(value, spec.min, spec.max)) : clamp(value, spec.min, spec.max);

function normalizeField(spec: FieldSpec, value: unknown, fallback: unknown): unknown {
  switch (spec.kind) {
    case 'boolean':
      return typeof value === 'boolean' ? value : fallback;
    case 'select':
      return typeof value === 'string' && spec.options?.includes(value) ? value : fallback;
    case 'goodShare':
      return value === 'linked' ? value : isNumber(value) ? snap(spec, value) : fallback;
    case 'optionalInt':
      return value === null ? null : isNumber(value) ? snap(spec, value) : fallback;
    case 'range': {
      if (!Array.isArray(value) || !isNumber(value[0]) || !isNumber(value[1])) return fallback;
      const a = snap(spec, value[0]);
      const b = snap(spec, value[1]);
      return a <= b ? [a, b] : [b, a];
    }
    default:
      return isNumber(value) ? snap(spec, value) : fallback;
  }
}

function normalizeSection<T extends object>(value: unknown, defaults: T, fields: readonly FieldSpec[]): T {
  const source = typeof value === 'object' && value !== null ? value : {};
  return fields.reduce<T>(
    (section, spec) =>
      setField(
        section,
        spec.key,
        normalizeField(spec, getField(source, spec.key), getField(defaults, spec.key)),
      ),
    defaults,
  );
}

function normalizeTiers(value: unknown): CollectibleTier[] {
  if (!Array.isArray(value)) return [...DEFAULT_SESSION_RULES.collectibleTiers];
  const tiers = value.flatMap((entry): CollectibleTier[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { collected, bonus } = entry as {
      collected?: unknown;
      bonus?: { type?: unknown; count?: unknown; percent?: unknown };
    };
    if (!isNumber(collected) || typeof bonus !== 'object') return [];
    const at = Math.round(clamp(collected, ...TIER_COLLECTED_BOUNDS));
    if (bonus.type === 'convert_bad' && isNumber(bonus.count))
      return [
        {
          collected: at,
          bonus: { type: 'convert_bad', count: Math.round(clamp(bonus.count, ...TIER_CONVERT_BOUNDS)) },
        },
      ];
    if (bonus.type === 'release_chance' && isNumber(bonus.percent))
      return [
        {
          collected: at,
          bonus: {
            type: 'release_chance',
            percent: Math.round(clamp(bonus.percent, ...TIER_PERCENT_BOUNDS)),
          },
        },
      ];
    return [];
  });
  // Ascending, unique thresholds
  return tiers
    .sort((a, b) => a.collected - b.collected)
    .filter((tier, index, list) => index === 0 || tier.collected !== list[index - 1]?.collected)
    .slice(0, MAX_COLLECTIBLE_TIERS);
}

export function normalizeSessionRules(value: unknown): SessionRules {
  const rules = normalizeSection(value, DEFAULT_SESSION_RULES, [
    ...SESSION_RULE_FIELDS,
    ...PERFORMER_RULE_FIELDS,
  ]);
  const source = typeof value === 'object' && value !== null ? (value as Section) : {};
  return {
    ...rules,
    goalDriftMaxDistance: Math.max(rules.goalDriftMaxDistance, rules.goalDriftRange[1]),
    collectibleTiers:
      'collectibleTiers' in source ? normalizeTiers(source.collectibleTiers) : rules.collectibleTiers,
  };
}

export const normalizePenaltyRules = (value: unknown): PenaltyRules =>
  normalizeSection(value, DEFAULT_PENALTY_RULES, PENALTY_RULE_FIELDS);

/** The field count always equals the composition; picks never exceed it. */
export function normalizeDraft(value: unknown): DraftConfig {
  const draft = normalizeSection(value, DEFAULT_DRAFT_CONFIG, DRAFT_FIELDS);
  const sum = compositionSize(draft.composition);
  if (sum < MIN_DRAFT_FIELDS) return DEFAULT_DRAFT_CONFIG;
  return { ...draft, fieldCount: sum, picks: Math.min(draft.picks, sum) };
}

export function normalizeBeta(value: unknown): BetaConfig {
  const beta = normalizeSection(value, DEFAULT_BETA_CONFIG, BETA_FIELDS);
  return compositionSize(beta.draftComposition) < MIN_DRAFT_FIELDS
    ? { ...beta, draftComposition: DEFAULT_BETA_CONFIG.draftComposition }
    : beta;
}

export function normalizeVisualEffects(value: unknown): VisualEffectsConfig {
  const fractions =
    typeof value === 'object' && value !== null ? (value as Section).pixelBlockFractions : undefined;
  if (!Array.isArray(fractions) || fractions.length !== PIXELATE_LEVELS || !fractions.every(isNumber))
    return DEFAULT_VISUAL_EFFECTS;
  const clamped = fractions.map((fraction) => clamp(fraction, ...BLOCK_FRACTION_BOUNDS));
  // Levels must grow; otherwise fall back rather than guess
  return clamped.every((fraction, index) => index === 0 || fraction > (clamped[index - 1] ?? 0))
    ? { pixelBlockFractions: clamped }
    : DEFAULT_VISUAL_EFFECTS;
}

export const hasErrors = (errors: FieldErrors): boolean => Object.keys(errors).length > 0;

/** Validation for one admin section (IPC `config:updateGame`). */
export function validateGameSection(
  update:
    | { section: 'rules'; value: SessionRules }
    | { section: 'penalties'; value: PenaltyRules }
    | { section: 'visualEffects'; value: VisualEffectsConfig }
    | { section: 'draft'; value: DraftConfig }
    | { section: 'beta'; value: BetaConfig },
): FieldErrors {
  switch (update.section) {
    case 'rules':
      return validateSessionRules(update.value);
    case 'penalties':
      return validatePenaltyRules(update.value);
    case 'visualEffects':
      return validateVisualEffects(update.value);
    case 'draft':
      return validateDraft(update.value);
    case 'beta':
      return validateBeta(update.value);
  }
}

// --- folders and action cards (admin editors) ---

/** game-design §5.2 folder properties; `shareWeight` only for content folders. */
export const FOLDER_FIELDS: readonly FieldSpec[] = [
  int('selectionWeight', 'folder', 1, 100),
  int('shareWeight', 'folder', 1, 100),
  range('taskRange', 'folder', 1, 500),
  int('minImages', 'folder', 1, 1000),
  { key: 'unmaskedEffectBehavior', kind: 'select', group: 'folder', options: ['full', 'none'] },
];

/** game-design §6.4 / §10.4 card fields; `sessionChance` (null = no gate) has its own editor. */
export const ACTION_CARD_FIELDS: readonly FieldSpec[] = [
  int('weight', 'card', 0, 100),
  int('minPerSession', 'card', 0, 50),
  { key: 'maxPerSession', kind: 'optionalInt', group: 'card', min: 1, max: 50, step: 1 },
];

/** Bounds per action param key (§10.1 / §10.2). Unknown keys are only checked for finiteness. */
export const ACTION_PARAM_BOUNDS: Readonly<Record<string, { min: number; max: number; step: number }>> = {
  holdSeconds: { min: 1, max: 600, step: 1 },
  seconds: { min: 1, max: 600, step: 1 },
  count: { min: 1, max: 500, step: 1 },
  taskCount: { min: 1, max: 500, step: 1 },
  cardCount: { min: 1, max: 99, step: 1 },
  rounds: { min: 1, max: 30, step: 1 },
  multiplier: { min: 1, max: 10, step: 0.5 },
  multiplierStep: { min: 0.1, max: 5, step: 0.1 },
  alternatives: { min: 1, max: 10, step: 1 },
  safetyZone: { min: 0, max: 50, step: 1 },
  shieldEnabled: { min: 0, max: 1, step: 1 },
  splatterShare: { min: 0.05, max: 1, step: 0.05 },
};

export function validateActionCard(card: {
  weight: number;
  minPerSession: number;
  maxPerSession: number | null;
  sessionChance: number | null;
  params: Readonly<Record<string, number | Range>>;
}): FieldErrors {
  const errors = validateFields(card, ACTION_CARD_FIELDS);
  if (card.sessionChance !== null) {
    const error = numberError({ key: '', kind: 'percent', group: '', min: 0, max: 1 }, card.sessionChance);
    if (error) errors.sessionChance = error;
  }
  if (!errors.maxPerSession && card.maxPerSession !== null && card.minPerSession > card.maxPerSession)
    errors.minPerSession = 'minAboveMax';
  for (const [key, value] of Object.entries(card.params)) {
    const bounds = ACTION_PARAM_BOUNDS[key];
    const spec: FieldSpec = {
      key: `params.${key}`,
      kind: Array.isArray(value) ? 'range' : 'float',
      group: '',
      ...bounds,
    };
    Object.assign(errors, validateFields({ params: card.params }, [spec]));
  }
  return errors;
}
