import { useTranslation } from 'react-i18next';
import { useUiStore } from '@renderer/stores/uiStore';
import { Button } from '@renderer/ui/Button';

/** Placeholder start screen until the start wheel lands (AP5). */
export function HomeScreen() {
  const { t } = useTranslation();
  const navigate = useUiStore((state) => state.navigate);

  return (
    <main className="flex h-full flex-col px-12 py-8">
      <header className="flex items-center justify-between">
        <div className="font-display text-brand font-semibold uppercase tracking-brand">{t('app.title')}</div>
        {import.meta.env.DEV && (
          <Button
            variant="text"
            onClick={() => {
              navigate('showcase');
            }}
          >
            {t('home.openShowcase')}
          </Button>
        )}
      </header>
      <section className="flex flex-1 flex-col justify-center gap-6 pl-12">
        <div className="font-label text-label uppercase tracking-label text-ink-muted">
          {t('home.eyebrow', { number: '001' })}
        </div>
        <h1 className="font-display text-display font-bold uppercase">{t('app.title')}</h1>
        <p className="max-w-xl text-body text-ink-2">{t('home.comingSoon')}</p>
      </section>
    </main>
  );
}
