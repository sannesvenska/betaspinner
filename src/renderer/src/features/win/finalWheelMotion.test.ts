import { describe, expect, it } from 'vitest';
import { landingAngle, planDeceleration, rotationAt, SPIN_DEG_PER_SECOND } from './finalWheelMotion';

const normalize = (degrees: number): number => ((degrees % 360) + 360) % 360;

describe('final wheel motion', () => {
  it('places the landing spot inside the right area', () => {
    expect(landingAngle('allowed', 0.5, 25)).toBe(45);
    expect(landingAngle('denied', 0, 25)).toBe(90);
    expect(landingAngle('denied', 1, 25)).toBe(360);
  });

  it('stops exactly on the landing spot at the end of the hold', () => {
    for (const [current, landing, seconds] of [
      [0, 45, 41],
      [123.4, 300, 5],
      [-720, 10, 1],
      [9999, 181, 95],
    ] as const) {
      const plan = planDeceleration(current, landing, seconds * 1000);
      expect(normalize(rotationAt(plan, seconds * 1000))).toBeCloseTo(normalize(-landing), 6);
      expect(rotationAt(plan, 0)).toBe(current);
    }
  });

  it('keeps moving forward and starts near the constant spin speed', () => {
    const plan = planDeceleration(0, 200, 20_000);
    let previous = rotationAt(plan, 0);
    for (let t = 100; t <= 20_000; t += 100) {
      const next = rotationAt(plan, t);
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
    }
    const initialSpeed = (rotationAt(plan, 10) - rotationAt(plan, 0)) / 0.01;
    expect(initialSpeed).toBeGreaterThan(SPIN_DEG_PER_SECOND * 0.6);
    expect(initialSpeed).toBeLessThan(SPIN_DEG_PER_SECOND * 1.4);
  });
});
