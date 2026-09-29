import { useState } from 'react';
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
}

/**
 * Renders any supported media from `cr-media://` with `object-fit: contain` (never cropped).
 * GIF/WebM/MP4 autoplay, loop and stay muted (game-design §5.3).
 */
export function Media({ hash, kind, alt, className, variant = 'stage' }: MediaProps) {
  const { t } = useTranslation();
  const [failedHash, setFailedHash] = useState<string | null>(null);
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
        key={hash}
        src={mediaUrl(hash)}
        className={baseClass}
        autoPlay={!isThumbnail}
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
