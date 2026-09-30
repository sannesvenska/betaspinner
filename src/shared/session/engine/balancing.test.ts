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
      // Product target 80–100 rounds and ≈ 40 % (ROADMAP AP9.9); measured 81 rounds / 41 % with 0.5 % and 1 conversion
      expect(summary.avgRounds).toBeGreaterThan(70);
      expect(summary.avgRounds).toBeLessThan(105);
      expect(summary.avgFinalChance).toBeGreaterThan(35);
      expect(summary.avgFinalChance).toBeLessThan(47);
      expect(summary.avgFinalChance).toBeGreaterThanOrEqual(TARGET_CHANCE);
      // Detours actually change the board; drifts happen but stay rare
      expect(summary.avgDetourConversions).toBeGreaterThan(2);
      expect(summary.avgGoalDrifts).toBeLessThan(10);
    },
    SIMULATION_TIMEOUT_MS,
  );
});
