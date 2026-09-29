import { useTranslation } from 'react-i18next';
import { isFolderEligible } from '@shared/content';
import { EmptyLibrary } from '@renderer/features/library/EmptyLibrary';
import { useLibraryStore } from '@renderer/stores/libraryStore';
import { useUiStore } from '@renderer/stores/uiStore';
import { Button } from '@renderer/ui/Button';
import { GroupCount } from '@renderer/ui/GroupCount';

/** Start screen. The start wheel replaces the placeholder in AP5. */
export function HomeScreen() {
  const { t } = useTranslation();
  const navigate = useUiStore((state) => state.navigate);
  const snapshot = useLibraryStore((state) => state.snapshot);

  const eligibleContent = (snapshot?.folders ?? []).filter(
    (folder) => folder.role === 'content' && isFolderEligible(folder, snapshot?.status[folder.id]),
  );
  const goodCount = eligibleContent.filter((folder) => folder.group === 'good').length;
  const badCount = eligibleContent.length - goodCount;

  return (
    <main className="flex h-full flex-col px-12 py-8">
      <header className="flex items-center justify-between">
        <div className="font-display text-brand font-semibold uppercase tracking-brand">{t('app.title')}</div>
        <nav className="flex gap-2">
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
          <Button
            variant="text"
            onClick={() => {
              navigate('library');
            }}
          >
            {t('library.title')}
          </Button>
        </nav>
      </header>
      <section className="flex flex-1 flex-col justify-center pl-12">
        {!snapshot ? (
          <div className="font-label text-label text-ink-muted">{t('app.loading')}</div>
        ) : snapshot.folders.length === 0 ? (
          <EmptyLibrary />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="font-label text-label uppercase tracking-label text-ink-muted">
              {t('home.eyebrow', { number: '001' })}
            </div>
            <h1 className="font-display text-display font-bold uppercase">{t('app.title')}</h1>
            <div className="flex items-center gap-4 text-body text-ink-2">
              {t('home.readyCategories')}
              <span className="font-display text-stat font-semibold">
                <GroupCount good={goodCount} bad={badCount} />
              </span>
            </div>
            <p className="max-w-xl text-body text-ink-2">{t('home.comingSoon')}</p>
          </div>
        )}
      </section>
    </main>
  );
}
