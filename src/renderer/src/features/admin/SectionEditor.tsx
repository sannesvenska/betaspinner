import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getField, hasErrors, setField, type FieldErrors, type FieldSpec } from '@shared/config/gameConfig';
import { Button } from '@renderer/ui/Button';
import { Dialog } from '@renderer/ui/Dialog';
import { DIALOG_AUTOFOCUS } from '@renderer/ui/dialogAutofocus';
import { Icon } from '@renderer/ui/icons/Icon';
import { groupLabel } from './fieldLabels';
import { SpecField } from './SpecField';

interface SectionEditorProps<T extends object> {
  title: string;
  intro: string;
  /** Saved value – the draft starts from it and returns to it on discard */
  value: T;
  fields: readonly FieldSpec[];
  validate: (draft: T) => FieldErrors;
  onSave: (draft: T) => Promise<boolean>;
  /** Omitted = no "reset to defaults" (e.g. user-created cards) */
  onReset?: () => Promise<void>;
  /** Smaller heading for editors nested in a list */
  compact?: boolean;
  /** Editors that are not plain fields (e.g. collectible tiers) */
  extra?: (draft: T, update: (next: T) => void, errors: FieldErrors) => ReactNode;
  footer?: ReactNode;
}

/**
 * Admin section (game-design §16): edits a draft, validates on every change with the shared field specs,
 * saves only a valid draft. Changes to session rules apply to the next session.
 */
export function SectionEditor<T extends object>({
  title,
  intro,
  value,
  fields,
  validate,
  onSave,
  onReset,
  extra,
  footer,
  compact = false,
}: SectionEditorProps<T>) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<T | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [saving, setSaving] = useState(false);
  const current = draft ?? value;
  const errors = validate(current);
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(value);
  const groups = [...new Set(fields.map((spec) => spec.group))];

  const save = async () => {
    if (!draft || hasErrors(errors)) return;
    setSaving(true);
    try {
      if (await onSave(draft)) setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h2
          className={`font-display font-bold uppercase ${compact ? 'text-chip tracking-chip' : 'text-title'}`}
        >
          {title}
        </h2>
        {intro && <p className="max-w-3xl text-body text-ink-2">{intro}</p>}
      </header>

      {groups.map((group) => (
        <section key={group} className="flex flex-col gap-5 border-t border-line pt-6">
          <h3 className="font-label text-label uppercase tracking-label text-ink-muted">
            {groupLabel(t, group)}
          </h3>
          <div className="flex flex-wrap items-start gap-x-10 gap-y-6">
            {fields
              .filter((spec) => spec.group === group)
              .map((spec) => (
                <SpecField
                  key={spec.key}
                  spec={spec}
                  value={getField(current, spec.key)}
                  errors={errors}
                  onChange={(next) => {
                    setDraft(setField(current, spec.key, next));
                  }}
                />
              ))}
          </div>
        </section>
      ))}

      {extra?.(current, setDraft, errors)}

      <div
        className={`flex items-center gap-3 border-t border-line bg-bg py-5 ${compact ? '' : 'sticky bottom-0'}`}
      >
        <Button
          variant="primary"
          disabled={!dirty || hasErrors(errors) || saving}
          onClick={() => void save()}
        >
          <Icon name="check" size={16} />
          {t('admin.save')}
        </Button>
        <Button
          variant="text"
          disabled={!dirty}
          onClick={() => {
            setDraft(null);
          }}
        >
          {t('admin.discard')}
        </Button>
        <span className="text-body-sm text-ink-muted">
          {hasErrors(errors) ? t('admin.fixErrors') : dirty ? t('admin.unsaved') : t('admin.nextSession')}
        </span>
        {onReset && (
          <Button
            variant="text"
            className="ml-auto"
            onClick={() => {
              setConfirmReset(true);
            }}
          >
            <Icon name="refresh" size={16} />
            {t('admin.resetDefaults')}
          </Button>
        )}
      </div>
      {footer}

      <Dialog
        open={confirmReset}
        onClose={() => {
          setConfirmReset(false);
        }}
        title={t('admin.resetTitle', { section: title })}
      >
        <p className="px-8 py-4 text-body text-ink-2">{t('admin.resetBody')}</p>
        <div className="flex justify-end gap-3 px-8 pb-7">
          <Button
            variant="text"
            {...DIALOG_AUTOFOCUS}
            onClick={() => {
              setConfirmReset(false);
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setConfirmReset(false);
              setDraft(null);
              void onReset?.();
            }}
          >
            {t('admin.resetConfirm')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
