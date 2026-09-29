import { useTranslation } from 'react-i18next';
import { classNames } from './classNames';

/** The last seconds turn `bad` red (design-system §6). */
const WARNING_SECONDS = 3;
const SECONDS_PER_MINUTE = 60;
const PERCENT = 100;

interface CountdownProps {
  secondsRemaining: number;
  totalSeconds: number;
}

const formatClock = (seconds: number): string => {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const rest = seconds % SECONDS_PER_MINUTE;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};

export function Countdown({ secondsRemaining, totalSeconds }: CountdownProps) {
  const { t } = useTranslation();
  const warning = secondsRemaining > 0 && secondsRemaining <= WARNING_SECONDS;
  const progress = totalSeconds > 0 ? (secondsRemaining / totalSeconds) * PERCENT : 0;

  return (
    <div className="flex w-85 flex-col gap-2.5" role="timer" aria-live="off">
      <div className="flex items-baseline justify-between">
        <span className="font-label text-label uppercase tracking-label text-ink-muted">
          {t('countdown.hold')} · {t('countdown.ofSeconds', { seconds: totalSeconds })}
        </span>
        <span
          className={classNames(
            'font-display text-title font-bold tabular-nums',
            warning ? 'text-bad' : 'text-ink',
          )}
        >
          {formatClock(secondsRemaining)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-panel bg-ring-empty">
        <div
          className={classNames('h-full', warning ? 'bg-bad' : 'bg-ink')}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
