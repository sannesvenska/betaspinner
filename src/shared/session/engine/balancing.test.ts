import { describe, expect, it } from 'vitest';
import { playGame, summarize } from './balancingBot';

const GAMES = 200;
/** The bot explores until the release chance reaches this, then heads for the goal. */
const TARGET_CHANCE = 25;
const SIMULATION_TIMEOUT_MS = 60_000;

describe(`balancing simulation – ${GAMES} bot games (AP9.9)`, () => {
  it(
    'keeps the v2 defaults in a playable range',
    () => {
      const summary = summarize(
        Array.from({ length: GAMES }, (_, index) => playGame(index + 1, TARGET_CHANCE)),
      );
      console.log(`balancing ${JSON.stringify(summary)}`);

      // Almost every game reaches the goal (the rest ends by Mistress Says No)
      expect(summary.reachedGoal).toBeGreaterThan(GAMES * 0.85);
      // Guard rail, not a target: measured ≈ 126 rounds with the 2026-09-30 defaults (see ROADMAP AP9.9)
      expect(summary.avgRounds).toBeLessThan(150);
      expect(summary.avgFinalChance).toBeGreaterThanOrEqual(TARGET_CHANCE);
      // Detours actually change the board; drifts happen but stay rare
      expect(summary.avgDetourConversions).toBeGreaterThan(2);
      expect(summary.avgGoalDrifts).toBeLessThan(10);
    },
    SIMULATION_TIMEOUT_MS,
  );
});
