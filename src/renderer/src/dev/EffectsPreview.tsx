import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaEntry, MediaKind } from '@shared/content';
import { EffectMedia } from '@renderer/effects/EffectMedia';
import { PIXEL_BLOCK_FRACTIONS } from '@renderer/effects/effectMath';
import { useLibraryStore } from '@renderer/stores/libraryStore';
import { Button } from '@renderer/ui/Button';
import { Switch } from '@renderer/ui/Switch';

const KINDS: readonly MediaKind[] = ['image', 'animated', 'video'];
const PREVIEW_SPLATTER_SEED = 424242;
const SCAN_LIMIT = 200;

/** Dev showcase: one media file per kind with every pixel level and splatter (AP8 QA). */
export function EffectsPreview() {
  const { t } = useTranslation();
  const folders = useLibraryStore((state) => state.snapshot?.folders ?? []);
  const [samples, setSamples] = useState<MediaEntry[]>([]);
  const [level, setLevel] = useState(3);
  const [splatter, setSplatter] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      folders.map((folder) =>
        window.api.invoke('library:listMedia', { folderId: folder.id, offset: 0, limit: SCAN_LIMIT }),
      ),
    ).then((results) => {
      if (cancelled) return;
      const entries = results.flatMap((result) => (result.ok ? result.data.entries : []));
      setSamples(KINDS.flatMap((kind) => entries.find((entry) => entry.kind === kind) ?? []));
    });
    return () => {
      cancelled = true;
    };
  }, [folders]);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {PIXEL_BLOCK_FRACTIONS.map((_, index) => (
          <Button
            key={index}
            variant={index === level ? 'primary' : 'outline'}
            onClick={() => {
              setLevel(index);
            }}
          >
            {t('common.level', { level: index })}
          </Button>
        ))}
        <Switch label={t('effect.splatter.name')} checked={splatter} onChange={setSplatter} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {samples.map((entry) => (
          <div key={entry.hash} className="flex flex-col gap-1">
            <div className="aspect-square overflow-hidden bg-stage">
              <EffectMedia
                hash={entry.hash}
                kind={entry.kind}
                pixelLevel={level}
                splatterSeed={splatter ? PREVIEW_SPLATTER_SEED : null}
              />
            </div>
            <span className="font-label text-key uppercase tracking-label text-ink-muted">
              {entry.kind} · {entry.fileName}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
