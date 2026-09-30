import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActionHint } from '@shared/session/engine/actionHint';
import type { ActiveEffect, ReleaseChance, SessionRules, SessionState } from '@shared/session/types';
import { DEFAULT_SETTINGS } from '@shared/settings';
import { displayAccelerator } from '@renderer/features/settings/accelerator';
import { useUiStore } from '@renderer/stores/uiStore';
import { Button } from '@renderer/ui/Button';
import { Chip } from '@renderer/ui/Chip';
import { classNames } from '@renderer/ui/classNames';
import { GroupCount } from '@renderer/ui/GroupCount';
import { HoldToConfirm } from '@renderer/ui/HoldToConfirm';
import { Icon } from '@renderer/ui/icons/Icon';
import { Stat } from '@renderer/ui/Stat';
import { Tooltip } from '@renderer/ui/Tooltip';
import { EFFECT_ICONS, GOOD_EFFECTS } from './effectIcons';

interface GameConsoleProps {
  session: SessionState;
  rules: SessionRules;
  hint: ActionHint;
  releaseChance: ReleaseChance;
  performerName: string | null;
  ring: ReactNode;
  onGallery: () => void;
  onPause: () => void;
  onEndEarly: () => void;
}

const PERCENT_DECIMALS = 1;

/** design-system §10: one pip per collectible up to the highest tier; tier thresholds are taller. */
function PerformerProgress({
  name,
  collected,
  tiers,
}: {
  name: string;
  collected: number;
  tiers: readonly number[];
}) {
  const { t } = useTranslation();
  const maxTier = Math.max(0, ...tiers);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 font-label text-label uppercase tracking-label text-ink-muted">
        <Icon name="star" size={14} className="text-collectible" />
        {t('console.performer', { name })}
        <span className="ml-auto text-ink">{t('console.collected', { collected, total: maxTier })}</span>
      </div>
      <div className="flex items-end gap-1" aria-hidden>
        {Array.from({ length: maxTier }, (_, index) => (
          <span
            key={index}
            className={classNames(
              'w-full rounded-panel',
              tiers.includes(index + 1) ? 'h-3' : 'h-2',
              index < collected ? 'bg-collectible' : 'bg-ring-empty',
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function GameConsole({
  session,
  rules,
  hint,
  releaseChance,
  performerName,
  ring,
  onGallery,
  onPause,
  onEndEarly,
}: GameConsoleProps) {
  const { t } = useTranslation();
  const endEarlyHintId = useId();
  const settingsState = useUiStore((state) => state.settingsState);
  const pauseHotkey =
    settingsState.status === 'ready' ? settingsState.settings.pauseHotkey : DEFAULT_SETTINGS.pauseHotkey;
  const discovered = session.cards.filter((card) => card.discovered).length;
  const hiddenNormal = (group: 'good' | 'bad') =>
    session.cards.filter((card) => card.kind === 'normal' && card.group === group && !card.discovered).length;

  const chipMeta = (effect: ActiveEffect): string => {
    if (effect.type === 'pixelate') return t('common.level', { level: effect.value ?? 1 });
    if (effect.type === 'success_multiplier') return `×${(effect.value ?? 1).toFixed(1)}`;
    if (effect.remainingRounds !== undefined)
      return t('common.roundsShort', { count: effect.remainingRounds });
    return '';
  };

  const breakdown = (
    <span className="flex flex-col gap-0.5">
      <span>
        {t('console.chance.base', {
          discovered: releaseChance.discovered,
          rate: releaseChance.rate,
          base: releaseChance.base.toFixed(PERCENT_DECIMALS),
        })}
      </span>
      {releaseChance.bonus > 0 && <span>{t('console.chance.bonus', { bonus: releaseChance.bonus })}</span>}
      {releaseChance.multiplier > 1 && (
        <span>{t('console.chance.multiplier', { multiplier: releaseChance.multiplier.toFixed(1) })}</span>
      )}
      <span>{t('console.chance.cap', { min: rules.winChanceBounds[0], max: rules.winChanceBounds[1] })}</span>
    </span>
  );

  return (
    <aside className="flex min-h-0 flex-col gap-5 border-r border-line bg-panel px-[clamp(24px,2.5vw,48px)] pt-8 pb-10">
      <div className="font-display text-brand font-semibold uppercase tracking-brand">{t('app.title')}</div>
      <div className="mx-auto w-full max-w-[504px]">{ring}</div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <Tooltip content={breakdown} placement="bottom">
          {(describedById) => (
            <div tabIndex={0} aria-describedby={describedById} className="rounded-panel">
              <Stat label={t('console.releaseChance')}>
                {releaseChance.finalChance}
                <span className="text-ink-muted"> %</span>
              </Stat>
            </div>
          )}
        </Tooltip>
        <Stat label={t('console.discovered')}>
          {discovered}
          <span className="text-ink-muted"> / 100</span>
        </Stat>
        <Stat label={t('console.undiscovered')}>
          <GroupCount good={hiddenNormal('good')} bad={hiddenNormal('bad')} />
        </Stat>
        {/* game-design §7.4 actionHint: off / total / split / split_by_side */}
        {rules.actionHint !== 'off' && (
          <Stat label={t('console.actionsLeft')}>
            {rules.actionHint === 'total' ? (
              hint.total.good + hint.total.bad
            ) : (
              <GroupCount good={hint.total.good} bad={hint.total.bad} />
            )}
          </Stat>
        )}
      </div>
      {performerName && (
        <PerformerProgress
          name={performerName}
          collected={session.collected}
          tiers={rules.collectibleTiers.map((tier) => tier.collected)}
        />
      )}
      {session.effects.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {session.effects.map((effect) => (
            <Chip
              key={effect.id}
              group={GOOD_EFFECTS.includes(effect.type) ? 'good' : 'bad'}
              icon={EFFECT_ICONS[effect.type]}
              name={t(`effect.${effect.type}.name`)}
              meta={chipMeta(effect)}
              description={t(`effect.${effect.type}.description`)}
            />
          ))}
        </div>
      )}
      <div className="mt-auto grid grid-cols-3 gap-3">
        <Button variant="outline" keyHint="G" onClick={onGallery}>
          <Icon name="gallery" size={16} />
          {t('console.gallery')}
        </Button>
        <Tooltip content={t('console.pauseHint', { hotkey: displayAccelerator(pauseHotkey) })}>
          {(describedById) => (
            <Button variant="outline" aria-describedby={describedById} onClick={onPause} className="w-full">
              <Icon name="pause" size={16} />
              {t('console.pause')}
            </Button>
          )}
        </Tooltip>
        <Tooltip content={t('console.endEarlyHint')}>
          {(describedById) => (
            <HoldToConfirm describedBy={describedById} onConfirm={onEndEarly}>
              <span id={endEarlyHintId}>{t('console.endEarly')}</span>
            </HoldToConfirm>
          )}
        </Tooltip>
      </div>
    </aside>
  );
}
