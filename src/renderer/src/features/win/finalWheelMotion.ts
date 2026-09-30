/**
 * Final wheel choreography (design-system §7 "Final wheel"): constant spin until Hold Position, then a
 * deceleration that ends exactly at t = 0 on the pre-decided angle, starting with the current speed.
 * Pure math – unit tested; the component only feeds time.
 */

export const SPIN_DEG_PER_SECOND = 240;
const FULL_TURN = 360;
const MS_PER_SECOND = 1000;
/** Ease-out exponent ≈ 2 gives a natural stop; the distance is chosen so it stays close to that. */
const PREFERRED_EXPONENT = 2;
const MIN_EXPONENT = 1;

const mod = (value: number, modulus: number): number => ((value % modulus) + modulus) % modulus;

/** Wheel-local angle (clockwise from the top) of the landing spot. */
export function landingAngle(result: 'allowed' | 'denied', landing: number, finalChance: number): number {
  const allowedDeg = (finalChance / 100) * FULL_TURN;
  return result === 'allowed' ? landing * allowedDeg : allowedDeg + landing * (FULL_TURN - allowedDeg);
}

export interface Deceleration {
  from: number;
  distance: number;
  exponent: number;
  durationMs: number;
}

/** Plans the stop so that `rotation = -landing` (landing spot under the top pointer) at the end. */
export function planDeceleration(
  currentRotation: number,
  targetLanding: number,
  durationMs: number,
): Deceleration {
  const seconds = durationMs / MS_PER_SECOND;
  const naturalDistance = (SPIN_DEG_PER_SECOND * seconds) / PREFERRED_EXPONENT;
  const base = mod(-targetLanding - currentRotation, FULL_TURN);
  let distance = base + FULL_TURN * Math.round((naturalDistance - base) / FULL_TURN);
  if (distance <= 0) distance += FULL_TURN;
  const exponent = Math.max(MIN_EXPONENT, (SPIN_DEG_PER_SECOND * seconds) / distance);
  return { from: currentRotation, distance, exponent, durationMs };
}

export function rotationAt(plan: Deceleration, elapsedMs: number): number {
  const progress = Math.min(1, Math.max(0, elapsedMs / plan.durationMs));
  return plan.from + plan.distance * (1 - (1 - progress) ** plan.exponent);
}
