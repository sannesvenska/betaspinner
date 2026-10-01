import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BETA_FIELDS,
  MAX_COLLECTIBLE_TIERS,
  PENALTY_RULE_FIELDS,
  PERFORMER_RULE_FIELDS,
  PIXELATE_LEVELS,
  SESSION_RULE_FIELDS,
  validateBeta,
  validatePenaltyRules,
  validateSessionRules,
  validateVisualEffects,
  type FieldErrors,
} from '@shared/config/gameConfig';
import type { CollectibleTier, SessionRules } from '@shared/session/types';
import { useGameConfigStore } from '@renderer/stores/gameConfigStore';
import { useSessionStore } from '@renderer/stores/sessionStore';
import { Button } from '@renderer/ui/Button';
import { HoldToConfirm } from '@renderer/ui/HoldToConfirm';
import { Icon } from '@renderer/ui/icons/Icon';
import { NumberField } from '@renderer/ui/NumberField';
import { SegmentedControl } from '@renderer/ui/SegmentedControl';
import { errorLabel } from './fieldLabels';
import { SectionEditor } from './SectionEditor';

const NEW_TIER: CollectibleTier = { collected: 6, bonus: { type: 'release_chance', percent: 5 } };

export function SessionRulesSection() {
  const { t } = useTranslation();
  const rules = useGameConfigStore((state) => state.config.rules);
  const update = useGameConfigStore((state) => state.update);
  const reset = useGameConfigStore((state) => state.reset);
  return (
    <SectionEditor
      title={t('admin.section.rules')}
      intro={t('admin.intro.rules')}
      value={rules}
      fields={SESSION_RULE_FIELDS}
      validate={validateSessionRules}
      onSave={(value) => update({ section: 'rules', value })}
      onReset={() => reset('rules')}
    />
  );
}

function TierEditor({
  rules,
  onChange,
  errors,
}: {
  rules: SessionRules;
  onChange: (next: SessionRules) => void;
  errors: FieldErrors;
}) {
  const { t } = useTranslation();
  const tiers = rules.collectibleTiers;
  const setTiers = (next: CollectibleTier[]) => {
    onChange({ ...rules, collectibleTiers: next });
  };
  const setTier = (index: number, tier: CollectibleTier) => {
    setTiers(tiers.map((entry, i) => (i === index ? tier : entry)));
  };
  const error = (key: string) => {
    const code = errors[key];
    return code ? errorLabel(t, code) : null;
  };

  return (
    <section className="flex flex-col gap-5 border-t border-line pt-6">
      <h3 className="font-label text-label uppercase tracking-label text-ink-muted">
        {t('admin.group.tiers')}
      </h3>
      {tiers.length === 0 && <p className="text-body-sm text-ink-muted">{t('admin.tiers.none')}</p>}
      {tiers.map((tier, index) => {
        const amount = tier.bonus.type === 'convert_bad' ? tier.bonus.count : tier.bonus.percent;
        return (
          <div key={index} className="flex flex-wrap items-start gap-6">
            <NumberField
              compact
              label={t('admin.tiers.collected')}
              value={tier.collected}
              step={1}
              error={error(`collectibleTiers.${index}.collected`)}
              onChange={(collected) => {
                setTier(index, { ...tier, collected });
              }}
            />
            <SegmentedControl
              label={t('admin.tiers.bonus')}
              value={tier.bonus.type}
              options={[
                { value: 'convert_bad', label: t('admin.tiers.convert') },
                { value: 'release_chance', label: t('admin.tiers.chance') },
              ]}
              onChange={(type) => {
                setTier(index, {
                  ...tier,
                  bonus: type === 'convert_bad' ? { type, count: amount } : { type, percent: amount },
                });
              }}
            />
            <NumberField
              compact
              label={tier.bonus.type === 'convert_bad' ? t('admin.tiers.cards') : t('admin.tiers.percent')}
              value={amount}
              step={1}
              error={error(`collectibleTiers.${index}.amount`)}
              onChange={(value) => {
                setTier(index, {
                  ...tier,
                  bonus:
                    tier.bonus.type === 'convert_bad'
                      ? { type: 'convert_bad', count: value }
                      : { type: 'release_chance', percent: value },
                });
              }}
            />
            <Button
              variant="text"
              className="mt-7"
              onClick={() => {
                setTiers(tiers.filter((_, i) => i !== index));
              }}
            >
              <Icon name="trash" size={16} />
              {t('admin.tiers.remove')}
            </Button>
          </div>
        );
      })}
      <div>
        <Button
          variant="outline"
          disabled={tiers.length >= MAX_COLLECTIBLE_TIERS}
          onClick={() => {
            const last = tiers.at(-1);
            setTiers([...tiers, { ...NEW_TIER, collected: (last?.collected ?? 0) + 1 }]);
          }}
        >
          <Icon name="plus" size={16} />
          {t('admin.tiers.add')}
        </Button>
      </div>
    </section>
  );
}

export function PerformersSection() {
  const { t } = useTranslation();
  const rules = useGameConfigStore((state) => state.config.rules);
  const update = useGameConfigStore((state) => state.update);
  const reset = useGameConfigStore((state) => state.reset);
  return (
    <SectionEditor
      title={t('admin.section.performers')}
      intro={t('admin.intro.performers')}
      value={rules}
      fields={PERFORMER_RULE_FIELDS}
      validate={validateSessionRules}
      onSave={(value) => update({ section: 'rules', value })}
      onReset={() => reset('rules')}
      extra={(draft, onChange, errors) => <TierEditor rules={draft} onChange={onChange} errors={errors} />}
    />
  );
}

function ProgressionReset() {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  const loadSession = useSessionStore((state) => state.load);
  const resetProgression = async () => {
    const result = await window.api.invoke('progression:reset', undefined);
    if (result.ok) {
      setDone(true);
      await loadSession();
    }
  };
  return (
    <section className="flex max-w-3xl flex-col gap-3 border-t border-line pt-6">
      <h3 className="font-label text-label uppercase tracking-label text-ink-muted">
        {t('admin.progression.title')}
      </h3>
      <p className="text-body-sm text-ink-2">{t('admin.progression.body')}</p>
      <div className="w-64">
        <HoldToConfirm onConfirm={() => void resetProgression()}>
          {t('admin.progression.reset')}
        </HoldToConfirm>
      </div>
      {done && <p className="text-body-sm text-ink-muted">{t('admin.progression.done')}</p>}
    </section>
  );
}

export function PenaltiesSection() {
  const { t } = useTranslation();
  const penalties = useGameConfigStore((state) => state.config.penalties);
  const update = useGameConfigStore((state) => state.update);
  const reset = useGameConfigStore((state) => state.reset);
  return (
    <SectionEditor
      title={t('admin.section.penalties')}
      intro={t('admin.intro.penalties')}
      value={penalties}
      fields={PENALTY_RULE_FIELDS}
      validate={validatePenaltyRules}
      onSave={(value) => update({ section: 'penalties', value })}
      onReset={() => reset('penalties')}
      footer={<ProgressionReset />}
    />
  );
}

export function VisualEffectsSection() {
  const { t } = useTranslation();
  const visualEffects = useGameConfigStore((state) => state.config.visualEffects);
  const update = useGameConfigStore((state) => state.update);
  const reset = useGameConfigStore((state) => state.reset);
  return (
    <SectionEditor
      title={t('admin.section.visualEffects')}
      intro={t('admin.intro.visualEffects')}
      value={visualEffects}
      fields={[]}
      validate={validateVisualEffects}
      onSave={(value) => update({ section: 'visualEffects', value })}
      onReset={() => reset('visualEffects')}
      extra={(draft, onChange, errors) => (
        <section className="flex flex-col gap-5">
          <h3 className="font-label text-label uppercase tracking-label text-ink-muted">
            {t('admin.group.pixelate')}
          </h3>
          <div className="flex flex-wrap gap-6">
            {Array.from({ length: PIXELATE_LEVELS }, (_, index) => {
              const code = errors[`pixelBlockFractions.${index}`];
              return (
                <NumberField
                  key={index}
                  compact
                  percent
                  step={0.001}
                  label={t('admin.pixelLevel', { level: index + 1 })}
                  value={draft.pixelBlockFractions[index] ?? Number.NaN}
                  error={code ? errorLabel(t, code) : null}
                  onChange={(value) => {
                    onChange({
                      pixelBlockFractions: draft.pixelBlockFractions.map((fraction, i) =>
                        i === index ? value : fraction,
                      ),
                    });
                  }}
                />
              );
            })}
          </div>
          <p className="max-w-3xl text-body-sm text-ink-muted">{t('admin.pixelHint')}</p>
        </section>
      )}
    />
  );
}

/** game-design §6.7: switchable test variant; overrides performer cards and the draft while active. */
export function BetaSection() {
  const { t } = useTranslation();
  const beta = useGameConfigStore((state) => state.config.beta);
  const update = useGameConfigStore((state) => state.update);
  const reset = useGameConfigStore((state) => state.reset);
  return (
    <SectionEditor
      title={t('admin.section.beta')}
      intro={t('admin.intro.beta')}
      value={beta}
      fields={BETA_FIELDS}
      validate={validateBeta}
      onSave={(value) => update({ section: 'beta', value })}
      onReset={() => reset('beta')}
    />
  );
}
