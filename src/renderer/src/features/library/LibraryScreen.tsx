import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FolderConfig } from '@shared/content';
import { useLibraryStore } from '@renderer/stores/libraryStore';
import { useUiStore } from '@renderer/stores/uiStore';
import { Alert } from '@renderer/ui/Alert';
import { Button } from '@renderer/ui/Button';
import { classNames } from '@renderer/ui/classNames';
import { Icon } from '@renderer/ui/icons/Icon';
import { ProgressBar } from '@renderer/ui/ProgressBar';
import { FolderDetail } from './FolderDetail';
import { folderHealth, folderHealthText } from './folderLabels';
import { useAddFolders } from './useAddFolders';

const SECTIONS = [
  { group: 'good', role: 'content' },
  { group: 'bad', role: 'content' },
  { group: 'good', role: 'action' },
  { group: 'bad', role: 'action' },
] as const;

/** Folder management (minimal admin until AP9). */
export function LibraryScreen() {
  const { t } = useTranslation();
  const navigate = useUiStore((state) => state.navigate);
  const { snapshot, progress, error, rescan, dismissError } = useLibraryStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const addFlow = useAddFolders();

  const folders = snapshot?.folders ?? [];
  const selected: FolderConfig | undefined = folders.find((folder) => folder.id === selectedId) ?? folders[0];
  const scanning = snapshot?.scanning ?? false;

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-line px-12 py-6">
        <Button
          variant="text"
          keyHint="Esc"
          onClick={() => {
            navigate('home');
          }}
        >
          <Icon name="arrowLeft" size={16} />
          {t('common.back')}
        </Button>
        <h1 className="flex-1 font-display text-title font-bold uppercase">{t('library.title')}</h1>
        <Button variant="outline" disabled={scanning} onClick={() => void rescan()}>
          <Icon name="refresh" size={16} />
          {scanning ? t('library.scanning') : t('library.rescan')}
        </Button>
        <Button variant="primary" onClick={() => void addFlow.start()}>
          <Icon name="plus" size={16} />
          {t('library.addFolders')}
        </Button>
      </header>

      {scanning && (
        <div className="flex items-center gap-4 px-12 py-3">
          <ProgressBar
            value={progress?.processed ?? 0}
            max={progress?.total ?? 0}
            label={t('library.scanning')}
          />
          <span className="shrink-0 font-label text-label text-ink-muted tabular-nums">
            {t('library.progress', { processed: progress?.processed ?? 0, total: progress?.total ?? 0 })}
          </span>
        </div>
      )}
      {(error ?? addFlow.pickError) && (
        <div className="px-12 pt-4">
          <Alert onDismiss={dismissError}>{error ?? addFlow.pickError}</Alert>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,360px)_1fr]">
        <nav
          aria-label={t('library.foldersNav')}
          className="overflow-y-auto border-r border-line bg-panel px-6 py-6"
        >
          {SECTIONS.map(({ group, role }) => {
            const sectionFolders = folders.filter((folder) => folder.group === group && folder.role === role);
            return (
              <section key={`${group}-${role}`} className="mb-6">
                <h2
                  className={classNames(
                    'mb-2 border-l-3 pl-3 font-label text-label uppercase tracking-label text-ink-muted',
                    group === 'good' ? 'border-good' : 'border-bad',
                  )}
                >
                  {t(`library.group.${group}`)} · {t(`library.role.${role}`)}
                </h2>
                {sectionFolders.length === 0 ? (
                  <p className="pl-4 text-body-sm text-ink-muted">{t('library.sectionEmpty')}</p>
                ) : (
                  <ul>
                    {sectionFolders.map((folder) => {
                      const status = snapshot?.status[folder.id];
                      const health = folderHealth(folder, status, scanning);
                      const isSelected = folder.id === selected?.id;
                      return (
                        <li key={folder.id}>
                          <button
                            type="button"
                            aria-current={isSelected ? 'true' : undefined}
                            onClick={() => {
                              setSelectedId(folder.id);
                            }}
                            className={classNames(
                              'flex w-full flex-col items-start gap-0.5 rounded-panel px-4 py-2.5 text-left transition-colors duration-150',
                              isSelected ? 'bg-surface' : 'hover:bg-surface/60',
                            )}
                          >
                            <span className="font-display text-chip font-semibold uppercase tracking-chip">
                              {folder.displayName}
                            </span>
                            <span
                              className={classNames(
                                'flex items-center gap-1.5 text-body-sm',
                                health === 'ok' ? 'text-ink-muted' : 'text-bad',
                              )}
                            >
                              {health !== 'ok' && health !== 'scanning' && <Icon name="warning" size={14} />}
                              {folderHealthText(t, health, folder, status)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </nav>

        <section className="overflow-y-auto px-12 py-8">
          {selected ? (
            <FolderDetail
              key={selected.id}
              folder={selected}
              status={snapshot?.status[selected.id]}
              scanning={scanning}
            />
          ) : (
            <p className="text-body text-ink-muted">{t('library.noFolders')}</p>
          )}
        </section>
      </div>
      {addFlow.dialog}
    </main>
  );
}
