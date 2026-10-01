import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { computeActionHint } from '@shared/session/engine/actionHint';
import type { EngineEvent } from '@shared/session/engine/reduce';
import { computeReleaseChance } from '@shared/session/engine/releaseChance';
import { clockwiseDistance, shortDistance, TRACK_LENGTH, wrapField } from '@shared/session/track';
import type { Direction, SessionState, StrokeTier } from '@shared/session/types';
import { useActionCardsStore } from '@renderer/stores/actionCardsStore';
import { useLibraryStore } from '@renderer/stores/libraryStore';
import { useMasks } from '@renderer/stores/masksStore';
import { useSessionStore } from '@renderer/stores/sessionStore';
import { useAnimationScale, useUiStore } from '@renderer/stores/uiStore';
import { Alert } from '@renderer/ui/Alert';
import { HOLD_TO_CONFIRM_MS } from '@renderer/ui/HoldToConfirm';
import { cardEffectOptions } from '@renderer/effects/cardEffects';
import { EffectMedia } from '@renderer/effects/EffectMedia';
import { useCountdown } from '@renderer/ui/useCountdown';
import { playCue } from '@renderer/sound/sound';
import { DiceFace } from '@renderer/ui/DiceFace';
import { getBlockedDirection } from '@shared/session/engine/effects';
import { GalleryDrawer } from './GalleryDrawer';
import { GameConsole } from './GameConsole';
import { GameStage } from './GameStage';
import { Ring } from './Ring';
import { TaskBar, type TaskBarHandlers } from './TaskBar';

/** design-system §7 motion timings (multiplied by the animation scale). */
const MS_PER_FIELD = 120;
const DICE_ROLL_MS = 900;
const DICE_TICK_MS = 75;
const SEGMENT_DEG = 360 / TRACK_LENGTH;
const PREVIEW_SIZE = 'h-[45%] w-[45%]';
const COUNTDOWN_TICK_SECONDS = 3;
const DIE_SIDES = 6;
const SMALL_DIE_SIZE = 28;

const rotationFor = (position: number): number => -(position - 0.5) * SEGMENT_DEG;

interface GameScreenProps {
  session: SessionState;
}

/** Signed step count of the last position change (keeps wrap-around rotation continuous). */
function movementDelta(previous: number, session: SessionState): number {
  const move = session.lastMove;
  if (move && move.from === previous && move.to === session.position) {
    return (move.direction === 'right' ? 1 : -1) * move.steps;
  }
  const clockwise = clockwiseDistance(previous, session.position);
  return clockwise <= TRACK_LENGTH / 2 ? clockwise : clockwise - TRACK_LENGTH;
}

/** U Turn wins over the forced reversal (they never overlap by rule, §8.7). */
function blockedArc(session: SessionState): { side: Direction; reason: 'u_turn' | 'forced' } | null {
  const uTurn = getBlockedDirection(session.effects);
  if (uTurn) return { side: uTurn, reason: 'u_turn' };
  if (!session.forcedDirection) return null;
  return { side: session.forcedDirection === 'left' ? 'right' : 'left', reason: 'forced' };
}

const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function GameScreen({ session }: GameScreenProps) {
  const { t } = useTranslation();
  const dispatch = useSessionStore((state) => state.dispatch);
  const mediaKinds = useSessionStore((state) => state.snapshot?.mediaKinds ?? {});
  const error = useSessionStore((state) => state.error);
  const dismissError = useSessionStore((state) => state.dismissError);
  const folders = useLibraryStore((state) => state.snapshot?.folders ?? []);
  const actionCards = useActionCardsStore((state) => state.cards);
  const trackHashes = useMemo(
    () => session.cards.flatMap((card) => (card.imageHash ? [card.imageHash] : [])),
    [session.cards],
  );
  const masks = useMasks(trackHashes);
  const paused = useUiStore((state) => state.paused);
  const togglePause = useUiStore((state) => state.togglePause);
  const scale = useAnimationScale();

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [previewField, setPreviewField] = useState<number | null>(null);
  const [guess, setGuess] = useState<number[]>([]);
  // Picked per card (§8.6): a choice only counts for the step it was made on
  const [tierChoice, setTierChoice] = useState<{ stepKey: number; tier: StrokeTier } | null>(null);
  const [animating, setAnimating] = useState<'rolling' | 'moving' | null>(null);
  const [diceFace, setDiceFace] = useState<number | null>(null);
  const [rotation, setRotation] = useState(() => rotationFor(session.position));
  const [rotationMs, setRotationMs] = useState(0);
  const previousPosition = useRef(session.position);
  const animationTimer = useRef<number | undefined>(undefined);

  const hint = useMemo(() => computeActionHint(session), [session]);
  // The session plays with the rules it was generated with (admin changes apply to the next session)
  const rules = session.rules;
  const releaseChance = useMemo(() => computeReleaseChance(session, session.rules), [session]);
  const performerName = session.performerFolderId
    ? (folders.find((folder) => folder.id === session.performerFolderId)?.displayName ?? null)
    : null;
  const step = session.pending[0];
  const tierable = step?.kind === 'task' && step.tierable === true;

  // Hold / timed countdown for the current step; restarts per step, freezes while paused
  const timedSeconds = step?.kind === 'hold' || step?.kind === 'timed_task' ? step.seconds : 0;
  const stepKey = session.round * 1000 + session.pending.length;
  const countdown = useCountdown(timedSeconds, paused || galleryOpen, stepKey);
  const strokeTier: StrokeTier = tierChoice?.stepKey === stepKey ? tierChoice.tier : 1;

  const finishAnimation = useCallback(() => {
    window.clearTimeout(animationTimer.current);
    setRotationMs(0);
    setAnimating(null);
    setDiceFace(null);
  }, []);

  // Movement: rotate the ring field by field (design-system §7 "Marker move")
  useEffect(() => {
    const previous = previousPosition.current;
    if (previous === session.position) return;
    previousPosition.current = session.position;
    const delta = movementDelta(previous, session);
    const duration = Math.abs(delta) * MS_PER_FIELD * scale;
    setRotationMs(duration);
    setRotation((current) => current - delta * SEGMENT_DEG);
    if (duration === 0) return;
    setAnimating('moving');
    window.clearTimeout(animationTimer.current);
    animationTimer.current = window.setTimeout(finishAnimation, duration);
  }, [session, scale, finishAnimation]);

  useEffect(
    () => () => {
      window.clearTimeout(animationTimer.current);
    },
    [],
  );

  const send = useCallback(
    (event: EngineEvent) => {
      void dispatch(event);
    },
    [dispatch],
  );

  const roll = useCallback(async () => {
    const next = await dispatch({ type: 'roll' });
    const duration = DICE_ROLL_MS * scale;
    if (!next) return;
    if (duration === 0) {
      playCue('dice');
      return;
    }
    // Result is decided; the animation only shows it (cycling sums, decelerating)
    setAnimating('rolling');
    const dice = Math.max(1, next.lastDice.length);
    const started = performance.now();
    const tick = () => {
      if (performance.now() - started >= duration) {
        finishAnimation();
        playCue('dice');
        return;
      }
      setDiceFace(dice + Math.floor(Math.random() * (dice * (DIE_SIDES - 1) + 1)));
      animationTimer.current = window.setTimeout(tick, DICE_TICK_MS);
    };
    tick();
  }, [dispatch, scale, finishAnimation]);

  // Sound cues (design-system §8): card reveal after the move, last-seconds ticks, countdown end
  const revealKey =
    session.phase === 'resolve_card' && session.reveal && animating !== 'moving'
      ? `${session.round}-${session.reveal.field}`
      : null;
  const revealGroup = session.reveal?.group;
  const playedReveal = useRef<string | null>(revealKey);
  useEffect(() => {
    if (!revealKey || playedReveal.current === revealKey) return;
    playedReveal.current = revealKey;
    playCue(revealGroup === 'good' ? 'reveal-good' : 'reveal-bad');
  }, [revealKey, revealGroup]);

  useEffect(() => {
    if (timedSeconds === 0 || paused) return;
    if (countdown.finished) playCue('countdown-end');
    else if (countdown.secondsRemaining <= COUNTDOWN_TICK_SECONDS) playCue('tick');
  }, [countdown.secondsRemaining, countdown.finished, timedSeconds, paused]);

  const handlers: TaskBarHandlers = useMemo(
    () => ({
      confirm: () => {
        send(tierable ? { type: 'confirm', tier: strokeTier } : { type: 'confirm' });
      },
      selectTier: (tier) => {
        setTierChoice({ stepKey, tier });
      },
      roll: () => void roll(),
      chooseRoll: (value) => {
        send({ type: 'chooseRoll', value });
      },
      chooseDirection: (direction: Direction) => {
        send({ type: 'chooseDirection', direction });
      },
      pickEffect: (effect) => {
        send({ type: 'pickEffect', effect });
      },
      toggleGuess: (value) => {
        setGuess((current) =>
          current.includes(value)
            ? current.filter((entry) => entry !== value)
            : [...current, value].slice(-2),
        );
      },
      submitGuess: () => {
        const [first, second] = guess;
        if (first === undefined || second === undefined) return;
        send({ type: 'guess', numbers: [first, second] });
        setGuess([]);
      },
      chooseReward: (reward) => {
        send({ type: 'chooseReward', reward });
      },
      switcherooPool: (index) => {
        const categoryId = step?.kind === 'switcheroo_pool' ? step.categoryIds[index] : undefined;
        if (categoryId) send({ type: 'switcherooPool', categoryId });
      },
      switcherooFolder: (index) => {
        const folderId = step?.kind === 'switcheroo_folder' ? step.folderIds[index] : undefined;
        if (folderId) send({ type: 'switcherooFolder', folderId });
      },
    }),
    [send, roll, guess, step, tierable, strokeTier, stepKey],
  );

  // Keyboard map (game-design §7.2)
  const endEarlyTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (paused || isEditable(event.target) || document.querySelector('dialog[open]')) return;
      if (event.key === 'Backspace' && event.ctrlKey && !event.repeat) {
        endEarlyTimer.current = window.setTimeout(() => {
          send({ type: 'endEarly' });
        }, HOLD_TO_CONFIRM_MS);
        return;
      }
      // Let focused buttons handle their own Space/Enter activation
      const onButton = event.target instanceof HTMLButtonElement;
      const key = event.key;
      if (key === 'g' || key === 'G') {
        setGalleryOpen(true);
        return;
      }
      if (animating) {
        if (key === ' ' || key === 'Enter') {
          event.preventDefault();
          finishAnimation();
        }
        return;
      }
      if ((key === ' ' || key === 'Enter') && !onButton) {
        event.preventDefault();
        if (session.phase === 'roll' && !session.chooseNextRoll) handlers.roll();
        else if (step?.kind === 'task' || step?.kind === 'notice') handlers.confirm();
        else if ((step?.kind === 'hold' || step?.kind === 'timed_task') && countdown.finished)
          handlers.confirm();
        else if (step?.kind === 'guess') handlers.submitGuess();
        return;
      }
      if (session.phase === 'choose_direction' && (key === 'ArrowLeft' || key === 'ArrowRight')) {
        event.preventDefault();
        handlers.chooseDirection(key === 'ArrowLeft' ? 'left' : 'right');
        return;
      }
      const number = Number(key);
      if (!Number.isInteger(number) || number < 1 || number > 9) return;
      if (session.phase === 'roll' && session.chooseNextRoll && number <= 6) handlers.chooseRoll(number);
      else if (tierable && number <= rules.strokeTierMax) handlers.selectTier(number as StrokeTier);
      else if (step?.kind === 'guess' && number <= 6) handlers.toggleGuess(number);
      else if (step?.kind === 'pick_effect') {
        const effect = step.options[number - 1];
        if (effect) handlers.pickEffect(effect);
      } else if (step?.kind === 'choose_reward') {
        if (number === 1 && step.canRemoveEffect) handlers.chooseReward('remove_effect');
        if (number === 2) handlers.chooseReward('remove_penalty_fields');
      } else if (step?.kind === 'switcheroo_pool') handlers.switcherooPool(number - 1);
      else if (step?.kind === 'switcheroo_folder') handlers.switcherooFolder(number - 1);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Backspace' || event.key === 'Control') window.clearTimeout(endEarlyTimer.current);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.clearTimeout(endEarlyTimer.current);
    };
  }, [
    paused,
    animating,
    session,
    step,
    tierable,
    rules,
    handlers,
    countdown.finished,
    finishAnimation,
    send,
  ]);

  const targets =
    session.phase === 'choose_direction' && session.lastRoll && animating !== 'rolling'
      ? {
          left: wrapField(session.position - session.lastRoll),
          right: wrapField(session.position + session.lastRoll),
          blocked: null,
        }
      : null;

  const previewCard = previewField ? session.cards[previewField - 1] : undefined;
  const previewKind = previewCard?.imageHash ? mediaKinds[previewCard.imageHash] : undefined;
  const ringCenter = previewCard ? (
    <>
      <div className={PREVIEW_SIZE}>
        {previewCard.imageHash && previewKind && (
          <EffectMedia
            hash={previewCard.imageHash}
            kind={previewKind}
            variant="thumbnail"
            className="bg-stage"
            {...cardEffectOptions(previewCard, session.effects, folders, masks)}
          />
        )}
      </div>
      <div className="font-label text-label uppercase tracking-label text-ink">
        {t('game.fieldLabel', { field: previewCard.field })} ·{' '}
        {previewCard.kind === 'collectible' ? (
          <span className="text-collectible">{t('game.performer')}</span>
        ) : (
          <span className={previewCard.group === 'good' ? 'text-good' : 'text-bad'}>
            {t(previewCard.group === 'good' ? 'game.goodCard' : 'game.badCard')}
          </span>
        )}
      </div>
      <div className="font-label text-label text-ink-muted">
        {t('game.previewFrom', { distance: shortDistance(previewCard.field, session.position) })}
      </div>
    </>
  ) : session.phase === 'choose_direction' || animating === 'rolling' ? (
    <>
      <div className="font-label text-label uppercase tracking-label text-ink-muted">{t('game.rolled')}</div>
      <div
        key={diceFace ?? session.lastRoll}
        className="font-display text-display-xl font-bold text-good animate-[cr-land_160ms_ease-out]"
      >
        {diceFace ?? session.lastRoll}
      </div>
      {diceFace === null && session.lastDice.length > 1 ? (
        <div className="flex gap-1.5" aria-label={session.lastDice.join(' + ')}>
          {session.lastDice.map((value, index) => (
            <DiceFace key={index} value={value} size={SMALL_DIE_SIZE} tone="muted" />
          ))}
        </div>
      ) : (
        <div className="font-label text-label text-ink-muted">
          {t('game.fromField', { field: session.position })}
        </div>
      )}
    </>
  ) : (
    <>
      <div className="font-label text-label uppercase tracking-label text-ink-muted">{t('game.field')}</div>
      <div className="font-display text-display-xl font-semibold">{session.position}</div>
      <div className="flex gap-3 font-label text-label text-ink-2">
        <span>← {clockwiseDistance(session.goalField, session.position)}</span>
        <span>{t('game.goal', { field: session.goalField })}</span>
        <span>{clockwiseDistance(session.position, session.goalField)} →</span>
      </div>
    </>
  );

  return (
    <main
      className="grid h-full grid-cols-[clamp(400px,31vw,600px)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)]"
      onClick={animating ? finishAnimation : undefined}
    >
      <GameConsole
        session={session}
        rules={rules}
        hint={hint}
        releaseChance={releaseChance}
        performerName={performerName}
        ring={
          <Ring
            cards={session.cards}
            position={session.position}
            goalField={session.goalField}
            rotation={rotation}
            rotationMs={rotationMs}
            targets={targets}
            previewField={previewField}
            onPreview={setPreviewField}
            blocked={blockedArc(session)}
            goalPulse={
              step?.kind === 'notice' &&
              (step.notice.type === 'goal_moved' || step.notice.type === 'goal_drifted')
            }
            center={ringCenter}
            collectiblesVisible={session.rules.collectiblesVisible}
          />
        }
        onGallery={() => {
          setGalleryOpen(true);
        }}
        onPause={togglePause}
        onEndEarly={() => {
          send({ type: 'endEarly' });
        }}
      />
      <section className="grid min-h-0 grid-rows-[minmax(0,1fr)_clamp(136px,16vh,176px)]">
        <GameStage
          card={animating === 'moving' ? null : session.reveal}
          mediaKinds={mediaKinds}
          dimmed={session.phase === 'choose_direction' || session.phase === 'roll'}
          paused={paused}
          effects={cardEffectOptions(session.reveal, session.effects, folders, masks)}
        />
        <TaskBar
          session={session}
          rules={rules}
          folders={folders}
          actionCards={actionCards}
          hint={hint}
          countdown={timedSeconds > 0 ? countdown : null}
          guess={guess}
          strokeTier={strokeTier}
          animating={animating}
          handlers={handlers}
        />
      </section>
      {error && (
        <div className="fixed right-8 bottom-48 z-10 w-[480px]">
          <Alert onDismiss={dismissError}>{error}</Alert>
        </div>
      )}
      <GalleryDrawer
        open={galleryOpen}
        onClose={() => {
          setGalleryOpen(false);
        }}
        cards={session.cards}
        mediaKinds={mediaKinds}
        effects={session.effects}
        folders={folders}
        masks={masks}
      />
    </main>
  );
}
