import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MaskBulkAction, MaskedMediaEntry, MaskFilter, MaskFolderSummary } from '@shared/ipc';
import type { MaskStatus } from '@shared/masks';
import { useLibraryStore } from '@renderer/stores/libraryStore';
import { useMasksStore } from '@renderer/stores/masksStore';
import { Alert } from '@renderer/ui/Alert';
import { Button } from '@renderer/ui/Button';
import { classNames } from '@renderer/ui/classNames';
import { Dialog } from '@renderer/ui/Dialog';
import { DIALOG_AUTOFOCUS } from '@renderer/ui/dialogAutofocus';
import { Icon } from '@renderer/ui/icons/Icon';
import { Media } from '@renderer/ui/Media';
import { ProgressBar } from '@renderer/ui/ProgressBar';
import { SegmentedControl } from '@renderer/ui/SegmentedControl';
import { MaskEditor } from './MaskEditor';
import { VirtualGrid } from './VirtualGrid';

const FILTERS: readonly MaskFilter[] = ['all', 'unreviewed', 'masked', 'no_regions'];
const TILE_SIZE = 150;
const TILE_GAP = 8;
const SIDEBAR_GROUPS = [
  { key: 'good', match: (role: string, group: string) => role === 'content' && group === 'good' },
  { key: 'bad', match: (role: string, group: string) => role === 'content' && group === 'bad' },
  { key: 'performer', match: (role: string) => role === 'performer' },
] as const;

function StatusBadge({ status, count }: { status: MaskStatus; count: number }) {
  const { t } = useTranslation();
  return (
    <span
      className={classNames(
        'rounded-panel px-1.5 py-0.5 font-label text-key uppercase tracking-label',
        status === 'masked'
          ? 'bg-masked text-bg'
          : status === 'no_regions'
            ? 'bg-reviewed text-bg'
            : 'bg-surface text-ink-muted',
      )}
    >
      {status === 'masked' ? t('media.badge.masked', { count }) : t(`media.status.${status}`)}
    </span>
  );
}

/**
 * game-design §12.2 Media Library: review every image of a folder – masks, "no regions needed",
 * filters and bulk actions. Double-click (or Enter) opens the Mask Editor.
 */
export function MediaLibrarySection() {
  const { t } = useTranslation();
  const folders = useLibraryStore((state) => state.snapshot?.folders ?? []);
  const forgetMasks = useMasksStore((state) => state.forget);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [filter, setFilter] = useState<MaskFilter>('all');
  const [summary, setSummary] = useState<Record<string, MaskFolderSummary>>({});
  const [entries, setEntries] = useState<MaskedMediaEntry[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [editorIndex, setEditorIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const activeFolder = folders.find((folder) => folder.id === folderId) ?? folders[0];

  const loadSummary = useCallback(async () => {
    const result = await window.api.invoke('masks:summary', undefined);
    if (result.ok) setSummary(result.data);
    else setError(result.error);
  }, []);

  const loadEntries = useCallback(async () => {
    if (!activeFolder) return;
    const result = await window.api.invoke('masks:listFolder', { folderId: activeFolder.id, filter });
    if (result.ok) setEntries(result.data);
    else setError(result.error);
  }, [activeFolder, filter]);

  // Initial loads; the callbacks above refresh after bulk actions and editor saves
  useEffect(() => {
    let cancelled = false;
    void window.api.invoke('masks:summary', undefined).then((result) => {
      if (cancelled) return;
      if (result.ok) setSummary(result.data);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const activeFolderId = activeFolder?.id;
  useEffect(() => {
    if (!activeFolderId) return;
    let cancelled = false;
    void window.api.invoke('masks:listFolder', { folderId: activeFolderId, filter }).then((result) => {
      if (cancelled) return;
      if (result.ok) setEntries(result.data);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [activeFolderId, filter]);

  const clearSelection = () => {
    setSelection(new Set());
    setAnchor(null);
  };

  const select = (index: number, event: { ctrlKey: boolean; shiftKey: boolean }) => {
    const hash = entries[index]?.hash;
    if (!hash) return;
    if (event.shiftKey && anchor !== null) {
      const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
      setSelection(new Set(entries.slice(from, to + 1).map((entry) => entry.hash)));
      return;
    }
    setAnchor(index);
    if (event.ctrlKey) {
      setSelection((current) => {
        const next = new Set(current);
        if (next.has(hash)) next.delete(hash);
        else next.add(hash);
        return next;
      });
    } else setSelection(new Set([hash]));
  };

  const bulk = async (action: MaskBulkAction) => {
    const hashes = [...selection];
    const result = await window.api.invoke('masks:bulk', { hashes, action });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    forgetMasks(hashes);
    await Promise.all([loadEntries(), loadSummary()]);
  };

  /** §12.2: selected files go to the Windows recycle bin and leave the game. */
  const trashSelection = async () => {
    setConfirmTrash(false);
    if (!activeFolder) return;
    const hashes = [...selection];
    const result = await window.api.invoke('library:trashMedia', { folderId: activeFolder.id, hashes });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.data.failed.length > 0)
      setError(
        t('media.trash.failed', { count: result.data.failed.length, files: result.data.failed.join(', ') }),
      );
    forgetMasks(hashes);
    clearSelection();
    await Promise.all([loadEntries(), loadSummary()]);
  };

  const onSaved = useCallback(
    (imageHash: string, maskStatus: MaskStatus, regionCount: number) => {
      // Keep the editor's list stable (no re-filtering while editing); refresh counts
      setEntries((current) =>
        current.map((entry) => (entry.hash === imageHash ? { ...entry, maskStatus, regionCount } : entry)),
      );
      void loadSummary();
    },
    [loadSummary],
  );

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
      <nav
        aria-label={t('media.foldersNav')}
        className="overflow-y-auto border-r border-line bg-panel px-5 py-6"
      >
        {SIDEBAR_GROUPS.map((group) => {
          const groupFolders = folders.filter((folder) => group.match(folder.role, folder.group));
          if (groupFolders.length === 0) return null;
          return (
            <section key={group.key} className="mb-6 flex flex-col gap-1">
              <h2 className="mb-1 font-label text-label uppercase tracking-label text-ink-muted">
                {t(`library.section.${group.key}`)}
              </h2>
              {groupFolders.map((folder) => {
                const progress = summary[folder.id] ?? { total: 0, reviewed: 0, masked: 0, noRegions: 0 };
                const isActive = folder.id === activeFolder?.id;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => {
                      clearSelection();
                      setFolderId(folder.id);
                    }}
                    className={classNames(
                      'flex flex-col gap-1.5 rounded-panel px-3 py-2.5 text-left transition-colors duration-150',
                      isActive ? 'bg-surface' : 'hover:bg-surface/60',
                    )}
                  >
                    <span className="font-display text-chip font-semibold uppercase tracking-chip">
                      {folder.displayName}
                    </span>
                    <ProgressBar
                      value={progress.reviewed}
                      max={Math.max(1, progress.total)}
                      label={t('media.progress', { reviewed: progress.reviewed, total: progress.total })}
                    />
                    <span className="font-label text-key text-ink-muted tabular-nums">
                      {t('media.progress', { reviewed: progress.reviewed, total: progress.total })}
                    </span>
                  </button>
                );
              })}
            </section>
          );
        })}
      </nav>

      <section className="flex min-h-0 flex-col gap-4 px-8 py-6">
        <div className="flex flex-wrap items-end gap-6">
          <SegmentedControl
            label={t('media.filter.label')}
            value={filter}
            options={FILTERS.map((value) => ({ value, label: t(`media.filter.${value}`) }))}
            onChange={(value) => {
              clearSelection();
              setFilter(value);
            }}
          />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="font-label text-label text-ink-muted tabular-nums">
              {t('media.selected', { count: selection.size, total: entries.length })}
            </span>
            <Button
              variant="text"
              onClick={() => {
                setSelection(new Set(entries.map((entry) => entry.hash)));
              }}
            >
              {t('media.selectAll')}
            </Button>
            <Button variant="outline" disabled={selection.size === 0} onClick={() => void bulk('no_regions')}>
              {t('media.bulk.noRegions')}
            </Button>
            <Button variant="outline" disabled={selection.size === 0} onClick={() => void bulk('clear')}>
              {t('media.bulk.clear')}
            </Button>
            <Button
              variant="outline"
              disabled={selection.size === 0}
              onClick={() => {
                setConfirmTrash(true);
              }}
            >
              <Icon name="trash" size={16} />
              {t('media.trash.action')}
            </Button>
          </div>
        </div>
        {error && (
          <Alert
            onDismiss={() => {
              setError(null);
            }}
          >
            {error}
          </Alert>
        )}
        {entries.length === 0 ? (
          <p className="text-body text-ink-muted">{t('media.empty')}</p>
        ) : (
          <VirtualGrid
            items={entries}
            minTileSize={TILE_SIZE}
            gap={TILE_GAP}
            label={t('media.gridLabel')}
            itemKey={(entry) => `${entry.hash}-${entry.fileName}`}
            renderItem={(entry, index) => (
              <button
                type="button"
                aria-pressed={selection.has(entry.hash)}
                title={entry.fileName}
                onClick={(event) => {
                  select(index, event);
                }}
                onDoubleClick={() => {
                  setEditorIndex(index);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    setEditorIndex(index);
                  }
                }}
                className={classNames(
                  'relative h-full w-full overflow-hidden rounded-panel bg-stage outline-offset-2',
                  selection.has(entry.hash) && 'outline-2 outline-ink',
                )}
              >
                <Media hash={entry.hash} kind={entry.kind} variant="thumbnail" alt={entry.fileName} />
                <span className="absolute top-1.5 left-1.5">
                  <StatusBadge status={entry.maskStatus} count={entry.regionCount} />
                </span>
              </button>
            )}
          />
        )}
        <p className="text-body-sm text-ink-muted">{t('media.hint')}</p>
      </section>

      <Dialog
        open={confirmTrash}
        onClose={() => {
          setConfirmTrash(false);
        }}
        title={t('media.trash.title', { count: selection.size })}
      >
        <p className="px-8 py-4 text-body text-ink-2">{t('media.trash.body', { count: selection.size })}</p>
        <div className="flex justify-end gap-3 px-8 pb-7">
          <Button
            variant="text"
            {...DIALOG_AUTOFOCUS}
            onClick={() => {
              setConfirmTrash(false);
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void trashSelection()}>
            {t('media.trash.confirm', { count: selection.size })}
          </Button>
        </div>
      </Dialog>

      {editorIndex !== null && (
        <MaskEditor
          entries={entries}
          startIndex={editorIndex}
          onSaved={onSaved}
          onClose={() => {
            setEditorIndex(null);
            void loadEntries();
          }}
        />
      )}
    </div>
  );
}
