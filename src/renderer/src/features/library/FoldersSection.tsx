import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FolderConfig } from '@shared/content';
import { useLibraryStore } from '@renderer/stores/libraryStore';
import { Alert } from '@renderer/ui/Alert';
import { Button } from '@renderer/ui/Button';
import { classNames } from '@renderer/ui/classNames';
import { Icon } from '@renderer/ui/icons/Icon';
import { ProgressBar } from '@renderer/ui/ProgressBar';
import { FolderDetail } from './FolderDetail';
import { folderHealth, folderHealthText } from './folderLabels';
import { useAddFolders } from './useAddFolders';

const SECTIONS = [
  { key: 'good', role: 'content', tone: 'good' },
  { key: 'bad', role: 'content', tone: 'bad' },
  { key: 'performer', role: 'performer', tone: 'collectible' },
] as const;

/** Admin section "Folders" (game-design §5, §16): folders by group/role, scan state, properties. */
export function FoldersSection() {
  const { t } = useTranslation();
  const { snapshot, progress, error, rescan, dismissError } = useLibraryStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // §5 admin: a newly added folder is selected right away so it can be set up
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const addFlow = useAddFolders((folderIds) => {
    const [first] = folderIds;
    if (!first) return;
    setSelectedId(first);
    setJustAddedId(first);
    requestAnimationFrame(() => {
      document.querySelector(`[data-folder-id="${first}"]`)?.scrollIntoView({ block: 'nearest' });
    });
  });

  const folders = snapshot?.folders ?? [];
  const selected: FolderConfig | undefined = folders.find((folder) => folder.id === selectedId) ?? folders[0];
  const scanning = snapshot?.scanning ?? false;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end gap-4 border-b border-line px-12 py-4">
        <Button variant="outline" disabled={scanning} onClick={() => void rescan()}>
          <Icon name="refresh" size={16} />
          {scanning ? t('library.scanning') : t('library.rescan')}
        </Button>
        <Button variant="primary" onClick={() => void addFlow.start()}>
          <Icon name="plus" size={16} />
          {t('library.addFolders')}
        </Button>
      </div>

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

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,320px)_1fr]">
        <nav
          aria-label={t('library.foldersNav')}
          className="overflow-y-auto border-r border-line bg-panel px-6 py-6"
        >
          {SECTIONS.map(({ key, role, tone }) => {
            const sectionFolders = folders.filter(
              (folder) => folder.role === role && (role === 'performer' || folder.group === key),
            );
            return (
              <section key={key} className="mb-6">
                <h2
                  className={classNames(
                    'mb-2 border-l-3 pl-3 font-label text-label uppercase tracking-label text-ink-muted',
                    tone === 'good' ? 'border-good' : tone === 'bad' ? 'border-bad' : 'border-collectible',
                  )}
                >
                  {t(`library.section.${key}`)}
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
                            data-folder-id={folder.id}
                            aria-current={isSelected ? 'true' : undefined}
                            onClick={() => {
                              setSelectedId(folder.id);
                              setJustAddedId(null);
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
              focusName={selected.id === justAddedId}
              status={snapshot?.status[selected.id]}
              scanning={scanning}
            />
          ) : (
            <p className="text-body text-ink-muted">{t('library.noFolders')}</p>
          )}
        </section>
      </div>
      {addFlow.dialog}
    </div>
  );
}
