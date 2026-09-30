import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { FolderConfig } from '@shared/content';
import type { ActionHint } from '@shared/session/engine/actionHint';
import { wrapField } from '@shared/session/track';
import type { Direction, EffectType, SessionState, SwitcherooPool } from '@shared/session/types';
import { Button } from '@renderer/ui/Button';
import { classNames } from '@renderer/ui/classNames';
import { Countdown } from '@renderer/ui/Countdown';
import { GroupCount } from '@renderer/ui/GroupCount';
import { Icon } from '@renderer/ui/icons/Icon';
import { KeyHint } from '@renderer/ui/KeyHint';
import { DiceFace } from '@renderer/ui/DiceFace';
import { EFFECT_ICONS, GOOD_EFFECTS } from './effectIcons';
import { FolderPreview } from './FolderPreview';
import { noticeText } from './noticeText';
import { PickTile } from './PickTile';

const DIE_FACES = [1, 2, 3, 4, 5, 6] as const;

export interface TaskBarHandlers {
  confirm: () => void;
  roll: () => void;
  chooseRoll: (value: number) => void;
  chooseDirection: (direction: Direction) => void;
  pickEffect: (effect: EffectType) => void;
  toggleGuess: (value: number) => void;
  submitGuess: () => void;
  chooseReward: (reward: 'remove_effect' | 'remove_penalty_fields') => void;
  switcherooPool: (index: number) => void;
  switcherooFolder: (index: number) => void;
}

interface TaskBarProps {
  session: SessionState;
  folders: readonly FolderConfig[];
  hint: ActionHint;
  /** Hold / timed countdown of the current step */
  countdown: { secondsRemaining: number; finished: boolean } | null;
  guess: number[];
  animating: 'rolling' | 'moving' | null;
  handlers: TaskBarHandlers;
}

function Eyebrow({ children, tone }: { children: ReactNode; tone: 'good' | 'bad' | 'neutral' }) {
  return (
    <div
      className={classNames(
        'flex items-center gap-2 font-label text-label uppercase tracking-label',
        tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-ink-muted',
      )}
    >
      {children}
    </div>
  );
}

/** `phase` titles (Roll, Choose direction) are one step smaller than task titles. */
function Title({ children, size = 'task' }: { children: ReactNode; size?: 'task' | 'phase' }) {
  return (
    <div
      className={classNames(
        'font-display font-bold uppercase',
        size === 'task' ? 'text-display' : 'text-title',
      )}
    >
      {children}
    </div>
  );
}

/** The single task bar (design-system §4): what to do now + exactly one primary action. */
export function TaskBar({ session, folders, hint, countdown, guess, animating, handlers }: TaskBarProps) {
  const { t } = useTranslation();
  const reveal = session.reveal;
  const step = session.pending[0];
  const folderName = (id: string | undefined) =>
    folders.find((folder) => folder.id === id)?.displayName ?? '';

  const cardEyebrow = () => {
    if (!reveal) return null;
    const tone = reveal.group ?? 'neutral';
    if (reveal.kind === 'action' && reveal.action) {
      return (
        <Eyebrow tone={tone}>
          <span className="flex size-6 items-center justify-center rounded-full bg-bg">
            <Icon name={reveal.action} size={14} />
          </span>
          {t(reveal.group === 'good' ? 'game.goodAction' : 'game.badAction')} ·{' '}
          {t('game.fieldLabel', { field: reveal.field })}
        </Eyebrow>
      );
    }
    return (
      <Eyebrow tone={tone}>
        {t(reveal.group === 'good' ? 'game.goodCard' : 'game.badCard')} · {folderName(reveal.folderId)}
      </Eyebrow>
    );
  };
  const actionTitle = reveal?.kind === 'action' && reveal.action ? t(`action.${reveal.action}.name`) : null;
  const actionDescription =
    reveal?.kind === 'action' && reveal.action ? t(`action.${reveal.action}.description`) : null;

  const effectMeta = (type: EffectType): string => {
    const effect = session.effects.find((candidate) => candidate.type === type);
    if (!effect) return '';
    if (type === 'pixelate') return t('common.level', { level: effect.value ?? 1 });
    if (effect.remainingRounds !== undefined)
      return t('common.roundsShort', { count: effect.remainingRounds });
    return '';
  };
  /** Undiscovered cards a Switcheroo pool would change (§10.3). */
  const poolCardCount = (pool: SwitcherooPool): number => {
    const group = pool.startsWith('good') ? 'good' : 'bad';
    const kind = pool.endsWith('content') ? 'normal' : 'action';
    return session.cards.filter(
      (card) =>
        card.kind === kind &&
        card.group === group &&
        !card.discovered &&
        !(kind === 'action' && card.actionConsumed),
    ).length;
  };

  let content: ReactNode;
  let controls: ReactNode = null;

  if (animating === 'moving') {
    content = <Title size="phase">{t('game.moving')}</Title>;
  } else if (session.phase === 'roll') {
    content = <Title size="phase">{session.chooseNextRoll ? t('game.chooseRoll') : t('game.roll')}</Title>;
    controls = session.chooseNextRoll ? (
      <div className="flex gap-2">
        {DIE_FACES.map((value) => (
          <Button
            key={value}
            variant="outline"
            size="primary"
            keyHint={String(value)}
            onClick={() => {
              handlers.chooseRoll(value);
            }}
          >
            {value}
          </Button>
        ))}
      </div>
    ) : (
      <Button variant="primary" size="primary" keyHint="Space" onClick={handlers.roll}>
        {t('game.roll')}
      </Button>
    );
  } else if (session.phase === 'choose_direction') {
    const steps = session.lastRoll ?? 0;
    const direction = (dir: Direction) => {
      const sign = dir === 'right' ? 1 : -1;
      const target = wrapField(session.position + sign * steps);
      const side = dir === 'right' ? hint.right : hint.left;
      const goalDistance =
        dir === 'right'
          ? (session.goalField - session.position + 100) % 100
          : (session.position - session.goalField + 100) % 100;
      const isBlocked = session.effects.some(
        (effect) => effect.type === 'u_turn' && (effect.value ?? 0) === sign,
      );
      return (
        <button
          key={dir}
          type="button"
          disabled={isBlocked || animating === 'rolling'}
          onClick={() => {
            handlers.chooseDirection(dir);
          }}
          className="flex h-28 w-[clamp(15rem,22vw,24rem)] flex-col justify-center gap-2 rounded-panel border border-line-strong px-5 text-left transition-colors duration-150 hover:bg-surface disabled:opacity-40"
        >
          <span className="flex items-center justify-between font-display text-button-xl font-bold uppercase tracking-chip">
            <span className="flex items-center gap-3">
              {dir === 'left' && <Icon name="arrowLeft" size={24} />}
              {t(dir === 'left' ? 'game.left' : 'game.right')} · {t('game.toField', { field: target })}
              {dir === 'right' && <Icon name="arrowRight" size={24} />}
            </span>
            <KeyHint keys={dir === 'left' ? '←' : '→'} />
          </span>
          <span className="flex items-center gap-3 font-label text-label uppercase tracking-label text-ink-muted">
            {isBlocked ? (
              <>
                <Icon name="u_turn" size={16} className="text-bad" /> {t('game.blocked')}
              </>
            ) : (
              <>
                {t('game.goalDistance', { distance: goalDistance })} ·{' '}
                <GroupCount good={side.good} bad={side.bad} /> {t('game.actions')}
              </>
            )}
          </span>
        </button>
      );
    };
    content = <Title size="phase">{t('game.chooseDirection')}</Title>;
    controls = <div className="flex gap-4">{(['left', 'right'] as const).map(direction)}</div>;
  } else if (step) {
    switch (step.kind) {
      case 'task': {
        const multiplied = session.effects.some((effect) => effect.type === 'double_trouble');
        content = (
          <>
            {cardEyebrow()}
            <Title>{t('task.count', { count: step.count })}</Title>
            <div className="text-body text-ink-2">
              {[
                actionTitle ? actionDescription : null,
                multiplied ? t('task.base', { base: step.count / 2 }) : null,
                step.pace ? t(`task.pace.${step.pace}`) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </>
        );
        controls = (
          <Button variant="primary" size="primary" keyHint="Space" onClick={handlers.confirm}>
            {t('game.done')}
          </Button>
        );
        break;
      }
      case 'hold':
      case 'timed_task': {
        const done = countdown?.finished ?? false;
        content = (
          <>
            {cardEyebrow()}
            <Title>{step.kind === 'timed_task' ? t('task.timedTitle') : actionTitle}</Title>
            <div className="text-body text-ink-2">{actionDescription}</div>
          </>
        );
        controls = (
          <div className="flex flex-col gap-3">
            <Countdown
              secondsRemaining={countdown?.secondsRemaining ?? step.seconds}
              totalSeconds={step.seconds}
            />
            <Button
              variant={done ? 'primary' : 'outline'}
              disabled={!done}
              keyHint={done ? 'Space' : undefined}
              onClick={handlers.confirm}
            >
              {done ? t('game.done') : t('game.holding')}
            </Button>
          </div>
        );
        break;
      }
      case 'notice': {
        const notice = step.notice;
        const guessResult = notice.type === 'guess_result' ? notice : null;
        content = (
          <>
            {cardEyebrow()}
            <Title>{actionTitle ?? noticeText(t, notice)}</Title>
            <div className="flex items-center gap-2 text-body text-ink-2">
              {notice.type === 'shield_blocked' && <Icon name="shield" size={18} className="text-good" />}
              {actionTitle ? noticeText(t, notice) : null}
            </div>
          </>
        );
        controls = (
          <div className="flex items-center gap-6">
            {guessResult && (
              <div className="flex items-center gap-3" aria-hidden>
                {guessResult.numbers.map((value) => (
                  <DiceFace
                    key={value}
                    value={value}
                    size={44}
                    tone={value === guessResult.roll ? 'good' : 'muted'}
                  />
                ))}
                <span className="font-label text-label text-ink-muted">→</span>
                <DiceFace value={guessResult.roll} size={72} tone={guessResult.match ? 'good' : 'bad'} />
              </div>
            )}
            <Button variant="primary" size="primary" keyHint="Space" onClick={handlers.confirm}>
              {t('game.ok')}
            </Button>
          </div>
        );
        break;
      }
      case 'pick_effect':
        content = (
          <>
            {cardEyebrow()}
            <Title>{actionTitle}</Title>
            <div className="text-body text-ink-2">{t('step.pickEffect')}</div>
          </>
        );
        controls = (
          <div className="flex gap-2">
            {step.options.map((effect, index) => (
              <PickTile
                key={effect}
                title={t(`effect.${effect}.name`)}
                icon={<Icon name={EFFECT_ICONS[effect]} size={20} />}
                meta={effectMeta(effect)}
                tone={GOOD_EFFECTS.includes(effect) ? 'good' : 'bad'}
                keyHint={String(index + 1)}
                onClick={() => {
                  handlers.pickEffect(effect);
                }}
              />
            ))}
          </div>
        );
        break;
      case 'guess':
        content = (
          <>
            {cardEyebrow()}
            <Title>{actionTitle}</Title>
            <div className="text-body text-ink-2">{t('game.pickTwo')}</div>
          </>
        );
        controls = (
          <div className="flex items-center gap-2">
            {DIE_FACES.map((value) => (
              <Button
                key={value}
                variant={guess.includes(value) ? 'primary' : 'outline'}
                size="primary"
                keyHint={String(value)}
                aria-pressed={guess.includes(value)}
                aria-label={String(value)}
                className="px-4"
                onClick={() => {
                  handlers.toggleGuess(value);
                }}
              >
                <DiceFace value={value} size={36} tone={guess.includes(value) ? 'muted' : 'ink'} />
              </Button>
            ))}
            <Button
              variant="primary"
              size="primary"
              keyHint="Space"
              disabled={guess.length !== 2}
              onClick={handlers.submitGuess}
            >
              {t('game.confirmGuess')}
            </Button>
          </div>
        );
        break;
      case 'choose_reward':
        content = (
          <>
            {cardEyebrow()}
            <Title>{t('step.reward.title')}</Title>
          </>
        );
        controls = (
          <div className="flex gap-2">
            <PickTile
              title={t('step.reward.removeEffect')}
              tone="good"
              keyHint="1"
              disabled={!step.canRemoveEffect}
              onClick={() => {
                handlers.chooseReward('remove_effect');
              }}
            />
            <PickTile
              title={t('step.reward.removePenalty')}
              tone="good"
              keyHint="2"
              onClick={() => {
                handlers.chooseReward('remove_penalty_fields');
              }}
            />
          </div>
        );
        break;
      case 'switcheroo_pool':
        content = (
          <>
            {cardEyebrow()}
            <Title>{actionTitle}</Title>
            <div className="text-body text-ink-2">{t('step.switcherooPool')}</div>
          </>
        );
        controls = (
          <div className="flex gap-2">
            {step.pools.map((pool, index) => (
              <PickTile
                key={pool}
                title={t(`step.pool.${pool}`)}
                icon={<Icon name="switcheroo" size={20} />}
                meta={t('step.poolCards', { count: poolCardCount(pool) })}
                tone={pool.startsWith('good') ? 'good' : 'bad'}
                keyHint={String(index + 1)}
                onClick={() => {
                  handlers.switcherooPool(index);
                }}
              />
            ))}
          </div>
        );
        break;
      case 'switcheroo_folder':
        content = (
          <>
            {cardEyebrow()}
            <Title>{actionTitle}</Title>
            <div className="text-body text-ink-2">{t('step.switcherooFolder')}</div>
          </>
        );
        controls = (
          <div className="flex gap-2">
            {step.folderIds.map((id, index) => (
              <PickTile
                key={id}
                title={folderName(id)}
                preview={<FolderPreview folderId={id} />}
                tone={step.pool.startsWith('good') ? 'good' : 'bad'}
                keyHint={String(index + 1)}
                onClick={() => {
                  handlers.switcherooFolder(index);
                }}
              />
            ))}
          </div>
        );
        break;
    }
  }

  const resolving = session.phase === 'resolve_card' && animating !== 'moving';
  const isAction = resolving && reveal?.kind === 'action';
  const isBadAction = isAction && reveal.group === 'bad';
  // Re-mount per revealed card so the banner animation replays (design-system §7 "Action reveal")
  const revealKey = resolving && reveal ? `${session.round}-${reveal.field}` : session.phase;
  return (
    <div
      key={revealKey}
      className={classNames(
        'flex items-center gap-8 border-t bg-overlay px-12 backdrop-blur-overlay',
        isBadAction ? 'animate-[cr-flash_600ms_ease-out] border-bad' : 'border-line',
      )}
    >
      <div
        className={classNames(
          'flex min-w-0 flex-1 flex-col gap-1.5',
          isAction && 'origin-left animate-[cr-banner_320ms_ease-out]',
        )}
      >
        {content}
      </div>
      {controls}
    </div>
  );
}
