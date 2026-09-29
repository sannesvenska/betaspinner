import { useTranslation } from 'react-i18next';

interface GroupCountProps {
  good: number;
  bad: number;
  className?: string;
}

/** Good/bad counts encoded by shape (triangle up / down) + color + screen-reader text – never color-only. */
export function GroupCount({ good, bad, className }: GroupCountProps) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center gap-3 ${className ?? ''}`}>
      <span className="sr-only">
        {t('common.goodCount', { count: good })}, {t('common.badCount', { count: bad })}
      </span>
      <span aria-hidden className="inline-flex items-center gap-1 text-good">
        <svg width="0.55em" height="0.55em" viewBox="0 0 10 10">
          <path d="M5 0l5 10H0z" fill="currentColor" />
        </svg>
        {good}
      </span>
      <span aria-hidden className="inline-flex items-center gap-1 text-bad">
        <svg width="0.55em" height="0.55em" viewBox="0 0 10 10">
          <path d="M0 0h10L5 10z" fill="currentColor" />
        </svg>
        {bad}
      </span>
    </span>
  );
}
