import type { MediaKind } from '@shared/content';
import { hashVideo, readAndHashImage } from './hashMedia';
import { readImageInfo } from './imageHeader';
import { mediaFormatOf } from './mediaFormats';

export interface MediaDescription {
  hash: string;
  kind: MediaKind;
  mimeType: string;
  width: number | null;
  height: number | null;
}

/**
 * Hash + kind of one media file (game-design §5.3). Throws for unsupported formats and unreadable
 * image headers – such files must never end up on a card.
 */
export async function describeMedia(path: string, size: number): Promise<MediaDescription> {
  const format = mediaFormatOf(path);
  if (!format) throw new Error(`Unsupported format: ${path}`);
  if (format.isVideo) {
    const hash = await hashVideo(path, size);
    return { hash, kind: 'video', mimeType: format.mimeType, width: null, height: null };
  }
  const { hash, buffer } = await readAndHashImage(path);
  const info = readImageInfo(buffer);
  if (!info) throw new Error(`Unreadable image header: ${path}`);
  return {
    hash,
    kind: info.animated ? 'animated' : 'image',
    mimeType: format.mimeType,
    width: info.width,
    height: info.height,
  };
}
