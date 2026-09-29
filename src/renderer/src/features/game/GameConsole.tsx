import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActionHint } from '@shared/session/engine/actionHint';
import { getSuccessMultiplier } from '@shared/session/engine/effects';
import type { ActiveEffect, EffectType, SessionState } from '@shared/session/types';
import type { ActionId } from '@shared/actions';
import { Button } from '@renderer/ui/Button';
import { Chip } from '@renderer/ui/Chip';
import { GroupCount } from '@renderer/ui/GroupCount';
import { HoldToConfirm } from '@renderer/ui/HoldToConfirm';
import { Icon } from '@renderer/ui/icons/Icon';
import { Stat } from '@renderer/ui/Stat';
import { Tooltip } from '@renderer/ui/Tooltip';

/** Chip icon per effect type (action icons, design-system §6). */
const EFFECT_ICONS: Record<EffectType, ActionId> = {
  double_trouble: 'double_trouble',
  pace_slow: 'take_it_slow',
  pace_fast: 'speed_it_up',
  u_turn: 'u_turn',
  pixelate: 'pixelate',
  splatter: 'splatter',
  success_multiplier: 'hail_mary',
  shield: 'good_fairy',
};

const GOOD_EFFECTS: readonly EffectType[] = ['success_multiplier', 'shield'];

interface GameConsoleProps {
  session: SessionState;
  hint: ActionHint;
  ring: ReactNode;
  onGallery: () => void;
  onPause: () => void;
  onEndEarly: () => void;
}

export function GameConsole({ session, hint, ring, onGallery, onPause, onEndEarly }: GameConsoleProps) {
  const { t } = useTranslation();
  const endEarlyHintId = useId();
  const discovered = session.cards.filter((card) => card.discovered).length;
  const multiplier = getSuccessMultiplier(session.effects);

  const chipMeta = (effect: ActiveEffect): string => {
    if (effect.type === 'pixelate') return t('common.level', { level: effect.value ?? 1 });
    if (effect.type === 'success_multiplier') return `×${(effect.value ?? 1).toFixed(1)}`;
    if (effect.remainingRounds !== undefined)
      return t('common.roundsShort', { count: effect.remainingRounds });
    return '';
  };

  return (
    <aside className="flex min-h-0 flex-col gap-6 border-r border-line bg-panel px-[clamp(24px,2.5vw,48px)] pt-8 pb-10">
      <div className="font-display text-brand font-semibold uppercase tracking-brand">{t('app.title')}</div>
      <div className="mx-auto w-full max-w-[504px]">{ring}</div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        <Stat label={t('console.round')}>{session.round}</Stat>
        <Stat label={t('console.discovered')}>
          {discovered}
          <span className="text-ink-muted"> / 100</span>
        </Stat>
        <Stat label={t('console.actionsLeft')}>
          <GroupCount good={hint.total.good} bad={hint.total.bad} />
        </Stat>
        <Stat label={t('console.winMultiplier')} className={multiplier > 1 ? 'text-good' : 'text-ink-muted'}>
          ×{multiplier.toFixed(1)}
        </Stat>
      </div>
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
        <Tooltip content={t('console.pauseHint')}>
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
