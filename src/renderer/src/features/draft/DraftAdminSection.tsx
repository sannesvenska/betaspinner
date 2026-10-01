import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { DRAFT_FIELDS, validateDraft } from '@shared/config/gameConfig';
import { mediaUrl } from '@shared/content';
import { DRAFT_ART_SLOTS, type DraftArtSlot, type DraftCrop } from '@shared/draft';
import { SectionEditor } from '@renderer/features/admin/SectionEditor';
import { useDraftArtStore } from '@renderer/stores/draftArtStore';
import { useGameConfigStore } from '@renderer/stores/gameConfigStore';
import { Alert } from '@renderer/ui/Alert';
import { Button } from '@renderer/ui/Button';
import { Dialog } from '@renderer/ui/Dialog';
import { Icon } from '@renderer/ui/icons/Icon';
import { CroppedImage } from './CroppedImage';

const CROP_BOX_PX = 520;
const MIN_CROP_PX = 24;
const HANDLE_PX = 14;

type Drag = { kind: 'move' | 'resize'; originX: number; originY: number; start: DraftCrop };

/** Square crop editor: drag the square to move it, drag its corner to resize (always square in pixels). */
function CropDialog({
  slot,
  hash,
  crop,
  onClose,
}: {
  slot: DraftArtSlot;
  hash: string;
  crop: DraftCrop;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const setCrop = useDraftArtStore((state) => state.setCrop);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [draft, setDraft] = useState(crop);
  const drag = useRef<Drag | null>(null);

  const scale = natural ? Math.min(CROP_BOX_PX / natural.width, CROP_BOX_PX / natural.height) : 1;
  const width = natural ? natural.width * scale : CROP_BOX_PX;
  const height = natural ? natural.height * scale : CROP_BOX_PX;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>, kind: Drag['kind']) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind, originX: event.clientX, originY: event.clientY, start: draft };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    const dx = (event.clientX - current.originX) / width;
    const dy = (event.clientY - current.originY) / height;
    const { start } = current;
    if (current.kind === 'move') {
      setDraft({
        ...start,
        x: Math.min(1 - start.w, Math.max(0, start.x + dx)),
        y: Math.min(1 - start.h, Math.max(0, start.y + dy)),
      });
      return;
    }
    // Resize keeps the square: grow by the larger pixel delta, limited by the image edges
    const startSide = start.w * width;
    const maxSide = Math.min((1 - start.x) * width, (1 - start.y) * height);
    const side = Math.min(maxSide, Math.max(MIN_CROP_PX, startSide + Math.max(dx * width, dy * height)));
    setDraft({ ...start, w: side / width, h: side / height });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <Dialog open onClose={onClose} title={t('draft.admin.cropTitle', { slot: t(`draft.slot.${slot}`) })}>
      <div className="flex flex-col items-center gap-4 px-8 py-6">
        <div className="relative bg-stage" style={{ width, height }}>
          <img
            src={mediaUrl(hash)}
            alt=""
            draggable={false}
            className="h-full w-full select-none"
            onLoad={(event) => {
              setNatural({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              });
            }}
          />
          <div
            role="presentation"
            className="absolute cursor-move border-2 border-ink shadow-[0_0_0_9999px_rgb(0_0_0/0.55)]"
            style={{
              left: draft.x * width,
              top: draft.y * height,
              width: draft.w * width,
              height: draft.h * height,
            }}
            onPointerDown={(event) => {
              onPointerDown(event, 'move');
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <div
              role="presentation"
              className="absolute -right-2 -bottom-2 cursor-nwse-resize border border-bg bg-ink"
              style={{ width: HANDLE_PX, height: HANDLE_PX }}
              onPointerDown={(event) => {
                onPointerDown(event, 'resize');
              }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          </div>
        </div>
        <p className="text-body-sm text-ink-muted">{t('draft.admin.cropHint')}</p>
      </div>
      <div className="flex justify-end gap-3 px-8 pb-7">
        <Button variant="text" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            void setCrop(slot, draft).then(onClose);
          }}
        >
          {t('admin.save')}
        </Button>
      </div>
    </Dialog>
  );
}

function DraftArtEditor() {
  const { t } = useTranslation();
  const { art, error, load, pickImage, clear, dismissError } = useDraftArtStore();
  const [cropping, setCropping] = useState<DraftArtSlot | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const croppingEntry = cropping ? art?.[cropping] : null;
  return (
    <section className="flex flex-col gap-5 border-t border-line pt-6">
      <h3 className="font-label text-label uppercase tracking-label text-ink-muted">
        {t('admin.group.draftArt')}
      </h3>
      <p className="max-w-3xl text-body-sm text-ink-2">{t('draft.admin.artIntro')}</p>
      {error && (
        <Alert onDismiss={dismissError}>
          {error === 'unsupported' ? t('draft.admin.unsupported') : error}
        </Alert>
      )}
      <ul className="flex flex-wrap gap-6">
        {DRAFT_ART_SLOTS.map((slot) => {
          const entry = art?.[slot];
          return (
            <li key={slot} className="flex w-40 flex-col gap-2">
              <span className="font-label text-label uppercase tracking-label text-ink-muted">
                {t(`draft.slot.${slot}`)}
              </span>
              <div className="aspect-square overflow-hidden rounded-panel border border-line-strong bg-surface">
                {entry ? (
                  <CroppedImage hash={entry.image.hash} crop={entry.crop} alt={t(`draft.slot.${slot}`)} />
                ) : (
                  <div className="flex h-full items-center justify-center text-body-sm text-ink-muted">
                    {t('draft.admin.noImage')}
                  </div>
                )}
              </div>
              <Button variant="outline" onClick={() => void pickImage(slot)}>
                <Icon name="plus" size={16} />
                {entry ? t('library.cards.replaceImage') : t('library.cards.chooseImage')}
              </Button>
              {entry && (
                <div className="flex gap-1">
                  <Button
                    variant="text"
                    onClick={() => {
                      setCropping(slot);
                    }}
                  >
                    {t('draft.admin.crop')}
                  </Button>
                  <Button variant="text" onClick={() => void clear(slot)}>
                    <Icon name="trash" size={16} />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {cropping && croppingEntry && (
        <CropDialog
          slot={cropping}
          hash={croppingEntry.image.hash}
          crop={croppingEntry.crop}
          onClose={() => {
            setCropping(null);
          }}
        />
      )}
    </section>
  );
}

/** game-design §6.0 admin: draft rules + the five card images. */
export function DraftAdminSection() {
  const { t } = useTranslation();
  const draft = useGameConfigStore((state) => state.config.draft);
  const update = useGameConfigStore((state) => state.update);
  const reset = useGameConfigStore((state) => state.reset);
  return (
    <SectionEditor
      title={t('admin.section.draft')}
      intro={t('admin.intro.draft')}
      value={draft}
      fields={DRAFT_FIELDS}
      validate={validateDraft}
      onSave={(value) => update({ section: 'draft', value })}
      onReset={() => reset('draft')}
      footer={<DraftArtEditor />}
    />
  );
}
