import { useTranslation } from 'react-i18next';
import { EmptyLibrary } from '@renderer/features/library/EmptyLibrary';
import { StartScreen } from '@renderer/features/start/StartScreen';
import { useLibraryStore } from '@renderer/stores/libraryStore';

/** Start screen: first-run setup without folders, otherwise the start wheel. */
export function HomeScreen() {
  const { t } = useTranslation();
  const snapshot = useLibraryStore((state) => state.snapshot);

  if (snapshot && snapshot.folders.length > 0) return <StartScreen />;

  return (
    <main className="flex h-full flex-col px-12 py-8">
      <header className="flex items-center justify-between">
        <div className="font-display text-brand font-semibold uppercase tracking-brand">{t('app.title')}</div>
      </header>
      <section className="flex flex-1 flex-col justify-center pl-12">
        {snapshot ? (
          <EmptyLibrary />
        ) : (
          <div className="font-label text-label text-ink-muted">{t('app.loading')}</div>
        )}
      </section>
    </main>
  );
}
