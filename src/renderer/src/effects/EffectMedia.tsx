import { useEffect, useMemo, useRef, useState } from 'react';
import { mediaUrl, type MediaKind } from '@shared/content';
import { classNames } from '@renderer/ui/classNames';
import { Media } from '@renderer/ui/Media';
import { useGameConfigStore } from '@renderer/stores/gameConfigStore';
import { drawEffectFrame, hasEffects, type EffectOptions } from './drawEffects';
import { loadSplatterTextures } from './splatterTextures';

/** A frame drawn slower than this on average switches animated media to a static frame (§5.3). */
const FRAME_BUDGET_MS = 16;
const BUDGET_SAMPLE_FRAMES = 30;
const IMAGE_CACHE_LIMIT = 64;
const MS_PER_MICROSECOND = 1 / 1000;

/** Decoded images by hash – the protocol sends `no-store`, so the ring/gallery would refetch otherwise. */
const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadMediaImage(hash: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(hash);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      imageCache.delete(hash);
      reject(new Error(`Media ${hash} failed to load`));
    };
    image.src = mediaUrl(hash);
  });
  imageCache.set(hash, promise);
  if (imageCache.size > IMAGE_CACHE_LIMIT) {
    const oldest = imageCache.keys().next().value;
    if (oldest) imageCache.delete(oldest);
  }
  return promise;
}

interface EffectMediaProps extends EffectOptions {
  hash: string;
  kind: MediaKind;
  alt?: string;
  className?: string;
  variant?: 'stage' | 'thumbnail';
  paused?: boolean;
}

/**
 * Media with pixelate / splatter (game-design §12). Without effects it renders plain <img>/<video>.
 * Images draw once; videos draw per frame; GIF/animated WebP use ImageDecoder frames.
 * Thumbnails always draw a single frame.
 */
export function EffectMedia(props: EffectMediaProps) {
  const { hash, kind, alt, className, variant = 'stage', paused = false, pixelLevel, splatterSeed } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pausedRef = useRef(paused);
  const [failed, setFailed] = useState(false);
  const active = hasEffects({ pixelLevel, splatterSeed });
  // Admin-configured pixelate levels (§12.4); level 0 = off
  const configured = useGameConfigStore((state) => state.config.visualEffects.pixelBlockFractions);
  const blockFractions = useMemo(() => [0, ...configured], [configured]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!active || !canvas || !context) return;
    let disposed = false;
    // Function call so the flag isn't narrowed across awaits
    const isDisposed = (): boolean => disposed;
    const scratch = document.createElement('canvas');
    const options: EffectOptions = { pixelLevel, splatterSeed, blockFractions };
    let textures: HTMLImageElement[] = [];
    let redraw: () => void = () => undefined;
    const cleanups: (() => void)[] = [];

    const sizeCanvas = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };
    const observer = new ResizeObserver(() => {
      sizeCanvas();
      redraw();
    });
    observer.observe(canvas);
    cleanups.push(() => {
      observer.disconnect();
    });

    // Rolling frame-cost check for animated sources
    let budgetSamples = 0;
    let budgetTotal = 0;
    const withinBudget = (cost: number): boolean => {
      budgetSamples++;
      budgetTotal += cost;
      if (budgetSamples < BUDGET_SAMPLE_FRAMES) return true;
      const average = budgetTotal / budgetSamples;
      budgetSamples = 0;
      budgetTotal = 0;
      return average <= FRAME_BUDGET_MS;
    };
    const timedDraw = (source: CanvasImageSource, width: number, height: number): number => {
      const started = performance.now();
      drawEffectFrame(context, source, width, height, options, textures, scratch);
      return performance.now() - started;
    };

    const startImage = async () => {
      const image = await loadMediaImage(hash);
      if (disposed) return;
      redraw = () => {
        timedDraw(image, image.naturalWidth, image.naturalHeight);
      };
      redraw();
    };

    const startVideo = () => {
      const video = document.createElement('video');
      videoRef.current = video;
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.src = mediaUrl(hash);
      let animating = variant === 'stage';
      redraw = () => {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
          timedDraw(video, video.videoWidth, video.videoHeight);
      };
      const onFrame = () => {
        if (disposed || !animating) return;
        const cost = timedDraw(video, video.videoWidth, video.videoHeight);
        if (!withinBudget(cost)) {
          // Too slow: keep the current frame as a still (§5.3 animatedEffectFallback)
          animating = false;
          video.pause();
          return;
        }
        video.requestVideoFrameCallback(onFrame);
      };
      video.addEventListener('loadeddata', () => {
        redraw();
        if (animating && !pausedRef.current) {
          void video.play().catch(() => undefined);
          video.requestVideoFrameCallback(onFrame);
        }
      });
      video.addEventListener('error', () => {
        setFailed(true);
      });
      cleanups.push(() => {
        animating = false;
        videoRef.current = null;
        video.pause();
        video.removeAttribute('src');
        video.load();
      });
    };

    const startAnimated = async () => {
      if (variant === 'thumbnail' || !('ImageDecoder' in window)) {
        await startImage();
        return;
      }
      const response = await fetch(mediaUrl(hash));
      const decoder = new ImageDecoder({
        data: await response.arrayBuffer(),
        type: response.headers.get('Content-Type') ?? 'image/gif',
      });
      await decoder.tracks.ready;
      const frameCount = decoder.tracks.selectedTrack?.frameCount ?? 1;
      let frameIndex = 0;
      let timer: number | undefined;
      let lastFrame: VideoFrame | null = null;
      redraw = () => {
        if (lastFrame) timedDraw(lastFrame, lastFrame.displayWidth, lastFrame.displayHeight);
      };
      const next = async () => {
        if (disposed) return;
        const { image } = await decoder.decode({ frameIndex });
        if (isDisposed()) {
          image.close();
          return;
        }
        lastFrame?.close();
        lastFrame = image;
        const cost = timedDraw(image, image.displayWidth, image.displayHeight);
        if (frameCount <= 1 || !withinBudget(cost)) return; // static image or too slow → keep this frame
        frameIndex = (frameIndex + 1) % frameCount;
        const durationMs = (image.duration ?? 100_000) * MS_PER_MICROSECOND;
        // While paused the loop idles instead of advancing frames
        const wait = () => {
          timer = window.setTimeout(() => {
            if (pausedRef.current) wait();
            else void next();
          }, durationMs);
        };
        wait();
      };
      cleanups.push(() => {
        window.clearTimeout(timer);
        lastFrame?.close();
        decoder.close();
      });
      await next();
    };

    sizeCanvas();
    void loadSplatterTextures()
      .then((loaded) => {
        textures = loaded;
        if (disposed) return undefined;
        if (kind === 'video') {
          startVideo();
          return undefined;
        }
        return kind === 'animated' ? startAnimated() : startImage();
      })
      .catch((error: unknown) => {
        console.warn('[effects] rendering failed, showing plain media', error);
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      for (const cleanup of cleanups) cleanup();
    };
  }, [active, hash, kind, variant, pixelLevel, splatterSeed, blockFractions]);

  // Pause (§19) stops playback without tearing the pipeline down, so it resumes where it was
  useEffect(() => {
    pausedRef.current = paused;
    const video = videoRef.current;
    if (!video || variant === 'thumbnail') return;
    if (paused) video.pause();
    else void video.play().catch(() => undefined);
  }, [paused, variant]);

  if (!active || failed) {
    return (
      <Media
        hash={hash}
        kind={kind}
        {...(alt ? { alt } : {})}
        {...(className ? { className } : {})}
        variant={variant}
        paused={paused}
      />
    );
  }
  return (
    <canvas ref={canvasRef} role="img" aria-label={alt} className={classNames('h-full w-full', className)} />
  );
}
