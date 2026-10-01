import { useTranslation } from 'react-i18next';
import type { PackageProgress } from '@shared/packages';
import { ProgressBar } from '@renderer/ui/ProgressBar';

/** Progress of package work (setup copy, export, import, move) – game-design §5.4. */
export function PackageProgressBar({ progress }: { progress: PackageProgress }) {
  const { t } = useTranslation();
  const label = t(`packages.progress.${progress.task}`, { label: progress.label });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-body-sm text-ink-2">{label}</span>
        <span className="font-label text-label text-ink-muted tabular-nums">
          {t('packages.progress.count', { done: progress.done, total: progress.total })}
        </span>
      </div>
      <ProgressBar value={progress.done} max={progress.total} label={label} />
    </div>
  );
}
