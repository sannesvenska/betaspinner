import type { ActionId } from '../actions';
import { generateSession, GenerationError, type GenerateSessionInput } from './generateSession';

export interface CardDistribution {
  id: string;
  type: ActionId;
  /** Share of sessions whose action pool contains the card (0..1) */
  poolShare: number;
  /** Average number of copies on the board per session */
  avgCount: number;
}

export interface SimulationResult {
  runs: number;
  /** Runs that could not generate (e.g. no eligible category) */
  failed: number;
  avgActionCards: number;
  avgGoodActions: number;
  avgBadActions: number;
  avgCollectibles: number;
  /** Share of sessions with a performer (0..1) */
  performerShare: number;
  avgPoolSize: number;
  cards: CardDistribution[];
}

export type SimulationInput = Omit<GenerateSessionInput, 'seed' | 'sessionId' | 'now' | 'goalValue'>;

const SIMULATION_NOW = '2026-01-01T00:00:00.000Z';
const TRACK_FIELDS = 100;

/**
 * game-design §16 admin preview: runs the real generator `runs` times with deterministic seeds and
 * summarizes the action card distribution. Progression stays fixed (no cooldown rotation between runs).
 */
export function simulateSessions(input: SimulationInput, runs: number): SimulationResult {
  let failed = 0;
  let succeeded = 0;
  const totals = { actions: 0, good: 0, bad: 0, collectibles: 0, performer: 0, pool: 0 };
  const inPool = new Map<string, number>();
  const copies = new Map<string, number>();

  for (let run = 1; run <= runs; run++) {
    try {
      const { session } = generateSession({
        ...input,
        seed: run,
        sessionId: `simulation-${run}`,
        now: SIMULATION_NOW,
        goalValue: (run % TRACK_FIELDS) + 1,
      });
      succeeded++;
      for (const card of session.cards) {
        if (card.kind === 'collectible') totals.collectibles++;
        if (card.kind !== 'action' || !card.actionCardId) continue;
        totals.actions++;
        if (card.group === 'good') totals.good++;
        else totals.bad++;
        copies.set(card.actionCardId, (copies.get(card.actionCardId) ?? 0) + 1);
      }
      if (session.performerFolderId) totals.performer++;
      totals.pool += session.actionPool.length;
      for (const id of session.actionPool) inPool.set(id, (inPool.get(id) ?? 0) + 1);
    } catch (error) {
      if (!(error instanceof GenerationError)) throw error;
      failed++;
    }
  }

  const per = (value: number) => (succeeded === 0 ? 0 : value / succeeded);
  return {
    runs,
    failed,
    avgActionCards: per(totals.actions),
    avgGoodActions: per(totals.good),
    avgBadActions: per(totals.bad),
    avgCollectibles: per(totals.collectibles),
    performerShare: per(totals.performer),
    avgPoolSize: per(totals.pool),
    cards: input.actionCards.map((card) => ({
      id: card.id,
      type: card.type,
      poolShare: per(inPool.get(card.id) ?? 0),
      avgCount: per(copies.get(card.id) ?? 0),
    })),
  };
}
