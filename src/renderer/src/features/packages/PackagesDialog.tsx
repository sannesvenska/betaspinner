import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PackageSummary, PackageZipInfo } from '@shared/packages';
import { usePackagesStore } from '@renderer/stores/packagesStore';
import { Alert } from '@renderer/ui/Alert';
import { Button } from '@renderer/ui/Button';
import { classNames } from '@renderer/ui/classNames';
import { Dialog } from '@renderer/ui/Dialog';
import { DIALOG_AUTOFOCUS } from '@renderer/ui/dialogAutofocus';
import { Icon } from '@renderer/ui/icons/Icon';
import { TextField } from '@renderer/ui/TextField';
import { formatSize } from './formatSize';
import { PackageProgressBar } from './PackageProgressBar';

function PackageRow({ entry, active }: { entry: PackageSummary; active: boolean }) {
  const { t } = useTranslation();
  const { activate, rename, duplicate, remove, exportPackage, busy } = usePackagesStore();
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [exported, setExported] = useState(false);

  return (
    <li
      className={classNames(
        'flex flex-col gap-3 rounded-panel border px-5 py-4',
        active ? 'border-ink bg-panel' : 'border-line',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        {nameDraft === null ? (
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-3 font-display text-chip font-semibold uppercase tracking-chip">
              {entry.name}
              {active && <span className="font-label text-key text-good">{t('packages.active')}</span>}
            </span>
            <span className="text-body-sm text-ink-muted">
              {t('packages.meta', {
                folders: entry.folderCount,
                files: entry.mediaCount,
                size: formatSize(entry.sizeBytes),
              })}
            </span>
          </div>
        ) : (
          <form
            className="flex flex-1 items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void rename(entry.id, nameDraft).then((ok) => {
                if (ok) setNameDraft(null);
              });
            }}
          >
            <div className="flex-1">
              <TextField
                label={t('packages.name')}
                value={nameDraft}
                autoFocus
                onChange={(event) => {
                  setNameDraft(event.target.value);
                }}
              />
            </div>
            <Button type="submit" variant="primary" disabled={busy || !nameDraft.trim()}>
              {t('admin.save')}
            </Button>
            <Button
              variant="text"
              onClick={() => {
                setNameDraft(null);
              }}
            >
              {t('common.cancel')}
            </Button>
          </form>
        )}
        {!active && nameDraft === null && (
          <Button variant="primary" disabled={busy} onClick={() => void activate(entry.id)}>
            {t('packages.activate')}
          </Button>
        )}
      </div>
      {nameDraft === null && (
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="text"
            disabled={busy}
            onClick={() => {
              setNameDraft(entry.name);
            }}
          >
            {t('packages.rename')}
          </Button>
          <Button variant="text" disabled={busy} onClick={() => void duplicate(entry.id)}>
            {t('packages.duplicate')}
          </Button>
          <Button
            variant="text"
            disabled={busy}
            onClick={() => {
              setExported(false);
              void exportPackage(entry.id).then(setExported);
            }}
          >
            {t('packages.export')}
          </Button>
          {!active &&
            (confirmRemove ? (
              <span className="flex items-center gap-2">
                <span className="text-body-sm text-bad">{t('packages.removeConfirm')}</span>
                <Button variant="outline" disabled={busy} onClick={() => void remove(entry.id)}>
                  <Icon name="trash" size={16} />
                  {t('packages.remove')}
                </Button>
                <Button
                  variant="text"
                  onClick={() => {
                    setConfirmRemove(false);
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </span>
            ) : (
              <Button
                variant="text"
                disabled={busy}
                onClick={() => {
                  setConfirmRemove(true);
                }}
              >
                <Icon name="trash" size={16} />
                {t('packages.remove')}
              </Button>
            ))}
          {exported && <span className="text-body-sm text-good">{t('packages.exported')}</span>}
        </div>
      )}
    </li>
  );
}

/**
 * game-design §5.4: lists the content packages; the active one is played and edited in the admin.
 * Switching reloads the app with the other package.
 */
export function PackagesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const {
    status,
    progress,
    busy,
    error,
    load,
    subscribe,
    create,
    pickImport,
    importPackage,
    moveRoot,
    dismissError,
  } = usePackagesStore();
  const [newName, setNewName] = useState('');
  const [pending, setPending] = useState<PackageZipInfo | null>(null);

  useEffect(() => subscribe(), [subscribe]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const startImport = async () => {
    const info = await pickImport();
    if (!info) return;
    if (info.exists) setPending(info);
    else await importPackage(info, 'copy');
  };

  return (
    <Dialog open={open} onClose={onClose} title={t('packages.title')}>
      <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto px-8 py-6">
        <p className="text-body-sm text-ink-2">{t('packages.intro')}</p>
        {error && <Alert onDismiss={dismissError}>{error}</Alert>}
        {busy && progress && <PackageProgressBar progress={progress} />}
        <ul className="flex flex-col gap-3">
          {status?.packages.map((entry) => (
            <PackageRow key={entry.id} entry={entry} active={entry.id === status.activeId} />
          ))}
        </ul>

        {pending ? (
          <div role="alert" className="flex flex-col gap-3 rounded-panel border border-line-strong px-5 py-4">
            <p className="text-body text-ink-2">{t('packages.conflict', { name: pending.name })}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  void importPackage(pending, 'replace').then(() => {
                    setPending(null);
                  });
                }}
              >
                {t('packages.replace')}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  void importPackage(pending, 'copy').then(() => {
                    setPending(null);
                  });
                }}
              >
                {t('packages.importCopy')}
              </Button>
              <Button
                variant="text"
                {...DIALOG_AUTOFOCUS}
                onClick={() => {
                  setPending(null);
                }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3 border-t border-line pt-5">
            <form
              className="flex flex-1 items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void create(newName).then((ok) => {
                  if (ok) setNewName('');
                });
              }}
            >
              <div className="flex-1">
                <TextField
                  label={t('packages.newName')}
                  value={newName}
                  onChange={(event) => {
                    setNewName(event.target.value);
                  }}
                />
              </div>
              <Button type="submit" variant="outline" disabled={busy || !newName.trim()}>
                <Icon name="plus" size={16} />
                {t('packages.create')}
              </Button>
            </form>
            <Button variant="outline" disabled={busy} onClick={() => void startImport()}>
              {t('packages.import')}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <div className="flex flex-col gap-1">
            <span className="font-label text-label uppercase tracking-label text-ink-muted">
              {t('packages.library')}
            </span>
            <span className="font-label text-label text-ink-2 select-text">{status?.root ?? '–'}</span>
          </div>
          <Button variant="text" disabled={busy} onClick={() => void moveRoot()}>
            {t('packages.move')}
          </Button>
        </div>
      </div>
      <div className="flex justify-end border-t border-line px-8 py-5">
        <Button variant="primary" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </Dialog>
  );
}
