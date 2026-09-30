import { actionGroup, type ActionId } from '../actions';
import type { FolderConfig, MediaEntry } from '../content';
import type { Group } from '../game';
import { assignActionSlots } from './assignActionSlots';
import { placeStart } from './goalAndStart';
import { createImageBag, type ImageBag } from './imageBags';
import { placeActions } from './placeActions';
import { createRng, randInt, shuffle, type Rng } from './rng';
import { selectCategories } from './selectCategories';
import { ALL_FIELDS, wrapField } from './track';
import type { ActionConfig, Card, Progression, SessionRules, SessionState } from './types';

const GROUPS: readonly Group[] = ['good', 'bad'];

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
  /** Start wheel result = Goal Field (game-design §6.1) */
  goalValue: number;
  rules: SessionRules;
  actions: readonly ActionConfig[];
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
  for (let i = 0; i < total - counts.reduce((acc, count) => acc + count, 0); i++) {
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
  const usedHashes = new Set<string>();

  // §6.1 goal, start, initial task
  const goalField = wrapField(input.goalValue);
  const startField = placeStart(rng, goalField, rules);
  const initialTaskCount = randInt(rng, rules.initialTaskRange[0], rules.initialTaskRange[1]);

  // §6.2 categories
  const categories = {} as Record<Group, string[]>;
  for (const group of GROUPS) {
    const candidates = input.folders.filter(
      (folder) =>
        folder.role === 'content' &&
        folder.group === group &&
        folder.enabled &&
        (byFolder.get(folder.id)?.length ?? 0) >= folder.minImages,
    );
    const picked = selectCategories(rng, {
      candidates,
      count: rules.categoriesPerSession[group],
      usage: progression.categoryUsage,
      sessionIndex,
      rules,
    });
    if (picked.length === 0)
      throw new GenerationError(group === 'good' ? 'no_good_category' : 'no_bad_category');
    categories[group] = picked;
  }

  // §6.3 composition
  const plannedActions = randInt(rng, rules.actionCardCount[0], rules.actionCardCount[1]);
  const goodShare = rules.actionGoodShare === 'linked' ? progression.goodChance : rules.actionGoodShare;
  const plannedGood = Math.round(plannedActions * goodShare);

  // §6.4 action types (unfillable slots become normal cards)
  const slots = assignActionSlots(rng, {
    slotCounts: { good: plannedGood, bad: plannedActions - plannedGood },
    actions: input.actions,
    blocked: progression.blockedActionsNextSession,
  });

  // §6.5 placement
  const actionFields = placeActions(rng, {
    startField,
    goalField,
    count: slots.good.length + slots.bad.length,
    rules,
  });
  const actionIds: ActionId[] = shuffle(rng, [...slots.good, ...slots.bad]).slice(0, actionFields.length);
  const actionByField = new Map(actionFields.map((field, index) => [field, actionIds[index] as ActionId]));

  const normalFields = ALL_FIELDS.filter((field) => field !== goalField && !actionByField.has(field));
  const goodNormalCount = Math.round(normalFields.length * progression.goodChance);
  const shuffledNormal = shuffle(rng, normalFields);
  const normalGroup = new Map<number, Group>(
    shuffledNormal.map((field, index) => [field, index < goodNormalCount ? 'good' : 'bad']),
  );

  // §6.6 images – one bag per content category, one per action group
  const bagOptions = {
    imageRecency: progression.imageRecency,
    sessionIndex,
    recencySessions: rules.imageRecencySessions,
    usedHashes,
  };
  const categoryBags = new Map<string, ImageBag>();
  for (const id of [...categories.good, ...categories.bad]) {
    categoryBags.set(id, createImageBag(rng, { ...bagOptions, entries: byFolder.get(id) ?? [] }));
  }

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

  const actionBags = new Map<Group, ImageBag>();
  for (const group of GROUPS) {
    const actionFolderIds = input.folders
      .filter((folder) => folder.role === 'action' && folder.group === group && folder.enabled)
      .map((folder) => folder.id);
    const entries = actionFolderIds.flatMap((id) => byFolder.get(id) ?? []);
    actionBags.set(group, createImageBag(rng, { ...bagOptions, entries }));
  }

  const cards: Card[] = ALL_FIELDS.map((field) =>
    buildCard(rng, field, {
      goalField,
      startField,
      actionByField,
      normalGroup,
      folderForField,
      folderById,
      categoryBags,
      actionBags,
    }),
  );

  const categoryUsage: Progression['categoryUsage'] = { ...progression.categoryUsage };
  for (const id of [...categories.good, ...categories.bad]) {
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
      initialTaskCount,
      categories,
      activeActionFolders: { good: null, bad: null },
      cards,
      effects: [],
      round: 0,
      phase: 'initial_task',
      pending: [],
      reveal: null,
      lastRoll: null,
      chooseNextRoll: false,
      lastMove: null,
      endReason: null,
      penaltyFieldsRemoved: 0,
      winCheck: null,
      finalWheel: null,
      reward: null,
      stats: {
        rolls: 0,
        tasksPerformed: 0,
        holdTasks: 0,
        holdSeconds: 0,
        actionsTriggered: {},
        maxPixelLevel: 0,
        switches: [],
      },
    },
    categoryUsage,
  };
}

interface CardContext {
  goalField: number;
  startField: number;
  actionByField: ReadonlyMap<number, ActionId>;
  normalGroup: ReadonlyMap<number, Group>;
  folderForField: ReadonlyMap<number, string>;
  folderById: ReadonlyMap<string, FolderConfig>;
  categoryBags: ReadonlyMap<string, ImageBag>;
  actionBags: ReadonlyMap<Group, ImageBag>;
}

function buildCard(rng: Rng, field: number, context: CardContext): Card {
  const discovered = field === context.startField;
  if (field === context.goalField) return { field, kind: 'goal', discovered: false };

  const action = context.actionByField.get(field);
  if (action) {
    const group = actionGroup(action);
    const entry = context.actionBags.get(group)?.draw((candidate) => {
      const allowed = context.folderById.get(candidate.folderId)?.allowedActions;
      return allowed === null || allowed === undefined || allowed.includes(action);
    });
    // No image → built-in neutral action design (game-design §6.3)
    return entry
      ? { field, kind: 'action', group, action, folderId: entry.folderId, imageHash: entry.hash, discovered }
      : { field, kind: 'action', group, action, discovered };
  }

  const group = context.normalGroup.get(field) ?? 'bad';
  const folderId = context.folderForField.get(field) as string;
  const folder = context.folderById.get(folderId);
  const entry = context.categoryBags.get(folderId)?.draw();
  const [minTasks, maxTasks] = folder?.taskRange ?? [1, 1];
  return {
    field,
    kind: 'normal',
    group,
    folderId,
    ...(entry ? { imageHash: entry.hash } : {}),
    taskCount: randInt(rng, minTasks, maxTasks),
    discovered,
  };
}
