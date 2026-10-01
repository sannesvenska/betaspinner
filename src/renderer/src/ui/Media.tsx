import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mediaUrl, type MediaKind } from '@shared/content';
import { classNames } from './classNames';
import { Icon } from './icons/Icon';

const BROKEN_ICON_SIZE = 32;

interface MediaProps {
  hash: string;
  kind: MediaKind;
  /** Accessible description; decorative when omitted. */
  alt?: string;
  className?: string;
  /** Thumbnails: videos show their first frame and play on hover only. */
  variant?: 'stage' | 'thumbnail';
  /** Pause screen: stop playback instantly (game-design §19). */
  paused?: boolean;
}

/**
 * Renders any supported media from `bs-media://` with `object-fit: contain` (never cropped).
 * GIF/WebM/MP4 autoplay, loop and stay muted (game-design §5.3).
 */
export function Media({ hash, kind, alt, className, variant = 'stage', paused = false }: MediaProps) {
  const { t } = useTranslation();
  const [failedHash, setFailedHash] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || variant === 'thumbnail') return;
    if (paused) video.pause();
    else void video.play().catch(() => undefined);
  }, [paused, variant, hash]);
  const baseClass = classNames('h-full w-full object-contain', className);

  if (failedHash === hash) {
    return (
      <div
        role="img"
        aria-label={t('media.broken')}
        className={classNames(
          'flex h-full w-full flex-col items-center justify-center gap-2 bg-stage text-ink-muted',
          className,
        )}
      >
        <Icon name="brokenImage" size={BROKEN_ICON_SIZE} />
        {variant === 'stage' && (
          <span className="font-label text-label uppercase tracking-label">{t('media.broken')}</span>
        )}
      </div>
    );
  }

  const onError = () => {
    setFailedHash(hash);
  };

  if (kind === 'video') {
    const isThumbnail = variant === 'thumbnail';
    return (
      <video
        ref={videoRef}
        key={hash}
        src={mediaUrl(hash)}
        className={baseClass}
        autoPlay={!isThumbnail && !paused}
        loop
        muted
        playsInline
        preload={isThumbnail ? 'metadata' : 'auto'}
        aria-label={alt}
        onError={onError}
        onPointerEnter={
          isThumbnail ? (event) => void event.currentTarget.play().catch(() => undefined) : undefined
        }
        onPointerLeave={
          isThumbnail
            ? (event) => {
                event.currentTarget.pause();
              }
            : undefined
        }
      />
    );
  }

  return (
    <img
      key={hash}
      src={mediaUrl(hash)}
      alt={alt ?? ''}
      className={baseClass}
      loading={variant === 'thumbnail' ? 'lazy' : 'eager'}
      decoding="async"
      draggable={false}
      onError={onError}
    />
  );
}
