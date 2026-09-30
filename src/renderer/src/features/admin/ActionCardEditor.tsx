import { useTranslation } from 'react-i18next';
import { ACTION_IDS } from '@shared/actions';
import {
  ACTION_CARD_FIELDS,
  ACTION_PARAM_BOUNDS,
  validateActionCard,
  type FieldErrors,
} from '@shared/config/gameConfig';
import type { ActionCardDefinition, Range } from '@shared/session/types';
import { useActionCardsStore } from '@renderer/stores/actionCardsStore';
import { classNames } from '@renderer/ui/classNames';
import { NumberField } from '@renderer/ui/NumberField';
import { Switch } from '@renderer/ui/Switch';
import type enNsfw from '@renderer/i18n/locales/en-nsfw.json';
import { errorLabel } from './fieldLabels';
import { SectionEditor } from './SectionEditor';

type ParamId = keyof typeof enNsfw.admin.param;
const DEFAULT_SESSION_CHANCE = 0.5;

function ParamsEditor({
  card,
  onChange,
  errors,
}: {
  card: ActionCardDefinition;
  onChange: (next: ActionCardDefinition) => void;
  errors: FieldErrors;
}) {
  const { t } = useTranslation();
  const entries = Object.entries(card.params);
  const setParam = (key: string, value: number | Range) => {
    onChange({ ...card, params: { ...card.params, [key]: value } });
  };
  const error = (key: string) => {
    const code = errors[key];
    return code ? errorLabel(t, code, ACTION_PARAM_BOUNDS[key.replace(/^params\.|\.\d$/g, '')]) : null;
  };
  // Param labels exist for every built-in key; unknown keys (future types) show the raw key
  const label = (key: string) => (key in ACTION_PARAM_BOUNDS ? t(`admin.param.${key as ParamId}`) : key);

  if (entries.length === 0) return <p className="text-body-sm text-ink-muted">{t('admin.card.noParams')}</p>;
  return (
    <div className="flex flex-wrap items-start gap-x-10 gap-y-6">
      {entries.map(([key, value]) => {
        const bounds = ACTION_PARAM_BOUNDS[key];
        if (key === 'shieldEnabled')
          return (
            <Switch
              key={key}
              label={`${label(key)}: ${value === 1 ? t('admin.on') : t('admin.off')}`}
              checked={value === 1}
              onChange={(enabled) => {
                setParam(key, enabled ? 1 : 0);
              }}
            />
          );
        if (Array.isArray(value)) {
          const [min, max] = value as Range;
          return (
            <fieldset key={key} className="flex flex-col gap-2">
              <legend className="mb-2 font-label text-label uppercase tracking-label text-ink-muted">
                {label(key)}
              </legend>
              <div className="flex gap-3">
                <NumberField
                  compact
                  label={t('admin.min')}
                  value={min}
                  step={bounds?.step}
                  error={error(`params.${key}.0`)}
                  onChange={(next) => {
                    setParam(key, [next, max]);
                  }}
                />
                <NumberField
                  compact
                  label={t('admin.max')}
                  value={max}
                  step={bounds?.step}
                  error={error(`params.${key}.1`)}
                  onChange={(next) => {
                    setParam(key, [min, next]);
                  }}
                />
              </div>
              {errors[`params.${key}`] && (
                <span className="text-body-sm text-bad">{error(`params.${key}`)}</span>
              )}
            </fieldset>
          );
        }
        return (
          <NumberField
            key={key}
            label={label(key)}
            value={typeof value === 'number' ? value : Number.NaN}
            step={bounds?.step}
            error={error(`params.${key}`)}
            onChange={(next) => {
              setParam(key, next);
            }}
          />
        );
      })}
    </div>
  );
}

function RequiresEditor({
  card,
  onChange,
}: {
  card: ActionCardDefinition;
  onChange: (next: ActionCardDefinition) => void;
}) {
  const { t } = useTranslation();
  const requires = card.requires ?? [];
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-label text-label uppercase tracking-label text-ink-muted">
        {t('admin.card.requires')}
      </legend>
      <div className="flex max-w-4xl flex-wrap gap-2">
        {ACTION_IDS.filter((type) => type !== card.type).map((type) => {
          const selected = requires.includes(type);
          return (
            <button
              key={type}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                onChange({
                  ...card,
                  requires: selected ? requires.filter((entry) => entry !== type) : [...requires, type],
                });
              }}
              className={classNames(
                'rounded-panel border px-3 py-1.5 text-body-sm transition-colors duration-150',
                selected ? 'border-ink bg-ink text-bg' : 'border-line-strong text-ink-2 hover:bg-surface',
              )}
            >
              {t(`action.${type}.name`)}
            </button>
          );
        })}
      </div>
      <span className="text-body-sm text-ink-muted">{t('admin.card.requiresHint')}</span>
    </fieldset>
  );
}

/** game-design §6.4 / §10.4 per-card settings (admin, AP10). */
export function ActionCardEditor({ card, label }: { card: ActionCardDefinition; label: string }) {
  const { t } = useTranslation();
  const update = useActionCardsStore((state) => state.update);
  const reset = useActionCardsStore((state) => state.reset);

  return (
    <SectionEditor
      compact
      title={t('admin.card.title', { name: label })}
      intro=""
      value={card}
      fields={ACTION_CARD_FIELDS}
      validate={validateActionCard}
      onSave={async (draft) => {
        await update(card.id, {
          weight: draft.weight,
          minPerSession: draft.minPerSession,
          maxPerSession: draft.maxPerSession,
          sessionChance: draft.sessionChance,
          requires: draft.requires ?? [],
          params: draft.params,
        });
        return useActionCardsStore.getState().error === null;
      }}
      {...(card.builtIn ? { onReset: () => reset(card.id) } : {})}
      extra={(draft, onChange, errors) => (
        <>
          <section className="flex flex-col gap-5 border-t border-line pt-6">
            <div className="flex flex-wrap items-end gap-6">
              <Switch
                label={`${t('admin.card.sessionChance')}: ${
                  draft.sessionChance === null ? t('admin.card.always') : t('admin.card.gated')
                }`}
                checked={draft.sessionChance !== null}
                onChange={(gated) => {
                  onChange({ ...draft, sessionChance: gated ? DEFAULT_SESSION_CHANCE : null });
                }}
              />
              {draft.sessionChance !== null && (
                <NumberField
                  compact
                  percent
                  step={0.01}
                  label={t('admin.card.chance')}
                  value={draft.sessionChance}
                  error={errors.sessionChance ? errorLabel(t, errors.sessionChance) : null}
                  onChange={(sessionChance) => {
                    onChange({ ...draft, sessionChance });
                  }}
                />
              )}
            </div>
            <RequiresEditor card={draft} onChange={onChange} />
          </section>
          <section className="flex flex-col gap-5 border-t border-line pt-6">
            <h3 className="font-label text-label uppercase tracking-label text-ink-muted">
              {t('admin.group.params')}
            </h3>
            <ParamsEditor card={draft} onChange={onChange} errors={errors} />
          </section>
        </>
      )}
    />
  );
}
