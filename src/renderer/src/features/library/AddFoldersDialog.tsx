import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FolderRole, NewFolderInput } from '@shared/content';
import type { Group } from '@shared/game';
import { Button } from '@renderer/ui/Button';
import { Dialog } from '@renderer/ui/Dialog';
import { SegmentedControl } from '@renderer/ui/SegmentedControl';
import { TextField } from '@renderer/ui/TextField';
import { folderBaseName } from './folderLabels';
import { groupOptions, roleOptions } from './groupOptions';

interface Draft {
  path: string;
  displayName: string;
  group: Group | null;
  role: FolderRole;
}

interface AddFoldersDialogProps {
  paths: string[];
  onCancel: () => void;
  onSubmit: (inputs: NewFolderInput[]) => Promise<void>;
}

/**
 * Wizard step after picking folders: content folders need an explicit group; role defaults to content.
 * Performer galleries have no group (game-design §5.1 v2).
 */
export function AddFoldersDialog({ paths, onCancel, onSubmit }: AddFoldersDialogProps) {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    paths.map((path) => ({ path, displayName: folderBaseName(path), group: null, role: 'content' })),
  );
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

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
    <Dialog open onClose={onCancel} title={t('library.add.title', { count: drafts.length })}>
      <p className="px-8 pt-2 text-body text-ink-2">{t('library.add.intro')}</p>
      <div className="flex max-h-[60vh] flex-col gap-6 overflow-y-auto px-8 py-6">
        {drafts.map((draft, index) => (
          <section
            key={draft.path}
            className="flex flex-col gap-4 border-t border-line pt-5 first:border-t-0 first:pt-0"
          >
            <div className="font-label text-label text-ink-muted" title={draft.path}>
              {draft.path}
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
      <div className="flex justify-end gap-3 border-t border-line px-8 py-5">
        <Button variant="text" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" disabled={saving} onClick={() => void submit()}>
          {t('library.add.submit', { count: drafts.length })}
        </Button>
      </div>
    </Dialog>
  );
}
