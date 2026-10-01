import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { hashVideo, readAndHashImage } from './hashMedia';
import { mediaFormatOf } from './mediaFormats';

export interface CopyProgress {
  copied: number;
  total: number;
}

export interface CopyResult {
  copied: number;
  /** Same content already in the package (or twice in the source) */
  skippedDuplicates: number;
  failed: string[];
}

/** Same hash as the scan (§5.3): full SHA-1 for images, size + head + tail for videos. */
export async function hashMediaFile(path: string): Promise<string> {
  const format = mediaFormatOf(path);
  if (format?.isVideo) return hashVideo(path, (await stat(path)).size);
  return (await readAndHashImage(path)).hash;
}

/** Playable files directly inside `folder` (non-recursive, like the scan). */
export async function listMediaFiles(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.') && mediaFormatOf(entry.name))
    .map((entry) => join(folder, entry.name));
}

/**
 * game-design §5.4: copies the media of `source` into `target` (created). Files whose content is already
 * in `knownHashes` are skipped; copied hashes are added, so a package keeps every image once.
 */
export async function copyMediaFolder(
  source: string,
  target: string,
  knownHashes: Set<string>,
  onProgress: (progress: CopyProgress) => void = () => undefined,
): Promise<CopyResult> {
  const files = await listMediaFiles(source);
  await mkdir(target, { recursive: true });
  const result: CopyResult = { copied: 0, skippedDuplicates: 0, failed: [] };
  for (const [index, file] of files.entries()) {
    try {
      const hash = await hashMediaFile(file);
      if (knownHashes.has(hash)) result.skippedDuplicates++;
      else {
        await copyFile(file, join(target, basename(file)));
        knownHashes.add(hash);
        result.copied++;
      }
    } catch (error) {
      console.error('[import] could not copy', file, error);
      result.failed.push(file);
    }
    onProgress({ copied: index + 1, total: files.length });
  }
  return result;
}
