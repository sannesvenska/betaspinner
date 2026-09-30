import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_PENALTY_RULES } from '@shared/session/defaults';
import { applySessionOutcome, LOSS_OUTCOMES } from '@shared/session/progressionRules';
import { createRng } from '@shared/session/rng';
import type { SessionState } from '@shared/session/types';
import { FinalWheelScreen, OutcomeScreen, WinCheckScreen } from '@renderer/features/win/WinScreens';
import { useLibraryStore } from '@renderer/stores/libraryStore';
import { useSessionStore } from '@renderer/stores/sessionStore';
import { useUiStore } from '@renderer/stores/uiStore';
import { Button } from '@renderer/ui/Button';
import { Dialog } from '@renderer/ui/Dialog';
import { DIALOG_AUTOFOCUS } from '@renderer/ui/dialogAutofocus';
import { GameScreen } from './GameScreen';
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

function CategoryReveal({ session }: { session: SessionState }) {
  const { t } = useTranslation();
  const folders = useLibraryStore((state) => state.snapshot?.folders ?? []);
  const markRevealed = useUiStore((state) => state.markRevealed);
  const name = (id: string) => folders.find((folder) => folder.id === id)?.displayName ?? id;
  const start = () => {
    markRevealed(session.id);
  };
  useSpaceToConfirm(start);
  return (
    <CenteredScreen eyebrow={t('reveal.eyebrow')} title={t('reveal.title')}>
      <div className="flex gap-16">
        {(['good', 'bad'] as const).map((group) => (
          <div
            key={group}
            className={`flex flex-col gap-2 border-l-3 pl-5 ${group === 'good' ? 'border-good' : 'border-bad'}`}
          >
            <div
              className={`font-label text-label uppercase tracking-label ${group === 'good' ? 'text-good' : 'text-bad'}`}
            >
              {t(`reveal.${group}`)}
            </div>
            {session.categories[group].map((id) => (
              <div key={id} className="font-display text-title font-bold uppercase">
                {name(id)}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div>
        <Button variant="primary" size="primary" keyHint="Space" onClick={start}>
          {t('reveal.start')}
        </Button>
      </div>
    </CenteredScreen>
  );
}

function SessionEnd({ session }: { session: SessionState }) {
  const { t } = useTranslation();
  const close = useSessionStore((state) => state.close);
  const progression = useSessionStore((state) => state.snapshot?.progression);
  const mediaKinds = useSessionStore((state) => state.snapshot?.mediaKinds ?? {});
  const outcome = session.endReason ?? 'ended_early';
  const discovered = session.cards.filter((card) => card.discovered).length;
  const onClose = useCallback(() => void close(), [close]);
  useSpaceToConfirm(onClose);

  // Preview only: counts are deterministic, the random field positions are decided when closing
  const change = progression
    ? applySessionOutcome(progression, session, DEFAULT_PENALTY_RULES, createRng(0)).change
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
          t('end.change.blocked', { action: t(`action.${session.reward.action}.name`) }),
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
            <GameStage card={session.reveal} mediaKinds={mediaKinds} dimmed={false} paused={false} />
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
  const afterGoal =
    session.phase === 'win_check' || session.phase === 'final_wheel' || session.phase === 'outcome';

  let screen;
  if (finished) screen = <SessionEnd session={session} />;
  else if (session.phase === 'win_check') screen = <WinCheckScreen session={session} />;
  else if (session.phase === 'final_wheel') screen = <FinalWheelScreen session={session} />;
  else if (session.phase === 'outcome') screen = <OutcomeScreen session={session} />;
  else if (session.phase === 'initial_task') screen = <InitialTask session={session} />;
  else if (!revealed && session.round === 0) screen = <CategoryReveal session={session} />;
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
