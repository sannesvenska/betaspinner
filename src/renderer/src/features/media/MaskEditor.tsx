import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { MaskedMediaEntry } from '@shared/ipc';
import {
  boxFromPoints,
  DEFAULT_FEATHER,
  isUsableRegion,
  LASSO_EPSILON,
  MASK_EFFECTS,
  MAX_FEATHER,
  moveRegion,
  regionAt,
  regionBounds,
  resizeRegion,
  simplifyPath,
  type Handle,
  type MaskEffect,
  type MaskRegion,
  type MaskShape,
  type MaskStatus,
  type Point,
} from '@shared/masks';
import { EffectMedia } from '@renderer/effects/EffectMedia';
import { DEFAULT_SETTINGS, type MaskEditorSettings } from '@shared/settings';
import { useMasksStore } from '@renderer/stores/masksStore';
import { useUiStore } from '@renderer/stores/uiStore';
import { Button } from '@renderer/ui/Button';
import { classNames } from '@renderer/ui/classNames';
import { Icon } from '@renderer/ui/icons/Icon';
import { KeyHint } from '@renderer/ui/KeyHint';
import { NumberField } from '@renderer/ui/NumberField';
import { Switch } from '@renderer/ui/Switch';
import { commit, redo, startHistory, undo, type RegionHistory } from './regionHistory';

type Tool = 'select' | 'rect' | 'ellipse' | 'polygon' | 'lasso';

const TOOLS: readonly { tool: Tool; key: string }[] = [
  { tool: 'select', key: 'V' },
  { tool: 'rect', key: 'R' },
  { tool: 'ellipse', key: 'E' },
  { tool: 'polygon', key: 'P' },
  { tool: 'lasso', key: 'L' },
];
const TOOL_BY_KEY: Readonly<Record<string, Tool>> = {
  v: 'select',
  r: 'rect',
  e: 'ellipse',
  p: 'polygon',
  l: 'lasso',
};
const HANDLES: readonly Handle[] = ['nw', 'ne', 'sw', 'se'];
const HANDLE_PX = 10;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.15;
const FALLBACK_ASPECT = 16 / 9;
const PREVIEW_LEVELS = [0, 1, 2, 3, 4, 5] as const;
const PREVIEW_SPLATTER_SEED = 7;
const PERCENT = 100;

type Draft =
  | { kind: 'box'; shape: 'rect' | 'ellipse'; start: Point; end: Point }
  | { kind: 'polygon'; points: Point[]; cursor: Point | null }
  | { kind: 'lasso'; points: Point[] }
  | { kind: 'move'; id: string; origin: Point; start: MaskRegion }
  | { kind: 'resize'; id: string; handle: Handle; start: MaskRegion }
  | { kind: 'pan'; origin: Point; startPan: Point };

const newId = (): string => `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const newRegion = (shape: MaskShape, geometry: Pick<MaskRegion, 'rect' | 'points'>): MaskRegion => ({
  id: newId(),
  shape,
  ...geometry,
  effects: [...MASK_EFFECTS],
  feather: DEFAULT_FEATHER,
});
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const TEXT_INPUT_TYPES = new Set(['text', 'number', 'search']);
/** Only real text entry swallows the editor shortcuts (radios/checkboxes do not). */
const isTyping = (target: EventTarget | null) =>
  (target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type)) ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement;

function RegionShape({ region, className }: { region: MaskRegion; className: string }) {
  if (region.shape === 'polygon')
    return (
      <polygon
        points={(region.points ?? []).map((point) => `${point.x},${point.y}`).join(' ')}
        className={className}
        vectorEffect="non-scaling-stroke"
      />
    );
  const box = region.rect ?? { x: 0, y: 0, w: 0, h: 0 };
  return region.shape === 'rect' ? (
    <rect
      x={box.x}
      y={box.y}
      width={box.w}
      height={box.h}
      className={className}
      vectorEffect="non-scaling-stroke"
    />
  ) : (
    <ellipse
      cx={box.x + box.w / 2}
      cy={box.y + box.h / 2}
      rx={box.w / 2}
      ry={box.h / 2}
      className={className}
      vectorEffect="non-scaling-stroke"
    />
  );
}

interface MaskEditorProps {
  entries: readonly MaskedMediaEntry[];
  startIndex: number;
  onClose: () => void;
  /** After every save: the list and folder progress refresh */
  onSaved: (imageHash: string, status: MaskStatus, regionCount: number) => void;
}

/** game-design §12.3 Mask Editor – full screen, keyboard first, autosaves on navigation and close. */
export function MaskEditor({ entries, startIndex, onClose, onSaved }: MaskEditorProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const putMask = useMasksStore((state) => state.put);
  const saveSettings = useUiStore((state) => state.saveSettings);
  // Remembered choices (§12.3); read once – later changes are written back by `remember`
  const [prefs] = useState(() => {
    const settingsState = useUiStore.getState().settingsState;
    return settingsState.status === 'ready' ? settingsState.settings.maskEditor : DEFAULT_SETTINGS.maskEditor;
  });

  const [index, setIndex] = useState(startIndex);
  const [history, setHistory] = useState<RegionHistory>(startHistory([]));
  const [saved, setSaved] = useState<{ regions: MaskRegion[]; status: MaskStatus; inverted: boolean } | null>(
    null,
  );
  const [inverted, setInverted] = useState(prefs.inverted);
  const [tool, setTool] = useState<Tool>(prefs.tool);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [live, setLive] = useState<MaskRegion[] | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [previewLevel, setPreviewLevel] = useState(prefs.previewLevel);
  const [previewSplatter, setPreviewSplatter] = useState(prefs.previewSplatter);
  const [videoAspect, setVideoAspect] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const entry = entries[index];
  const regions = live ?? history.present;
  const selected = regions.find((region) => region.id === selectedId);
  const dirty =
    saved !== null &&
    (JSON.stringify(history.present) !== JSON.stringify(saved.regions) || inverted !== saved.inverted);

  /** Writes changed editor choices to the settings (survive image changes and restarts). */
  const remember = useCallback(
    (patch: Partial<MaskEditorSettings>) => {
      const settingsState = useUiStore.getState().settingsState;
      if (settingsState.status !== 'ready') return;
      const { settings } = settingsState;
      void saveSettings({ ...settings, maskEditor: { ...settings.maskEditor, ...patch } });
    },
    [saveSettings],
  );
  const chooseTool = useCallback(
    (next: Tool) => {
      setTool(next);
      setDraft(null);
      if (next !== 'select') remember({ tool: next });
    },
    [remember],
  );
  const toggleInverted = useCallback(() => {
    setInverted(!inverted);
    remember({ inverted: !inverted });
  }, [inverted, remember]);
  const togglePreviewSplatter = useCallback(() => {
    setPreviewSplatter(!previewSplatter);
    remember({ previewSplatter: !previewSplatter });
  }, [previewSplatter, remember]);
  const choosePreviewLevel = (level: number) => {
    setPreviewLevel(level);
    remember({ previewLevel: level });
  };

  // Native modal dialog: traps focus, keeps the app's Esc-to-home from firing
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([rect]) => {
      if (rect) setStageSize({ width: rect.contentRect.width, height: rect.contentRect.height });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  /** Switches the image; per-image state starts fresh (the mask loads in the effect below). */
  const showIndex = useCallback((target: number) => {
    setSaved(null);
    setSelectedId(null);
    setDraft(null);
    setLive(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setVideoAspect(null);
    setIndex(target);
  }, []);

  // Load the mask of the current image
  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    void window.api.invoke('masks:getMany', { hashes: [entry.hash] }).then((result) => {
      if (cancelled) return;
      const mask = result.ok ? result.data[entry.hash] : undefined;
      const loaded = mask?.regions ?? [];
      // Without a saved mask the remembered "invert" applies (not dirty until something is drawn)
      const settingsState = useUiStore.getState().settingsState;
      const startInverted =
        mask?.inverted ??
        (settingsState.status === 'ready' ? settingsState.settings.maskEditor.inverted : false);
      setHistory(startHistory(loaded));
      setSaved({ regions: loaded, status: mask?.status ?? 'unreviewed', inverted: startInverted });
      setInverted(startInverted);
    });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  // Videos have no header dimensions – read them from the metadata
  useEffect(() => {
    if (entry?.kind !== 'video' || entry.width) return;
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = `cr-media://media/${entry.hash}`;
    video.onloadedmetadata = () => {
      if (video.videoWidth > 0) setVideoAspect(video.videoWidth / video.videoHeight);
    };
    return () => {
      video.removeAttribute('src');
    };
  }, [entry]);

  const save = useCallback(
    async (
      status?: MaskStatus,
      next: MaskRegion[] = history.present,
      nextInverted: boolean = inverted,
    ): Promise<boolean> => {
      if (!entry || !saved) return false;
      const changed =
        JSON.stringify(next) !== JSON.stringify(saved.regions) ||
        nextInverted !== saved.inverted ||
        (status && status !== saved.status);
      if (!changed) return true;
      const result = await window.api.invoke('masks:save', {
        imageHash: entry.hash,
        regions: next,
        inverted: nextInverted,
        ...(status ? { status } : {}),
      });
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      setError(null);
      setSaved({ regions: result.data.regions, status: result.data.status, inverted: result.data.inverted });
      putMask(result.data.status === 'unreviewed' ? null : result.data, entry.hash);
      onSaved(entry.hash, result.data.status, result.data.regions.length);
      return true;
    },
    [entry, saved, history.present, inverted, putMask, onSaved],
  );

  const go = useCallback(
    async (delta: number) => {
      const target = index + delta;
      if (target < 0 || target >= entries.length) return;
      if (await save()) showIndex(target);
    },
    [index, entries.length, save, showIndex],
  );

  const close = useCallback(async () => {
    if (await save()) onClose();
  }, [save, onClose]);

  const update = useCallback((next: MaskRegion[]) => {
    setHistory((current) => commit(current, next));
  }, []);

  const copyPrevious = useCallback(async () => {
    const previous = entries[index - 1];
    if (!previous) return;
    const result = await window.api.invoke('masks:getMany', { hashes: [previous.hash] });
    const copied = result.ok ? (result.data[previous.hash]?.regions ?? []) : [];
    if (copied.length > 0)
      update([...history.present, ...copied.map((region) => ({ ...region, id: newId() }))]);
  }, [entries, index, history.present, update]);

  const markNoRegions = useCallback(async () => {
    setHistory((current) => commit(current, []));
    setInverted(false);
    if ((await save('no_regions', [], false)) && index < entries.length - 1) showIndex(index + 1);
  }, [save, index, entries.length, showIndex]);

  const finishPolygon = useCallback(() => {
    if (draft?.kind !== 'polygon') return;
    const region = newRegion('polygon', { points: draft.points });
    if (isUsableRegion(region)) {
      update([...history.present, region]);
      setSelectedId(region.id);
    }
    setDraft(null);
  }, [draft, history.present, update]);

  // Keyboard map (§12.3)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      if (event.ctrlKey && key === 'z') {
        event.preventDefault();
        setHistory((current) => (event.shiftKey ? redo(current) : undo(current)));
        return;
      }
      if (event.ctrlKey && key === 'y') {
        event.preventDefault();
        setHistory(redo);
        return;
      }
      if (event.ctrlKey || event.altKey) return;
      if (event.key === ' ') {
        event.preventDefault();
        setSpaceHeld(true);
        return;
      }
      if (event.key === 'Enter' && draft?.kind === 'polygon') {
        event.preventDefault();
        finishPolygon();
        return;
      }
      const nextTool = TOOL_BY_KEY[key];
      if (nextTool) {
        chooseTool(nextTool);
        return;
      }
      if (key === 'i') {
        toggleInverted();
        return;
      }
      if (key === 's') {
        togglePreviewSplatter();
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        update(history.present.filter((region) => region.id !== selectedId));
        setSelectedId(null);
        return;
      }
      if (event.key === 'ArrowLeft') void go(-1);
      else if (event.key === 'ArrowRight') void go(1);
      else if (key === 'c') void copyPrevious();
      else if (key === 'n') void markNoRegions();
      else if (key === '0') {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ') setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    draft,
    selectedId,
    history.present,
    update,
    go,
    copyPrevious,
    markNoRegions,
    finishPolygon,
    chooseTool,
    toggleInverted,
    togglePreviewSplatter,
  ]);

  if (!entry) return null;

  // Image placement: contain-fit in the stage, then zoom/pan
  const aspect = entry.width && entry.height ? entry.width / entry.height : (videoAspect ?? FALLBACK_ASPECT);
  const fitWidth = Math.min(stageSize.width, stageSize.height * aspect);
  const fitHeight = fitWidth / aspect;
  const width = fitWidth * zoom;
  const height = fitHeight * zoom;
  const left = (stageSize.width - width) / 2 + pan.x;
  const top = (stageSize.height - height) / 2 + pan.y;
  const handleW = width > 0 ? HANDLE_PX / width : 0;
  const handleH = height > 0 ? HANDLE_PX / height : 0;

  const toPoint = (event: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: 0, y: 0 };
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  };
  const handleAt = (point: Point): Handle | undefined => {
    if (!selected) return undefined;
    const bounds = regionBounds(selected);
    return HANDLES.find((handle) => {
      const hx = handle.includes('w') ? bounds.x : bounds.x + bounds.w;
      const hy = handle.includes('n') ? bounds.y : bounds.y + bounds.h;
      return Math.abs(point.x - hx) <= handleW && Math.abs(point.y - hy) <= handleH;
    });
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    if (spaceHeld || event.button === 1) {
      setDraft({ kind: 'pan', origin: { x: event.clientX, y: event.clientY }, startPan: pan });
      return;
    }
    const point = toPoint(event);
    switch (tool) {
      case 'select': {
        const handle = handleAt(point);
        if (handle && selected) {
          setDraft({ kind: 'resize', id: selected.id, handle, start: selected });
          return;
        }
        const hit = regionAt(history.present, point);
        setSelectedId(hit?.id ?? null);
        if (hit) setDraft({ kind: 'move', id: hit.id, origin: point, start: hit });
        return;
      }
      case 'rect':
      case 'ellipse':
        setDraft({ kind: 'box', shape: tool, start: point, end: point });
        return;
      case 'lasso':
        setDraft({ kind: 'lasso', points: [point] });
        return;
      case 'polygon':
        setDraft(
          draft?.kind === 'polygon'
            ? { ...draft, points: [...draft.points, point] }
            : { kind: 'polygon', points: [point], cursor: point },
        );
    }
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft) return;
    if (draft.kind === 'pan') {
      setPan({
        x: draft.startPan.x + event.clientX - draft.origin.x,
        y: draft.startPan.y + event.clientY - draft.origin.y,
      });
      return;
    }
    const point = toPoint(event);
    switch (draft.kind) {
      case 'box':
        setDraft({ ...draft, end: point });
        return;
      case 'lasso':
        setDraft({ ...draft, points: [...draft.points, point] });
        return;
      case 'polygon':
        setDraft({ ...draft, cursor: point });
        return;
      case 'move':
        setLive(
          history.present.map((region) =>
            region.id === draft.id
              ? moveRegion(draft.start, point.x - draft.origin.x, point.y - draft.origin.y)
              : region,
          ),
        );
        return;
      case 'resize':
        setLive(
          history.present.map((region) =>
            region.id === draft.id ? resizeRegion(draft.start, draft.handle, point) : region,
          ),
        );
    }
  };

  const onPointerUp = () => {
    if (!draft) return;
    if (draft.kind === 'polygon') return; // closes with double-click / Enter
    if (draft.kind === 'box') {
      const region = newRegion(draft.shape, { rect: boxFromPoints(draft.start, draft.end) });
      if (isUsableRegion(region)) {
        update([...history.present, region]);
        setSelectedId(region.id);
      }
    } else if (draft.kind === 'lasso') {
      const region = newRegion('polygon', { points: simplifyPath(draft.points, LASSO_EPSILON) });
      if (isUsableRegion(region)) {
        update([...history.present, region]);
        setSelectedId(region.id);
      }
    } else if ((draft.kind === 'move' || draft.kind === 'resize') && live) {
      update(live);
    }
    setLive(null);
    setDraft(null);
  };

  const onWheel = (event: React.WheelEvent) => {
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage) return;
    const nextZoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, event.deltaY < 0 ? zoom * ZOOM_STEP : zoom / ZOOM_STEP),
    );
    // Keep the point under the cursor in place
    const mouse = { x: event.clientX - stage.left, y: event.clientY - stage.top };
    const u = width > 0 ? (mouse.x - left) / width : 0.5;
    const v = height > 0 ? (mouse.y - top) / height : 0.5;
    const nextWidth = fitWidth * nextZoom;
    const nextHeight = fitHeight * nextZoom;
    setPan({
      x: mouse.x - u * nextWidth - (stageSize.width - nextWidth) / 2,
      y: mouse.y - v * nextHeight - (stageSize.height - nextHeight) / 2,
    });
    setZoom(nextZoom);
  };

  const setSelected = (patch: Partial<MaskRegion>) => {
    if (!selected) return;
    update(history.present.map((region) => (region.id === selected.id ? { ...region, ...patch } : region)));
  };
  const toggleEffect = (effect: MaskEffect, enabled: boolean) => {
    if (!selected) return;
    const effects = enabled
      ? [...new Set([...selected.effects, effect])]
      : selected.effects.filter((e) => e !== effect);
    setSelected({ effects: MASK_EFFECTS.filter((candidate) => effects.includes(candidate)) });
  };

  const pixelateRegions = regions.filter((region) => region.effects.includes('pixelate'));
  const splatterRegions = regions.filter((region) => region.effects.includes('splatter'));
  const draftRegion: MaskRegion | null =
    draft?.kind === 'box'
      ? newRegion(draft.shape, { rect: boxFromPoints(draft.start, draft.end) })
      : draft?.kind === 'lasso' && draft.points.length > 1
        ? newRegion('polygon', { points: draft.points })
        : null;
  const status: MaskStatus = saved?.status ?? 'unreviewed';

  return (
    <dialog
      ref={dialogRef}
      aria-label={t('media.editor.title')}
      className="m-0 h-full max-h-none w-full max-w-none bg-bg p-0 text-ink backdrop:bg-scrim"
      onCancel={(event) => {
        // Esc: cancel the drawing first, then close (with autosave)
        event.preventDefault();
        if (draft) setDraft(null);
        else if (selectedId) setSelectedId(null);
        else void close();
      }}
    >
      <div className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-6 py-3">
          {TOOLS.map(({ tool: entryTool, key }) => (
            <Button
              size="compact"
              key={entryTool}
              variant={tool === entryTool ? 'primary' : 'outline'}
              keyHint={key}
              aria-pressed={tool === entryTool}
              onClick={() => {
                chooseTool(entryTool);
              }}
            >
              {t(`media.tool.${entryTool}`)}
            </Button>
          ))}
          {/* Mask options, set apart from the drawing tools by a wider gap and a divider */}
          <span className="mx-4 h-8 w-px bg-line-strong" />
          <Button
            size="compact"
            variant={inverted ? 'primary' : 'outline'}
            keyHint="I"
            aria-pressed={inverted}
            title={t('media.editor.invertHint')}
            onClick={toggleInverted}
          >
            {t('media.editor.invert')}
          </Button>
          <Button
            size="compact"
            variant={previewSplatter ? 'primary' : 'outline'}
            keyHint="S"
            aria-pressed={previewSplatter}
            onClick={togglePreviewSplatter}
          >
            {t('media.editor.previewSplatter')}
          </Button>
          <span className="mx-2 h-8 w-px bg-line" />
          <Button
            size="compact"
            variant="text"
            title="Ctrl+Z"
            disabled={history.past.length === 0}
            onClick={() => {
              setHistory(undo);
            }}
          >
            {t('media.editor.undo')}
          </Button>
          <Button
            size="compact"
            variant="text"
            title="Ctrl+Y"
            disabled={history.future.length === 0}
            onClick={() => {
              setHistory(redo);
            }}
          >
            {t('media.editor.redo')}
          </Button>
          <span className="ml-auto font-label text-label whitespace-nowrap text-ink-muted tabular-nums">
            {t('media.editor.zoom', { zoom: Math.round(zoom * PERCENT) })}
          </span>
          <Button variant="primary" size="compact" keyHint="Esc" onClick={() => void close()}>
            {t('common.close')}
          </Button>
        </header>

        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_340px]">
          <div
            ref={stageRef}
            className={classNames('relative overflow-hidden bg-stage', spaceHeld && 'cursor-grab')}
            onWheel={onWheel}
          >
            <div className="absolute" style={{ left, top, width, height }}>
              <EffectMedia
                key={entry.hash}
                hash={entry.hash}
                kind={entry.kind}
                variant="stage"
                pixelLevel={previewLevel}
                splatterSeed={previewSplatter ? PREVIEW_SPLATTER_SEED : null}
                pixelateRegions={pixelateRegions}
                splatterRegions={splatterRegions}
                invertRegions={inverted}
              />
              <svg
                ref={svgRef}
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                className={classNames(
                  'absolute inset-0 h-full w-full',
                  tool === 'select' ? 'cursor-default' : 'cursor-crosshair',
                )}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onDoubleClick={finishPolygon}
              >
                {/* Inverted: the outside is shaded (that is where the effects go) */}
                {inverted && (
                  <>
                    <defs>
                      <mask id="cr-mask-outside">
                        <rect x={0} y={0} width={1} height={1} fill="white" />
                        {regions.map((region) => (
                          <RegionShape key={region.id} region={region} className="fill-black" />
                        ))}
                      </mask>
                    </defs>
                    <rect
                      x={0}
                      y={0}
                      width={1}
                      height={1}
                      mask="url(#cr-mask-outside)"
                      className="fill-masked/20"
                    />
                  </>
                )}
                {regions.map((region) => (
                  <RegionShape
                    key={region.id}
                    region={region}
                    className={classNames(
                      inverted ? 'fill-none stroke-2' : 'fill-masked/20 stroke-2',
                      region.id === selectedId ? 'stroke-ink [stroke-dasharray:6_4]' : 'stroke-masked',
                    )}
                  />
                ))}
                {draftRegion && (
                  <RegionShape region={draftRegion} className="fill-masked/10 stroke-ink stroke-2" />
                )}
                {draft?.kind === 'polygon' && (
                  <polyline
                    points={[...draft.points, ...(draft.cursor ? [draft.cursor] : [])]
                      .map((point) => `${point.x},${point.y}`)
                      .join(' ')}
                    className="fill-none stroke-ink stroke-2"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {selected &&
                  tool === 'select' &&
                  HANDLES.map((handle) => {
                    const bounds = regionBounds(selected);
                    const hx = handle.includes('w') ? bounds.x : bounds.x + bounds.w;
                    const hy = handle.includes('n') ? bounds.y : bounds.y + bounds.h;
                    return (
                      <rect
                        key={handle}
                        x={hx - handleW / 2}
                        y={hy - handleH / 2}
                        width={handleW}
                        height={handleH}
                        className="fill-ink stroke-bg stroke-1"
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}
              </svg>
            </div>
          </div>

          <aside className="flex min-h-0 flex-col gap-6 overflow-y-auto border-l border-line bg-panel px-6 py-6">
            <section className="flex flex-col gap-1">
              <div className="font-label text-label uppercase tracking-label text-ink-muted">
                {t('media.editor.position', { index: index + 1, total: entries.length })}
              </div>
              <div
                className="truncate font-display text-chip font-semibold uppercase tracking-chip"
                title={entry.fileName}
              >
                {entry.fileName}
              </div>
              <div className="text-body-sm text-ink-2">
                {t(`media.status.${status}`)} · {dirty ? t('media.editor.unsaved') : t('media.editor.saved')}
              </div>
              {error && <div className="text-body-sm text-bad">{error}</div>}
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="font-label text-label uppercase tracking-label text-ink-muted">
                {t('media.editor.region')}
              </h3>
              {selected ? (
                <>
                  <div className="text-body-sm text-ink-2">{t(`media.shape.${selected.shape}`)}</div>
                  {MASK_EFFECTS.map((effect) => (
                    <Switch
                      key={effect}
                      label={t(`effect.${effect}.name`)}
                      checked={selected.effects.includes(effect)}
                      onChange={(enabled) => {
                        toggleEffect(effect, enabled);
                      }}
                    />
                  ))}
                  <NumberField
                    compact
                    percent
                    step={0.005}
                    min={0}
                    max={MAX_FEATHER}
                    label={t('media.editor.feather')}
                    value={selected.feather}
                    onChange={(feather) => {
                      if (Number.isFinite(feather))
                        setSelected({ feather: Math.min(MAX_FEATHER, Math.max(0, feather)) });
                    }}
                  />
                  <Button
                    variant="text"
                    className="self-start"
                    keyHint="Del"
                    onClick={() => {
                      update(history.present.filter((region) => region.id !== selected.id));
                      setSelectedId(null);
                    }}
                  >
                    <Icon name="trash" size={16} />
                    {t('media.editor.delete')}
                  </Button>
                </>
              ) : (
                <p className="text-body-sm text-ink-muted">
                  {t('media.editor.noSelection', { count: history.present.length })}
                </p>
              )}
            </section>

            <section className="flex flex-col gap-3">
              {/* Compact level buttons: six segments don't fit the side panel */}
              <div className="flex flex-col gap-2">
                <span className="font-label text-label uppercase tracking-label text-ink-muted">
                  {t('media.editor.preview')}
                </span>
                <div className="flex" role="group" aria-label={t('media.editor.preview')}>
                  {PREVIEW_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      aria-pressed={previewLevel === level}
                      onClick={() => {
                        choosePreviewLevel(level);
                      }}
                      className={classNames(
                        'h-10 flex-1 border border-line-strong font-display text-button font-semibold not-first:-ml-px first:rounded-l-panel last:rounded-r-panel',
                        previewLevel === level ? 'bg-ink text-bg' : 'text-ink-muted hover:text-ink',
                      )}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              {inverted && <p className="text-body-sm text-ink-muted">{t('media.editor.invertHint')}</p>}
            </section>

            <section className="mt-auto flex flex-col gap-2">
              <Button
                variant="outline"
                keyHint="C"
                disabled={index === 0}
                onClick={() => void copyPrevious()}
              >
                {t('media.editor.copyPrevious')}
              </Button>
              <Button variant="outline" keyHint="N" onClick={() => void markNoRegions()}>
                {t('media.editor.noRegions')}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  keyHint="←"
                  disabled={index === 0}
                  onClick={() => void go(-1)}
                >
                  {t('media.editor.previous')}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  keyHint="→"
                  disabled={index >= entries.length - 1}
                  onClick={() => void go(1)}
                >
                  {t('media.editor.next')}
                </Button>
              </div>
              <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
                <KeyHint keys="Space" /> {t('media.editor.panHint')}
              </p>
            </section>
          </aside>
        </div>
      </div>
    </dialog>
  );
}
