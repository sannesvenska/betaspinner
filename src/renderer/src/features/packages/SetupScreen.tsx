import { useTranslation } from 'react-i18next';
import { usePackagesStore } from '@renderer/stores/packagesStore';
import { Alert } from '@renderer/ui/Alert';
import { Button } from '@renderer/ui/Button';
import { Icon } from '@renderer/ui/icons/Icon';
import { PackageProgressBar } from './PackageProgressBar';

/**
 * game-design §5.4: first start with packages – the library folder is chosen once. Content of an older
 * install is copied into the package "Default" (the originals stay where they are).
 */
export function SetupScreen() {
  const { t } = useTranslation();
  const status = usePackagesStore((state) => state.status);
  const progress = usePackagesStore((state) => state.progress);
  const busy = usePackagesStore((state) => state.busy);
  const error = usePackagesStore((state) => state.error);
  const chooseRoot = usePackagesStore((state) => state.chooseRoot);
  const dismissError = usePackagesStore((state) => state.dismissError);
  const migrating = status?.hasLegacyContent ?? false;

  return (
    <main className="flex h-full flex-col px-12 py-8">
      <header className="font-display text-brand font-semibold uppercase tracking-brand">
        {t('app.title')}
      </header>
      <section className="flex max-w-2xl flex-1 flex-col justify-center gap-8 pl-12">
        <div className="flex flex-col gap-4">
          <div className="font-label text-label uppercase tracking-label text-ink-muted">
            {t('packages.setup.eyebrow')}
          </div>
          <h1 className="font-display text-display font-bold uppercase">{t('packages.setup.title')}</h1>
          <p className="text-body text-ink-2">{t('packages.setup.body')}</p>
          <p className="text-body text-ink-2">
            {migrating ? t('packages.setup.migrate') : t('packages.setup.fresh')}
          </p>
        </div>
        {error && <Alert onDismiss={dismissError}>{error}</Alert>}
        {busy && progress ? (
          <PackageProgressBar progress={progress} />
        ) : (
          <div>
            <Button variant="primary" size="primary" disabled={busy} onClick={() => void chooseRoot()}>
              <Icon name="folder" size={20} />
              {t('packages.setup.choose')}
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
