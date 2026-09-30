import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FOLDER_FIELDS, validateFields } from '@shared/config/gameConfig';
import { FOLDER_DEFAULTS, type FolderConfig, type FolderScanStatus } from '@shared/content';
import { SectionEditor } from '@renderer/features/admin/SectionEditor';
import { useLibraryStore } from '@renderer/stores/libraryStore';
import { Button } from '@renderer/ui/Button';
import { Dialog } from '@renderer/ui/Dialog';
import { DIALOG_AUTOFOCUS } from '@renderer/ui/dialogAutofocus';
import { Icon } from '@renderer/ui/icons/Icon';
import { SegmentedControl } from '@renderer/ui/SegmentedControl';
import { Switch } from '@renderer/ui/Switch';
import { TextField } from '@renderer/ui/TextField';
import { folderHealth, folderHealthText } from './folderLabels';
import { groupOptions, roleOptions } from './groupOptions';
import { MediaGrid } from './MediaGrid';

interface FolderDetailProps {
  folder: FolderConfig;
  status: FolderScanStatus | undefined;
  scanning: boolean;
}

export function FolderDetail({ folder, status, scanning }: FolderDetailProps) {
  const { t } = useTranslation();
  const updateFolder = useLibraryStore((state) => state.updateFolder);
  const removeFolder = useLibraryStore((state) => state.removeFolder);
  // null = not editing; shows the stored name so external updates stay visible
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const health = folderHealth(folder, status, scanning);
  // Performers have no share between categories (game-design §5.1)
  const folderFields = FOLDER_FIELDS.filter(
    (spec) => folder.role === 'content' || spec.key !== 'shareWeight',
  );

  const commitName = () => {
    const trimmed = nameDraft?.trim();
    if (trimmed && trimmed !== folder.displayName) void updateFolder(folder.id, { displayName: trimmed });
    setNameDraft(null);
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="font-label text-label uppercase tracking-label text-ink-muted">
          {folder.role === 'performer'
            ? t('library.role.performer')
            : `${t(`library.group.${folder.group}`)} · ${t(`library.role.${folder.role}`)}`}
        </div>
        <h2 className="font-display text-title font-bold uppercase">{folder.displayName}</h2>
        <div className="flex items-center gap-2 font-label text-label text-ink-muted select-text">
          <Icon name="folder" size={16} />
          {folder.path}
        </div>
        <div className={`text-body-sm ${health === 'ok' ? 'text-ink-2' : 'text-bad'}`}>
          {folderHealthText(t, health, folder, status)}
        </div>
        {status && status.failedCount > 0 && (
          <div className="flex items-center gap-2 text-body-sm text-bad">
            <Icon name="warning" size={14} />
            {t('library.status.skipped', { count: status.failedCount })}
          </div>
        )}
      </header>

      <div className="grid max-w-3xl grid-cols-1 gap-6">
        <TextField
          label={t('library.field.displayName')}
          value={nameDraft ?? folder.displayName}
          onChange={(event) => {
            setNameDraft(event.target.value);
          }}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <div className="flex flex-wrap items-end gap-8">
          {folder.role === 'content' && (
            <SegmentedControl
              label={t('library.field.group')}
              value={folder.group}
              options={groupOptions(t)}
              onChange={(group) => void updateFolder(folder.id, { group })}
            />
          )}
          <SegmentedControl
            label={t('library.field.role')}
            value={folder.role}
            options={roleOptions(t)}
            onChange={(role) => void updateFolder(folder.id, { role })}
          />
          <Switch
            label={folder.enabled ? t('library.field.enabled') : t('library.field.disabled')}
            checked={folder.enabled}
            onChange={(enabled) => void updateFolder(folder.id, { enabled })}
          />
        </div>
        <div>
          <Button
            variant="text"
            onClick={() => {
              setConfirmRemove(true);
            }}
          >
            <Icon name="trash" size={16} />
            {t('library.detail.remove')}
          </Button>
        </div>
      </div>

      <SectionEditor
        compact
        title={t('library.detail.properties')}
        intro={t(
          folder.role === 'performer'
            ? 'library.detail.propertiesPerformer'
            : 'library.detail.propertiesContent',
        )}
        value={folder}
        fields={folderFields}
        validate={(draft) => validateFields(draft, folderFields)}
        onSave={(draft) =>
          updateFolder(folder.id, {
            selectionWeight: draft.selectionWeight,
            shareWeight: draft.shareWeight,
            taskRange: draft.taskRange,
            minImages: draft.minImages,
            unmaskedEffectBehavior: draft.unmaskedEffectBehavior,
          })
        }
        onReset={async () => {
          await updateFolder(folder.id, {
            selectionWeight: FOLDER_DEFAULTS.selectionWeight,
            shareWeight: FOLDER_DEFAULTS.shareWeight,
            taskRange: [...FOLDER_DEFAULTS.taskRange],
            minImages: FOLDER_DEFAULTS.minImages,
            unmaskedEffectBehavior: FOLDER_DEFAULTS.unmaskedEffectBehavior,
          });
        }}
      />

      {/* FolderDetail is keyed by folder id, so the grid remounts per folder */}
      {status?.state === 'ok' && (
        <MediaGrid folderId={folder.id} revision={`${status.lastScannedAt}-${status.mediaCount}`} />
      )}

      <Dialog
        open={confirmRemove}
        onClose={() => {
          setConfirmRemove(false);
        }}
        title={t('library.remove.title')}
      >
        <p className="px-8 py-4 text-body text-ink-2">
          {t('library.remove.body', { name: folder.displayName })}
        </p>
        <div className="flex justify-end gap-3 px-8 pb-7">
          <Button
            variant="text"
            {...DIALOG_AUTOFOCUS}
            onClick={() => {
              setConfirmRemove(false);
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setConfirmRemove(false);
              void removeFolder(folder.id);
            }}
          >
            {t('library.remove.confirm')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
