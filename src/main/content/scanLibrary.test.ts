import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryIndex } from '@shared/content';
import * as hashMedia from './hashMedia';
import { scanLibrary } from './scanLibrary';
import { gifFile, jpegHeader, pngHeader } from './testImages';

const EMPTY_INDEX: LibraryIndex = { entries: [], folders: {} };
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'bs-scan-'));
  await mkdir(join(root, 'good'));
  await writeFile(join(root, 'good', 'a.png'), pngHeader(100, 50));
  await writeFile(join(root, 'good', 'b.gif'), gifFile(10, 10, 2));
  await writeFile(join(root, 'good', 'c.mp4'), Buffer.from('fake video bytes'));
  await writeFile(join(root, 'good', 'notes.txt'), 'ignored');
  await writeFile(join(root, 'good', 'corrupt.jpg'), 'not really a jpeg');
  await writeFile(join(root, 'good', '.hidden.png'), pngHeader(1, 1));
  await mkdir(join(root, 'good', 'nested'));
  await writeFile(join(root, 'good', 'nested', 'deep.png'), pngHeader(1, 1));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe('scanLibrary', () => {
  it('indexes supported top-level media with kind, mime type and dimensions', async () => {
    const index = await scanLibrary({
      folders: [{ id: 'f1', path: join(root, 'good') }],
      previous: EMPTY_INDEX,
    });

    expect(index.entries.map((entry) => [entry.fileName, entry.kind, entry.mimeType, entry.width])).toEqual([
      ['a.png', 'image', 'image/png', 100],
      ['b.gif', 'animated', 'image/gif', 10],
      ['c.mp4', 'video', 'video/mp4', null],
    ]);
    expect(index.folders.f1).toMatchObject({ state: 'ok', mediaCount: 3, failedCount: 1 });
    expect(new Set(index.entries.map((entry) => entry.hash)).size).toBe(3);
  });

  it('marks missing folders without failing the scan', async () => {
    const index = await scanLibrary({
      folders: [
        { id: 'f1', path: join(root, 'good') },
        { id: 'gone', path: join(root, 'does-not-exist') },
      ],
      previous: EMPTY_INDEX,
    });

    expect(index.folders.gone).toMatchObject({ state: 'missing', mediaCount: 0 });
    expect(index.folders.f1?.mediaCount).toBe(3);
  });

  it('reuses cached entries for unchanged files and re-hashes changed ones', async () => {
    const folders = [{ id: 'f1', path: join(root, 'good') }];
    const first = await scanLibrary({ folders, previous: EMPTY_INDEX });

    const changedPath = join(root, 'good', 'a.jpg');
    await writeFile(changedPath, jpegHeader(20, 20));
    await utimes(changedPath, new Date(), new Date(Date.now() + 5000));
    const readSpy = vi.spyOn(hashMedia, 'readAndHashImage');

    const second = await scanLibrary({ folders, previous: first });

    // changed file + the corrupt file (failures are never cached)
    expect(readSpy.mock.calls.map((call) => call[0]).sort()).toEqual(
      [changedPath, join(root, 'good', 'corrupt.jpg')].sort(),
    );
    expect(second.entries).toHaveLength(4);
  });

  it('reports progress up to the total', async () => {
    const onProgress = vi.fn();
    await scanLibrary({
      folders: [{ id: 'f1', path: join(root, 'good') }],
      previous: EMPTY_INDEX,
      onProgress,
    });

    expect(onProgress).toHaveBeenLastCalledWith({ processed: 4, total: 4, currentFolderId: null });
  });
});

describe('hashVideo', () => {
  it('hashes head and tail only, so middle bytes do not change the hash', async () => {
    const path = join(root, 'v.webm');
    const chunk = 4;
    await writeFile(path, Buffer.from('HEADxxxxxxxxTAIL'));
    const original = await hashMedia.hashVideo(path, 16, chunk);
    await writeFile(path, Buffer.from('HEADyyyyyyyyTAIL'));

    expect(await hashMedia.hashVideo(path, 16, chunk)).toBe(original);
    await writeFile(path, Buffer.from('HEADyyyyyyyyTAIX'));
    expect(await hashMedia.hashVideo(path, 16, chunk)).not.toBe(original);
  });
});
