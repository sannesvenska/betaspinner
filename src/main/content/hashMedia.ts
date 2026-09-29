import { createHash } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';

/** Videos: hash size + first + last chunk only (game-design §5.3) to keep scans fast. */
export const VIDEO_HASH_CHUNK_BYTES = 1024 * 1024;

export const sha1 = (data: Buffer | string): string => createHash('sha1').update(data).digest('hex');

/** Reads the whole image once – callers reuse the buffer for header parsing. */
export async function readAndHashImage(filePath: string): Promise<{ hash: string; buffer: Buffer }> {
  const buffer = await readFile(filePath);
  return { hash: sha1(buffer), buffer };
}

export async function hashVideo(
  filePath: string,
  size: number,
  chunkBytes = VIDEO_HASH_CHUNK_BYTES,
): Promise<string> {
  const handle = await open(filePath, 'r');
  try {
    const hash = createHash('sha1').update(`size:${size};`);
    const headLength = Math.min(chunkBytes, size);
    const head = Buffer.alloc(headLength);
    await handle.read(head, 0, headLength, 0);
    hash.update(head);

    const tailStart = Math.max(headLength, size - chunkBytes);
    const tailLength = size - tailStart;
    if (tailLength > 0) {
      const tail = Buffer.alloc(tailLength);
      await handle.read(tail, 0, tailLength, tailStart);
      hash.update(tail);
    }
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}
