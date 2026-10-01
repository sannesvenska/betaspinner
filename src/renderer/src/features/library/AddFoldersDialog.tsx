import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FOLDER_DEFAULTS, type FolderRole, type NewFolderInput, type PickedFolder } from '@shared/content';
import type { Group } from '@shared/game';
import { Button } from '@renderer/ui/Button';
import { Dialog } from '@renderer/ui/Dialog';
import { useLibraryStore } from '@renderer/stores/libraryStore';
import { Icon } from '@renderer/ui/icons/Icon';
import { ProgressBar } from '@renderer/ui/ProgressBar';
import { SegmentedControl } from '@renderer/ui/SegmentedControl';
import { TextField } from '@renderer/ui/TextField';
import { folderBaseName } from './folderLabels';
import { groupOptions, roleOptions } from './groupOptions';

interface Draft {
  path: string;
  mediaCount: number | null;
  displayName: string;
  group: Group | null;
  role: FolderRole;
}

interface AddFoldersDialogProps {
  picked: PickedFolder[];
  onCancel: () => void;
  onSubmit: (inputs: NewFolderInput[]) => Promise<void>;
}

/**
 * Wizard step after picking folders: content folders need an explicit group; role defaults to content.
 * Performer galleries have no group (game-design §5.1 v2).
 */
function MediaCount({ count }: { count: number | null }) {
  const { t } = useTranslation();
  if (count === null) return <span className="text-body-sm text-bad">{t('library.add.unreadable')}</span>;
  const few = count < FOLDER_DEFAULTS.minImages;
  return (
    <div className="flex flex-col gap-1">
      <span
        className={`font-display text-chip font-semibold uppercase tracking-chip ${few ? 'text-bad' : ''}`}
      >
        {t('library.add.mediaCount', { count })}
      </span>
      {count === 0 ? (
        <span className="text-body-sm text-bad">{t('library.add.mediaNone')}</span>
      ) : (
        few && (
          <span className="text-body-sm text-bad">
            {t('library.add.mediaFew', { min: FOLDER_DEFAULTS.minImages })}
          </span>
        )
      )}
    </div>
  );
}

export function AddFoldersDialog({ picked, onCancel, onSubmit }: AddFoldersDialogProps) {
  const { t } = useTranslation();
  // Folders already in the library are only listed with a warning and never added again
  const duplicates = picked.filter((folder) => folder.alreadyAdded !== null);
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    picked
      .filter((folder) => folder.alreadyAdded === null)
      .map((folder) => ({
        path: folder.path,
        mediaCount: folder.mediaCount,
        displayName: folderBaseName(folder.path),
        group: null,
        role: 'content',
      })),
  );
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const importing = useLibraryStore((state) => state.importing);

  const patchDraft = (index: number, patch: Partial<Draft>) => {
    setDrafts((current) => current.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)));
  };

  const submit = async () => {
    const complete = drafts.flatMap((draft) => {
      // The stored group of a performer folder is ignored
      const group = draft.role === 'performer' ? (draft.group ?? 'good') : draft.group;
      return group && draft.displayName.trim()
        ? [{ path: draft.path, displayName: draft.displayName.trim(), group, role: draft.role }]
        : [];
    });
    if (complete.length !== drafts.length) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    try {
      await onSubmit(complete);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onCancel} title={t('library.add.title', { count: Math.max(1, drafts.length) })}>
      <p className="px-8 pt-2 text-body text-ink-2">
        {drafts.length > 0 ? t('library.add.intro') : t('library.add.allAdded', { count: duplicates.length })}
      </p>
      <div className="flex max-h-[60vh] flex-col gap-6 overflow-y-auto px-8 py-6">
        {duplicates.map((folder) => (
          <div key={folder.path} role="alert" className="flex items-start gap-3 text-body-sm text-bad">
            <Icon name="warning" size={16} />
            <div className="flex flex-col gap-1">
              <span className="font-label text-label text-ink-muted">{folder.path}</span>
              {t('library.add.alreadyAdded', { name: folder.alreadyAdded })}
            </div>
          </div>
        ))}
        {drafts.map((draft, index) => (
          <section
            key={draft.path}
            className="flex flex-col gap-4 border-t border-line pt-5 first:border-t-0 first:pt-0"
          >
            <div className="flex items-start justify-between gap-6">
              <div className="font-label text-label text-ink-muted" title={draft.path}>
                {draft.path}
              </div>
              <MediaCount count={draft.mediaCount} />
            </div>
            <TextField
              label={t('library.field.displayName')}
              value={draft.displayName}
              error={showErrors && !draft.displayName.trim() ? t('library.add.nameRequired') : null}
              onChange={(event) => {
                patchDraft(index, { displayName: event.target.value });
              }}
            />
            <div className="flex flex-wrap gap-8">
              <SegmentedControl
                label={t('library.field.role')}
                value={draft.role}
                options={roleOptions(t)}
                onChange={(role) => {
                  patchDraft(index, { role });
                }}
              />
              <div className={draft.role === 'performer' ? 'hidden' : 'flex flex-col gap-2'}>
                <SegmentedControl
                  label={t('library.field.group')}
                  value={draft.group ?? ('' as Group)}
                  options={groupOptions(t)}
                  onChange={(group) => {
                    patchDraft(index, { group });
                  }}
                />
                {showErrors && !draft.group && (
                  <span className="text-body-sm text-bad">{t('library.add.groupRequired')}</span>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>
      {saving && importing && (
        <div className="flex flex-col gap-2 border-t border-line px-8 py-4">
          <span className="text-body-sm text-ink-2">
            {t('library.add.copying', {
              folder: importing.folderName,
              index: importing.folderIndex + 1,
              count: importing.folderCount,
              copied: importing.copied,
              total: importing.total,
            })}
          </span>
          <ProgressBar value={importing.copied} max={importing.total} label={t('library.add.copyingLabel')} />
        </div>
      )}
      <div className="flex justify-end gap-3 border-t border-line px-8 py-5">
        <Button variant="text" onClick={onCancel}>
          {drafts.length > 0 ? t('common.cancel') : t('common.close')}
        </Button>
        {drafts.length > 0 && (
          <Button variant="primary" disabled={saving} onClick={() => void submit()}>
            {t('library.add.submit', { count: drafts.length })}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
