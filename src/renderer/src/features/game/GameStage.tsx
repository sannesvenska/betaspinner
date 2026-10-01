import { useTranslation } from 'react-i18next';
import type { SessionMediaKinds } from '@shared/ipc';
import type { Card } from '@shared/session/types';
import { classNames } from '@renderer/ui/classNames';
import { Icon } from '@renderer/ui/icons/Icon';
import type { EffectOptions } from '@renderer/effects/drawEffects';
import { EffectMedia } from '@renderer/effects/EffectMedia';

const NEUTRAL_ICON_SIZE = 160;

interface GameStageProps {
  card: Card | null;
  mediaKinds: SessionMediaKinds;
  dimmed: boolean;
  paused: boolean;
  effects: EffectOptions;
}

/** Image first: the card media fills the stage without cropping; no chrome on top (design-system §1). */
export function GameStage({ card, mediaKinds, dimmed, paused, effects }: GameStageProps) {
  const { t } = useTranslation();
  const hash = card?.imageHash;
  const kind = hash ? mediaKinds[hash] : undefined;

  return (
    <div
      className={classNames(
        'flex h-full min-h-0 items-center justify-center px-12 pt-8 pb-6 transition-opacity duration-200',
        dimmed && 'opacity-30',
      )}
    >
      {hash && kind ? (
        <div key={hash} className="h-full w-full animate-[bs-fade-in_240ms_ease-out]">
          <EffectMedia hash={hash} kind={kind} paused={paused} {...effects} />
        </div>
      ) : card?.kind === 'action' && card.action ? (
        // Built-in neutral action design (§6.3)
        <div
          role="img"
          aria-label={t('game.neutralCard')}
          className={classNames(
            'flex aspect-[3/4] h-full max-h-full items-center justify-center rounded-panel bg-surface bg-[repeating-linear-gradient(45deg,transparent_0_12px,var(--color-line)_12px_13px)]',
            card.group === 'good' ? 'text-good' : 'text-bad',
          )}
        >
          <Icon name={card.action} size={NEUTRAL_ICON_SIZE} />
        </div>
      ) : null}
    </div>
  );
}
