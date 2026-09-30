import { useTranslation } from 'react-i18next';
import type { FieldErrors, FieldSpec } from '@shared/config/gameConfig';
import { NumberField } from '@renderer/ui/NumberField';
import { SegmentedControl } from '@renderer/ui/SegmentedControl';
import { Switch } from '@renderer/ui/Switch';
import { errorLabel, fieldLabel, optionLabel } from './fieldLabels';

interface SpecFieldProps {
  spec: FieldSpec;
  value: unknown;
  errors: FieldErrors;
  onChange: (value: unknown) => void;
}

const asNumber = (value: unknown): number => (typeof value === 'number' ? value : Number.NaN);
const LINKED = 'linked';
const DEFAULT_FIXED_SHARE = 0.4;
const DEFAULT_LIMIT = 10;

/** One admin field rendered from its spec (game-design §16); errors come from the shared validation. */
export function SpecField({ spec, value, errors, onChange }: SpecFieldProps) {
  const { t } = useTranslation();
  const label = fieldLabel(t, spec);
  const error = (key: string) => {
    const code = errors[key];
    return code ? errorLabel(t, code, spec) : null;
  };

  switch (spec.kind) {
    case 'boolean':
      return (
        <Switch
          label={`${label}: ${value === true ? t('admin.on') : t('admin.off')}`}
          checked={value === true}
          onChange={onChange}
        />
      );
    case 'select':
      return (
        <SegmentedControl
          label={label}
          value={typeof value === 'string' ? value : ''}
          options={(spec.options ?? []).map((option) => ({
            value: option,
            label: optionLabel(t, spec.key, option),
          }))}
          onChange={onChange}
        />
      );
    case 'range': {
      const [min, max] = Array.isArray(value) ? (value as unknown[]) : [];
      return (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-label text-label uppercase tracking-label text-ink-muted">
            {label}
          </legend>
          <div className="flex items-start gap-3">
            <NumberField
              compact
              label={t('admin.min')}
              value={asNumber(min)}
              min={spec.min}
              max={spec.max}
              step={spec.step}
              error={error(`${spec.key}.0`)}
              onChange={(next) => {
                onChange([next, max]);
              }}
            />
            <NumberField
              compact
              label={t('admin.max')}
              value={asNumber(max)}
              min={spec.min}
              max={spec.max}
              step={spec.step}
              error={error(`${spec.key}.1`)}
              onChange={(next) => {
                onChange([min, next]);
              }}
            />
          </div>
          {errors[spec.key] && <span className="text-body-sm text-bad">{error(spec.key)}</span>}
        </fieldset>
      );
    }
    case 'goodShare': {
      const linked = value === LINKED;
      return (
        <div className="flex items-end gap-4">
          <SegmentedControl
            label={label}
            value={linked ? 'linked' : 'fixed'}
            options={[
              { value: 'linked', label: t('admin.goodShare.linked') },
              { value: 'fixed', label: t('admin.goodShare.fixed') },
            ]}
            onChange={(mode) => {
              onChange(mode === 'linked' ? LINKED : DEFAULT_FIXED_SHARE);
            }}
          />
          {!linked && (
            <NumberField
              compact
              percent
              label={t('admin.goodShare.value')}
              value={asNumber(value)}
              min={spec.min}
              max={spec.max}
              step={spec.step}
              error={error(spec.key)}
              onChange={onChange}
            />
          )}
        </div>
      );
    }
    case 'optionalInt': {
      const unlimited = value === null;
      return (
        <div className="flex items-end gap-4">
          <Switch
            label={`${label}: ${unlimited ? t('admin.unlimited') : t('admin.limited')}`}
            checked={!unlimited}
            onChange={(limited) => {
              onChange(limited ? DEFAULT_LIMIT : null);
            }}
          />
          {!unlimited && (
            <NumberField
              compact
              label={t('admin.limit')}
              value={asNumber(value)}
              min={spec.min}
              max={spec.max}
              step={spec.step}
              error={error(spec.key)}
              onChange={onChange}
            />
          )}
        </div>
      );
    }
    default:
      return (
        <NumberField
          label={label}
          value={asNumber(value)}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          percent={spec.kind === 'percent'}
          error={error(spec.key)}
          onChange={onChange}
        />
      );
  }
}
