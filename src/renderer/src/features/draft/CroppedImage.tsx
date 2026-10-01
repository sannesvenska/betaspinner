import { mediaUrl } from '@shared/content';
import type { DraftCrop } from '@shared/draft';

const PERCENT = 100;

interface CroppedImageProps {
  hash: string;
  crop: DraftCrop;
  alt?: string;
}

/**
 * Shows the square crop of an image (game-design §6.0 draft art) in a square box: the image is scaled
 * so the crop fills the box and shifted so the crop's corner sits at the box origin.
 */
export function CroppedImage({ hash, crop, alt = '' }: CroppedImageProps) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <img
        src={mediaUrl(hash)}
        alt={alt}
        draggable={false}
        className="absolute max-w-none select-none"
        style={{
          width: `${PERCENT / crop.w}%`,
          height: `${PERCENT / crop.h}%`,
          left: `${(-crop.x / crop.w) * PERCENT}%`,
          top: `${(-crop.y / crop.h) * PERCENT}%`,
        }}
      />
    </div>
  );
}
