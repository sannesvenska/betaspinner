import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cardGroup } from '@shared/session/selectActionPool';
import { applySessionOutcome, LOSS_OUTCOMES } from '@shared/session/progressionRules';
import { createRng } from '@shared/session/rng';
import type { SessionState } from '@shared/session/types';
import { FinalWheelScreen, OutcomeScreen } from '@renderer/features/win/WinScreens';
import { actionCardName, useActionCardsStore } from '@renderer/stores/actionCardsStore';
import { useGameConfigStore } from '@renderer/stores/gameConfigStore';
import { useLibraryStore } from '@renderer/stores/libraryStore';
import { useSessionStore } from '@renderer/stores/sessionStore';
import { useUiStore } from '@renderer/stores/uiStore';
import { Button } from '@renderer/ui/Button';
import { Dialog } from '@renderer/ui/Dialog';
import { DIALOG_AUTOFOCUS } from '@renderer/ui/dialogAutofocus';
import { Icon } from '@renderer/ui/icons/Icon';
import { GameScreen } from './GameScreen';
import { NO_EFFECTS } from '@renderer/effects/cardEffects';
import { GameStage } from './GameStage';

function useSpaceToConfirm(action: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (useUiStore.getState().paused || document.querySelector('dialog[open]')) return;
      if ((event.key === ' ' || event.key === 'Enter') && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [action]);
}

function CenteredScreen({
  eyebrow,
  title,
  body,
  aside,
  children,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="grid h-full grid-cols-[minmax(0,1fr)_auto] items-center gap-12 px-24">
      <div className="flex flex-col gap-6">
        <div className="font-label text-label uppercase tracking-label text-ink-muted">{eyebrow}</div>
        <h1 className="font-display text-display font-bold uppercase">{title}</h1>
        {body && <p className="max-w-2xl text-body text-ink-2">{body}</p>}
        {children}
      </div>
      {aside && <div className="h-[70vh]">{aside}</div>}
    </main>
  );
}

function InitialTask({ session }: { session: SessionState }) {
  const { t } = useTranslation();
  const dispatch = useSessionStore((state) => state.dispatch);
  const confirm = () => void dispatch({ type: 'confirm' });
  useSpaceToConfirm(confirm);
  return (
    <CenteredScreen
      eyebrow={t('initial.eyebrow', { goal: session.goalField })}
      title={t('initial.title')}
      body={t('initial.body')}
    >
      <div className="font-display text-display-xl font-bold uppercase">
        {t('task.count', { count: session.initialTaskCount })}
      </div>
      <div>
        <Button variant="primary" size="primary" keyHint="Space" onClick={confirm}>
          {t('game.done')}
        </Button>
      </div>
    </CenteredScreen>
  );
}

function BriefingColumn({
  label,
  tone,
  children,
}: {
  label: string;
  tone: 'good' | 'bad' | 'collectible' | 'neutral';
  children: React.ReactNode;
}) {
  const border =
    tone === 'good'
      ? 'border-good'
      : tone === 'bad'
        ? 'border-bad'
        : tone === 'collectible'
          ? 'border-collectible'
          : 'border-line-strong';
  const text =
    tone === 'good'
      ? 'text-good'
      : tone === 'bad'
        ? 'text-bad'
        : tone === 'collectible'
          ? 'text-collectible'
          : 'text-ink-muted';
  return (
    <div className={`flex min-w-0 flex-col gap-2 border-l-3 pl-5 ${border}`}>
      <div className={`font-label text-label uppercase tracking-label ${text}`}>{label}</div>
      {children}
    </div>
  );
}

/** Session briefing (design-system §10): categories, performer and the session's action pool. */
function SessionBriefing({ session }: { session: SessionState }) {
  const { t } = useTranslation();
  const folders = useLibraryStore((state) => state.snapshot?.folders ?? []);
  const actionCards = useActionCardsStore((state) => state.cards);
  const markRevealed = useUiStore((state) => state.markRevealed);
  const reroll = useSessionStore((state) => state.reroll);
  const canReroll = session.rules.allowReroll && !session.rerolled;
  const name = (id: string) => folders.find((folder) => folder.id === id)?.displayName ?? id;
  const pool = session.actionPool
    .map((id) => actionCards.find((card) => card.id === id))
    .filter((card) => card !== undefined)
    .sort((a, b) => Number(cardGroup(a) === 'bad') - Number(cardGroup(b) === 'bad'));
  const start = () => {
    markRevealed(session.id);
  };
  useSpaceToConfirm(start);
  return (
    <CenteredScreen eyebrow={t('briefing.eyebrow')} title={t('briefing.title')}>
      <div className="grid max-w-6xl grid-cols-4 gap-10">
        {(['good', 'bad'] as const).map((group) => (
          <BriefingColumn key={group} label={t(`briefing.${group}`)} tone={group}>
            {session.categories[group].map((id) => (
              <div key={id} className="font-display text-chip font-bold uppercase tracking-chip">
                {name(id)}
              </div>
            ))}
          </BriefingColumn>
        ))}
        <BriefingColumn label={t('briefing.performer')} tone="collectible">
          {session.performerFolderId ? (
            <>
              <div className="font-display text-chip font-bold uppercase tracking-chip">
                {name(session.performerFolderId)}
              </div>
              {session.rules.collectibleTiers.map((tier) => (
                <div key={tier.collected} className="text-body-sm text-ink-2">
                  {tier.bonus.type === 'convert_bad'
                    ? t('briefing.tierConvert', { collected: tier.collected, count: tier.bonus.count })
                    : t('briefing.tierChance', { collected: tier.collected, percent: tier.bonus.percent })}
                </div>
              ))}
            </>
          ) : (
            <div className="text-body-sm text-ink-muted">{t('briefing.noPerformer')}</div>
          )}
        </BriefingColumn>
        <BriefingColumn label={t('briefing.actions')} tone="neutral">
          {pool.map((card) => (
            <div
              key={card.id}
              className={`flex items-center gap-2 text-body-sm ${cardGroup(card) === 'good' ? 'text-good' : 'text-bad'}`}
            >
              <Icon name={card.type} size={16} />
              <span className="text-ink-2">{actionCardName(t, actionCards, card.id, card.type)}</span>
            </div>
          ))}
        </BriefingColumn>
      </div>
      <div className="flex items-center gap-4">
        <Button variant="primary" size="primary" keyHint="Space" onClick={start}>
          {t('briefing.start')}
        </Button>
        {canReroll && (
          <Button variant="outline" size="primary" onClick={() => void reroll()}>
            {t('briefing.reroll')}
          </Button>
        )}
      </div>
      {session.rerolled && <p className="text-body-sm text-ink-muted">{t('briefing.rerolled')}</p>}
    </CenteredScreen>
  );
}

function SessionEnd({ session }: { session: SessionState }) {
  const { t } = useTranslation();
  const close = useSessionStore((state) => state.close);
  const progression = useSessionStore((state) => state.snapshot?.progression);
  const mediaKinds = useSessionStore((state) => state.snapshot?.mediaKinds ?? {});
  const actionCards = useActionCardsStore((state) => state.cards);
  const penalties = useGameConfigStore((state) => state.config.penalties);
  const outcome = session.endReason ?? 'ended_early';
  const discovered = session.cards.filter((card) => card.discovered).length;
  const onClose = useCallback(() => void close(), [close]);
  useSpaceToConfirm(onClose);

  // Preview only: counts are deterministic, the random field positions are decided when closing
  const change = progression
    ? applySessionOutcome(progression, session, penalties, createRng(0)).change
    : null;
  const changeLines = change
    ? [
        change.penaltyFieldsAdded > 0 && t('end.change.added', { count: change.penaltyFieldsAdded }),
        change.penaltyFieldsRemoved > 0 && t('end.change.removed', { count: change.penaltyFieldsRemoved }),
        change.goodChanceDelta !== 0 &&
          t('end.change.goodChance', {
            delta: `${change.goodChanceDelta > 0 ? '+' : '−'}${Math.abs(Math.round(change.goodChanceDelta * 1000) / 10)}`,
          }),
        LOSS_OUTCOMES.includes(outcome) && t('end.change.lossStreak', { count: change.lossStreak }),
        session.reward?.type === 'block_bad_action' &&
          t('end.change.blocked', {
            action: actionCardName(t, actionCards, session.reward.actionCardId, session.reward.action),
          }),
      ].filter((line): line is string => typeof line === 'string')
    : [];
  const isLoss = LOSS_OUTCOMES.includes(outcome);

  return (
    <CenteredScreen
      eyebrow={t('game.fieldLabel', { field: session.position })}
      title={t(`end.outcome.${outcome}`)}
      aside={
        outcome === 'mistress_says_no' ? (
          <div className="aspect-[3/4] h-full">
            <GameStage
              card={session.reveal}
              mediaKinds={mediaKinds}
              dimmed={false}
              paused={false}
              effects={NO_EFFECTS}
            />
          </div>
        ) : undefined
      }
    >
      <dl className="flex gap-12">
        {[
          [t('end.discovered'), `${discovered} / 100`],
          [t('end.rounds'), String(session.round)],
          [t('end.tasks'), String(session.stats.tasksPerformed)],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="font-label text-label uppercase tracking-label text-ink-muted">{label}</dt>
            <dd className="font-display text-stat font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <section
        className={`flex max-w-xl flex-col gap-2 border-l-3 pl-4 ${isLoss ? 'border-bad' : 'border-ring-empty'}`}
      >
        <h2 className="font-label text-label uppercase tracking-label text-ink-muted">
          {t('end.changesTitle')}
        </h2>
        {(changeLines.length > 0 ? changeLines : [t('end.change.nothing')]).map((line) => (
          <p key={line} className="text-body text-ink-2">
            {line}
          </p>
        ))}
      </section>
      <div>
        <Button variant="primary" size="primary" keyHint="Space" onClick={onClose}>
          {t('end.backToStart')}
        </Button>
      </div>
    </CenteredScreen>
  );
}

/** Routes an active session to the right screen (game-design §8). */
export function GameFlow({ session }: { session: SessionState }) {
  const { t } = useTranslation();
  const revealed = useUiStore((state) => state.revealedSessionIds.includes(session.id));
  const resumeAnswered = useUiStore((state) => state.resumeAnswered);
  const answerResume = useUiStore((state) => state.answerResume);
  const markRevealed = useUiStore((state) => state.markRevealed);
  const dispatch = useSessionStore((state) => state.dispatch);
  const finished = session.phase === 'ended';
  const afterGoal = session.phase === 'final_wheel' || session.phase === 'outcome';

  let screen;
  if (finished) screen = <SessionEnd session={session} />;
  else if (session.phase === 'final_wheel') screen = <FinalWheelScreen session={session} />;
  else if (session.phase === 'outcome') screen = <OutcomeScreen session={session} />;
  else if (session.phase === 'initial_task') screen = <InitialTask session={session} />;
  else if (!revealed && session.round === 0) screen = <SessionBriefing session={session} />;
  else screen = <GameScreen session={session} />;

  // A session found on app start: resume or end early (§8.3)
  const askResume = !resumeAnswered && !finished && !afterGoal;
  return (
    <>
      {screen}
      <Dialog open={askResume} onClose={answerResume} title={t('resume.title')}>
        <p className="px-8 py-4 text-body text-ink-2">{t('resume.body')}</p>
        <div className="flex items-center justify-end gap-3 px-8 pb-7">
          <span className="mr-auto text-body-sm text-ink-muted">{t('resume.endEarlyHint')}</span>
          <Button
            variant="text"
            onClick={() => {
              answerResume();
              void dispatch({ type: 'endEarly' });
            }}
          >
            {t('resume.endEarly')}
          </Button>
          <Button
            variant="primary"
            {...DIALOG_AUTOFOCUS}
            keyHint="Enter"
            onClick={() => {
              answerResume();
              markRevealed(session.id);
            }}
          >
            {t('resume.resume')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
