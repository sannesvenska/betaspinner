import { useEffect, useRef, useState } from 'react';

const TICK_INTERVAL_MS = 100;
const MS_PER_SECOND = 1000;

interface CountdownState {
  /** Whole seconds left, rounded up (shows 1 until the very end). */
  secondsRemaining: number;
  finished: boolean;
}

/**
 * Wall-clock based countdown that can be paused (Pause screen freezes timers).
 * Restarts whenever `totalSeconds` or `restartKey` changes.
 */
export function useCountdown(totalSeconds: number, paused: boolean, restartKey = 0): CountdownState {
  const [remainingMs, setRemainingMs] = useState(totalSeconds * MS_PER_SECOND);
  const remainingRef = useRef(remainingMs);

  useEffect(() => {
    remainingRef.current = totalSeconds * MS_PER_SECOND;
    setRemainingMs(remainingRef.current);
  }, [totalSeconds, restartKey]);

  useEffect(() => {
    if (paused || remainingRef.current <= 0) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      remainingRef.current = Math.max(0, remainingRef.current - (now - last));
      last = now;
      setRemainingMs(remainingRef.current);
      if (remainingRef.current <= 0) window.clearInterval(timer);
    }, TICK_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [paused, totalSeconds, restartKey]);

  return { secondsRemaining: Math.ceil(remainingMs / MS_PER_SECOND), finished: remainingMs <= 0 };
}
