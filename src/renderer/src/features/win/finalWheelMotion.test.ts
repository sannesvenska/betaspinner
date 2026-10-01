import { describe, expect, it } from 'vitest';
import {
  BRAKE_MS_RANGE,
  CRUISE_DEG_PER_SECOND,
  landingAngle,
  planSpin,
  randomBrakeMs,
  rotationAt,
  SPIN_DEG_PER_SECOND,
} from './finalWheelMotion';

const normalize = (degrees: number): number => ((degrees % 360) + 360) % 360;
/** Degrees per second around `t` */
const speedAt = (plan: ReturnType<typeof planSpin>, t: number): number =>
  (rotationAt(plan, t + 5) - rotationAt(plan, t - 5)) / 0.01;

describe('final wheel motion', () => {
  it('places the landing spot inside the right area', () => {
    expect(landingAngle('allowed', 0.5, 25)).toBe(45);
    expect(landingAngle('denied', 0, 25)).toBe(90);
    expect(landingAngle('denied', 1, 25)).toBe(360);
  });

  it('stops exactly on the landing spot at the end of the hold', () => {
    for (const [current, landing, seconds, brake] of [
      [0, 45, 41, 1200],
      [123.4, 300, 5, 1800],
      [-720, 10, 1, 1500],
      [9999, 181, 60, 1700],
    ] as const) {
      const plan = planSpin(current, landing, seconds * 1000, brake);
      expect(normalize(rotationAt(plan, seconds * 1000))).toBeCloseTo(normalize(-landing), 6);
      expect(rotationAt(plan, 0)).toBe(current);
    }
  });

  it('always moves forward and starts at the calm spin speed', () => {
    const plan = planSpin(0, 200, 20_000, 1500);
    let previous = rotationAt(plan, 0);
    for (let t = 50; t <= 20_000; t += 50) {
      const next = rotationAt(plan, t);
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
    }
    const initialSpeed = (rotationAt(plan, 1) - rotationAt(plan, 0)) / 0.001;
    expect(initialSpeed).toBeCloseTo(SPIN_DEG_PER_SECOND, -1);
  });

  it('speeds up, cruises and only brakes in the last moments (no readable slow tail)', () => {
    const plan = planSpin(0, 200, 30_000, 1500);
    expect(speedAt(plan, 10_000)).toBeGreaterThan(CRUISE_DEG_PER_SECOND * 0.98);
    expect(speedAt(plan, 10_000)).toBeLessThan(CRUISE_DEG_PER_SECOND * 1.02);
    // Still at full speed just before the brake, and more than a full turn left when it starts
    expect(speedAt(plan, 30_000 - 1600)).toBeGreaterThan(CRUISE_DEG_PER_SECOND * 0.98);
    expect(rotationAt(plan, 30_000) - rotationAt(plan, 30_000 - 1500)).toBeGreaterThan(360);
  });

  it('draws the brake length from the configured range', () => {
    expect(randomBrakeMs(() => 0)).toBe(BRAKE_MS_RANGE[0]);
    expect(randomBrakeMs(() => 1)).toBe(BRAKE_MS_RANGE[1]);
  });
});
