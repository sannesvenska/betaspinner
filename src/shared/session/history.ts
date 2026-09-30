import type { ActionId } from '../actions';
import type { Group } from '../game';
import type { ProgressionChange } from './progressionRules';
import type { EndReason, SessionState, WinCheck } from './types';

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
  rounds: number;
  rolls: number;
  tasksPerformed: number;
  holdTasks: number;
  holdSeconds: number;
  discovered: number;
  actionsTriggered: Partial<Record<ActionId, number>>;
  maxPixelLevel: number;
  winCheck: (WinCheck & { result: 'allowed' | 'denied' }) | null;
  outcome: EndReason;
  progressionChange: ProgressionChange;
}

export function toSessionRecord(
  session: SessionState,
  endedAt: Date,
  change: ProgressionChange,
): SessionRecord {
  return {
    id: session.id,
    sessionIndex: session.sessionIndex,
    startedAt: session.startedAt,
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - new Date(session.startedAt).getTime(),
    seed: session.seed,
    goalValue: session.goalValue,
    categories: session.categories,
    rounds: session.round,
    rolls: session.stats.rolls,
    tasksPerformed: session.stats.tasksPerformed,
    holdTasks: session.stats.holdTasks,
    holdSeconds: session.stats.holdSeconds,
    discovered: session.cards.filter((card) => card.discovered).length,
    actionsTriggered: session.stats.actionsTriggered,
    maxPixelLevel: session.stats.maxPixelLevel,
    winCheck:
      session.winCheck && session.finalWheel
        ? { ...session.winCheck, result: session.finalWheel.result }
        : null,
    outcome: session.endReason ?? 'ended_early',
    progressionChange: change,
  };
}
