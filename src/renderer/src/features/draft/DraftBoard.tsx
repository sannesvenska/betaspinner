import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { isDraftComplete, type DraftFieldType, type DraftOutcome, type DraftState } from '@shared/draft';
import type { DraftArtView } from '@shared/ipc';
import { useDraftArtStore } from '@renderer/stores/draftArtStore';
import { useSessionStore } from '@renderer/stores/sessionStore';
import { classNames } from '@renderer/ui/classNames';
import { Icon } from '@renderer/ui/icons/Icon';
import { CroppedImage } from './CroppedImage';

const PERCENT = 100;
const TYPE_ICON = {
  bad: 'warning',
  good: 'check',
  pixelate: 'pixelate',
  splash: 'splatter',
  double: 'hail_mary',
} as const satisfies Record<DraftFieldType, string>;
const TYPE_TONE: Readonly<Record<DraftFieldType, string>> = {
  bad: 'text-bad border-bad',
  good: 'text-good border-good',
  pixelate: 'text-ink border-ink',
  splash: 'text-ink-2 border-ink-2',
  double: 'text-collectible border-collectible',
};

function FieldFace({ type, art }: { type: DraftFieldType; art: DraftArtView | null }) {
  const { t } = useTranslation();
  const image = art?.[type];
  return (
    <div className={classNames('relative h-full w-full border-2', TYPE_TONE[type])}>
      {image ? (
        <CroppedImage hash={image.image.hash} crop={image.crop} alt={t(`draft.type.${type}`)} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-surface">
          <Icon name={TYPE_ICON[type]} size={48} />
        </div>
      )}
      <span className="absolute right-0 bottom-0 left-0 bg-overlay px-2 py-1 text-center font-label text-key uppercase tracking-label">
        {t(`draft.type.${type}`)}
      </span>
    </div>
  );
}

/** game-design §6.0: the hidden fields; picked ones turn over at once, the rest after the last pick. */
export function DraftBoard({ draft }: { draft: DraftState | null }) {
  const { t } = useTranslation();
  const dealDraft = useSessionStore((state) => state.dealDraft);
  const pickDraft = useSessionStore((state) => state.pickDraft);
  const art = useDraftArtStore((state) => state.art);
  const loadArt = useDraftArtStore((state) => state.load);

  useEffect(() => {
    void loadArt();
  }, [loadArt]);
  // Deals a missing draft, or re-deals an untouched one whose mix no longer matches the config
  // (admin change, beta mode switched) – main decides, so calling it on every mount is safe
  useEffect(() => {
    void dealDraft();
  }, [dealDraft]);

  if (!draft) return <div className="font-label text-label text-ink-muted">{t('app.loading')}</div>;
  const complete = isDraftComplete(draft);
  const back = art?.back;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <div className="font-label text-label uppercase tracking-label text-ink-muted">
        {complete
          ? t('draft.done')
          : t('draft.remaining', { count: draft.picks - draft.picked.length, total: draft.picks })}
      </div>
      <ul className="grid w-[min(62vh,640px)] grid-cols-4 gap-3" aria-label={t('draft.boardLabel')}>
        {draft.board.map((type, index) => {
          const picked = draft.picked.includes(index);
          const revealed = picked || complete;
          return (
            <li key={index} className="aspect-square">
              <button
                type="button"
                disabled={revealed}
                aria-label={revealed ? t(`draft.type.${type}`) : t('draft.hidden', { number: index + 1 })}
                onClick={() => void pickDraft(index)}
                className={classNames(
                  'h-full w-full overflow-hidden rounded-panel transition-[opacity,transform] duration-200',
                  !revealed && 'hover:scale-[1.03] focus-visible:scale-[1.03]',
                  complete && !picked && 'opacity-35',
                )}
              >
                {revealed ? (
                  <div className="h-full w-full animate-[cr-fade-in_240ms_ease-out]">
                    <FieldFace type={type} art={art} />
                  </div>
                ) : back ? (
                  <CroppedImage hash={back.image.hash} crop={back.crop} alt="" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center border border-line-strong bg-surface bg-[repeating-linear-gradient(45deg,transparent_0_10px,var(--color-line)_10px_11px)] font-display text-title font-bold text-ink-muted">
                    ?
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** What the draft does to the coming session (start screen, briefing). */
export function DraftSummary({ outcome }: { outcome: DraftOutcome }) {
  const { t } = useTranslation();
  const rows = [
    [t('draft.summary.goodShare'), `${Math.round(outcome.goodShare * PERCENT)} %`],
    [
      t('draft.summary.pixelate'),
      outcome.pixelLevel > 0 ? t('draft.summary.level', { level: outcome.pixelLevel }) : '–',
    ],
    [
      t('draft.summary.splatter'),
      outcome.splatterShare > 0
        ? t('draft.summary.splatterShare', { percent: Math.round(outcome.splatterShare * PERCENT) })
        : '–',
    ],
    [t('draft.summary.winChance'), outcome.winMultiplier > 1 ? `×${outcome.winMultiplier}` : '–'],
  ] as const;
  return (
    <dl className="flex flex-col gap-2 border-l-3 border-line-strong pl-4">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-3">
          <dt className="w-44 font-label text-label uppercase tracking-label text-ink-muted">{label}</dt>
          <dd className="font-display text-chip font-bold uppercase tracking-chip">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
