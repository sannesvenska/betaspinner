import type { FolderConfig, MediaEntry } from '../content';
import type { DraftOutcome } from '../draft';
import type { Group } from '../game';
import { assignActionSlots } from './assignActionSlots';
import { placeStart } from './goalAndStart';
import { createImageBag, type ImageBag } from './imageBags';
import { placeActions } from './placeActions';
import { createRng, randInt, shuffle, type Rng } from './rng';
import { cardGroup, selectActionPool } from './selectActionPool';
import { selectCategories } from './selectCategories';
import { ALL_FIELDS, TRACK_LENGTH, wrapField } from './track';
import type {
  ActionCardDefinition,
  Card,
  Progression,
  SessionRules,
  SessionState,
  SessionStats,
} from './types';

const GROUPS: readonly Group[] = ['good', 'bad'];
const STROKE_TIER_SLOTS = 3;
const SPLATTER_SEED_MAX = 2 ** 31 - 1;

export type GenerationErrorCode = 'no_good_category' | 'no_bad_category';

export class GenerationError extends Error {
  constructor(readonly code: GenerationErrorCode) {
    super(`Session generation failed: ${code}`);
    this.name = 'GenerationError';
  }
}

export interface GenerateSessionInput {
  seed: number;
  sessionId: string;
  /** ISO timestamp */
  now: string;
  /** Start wheel result = Goal Field and initial task count (game-design §6.1) */
  goalValue: number;
  /** Session draft result (§6.0): good share of the normal cards, start pixelate, win factor */
  draft?: DraftOutcome | null;
  rules: SessionRules;
  actionCards: readonly ActionCardDefinition[];
  folders: readonly FolderConfig[];
  media: readonly MediaEntry[];
  progression: Progression;
}

export interface GenerateSessionResult {
  session: SessionState;
  /** Progression.categoryUsage including the picked categories – persist when the session starts. */
  categoryUsage: Progression['categoryUsage'];
}

/** Largest-remainder split of `total` by `weights` (sums exactly to total). */
export function allocateByWeight(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (sum <= 0) return weights.map((_, index) => (index === 0 ? total : 0));
  const exact = weights.map((weight) => (total * weight) / sum);
  const counts = exact.map(Math.floor);
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest);
  const missing = total - counts.reduce((acc, count) => acc + count, 0);
  for (let i = 0; i < missing; i++) {
    const target = order[i % order.length]?.index ?? 0;
    counts[target] = (counts[target] ?? 0) + 1;
  }
  return counts;
}

function mediaByFolder(media: readonly MediaEntry[]): Map<string, MediaEntry[]> {
  const byFolder = new Map<string, MediaEntry[]>();
  for (const entry of media) {
    const list = byFolder.get(entry.folderId) ?? [];
    list.push(entry);
    byFolder.set(entry.folderId, list);
  }
  return byFolder;
}

export const emptyStats = (): SessionStats => ({
  rolls: 0,
  tasksPerformed: 0,
  holdTasks: 0,
  holdSeconds: 0,
  actionsTriggered: {},
  actionCardsTriggered: {},
  maxPixelLevel: 0,
  switches: [],
  detourConversions: 0,
  detours: 0,
  revisitConversions: 0,
  revisitPenalties: 0,
  goalDrifts: 0,
  forcedReversals: 0,
  strokeTiers: Array<number>(STROKE_TIER_SLOTS).fill(0),
});

const rollCount = (rng: Rng, [min, max]: readonly [number, number]): number =>
  randInt(rng, Math.round(min), Math.round(max));

/**
 * game-design §6 – pure and deterministic: the same input always yields the same session.
 * Throws GenerationError when a group has no eligible content category.
 */
export function generateSession(input: GenerateSessionInput): GenerateSessionResult {
  const { rules, progression } = input;
  const rng = createRng(input.seed);
  const sessionIndex = progression.sessionCounter + 1;
  const byFolder = mediaByFolder(input.media);
  const folderById = new Map(input.folders.map((folder) => [folder.id, folder]));
  const imageCount = (id: string) => byFolder.get(id)?.length ?? 0;
  const selectionBase = { usage: progression.categoryUsage, sessionIndex, rules };

  // §6.1 goal, start; the initial task count equals the wheel value (v2)
  const goalField = wrapField(input.goalValue);
  const startField = placeStart(rng, goalField, rules);

  // §6.2 categories (count rolled per group)
  const categories = {} as Record<Group, string[]>;
  for (const group of GROUPS) {
    const candidates = input.folders.filter(
      (folder) =>
        folder.role === 'content' &&
        folder.group === group &&
        folder.enabled &&
        imageCount(folder.id) >= folder.minImages,
    );
    const picked = selectCategories(rng, {
      ...selectionBase,
      candidates,
      count: rollCount(rng, rules.categoriesPerSession[group]),
    });
    if (picked.length === 0)
      throw new GenerationError(group === 'good' ? 'no_good_category' : 'no_bad_category');
    categories[group] = picked;
  }

  // §6.2.1 performer – needs enough images for every collectible
  const performerCandidates = input.folders.filter(
    (folder) =>
      folder.role === 'performer' &&
      folder.enabled &&
      imageCount(folder.id) >= Math.max(folder.minImages, rules.collectibleCount[1]),
  );
  const performerFolderId =
    selectCategories(rng, { ...selectionBase, candidates: performerCandidates, count: 1 })[0] ?? null;

  // §6.3 composition
  const plannedActions = rollCount(rng, rules.actionCardCount);
  const goodShare = rules.actionGoodShare === 'linked' ? progression.goodChance : rules.actionGoodShare;
  const plannedGood = Math.round(plannedActions * goodShare);
  const collectibleCount = performerFolderId ? rollCount(rng, rules.collectibleCount) : 0;

  // §6.4 action pool, then slots (unfillable slots become normal cards); Freshen Up is beta-only (§6.7)
  const pool = selectActionPool(rng, {
    cards: rules.betaMode
      ? input.actionCards
      : input.actionCards.filter((card) => card.type !== 'freshen_up'),
    blocked: progression.blockedActionsNextSession,
    size: rules.actionPoolSize,
  });
  const slots = assignActionSlots(rng, {
    slotCounts: { good: plannedGood, bad: plannedActions - plannedGood },
    pool,
  });
  const actionCardIds = [...slots.good, ...slots.bad];

  // §6.5 placement: actions and collectibles share the stratified slots
  const specialFields = shuffle(
    rng,
    placeActions(rng, {
      startField,
      goalField,
      count: actionCardIds.length + collectibleCount,
      rules,
    }),
  );
  const collectibleFields = new Set(specialFields.slice(0, collectibleCount));
  const shuffledActions = shuffle(rng, actionCardIds);
  const actionByField = new Map(
    specialFields.slice(collectibleCount).flatMap((field, index) => {
      const id = shuffledActions[index];
      return id === undefined ? [] : [[field, id] as const];
    }),
  );

  const normalFields = ALL_FIELDS.filter(
    (field) => field !== goalField && !actionByField.has(field) && !collectibleFields.has(field),
  );
  // §6.0: the draft sets the normal good share; action cards stay linked to the progression good chance
  const goodNormalCount = Math.round(
    normalFields.length * (input.draft?.goodShare ?? progression.goodChance),
  );
  const shuffledNormal = shuffle(rng, normalFields);
  const normalGroup = new Map<number, Group>(
    shuffledNormal.map((field, index) => [field, index < goodNormalCount ? 'good' : 'bad']),
  );

  // §6.6 images – one bag per content category and one for the performer
  const usedHashes = new Set<string>();
  const bagFor = (folderId: string): ImageBag =>
    createImageBag(rng, {
      entries: byFolder.get(folderId) ?? [],
      imageRecency: progression.imageRecency,
      sessionIndex,
      recencySessions: rules.imageRecencySessions,
      usedHashes,
    });
  const categoryBags = new Map<string, ImageBag>();
  for (const id of [...categories.good, ...categories.bad]) categoryBags.set(id, bagFor(id));
  const performerBag = performerFolderId ? bagFor(performerFolderId) : undefined;

  // Folder per normal card, split by shareWeight when a group has several categories
  const folderForField = new Map<number, string>();
  for (const group of GROUPS) {
    const fields = ALL_FIELDS.filter((field) => normalGroup.get(field) === group);
    const ids = categories[group];
    const counts = allocateByWeight(
      fields.length,
      ids.map((id) => folderById.get(id)?.shareWeight ?? 1),
    );
    const assignment = shuffle(
      rng,
      ids.flatMap((id, index) => Array<string>(counts[index] ?? 0).fill(id)),
    );
    fields.forEach((field, index) => {
      folderForField.set(field, assignment[index] as string);
    });
  }

  const cardById = new Map(input.actionCards.map((card) => [card.id, card]));
  const context: CardContext = {
    goalField,
    startField,
    actionByField,
    cardById,
    collectibleFields,
    performer: performerFolderId ? folderById.get(performerFolderId) : undefined,
    performerBag,
    normalGroup,
    folderForField,
    folderById,
    categoryBags,
  };
  const builtCards: Card[] = ALL_FIELDS.map((field) => buildCard(rng, field, context));
  // §6.7 draft splash: a share of the cards starts splattered (a normal, removable splatter effect)
  const splatterTargets = new Set(
    shuffle(
      rng,
      builtCards.filter((card) => card.kind !== 'goal').map((card) => card.field),
    ).slice(0, Math.round((input.draft?.splatterShare ?? 0) * (TRACK_LENGTH - 1))),
  );
  const cards = builtCards.map((card) =>
    splatterTargets.has(card.field) ? { ...card, splatterSeed: randInt(rng, 1, SPLATTER_SEED_MAX) } : card,
  );

  const startPixelate = input.draft?.pixelLevel ?? 0;
  const categoryUsage: Progression['categoryUsage'] = { ...progression.categoryUsage };
  const usedFolders = [
    ...categories.good,
    ...categories.bad,
    ...(performerFolderId ? [performerFolderId] : []),
  ];
  for (const id of usedFolders) {
    categoryUsage[id] = {
      lastUsedSessionIndex: sessionIndex,
      timesUsed: (categoryUsage[id]?.timesUsed ?? 0) + 1,
    };
  }

  return {
    session: {
      id: input.sessionId,
      seed: input.seed,
      rngState: rng.state,
      sessionIndex,
      startedAt: input.now,
      goalValue: input.goalValue,
      goalField,
      startField,
      position: startField,
      initialTaskCount: input.goalValue,
      rules,
      rerolled: false,
      draft: input.draft ?? null,
      draftMultiplier: input.draft?.winMultiplier ?? 1,
      categories,
      performerFolderId,
      actionPool: pool.map((card) => card.id),
      cards,
      // §6.0 start pixelate: a normal, removable pixelate effect
      effects: [
        ...(startPixelate > 0
          ? [{ id: 'pixelate', type: 'pixelate', value: startPixelate, createdRound: 0 } as const]
          : []),
        ...(splatterTargets.size > 0 ? [{ id: 'splatter', type: 'splatter', createdRound: 0 } as const] : []),
      ],
      round: 0,
      phase: 'initial_task',
      pending: [],
      reveal: null,
      lastRoll: null,
      lastDice: [],
      nextDice: 1,
      chooseNextRoll: false,
      forcedDirection: null,
      lastForcedRound: null,
      lastMove: null,
      collected: 0,
      reachedTiers: [],
      endReason: null,
      penaltyFieldsRemoved: 0,
      winCheck: null,
      finalWheel: null,
      reward: null,
      stats: { ...emptyStats(), maxPixelLevel: startPixelate },
    },
    categoryUsage,
  };
}

interface CardContext {
  goalField: number;
  startField: number;
  actionByField: ReadonlyMap<number, string>;
  cardById: ReadonlyMap<string, ActionCardDefinition>;
  collectibleFields: ReadonlySet<number>;
  performer: FolderConfig | undefined;
  performerBag: ImageBag | undefined;
  normalGroup: ReadonlyMap<number, Group>;
  folderForField: ReadonlyMap<number, string>;
  folderById: ReadonlyMap<string, FolderConfig>;
  categoryBags: ReadonlyMap<string, ImageBag>;
}

const rollTasks = (rng: Rng, folder: FolderConfig | undefined): number => {
  const [minTasks, maxTasks] = folder?.taskRange ?? [1, 1];
  return randInt(rng, minTasks, maxTasks);
};

function buildCard(rng: Rng, field: number, context: CardContext): Card {
  const discovered = field === context.startField;
  if (field === context.goalField) return { field, kind: 'goal', discovered: false };

  const actionCardId = context.actionByField.get(field);
  const definition = actionCardId ? context.cardById.get(actionCardId) : undefined;
  if (definition) {
    const group = cardGroup(definition);
    // No image → built-in neutral action design (game-design §6.3)
    return {
      field,
      kind: 'action',
      group,
      action: definition.type,
      actionCardId: definition.id,
      ...(definition.image ? { imageHash: definition.image.hash } : {}),
      discovered,
    };
  }

  if (context.collectibleFields.has(field) && context.performer) {
    const entry = context.performerBag?.draw();
    return {
      field,
      kind: 'collectible',
      folderId: context.performer.id,
      ...(entry ? { imageHash: entry.hash } : {}),
      taskCount: rollTasks(rng, context.performer),
      discovered,
    };
  }

  const group = context.normalGroup.get(field) ?? 'bad';
  const folderId = context.folderForField.get(field) as string;
  const entry = context.categoryBags.get(folderId)?.draw();
  return {
    field,
    kind: 'normal',
    group,
    folderId,
    ...(entry ? { imageHash: entry.hash } : {}),
    taskCount: rollTasks(rng, context.folderById.get(folderId)),
    discovered,
  };
}
