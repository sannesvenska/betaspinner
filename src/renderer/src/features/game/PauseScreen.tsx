import { useTranslation } from 'react-i18next';
import { useUiStore } from '@renderer/stores/uiStore';

/**
 * Neutral screen (game-design §19): opaque, instant (no transition), no images, no game data.
 * The game stays mounted underneath so timers and media resume exactly where they were.
 */
export function PauseScreen() {
  const { t } = useTranslation();
  const togglePause = useUiStore((state) => state.togglePause);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('pause.title')}
      tabIndex={-1}
      onClick={togglePause}
      className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-5 bg-bg"
    >
      <div className="font-display text-brand font-semibold uppercase tracking-brand text-ink-muted">
        {t('app.title')}
      </div>
      <div className="font-display text-display font-bold uppercase">{t('pause.title')}</div>
      <div className="text-body text-ink-2">
        {t('pause.body')}{' '}
        <kbd className="rounded-panel border border-line-strong px-2 py-1 font-label text-label text-ink">
          Ctrl + Shift + Space
        </kbd>
      </div>
    </div>
  );
}
