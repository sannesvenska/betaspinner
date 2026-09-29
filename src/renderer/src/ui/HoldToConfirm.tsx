import { useEffect, useRef, useState, type ReactNode } from 'react';
import { classNames } from './classNames';

/** game-design §7.2: End Early is confirmed by holding for 1.5 s. */
export const HOLD_TO_CONFIRM_MS = 1500;
const HOLD_KEYS = new Set([' ', 'Enter']);

interface HoldToConfirmProps {
  onConfirm: () => void;
  children: ReactNode;
  className?: string;
  describedBy?: string;
}

/** Press and hold (pointer, or Space/Enter while focused). Releasing early cancels. */
export function HoldToConfirm({ onConfirm, children, className, describedBy }: HoldToConfirmProps) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  const cancel = () => {
    window.clearTimeout(timerRef.current);
    setHolding(false);
  };

  const start = () => {
    if (holding) return;
    setHolding(true);
    timerRef.current = window.setTimeout(() => {
      setHolding(false);
      onConfirm();
    }, HOLD_TO_CONFIRM_MS);
  };

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <button
      type="button"
      aria-describedby={describedBy}
      className={classNames(
        'relative h-13 overflow-hidden rounded-panel px-5 font-display text-button font-semibold uppercase tracking-button text-ink-muted hover:text-ink',
        className,
      )}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onKeyDown={(event) => {
        if (HOLD_KEYS.has(event.key) && !event.repeat) {
          event.preventDefault();
          start();
        }
      }}
      onKeyUp={(event) => {
        if (HOLD_KEYS.has(event.key)) cancel();
      }}
      onBlur={cancel}
    >
      {children}
      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-0.5 bg-danger ease-linear"
        style={{
          width: holding ? '100%' : '0%',
          transitionProperty: 'width',
          transitionDuration: holding ? `${HOLD_TO_CONFIRM_MS}ms` : '120ms',
        }}
      />
    </button>
  );
}
