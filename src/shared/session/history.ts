import type { ActionId } from '../actions';
import type { Group } from '../game';
import type { ProgressionChange } from './progressionRules';
import type { EndReason, ReleaseChance, SessionState, SessionStats } from './types';

/** game-design §17 – one entry per finished session in history.json. */
export interface SessionRecord {
  id: string;
  sessionIndex: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  seed: number;
  goalValue: number;
  categories: Record<Group, string[]>;
  performerFolderId: string | null;
  collected: number;
  reachedTiers: number[];
  actionPool: string[];
  rounds: number;
  rolls: number;
  tasksPerformed: number;
  holdTasks: number;
  holdSeconds: number;
  discovered: number;
  actionsTriggered: Partial<Record<ActionId, number>>;
  actionCardsTriggered: Record<string, number>;
  maxPixelLevel: number;
  detours: number;
  detourConversions: number;
  revisitConversions: number;
  goalDrifts: number;
  forcedReversals: number;
  strokeTiers: SessionStats['strokeTiers'];
  winCheck: (ReleaseChance & { result: 'allowed' | 'denied' }) | null;
  outcome: EndReason;
  progressionChange: ProgressionChange;
}

export function toSessionRecord(
  session: SessionState,
  endedAt: Date,
  change: ProgressionChange,
): SessionRecord {
  const { stats } = session;
  return {
    id: session.id,
    sessionIndex: session.sessionIndex,
    startedAt: session.startedAt,
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - new Date(session.startedAt).getTime(),
    seed: session.seed,
    goalValue: session.goalValue,
    categories: session.categories,
    performerFolderId: session.performerFolderId,
    collected: session.collected,
    reachedTiers: session.reachedTiers,
    actionPool: session.actionPool,
    rounds: session.round,
    rolls: stats.rolls,
    tasksPerformed: stats.tasksPerformed,
    holdTasks: stats.holdTasks,
    holdSeconds: stats.holdSeconds,
    discovered: session.cards.filter((card) => card.discovered).length,
    actionsTriggered: stats.actionsTriggered,
    actionCardsTriggered: stats.actionCardsTriggered,
    maxPixelLevel: stats.maxPixelLevel,
    detours: stats.detours,
    detourConversions: stats.detourConversions,
    revisitConversions: stats.revisitConversions,
    goalDrifts: stats.goalDrifts,
    forcedReversals: stats.forcedReversals,
    strokeTiers: stats.strokeTiers,
    winCheck:
      session.winCheck && session.finalWheel
        ? { ...session.winCheck, result: session.finalWheel.result }
        : null,
    outcome: session.endReason ?? 'ended_early',
    progressionChange: change,
  };
}
