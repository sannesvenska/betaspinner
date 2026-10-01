import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isFolderEligible } from '@shared/content';
import type { SpinResult } from '@shared/ipc';
import { nextDecayAt } from '@shared/session/progressionRules';
import { useGameConfigStore } from '@renderer/stores/gameConfigStore';
import { useLibraryStore } from '@renderer/stores/libraryStore';
import { useSessionStore } from '@renderer/stores/sessionStore';
import { useAnimationScale, useUiStore } from '@renderer/stores/uiStore';
import { Alert } from '@renderer/ui/Alert';
import { Button } from '@renderer/ui/Button';
import { KeyHint } from '@renderer/ui/KeyHint';
import { SettingsDialog } from '@renderer/features/settings/SettingsDialog';
import { playCue } from '@renderer/sound/sound';
import { DraftBoard, DraftSummary } from '@renderer/features/draft/DraftBoard';
import { effectiveGameConfig } from '@shared/config/gameConfig';
import { draftOutcome, isDraftComplete } from '@shared/draft';
import { StartWheel, type StartWheelHandle } from './StartWheel';

const RESULT_PAUSE_MS = 1200;
const CLOCK_TICK_MS = 1000;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

const formatRemaining = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / MS_PER_SECOND));
  return `${String(Math.floor(total / SECONDS_PER_MINUTE)).padStart(2, '0')}:${String(total % SECONDS_PER_MINUTE).padStart(2, '0')}`;
};

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, CLOCK_TICK_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [active]);
  return now;
}

/** Start screen with the start wheel (mockup B·03). */
export function StartScreen() {
  const { t } = useTranslation();
  const openAdmin = useUiStore((state) => state.openAdmin);
  const answerResume = useUiStore((state) => state.answerResume);
  const scale = useAnimationScale();
  const progression = useSessionStore((state) => state.snapshot?.progression);
  const discardedLegacySession = useSessionStore((state) => state.snapshot?.discardedLegacySession ?? false);
  const spin = useSessionStore((state) => state.spin);
  const adopt = useSessionStore((state) => state.adopt);
  const library = useLibraryStore((state) => state.snapshot);
  const wheelRef = useRef<StartWheelHandle>(null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const lockoutUntil = progression?.lockoutUntil ? new Date(progression.lockoutUntil).getTime() : 0;
  const decayAt = progression ? nextDecayAt(progression)?.getTime() : undefined;
  const now = useNow(lockoutUntil > 0 || decayAt !== undefined);
  const penalties = useGameConfigStore((state) => state.config.penalties);
  const nextLossAdds = penalties.penaltyStep * ((progression?.lossStreak ?? 0) + 1);
  const lockedMs = lockoutUntil - now;
  const locked = lockedMs > 0;

  const eligible = (library?.folders ?? []).filter(
    (folder) => folder.role === 'content' && isFolderEligible(folder, library?.status[folder.id]),
  );
  const ready =
    eligible.some((folder) => folder.group === 'good') && eligible.some((folder) => folder.group === 'bad');

  // §6.0: the draft comes before the wheel
  const gameConfig = useGameConfigStore((state) => state.config);
  const { draft: draftConfig, rules: effectiveRules } = effectiveGameConfig(gameConfig);
  const pendingDraft = progression?.pendingDraft ?? null;
  const draftSeen = useUiStore((state) =>
    pendingDraft ? state.seenDraftIds.includes(pendingDraft.id) : false,
  );
  const markDraftSeen = useUiStore((state) => state.markDraftSeen);
  // Stays on the board after the last pick until the player has looked at the full reveal
  const drafting =
    draftConfig.enabled && ready && (!pendingDraft || !isDraftComplete(pendingDraft) || !draftSeen);
  const draftResult =
    draftConfig.enabled && pendingDraft && isDraftComplete(pendingDraft) && progression
      ? draftOutcome(pendingDraft, draftConfig, progression.goodChance)
      : null;

  const onSpin = async () => {
    if (spinning || locked || !ready || drafting) return;
    setResult(null);
    setSpinning(true);
    const spun = await spin();
    if (!spun) {
      setSpinning(false);
      return;
    }
    await wheelRef.current?.spinTo(spun.wheel.value, scale);
    playCue(spun.wheel.penalty ? 'reveal-bad' : 'wheel-stop');
    setResult(spun);
    await new Promise((done) => setTimeout(done, RESULT_PAUSE_MS * scale));
    setSpinning(false);
    answerResume();
    adopt(spun);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        useUiStore.getState().paused ||
        event.target instanceof HTMLButtonElement ||
        document.querySelector('dialog[open]')
      )
        return;
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      if (drafting && draftResult && pendingDraft) markDraftSeen(pendingDraft.id);
      else if (spinning) wheelRef.current?.skip();
      else void onSpin();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  const hub = locked ? (
    <div className="flex flex-col items-center gap-1 text-center">
      <div className="font-label text-label uppercase tracking-label text-bad">{t('start.lockedTitle')}</div>
      <div className="font-display text-display font-bold tabular-nums">{formatRemaining(lockedMs)}</div>
    </div>
  ) : (
    <button
      type="button"
      disabled={!ready}
      onClick={spinning ? () => wheelRef.current?.skip() : () => void onSpin()}
      className="flex aspect-square w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-full bg-ink font-display text-title font-bold uppercase tracking-button text-bg transition-colors duration-150 hover:bg-ink-2 disabled:bg-ink-muted"
    >
      {spinning ? (result ? result.wheel.value : '…') : t('start.spin')}
      {!spinning && <KeyHint keys="Space" inverted />}
    </button>
  );

  return (
    <main className="grid h-full grid-cols-[minmax(320px,1fr)_minmax(0,auto)_minmax(260px,1fr)] items-center gap-8 px-12 py-8">
      <header className="absolute top-8 right-12 left-12 flex items-center justify-between">
        <div className="font-display text-brand font-semibold uppercase tracking-brand">{t('app.title')}</div>
        <nav className="flex gap-2">
          <Button
            variant="text"
            onClick={() => {
              openAdmin('folders');
            }}
          >
            {t('admin.title')}
          </Button>
          <Button
            variant="text"
            onClick={() => {
              setSettingsOpen(true);
            }}
          >
            {t('settings.open')}
          </Button>
        </nav>
      </header>

      <section className="flex flex-col gap-6 pl-12">
        <div className="font-label text-label uppercase tracking-label text-ink-muted">
          {t('start.eyebrow', { number: String((progression?.sessionCounter ?? 0) + 1).padStart(3, '0') })}
          {effectiveRules.betaMode && <span className="text-collectible"> · {t('draft.beta')}</span>}
        </div>
        <h1 className="font-display text-display font-bold uppercase">
          {drafting ? t('draft.title') : t('start.title')}
        </h1>
        <p className="max-w-md text-body text-ink-2">
          {drafting
            ? t(effectiveRules.betaMode ? 'draft.bodyBeta' : 'draft.body', {
                picks: draftConfig.picks,
                total: draftConfig.fieldCount,
              })
            : t('start.body')}
        </p>
        {draftResult && <DraftSummary outcome={draftResult} />}
        {drafting && draftResult && pendingDraft && (
          <div>
            <Button
              variant="primary"
              keyHint="Space"
              onClick={() => {
                markDraftSeen(pendingDraft.id);
              }}
            >
              {t('draft.continue')}
            </Button>
          </div>
        )}
        {locked && (
          <p className="max-w-md text-body text-bad">
            {t('start.lockedBody')} {formatRemaining(lockedMs)}.
          </p>
        )}
        {!ready && (
          <div className="flex max-w-md flex-col gap-3">
            <Alert>
              <strong className="text-ink">{t('start.notReadyTitle')}.</strong> {t('start.notReadyBody')}
            </Alert>
            <div>
              <Button
                variant="outline"
                onClick={() => {
                  openAdmin('folders');
                }}
              >
                {t('start.openLibrary')}
              </Button>
            </div>
          </div>
        )}
        {result?.generationError && <Alert>{t(`start.generation.${result.generationError}`)}</Alert>}
        {discardedLegacySession && <Alert>{t('start.legacyDiscarded')}</Alert>}
      </section>

      <div className="flex h-[min(80vh,900px)] items-center justify-center">
        {drafting ? (
          <DraftBoard draft={pendingDraft} />
        ) : (
          <StartWheel
            ref={wheelRef}
            penaltyFields={progression?.penaltyFields ?? []}
            highlight={result?.wheel.value ?? null}
            hub={hub}
          />
        )}
      </div>

      <aside className="flex flex-col gap-8">
        <div className="flex flex-col gap-0.5 border-l-3 border-penalty pl-4">
          <div className="font-label text-label uppercase tracking-label text-ink-muted">
            {t('start.penaltyFields')}
          </div>
          <div className="font-display text-title font-bold text-penalty">
            {progression?.penaltyFields.length ?? 0}
          </div>
          <div className="text-body-sm text-ink-2">
            {t('start.penaltyHint', { minutes: penalties.lockoutMinutes })}
          </div>
        </div>
        {decayAt !== undefined && (
          <div className="flex flex-col gap-0.5 border-l-3 border-ring-empty pl-4">
            <div className="font-label text-label uppercase tracking-label text-ink-muted">
              {t('start.nextDecay')}
            </div>
            <div className="font-display text-title font-bold tabular-nums">
              {formatRemaining(decayAt - now)}
            </div>
            <div className="text-body-sm text-ink-2">
              {t('start.decayHint', { count: penalties.decayAmount })}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-0.5 border-l-3 border-ring-empty pl-4">
          <div className="font-label text-label uppercase tracking-label text-ink-muted">
            {t('start.lossStreak')}
          </div>
          <div className="font-display text-title font-bold">{progression?.lossStreak ?? 0}</div>
          <div className="text-body-sm text-ink-2">{t('start.lossHint', { count: nextLossAdds })}</div>
        </div>
        <div className="flex flex-col gap-0.5 border-l-3 border-ring-empty pl-4">
          <div className="font-label text-label uppercase tracking-label text-ink-muted">
            {t('start.sessionsPlayed')}
          </div>
          <div className="font-display text-title font-bold">{progression?.sessionCounter ?? 0}</div>
        </div>
      </aside>
      <SettingsDialog
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
        }}
      />
    </main>
  );
}
