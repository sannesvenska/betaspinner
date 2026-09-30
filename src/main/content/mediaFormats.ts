import { extname } from 'node:path';

interface MediaFormat {
  mimeType: string;
  isVideo: boolean;
}

/** game-design §5.3 supported formats. */
const MEDIA_FORMATS: Readonly<Record<string, MediaFormat>> = {
  '.jpg': { mimeType: 'image/jpeg', isVideo: false },
  '.jpeg': { mimeType: 'image/jpeg', isVideo: false },
  '.png': { mimeType: 'image/png', isVideo: false },
  '.webp': { mimeType: 'image/webp', isVideo: false },
  '.gif': { mimeType: 'image/gif', isVideo: false },
  '.webm': { mimeType: 'video/webm', isVideo: true },
  '.mp4': { mimeType: 'video/mp4', isVideo: true },
};

export const mediaFormatOf = (filePath: string): MediaFormat | undefined =>
  MEDIA_FORMATS[extname(filePath).toLowerCase()];

/** Extensions without the dot, for file pickers. */
export const MEDIA_EXTENSIONS: readonly string[] = Object.keys(MEDIA_FORMATS).map((extension) =>
  extension.slice(1),
);
