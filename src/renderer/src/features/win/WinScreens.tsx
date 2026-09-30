import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { RewardChoice, SessionState } from '@shared/session/types';
import { PickTile } from '@renderer/features/game/PickTile';
import { useGameConfigStore } from '@renderer/stores/gameConfigStore';
import { useSessionStore } from '@renderer/stores/sessionStore';
import { useAnimationScale, useUiStore } from '@renderer/stores/uiStore';
import { Button } from '@renderer/ui/Button';
import { classNames } from '@renderer/ui/classNames';
import { playCue } from '@renderer/sound/sound';
import { FinalWheel, type FinalWheelHandle } from './FinalWheel';
import {
  landingAngle,
  planDeceleration,
  rotationAt,
  SPIN_DEG_PER_SECOND,
  type Deceleration,
} from './finalWheelMotion';

const MS_PER_SECOND = 1000;
const WARNING_SECONDS = 3;
const PERCENT = 100;
const REWARDS: readonly RewardChoice[] = [
  'remove_penalty_fields',
  'increase_good_chance',
  'block_bad_action',
];

/** Space/Enter triggers `action` unless a button has focus (it activates itself). */
function useSpaceKey(action: (() => void) | null) {
  useEffect(() => {
    if (!action) return;
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

function Stat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: 'ink' | 'good' | 'muted';
}) {
  return (
    <div
      className={classNames(
        'flex flex-col gap-0.5 border-l-3 pl-4',
        tone === 'good' ? 'border-good' : tone === 'ink' ? 'border-ink' : 'border-ring-empty',
      )}
    >
      <div className="font-label text-label uppercase tracking-label text-ink-muted">{label}</div>
      <div
        className={classNames(
          'font-display text-title font-bold',
          tone === 'good' ? 'text-good' : 'text-ink',
        )}
      >
        {value}
      </div>
      <div className="text-body-sm text-ink-2">{detail}</div>
    </div>
  );
}

function WinLayout({
  session,
  title,
  body,
  action,
  center,
  aside,
}: {
  session: SessionState;
  title: string;
  body: string;
  action: ReactNode;
  center: ReactNode;
  aside?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <main className="grid h-full grid-cols-[minmax(320px,1fr)_minmax(0,auto)_minmax(260px,1fr)] items-center gap-8 px-12 py-8">
      <div className="absolute top-8 left-12 font-display text-brand font-semibold uppercase tracking-brand">
        {t('app.title')}
      </div>
      <section className="flex flex-col gap-6 pl-12">
        <div className="font-label text-label uppercase tracking-label text-ink-muted">
          {t('win.eyebrow', { number: String(session.sessionIndex).padStart(3, '0') })}
        </div>
        <h1 className="font-display text-display font-bold uppercase">{title}</h1>
        <p className="max-w-md text-body text-ink-2">{body}</p>
        <div>{action}</div>
      </section>
      <div className="flex h-[min(80vh,900px)] items-center justify-center">{center}</div>
      <aside className="flex flex-col gap-8">{aside}</aside>
    </main>
  );
}

type WheelStage = 'ready' | 'spinning' | 'holding' | 'stopped';

/**
 * §14.1 v2 + §14.2 – the release chance is fixed on landing (no roll); constant spin, then Hold Position
 * decelerates the wheel onto the decided result at t = 0.
 */
export function FinalWheelScreen({ session }: { session: SessionState }) {
  const { t } = useTranslation();
  const dispatch = useSessionStore((state) => state.dispatch);
  const paused = useUiStore((state) => state.paused);
  const scale = useAnimationScale();
  const wheelRef = useRef<FinalWheelHandle>(null);
  const rotation = useRef(0);
  const plan = useRef<Deceleration | null>(null);
  const elapsed = useRef(0);
  const lastSecond = useRef(-1);
  const [stage, setStage] = useState<WheelStage>(session.finalWheel ? 'spinning' : 'ready');
  const [secondsLeft, setSecondsLeft] = useState(session.finalWheel?.holdSeconds ?? 0);
  const check = session.winCheck;
  const wheel = session.finalWheel;

  // Animation loop: time only advances while not paused (pause freezes the hold, §19)
  useEffect(() => {
    if (stage !== 'spinning' && stage !== 'holding') return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      if (!paused) {
        if (stage === 'spinning') {
          if (scale > 0) rotation.current += (SPIN_DEG_PER_SECOND * dt) / MS_PER_SECOND;
        } else if (plan.current) {
          elapsed.current += dt;
          const done = elapsed.current >= plan.current.durationMs;
          rotation.current = rotationAt(plan.current, elapsed.current);
          const left = Math.max(0, Math.ceil((plan.current.durationMs - elapsed.current) / MS_PER_SECOND));
          if (left !== lastSecond.current) {
            lastSecond.current = left;
            if (left > 0 && left <= WARNING_SECONDS) playCue('tick');
            setSecondsLeft(left);
          }
          if (done) {
            wheelRef.current?.setRotation(rotation.current);
            playCue('wheel-stop');
            setStage('stopped');
            return;
          }
        }
        wheelRef.current?.setRotation(rotation.current);
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [stage, paused, scale]);

  const start = useCallback(async () => {
    if (await dispatch({ type: 'startFinalWheel' })) setStage('spinning');
  }, [dispatch]);

  const hold = useCallback(() => {
    if (!wheel || !check) return;
    const target = landingAngle(wheel.result, wheel.landing, check.finalChance);
    plan.current = planDeceleration(rotation.current, target, wheel.holdSeconds * MS_PER_SECOND);
    elapsed.current = 0;
    setSecondsLeft(wheel.holdSeconds);
    setStage('holding');
  }, [wheel, check]);

  const finish = useCallback(() => void dispatch({ type: 'finishFinalWheel' }), [dispatch]);

  const handlePrimary = useCallback(() => {
    if (stage === 'ready') void start();
    else if (stage === 'spinning') hold();
    else if (stage === 'stopped') finish();
  }, [stage, start, hold, finish]);
  useSpaceKey(stage === 'holding' ? null : handlePrimary);

  if (!check) return null;
  const warning = stage === 'holding' && secondsLeft <= WARNING_SECONDS;
  const hub =
    stage === 'holding' ? (
      <>
        <div className="font-label text-label uppercase tracking-label text-ink-muted">{t('win.hold')}</div>
        <div
          className={classNames(
            'font-display text-display-xl font-bold tabular-nums',
            warning ? 'text-bad' : 'text-ink',
          )}
        >
          {secondsLeft}
        </div>
        <div className="font-label text-label uppercase tracking-label text-ink-muted">
          {t('win.ofSeconds', { seconds: wheel?.holdSeconds ?? 0 })}
        </div>
      </>
    ) : stage === 'stopped' && wheel ? (
      <div
        className={classNames(
          'font-display text-title font-bold uppercase',
          wheel.result === 'allowed' ? 'text-ink' : 'text-bad',
        )}
      >
        {t(wheel.result === 'allowed' ? 'win.allowed' : 'win.denied')}
      </div>
    ) : null;

  const actionLabel =
    stage === 'ready'
      ? t('win.startTask')
      : stage === 'spinning'
        ? t('win.holdPosition')
        : stage === 'holding'
          ? t('win.holding')
          : t('win.continue');

  return (
    <WinLayout
      session={session}
      title={t('win.wheelTitle')}
      body={t('win.wheelBody')}
      action={
        <Button
          variant={stage === 'holding' ? 'outline' : 'primary'}
          size="primary"
          disabled={stage === 'holding'}
          keyHint={stage === 'holding' ? undefined : 'Space'}
          onClick={handlePrimary}
        >
          {actionLabel}
        </Button>
      }
      center={<FinalWheel ref={wheelRef} finalChance={check.finalChance} hub={hub} />}
      aside={
        <>
          <Stat
            label={t('win.baseChance')}
            value={`${check.base.toFixed(1)} %`}
            detail={t('win.baseDetail', { discovered: check.discovered, rate: check.rate })}
            tone="muted"
          />
          {check.bonus > 0 && (
            <Stat
              label={t('win.bonus')}
              value={`+${check.bonus} %`}
              detail={t('win.bonusDetail', { collected: session.collected })}
              tone="muted"
            />
          )}
          {check.multiplier > 1 && (
            <Stat
              label={t('win.multiplier')}
              value={`×${check.multiplier.toFixed(1)}`}
              detail={t('win.multiplierDetail')}
              tone="good"
            />
          )}
          <Stat
            label={t('win.finalChance')}
            value={`${check.finalChance} %`}
            detail={t('win.finalDetail', { chance: check.finalChance, rest: PERCENT - check.finalChance })}
            tone="ink"
          />
        </>
      }
    />
  );
}

/** §14.3 – how the session ended after the final wheel. */
export function OutcomeScreen({ session }: { session: SessionState }) {
  const { t } = useTranslation();
  const dispatch = useSessionStore((state) => state.dispatch);
  const [choosingReward, setChoosingReward] = useState(false);
  const allowed = session.finalWheel?.result === 'allowed';
  const rules = useGameConfigStore((state) => state.config.penalties);
  const percent = (value: number) => Math.round(value * PERCENT * 10) / 10;

  const confirmDenied = useCallback(() => void dispatch({ type: 'confirm' }), [dispatch]);
  useSpaceKey(allowed ? null : confirmDenied);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!allowed || useUiStore.getState().paused) return;
      const index = Number(event.key) - 1;
      if (choosingReward) {
        const reward = REWARDS[index];
        if (reward) void dispatch({ type: 'chooseOutcome', outcome: 'success', reward });
        if (event.key === 'Escape') setChoosingReward(false);
      } else if (index === 0) setChoosingReward(true);
      else if (index === 1) void dispatch({ type: 'chooseOutcome', outcome: 'interrupted' });
      else if (index === 2) void dispatch({ type: 'chooseOutcome', outcome: 'no_result' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [allowed, choosingReward, dispatch]);

  if (!allowed) {
    return (
      <main className="flex h-full flex-col justify-center gap-6 px-24">
        <h1 className="font-display text-display font-bold uppercase text-bad">{t('outcome.deniedTitle')}</h1>
        <p className="max-w-2xl text-body text-ink-2">{t('outcome.deniedBody')}</p>
        <div>
          <Button variant="primary" size="primary" keyHint="Space" onClick={confirmDenied}>
            {t('game.ok')}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-full flex-col justify-center gap-8 px-24">
      <h1 className="font-display text-display font-bold uppercase">
        {choosingReward ? t('outcome.rewardTitle') : t('outcome.allowedTitle')}
      </h1>
      {!choosingReward && <p className="text-body text-ink-2">{t('outcome.allowedBody')}</p>}
      <div className="flex flex-wrap gap-3">
        {choosingReward ? (
          <>
            {REWARDS.map((reward, index) => (
              <PickTile
                key={reward}
                tone="good"
                keyHint={String(index + 1)}
                title={t(`outcome.reward.${reward}`, {
                  count: rules.successRemoveFields,
                  percent: percent(rules.goodChanceStep),
                })}
                onClick={() => void dispatch({ type: 'chooseOutcome', outcome: 'success', reward })}
              />
            ))}
            <Button
              variant="text"
              keyHint="Esc"
              onClick={() => {
                setChoosingReward(false);
              }}
            >
              {t('outcome.back')}
            </Button>
          </>
        ) : (
          <>
            <PickTile
              tone="good"
              keyHint="1"
              title={t('outcome.succeeded')}
              meta={t('outcome.succeededHint')}
              onClick={() => {
                setChoosingReward(true);
              }}
            />
            <PickTile
              tone="neutral"
              keyHint="2"
              title={t('outcome.interrupted')}
              meta={t('outcome.interruptedHint', { count: rules.partialRemoveFields })}
              onClick={() => void dispatch({ type: 'chooseOutcome', outcome: 'interrupted' })}
            />
            <PickTile
              tone="neutral"
              keyHint="3"
              title={t('outcome.noResult')}
              meta={t('outcome.noResultHint', {
                count: rules.partialRemoveFields,
                percent: percent(rules.goodChanceStep / 2),
              })}
              onClick={() => void dispatch({ type: 'chooseOutcome', outcome: 'no_result' })}
            />
          </>
        )}
      </div>
    </main>
  );
}
