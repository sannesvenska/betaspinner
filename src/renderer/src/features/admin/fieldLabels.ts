import type { TFunction } from 'i18next';
import type { FieldError, FieldSpec } from '@shared/config/gameConfig';
import type { UnmaskedEffectBehavior } from '@shared/content';
import type { ActionHintMode, ActionRetrigger } from '@shared/session/types';
import type enNsfw from '@renderer/i18n/locales/en-nsfw.json';

/** Label ids in the pack (`admin.field.<id>`); nested spec keys use `_` instead of `.`. */
export type AdminFieldId = keyof typeof enNsfw.admin.field;
type AdminGroupId = keyof typeof enNsfw.admin.group;

/** Every spec key has a label – guarded by the i18n test (`fieldLabels.test`). */
export const fieldId = (specKey: string): AdminFieldId => specKey.replaceAll('.', '_') as AdminFieldId;

export const fieldLabel = (t: TFunction, spec: Pick<FieldSpec, 'key'>): string =>
  t(`admin.field.${fieldId(spec.key)}`);

export const groupLabel = (t: TFunction, group: string): string => t(`admin.group.${group as AdminGroupId}`);

export function optionLabel(t: TFunction, specKey: string, option: string): string {
  if (specKey === 'actionRetrigger') return t(`admin.option.actionRetrigger.${option as ActionRetrigger}`);
  if (specKey === 'actionHint') return t(`admin.option.actionHint.${option as ActionHintMode}`);
  if (specKey === 'unmaskedEffectBehavior')
    return t(`admin.option.unmaskedEffectBehavior.${option as UnmaskedEffectBehavior}`);
  return option;
}

export const errorLabel = (t: TFunction, error: FieldError, spec?: Pick<FieldSpec, 'min' | 'max'>): string =>
  t(`admin.error.${error}`, { min: spec?.min, max: spec?.max });
