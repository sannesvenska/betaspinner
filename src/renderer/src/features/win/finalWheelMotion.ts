/**
 * Final wheel choreography (design-system §7 "Final wheel", game-design §14.2): a calm spin until Hold
 * Position, then the hold speeds the wheel up to cruise speed and keeps it there; only a short, hard brake
 * at the very end stops it exactly at t = 0 on the pre-decided angle. With 1–2 turns left when braking
 * starts, the outcome cannot be read seconds in advance. Pure math – unit tested; the component feeds time.
 */

export const SPIN_DEG_PER_SECOND = 240;
export const CRUISE_DEG_PER_SECOND = 720;
/** The brake length is drawn from this range per spin, so it cannot be counted down */
export const BRAKE_MS_RANGE = [1200, 1800] as const;
const ACCELERATION_MS = 1500;
/** Short holds: acceleration and brake share the time, a cruise phase may vanish */
const ACCELERATION_SHARE_MAX = 0.3;
const BRAKE_SHARE_MAX = 0.4;
/** 2 = constant deceleration: no slow crawl at the end */
const BRAKE_EXPONENT = 2;
const FULL_TURN = 360;
const MS_PER_SECOND = 1000;

const mod = (value: number, modulus: number): number => ((value % modulus) + modulus) % modulus;

/** Wheel-local angle (clockwise from the top) of the landing spot. */
export function landingAngle(result: 'allowed' | 'denied', landing: number, finalChance: number): number {
  const allowedDeg = (finalChance / 100) * FULL_TURN;
  return result === 'allowed' ? landing * allowedDeg : allowedDeg + landing * (FULL_TURN - allowedDeg);
}

export interface SpinPlan {
  from: number;
  durationMs: number;
  accelerationMs: number;
  brakeMs: number;
  /** Speeds in degrees per millisecond */
  startSpeed: number;
  cruiseSpeed: number;
}

/** Integral of smoothstep on [0, 1] (smooth speed-up without a jolt). */
const smoothIntegral = (x: number): number => x ** 3 - x ** 4 / 2;

/**
 * Plans the hold so that `rotation = -landing` (landing spot under the top pointer) at the end.
 * The cruise speed is tuned slightly (a fraction of a turn over the whole hold) to hit the angle exactly.
 */
export function planSpin(
  currentRotation: number,
  targetLanding: number,
  durationMs: number,
  brakeMs: number,
): SpinPlan {
  const duration = Math.max(1, durationMs);
  const accelerationMs = Math.min(ACCELERATION_MS, duration * ACCELERATION_SHARE_MAX);
  const brake = Math.min(brakeMs, duration * BRAKE_SHARE_MAX);
  const cruiseMs = duration - accelerationMs - brake;
  const startSpeed = SPIN_DEG_PER_SECOND / MS_PER_SECOND;
  // total(v) = startSpeed·A/2 + v·(A/2 + cruise + brake/p) – linear in the cruise speed v
  const fixed = (startSpeed * accelerationMs) / 2;
  const perSpeed = accelerationMs / 2 + cruiseMs + brake / BRAKE_EXPONENT;
  const natural = fixed + (CRUISE_DEG_PER_SECOND / MS_PER_SECOND) * perSpeed;
  const base = mod(-targetLanding - currentRotation, FULL_TURN);
  let distance = base + FULL_TURN * Math.round((natural - base) / FULL_TURN);
  while (distance <= fixed) distance += FULL_TURN;
  return {
    from: currentRotation,
    durationMs: duration,
    accelerationMs,
    brakeMs: brake,
    startSpeed,
    cruiseSpeed: (distance - fixed) / perSpeed,
  };
}

export function rotationAt(plan: SpinPlan, elapsedMs: number): number {
  const { from, durationMs, accelerationMs, brakeMs, startSpeed, cruiseSpeed } = plan;
  const t = Math.min(durationMs, Math.max(0, elapsedMs));
  const accelerated = (time: number) =>
    accelerationMs === 0
      ? 0
      : startSpeed * time +
        (cruiseSpeed - startSpeed) * accelerationMs * smoothIntegral(time / accelerationMs);
  if (t <= accelerationMs) return from + accelerated(t);
  const brakeStart = durationMs - brakeMs;
  const afterAcceleration = accelerated(accelerationMs);
  if (t <= brakeStart) return from + afterAcceleration + cruiseSpeed * (t - accelerationMs);
  const atBrake = afterAcceleration + cruiseSpeed * (brakeStart - accelerationMs);
  const progress = brakeMs === 0 ? 1 : (t - brakeStart) / brakeMs;
  const brakeDistance = (cruiseSpeed * brakeMs) / BRAKE_EXPONENT;
  return from + atBrake + brakeDistance * (1 - (1 - progress) ** BRAKE_EXPONENT);
}

/** Random brake length for one spin (choreography only – the result is decided by the engine). */
export const randomBrakeMs = (random: () => number = Math.random): number =>
  BRAKE_MS_RANGE[0] + random() * (BRAKE_MS_RANGE[1] - BRAKE_MS_RANGE[0]);
