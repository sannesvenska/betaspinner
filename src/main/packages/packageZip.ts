import { createWriteStream } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { mediaFormatOf } from '../content/mediaFormats';

/** Entry names inside a package ZIP (§5.4). */
export const ZIP_PACKAGE_FILE = 'package.json';
export const ZIP_MASKS_FILE = 'masks.json';

export interface ZipProgress {
  done: number;
  total: number;
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
}

const toEntryName = (root: string, file: string): string => relative(root, file).split(sep).join('/');

/**
 * Writes `packageDir` as ZIP. `package.json` and `masks.json` are passed as buffers (sanitized by the
 * caller); media are stored uncompressed (already compressed formats).
 */
export async function writePackageZip(
  packageDir: string,
  target: string,
  extras: Readonly<Record<string, Buffer>>,
  onProgress: (progress: ZipProgress) => void = () => undefined,
): Promise<void> {
  const files = (await listFiles(packageDir)).filter((file) => !(toEntryName(packageDir, file) in extras));
  const zip = new yazl.ZipFile();
  for (const [name, buffer] of Object.entries(extras)) zip.addBuffer(buffer, name);
  const total = files.length;
  for (const file of files)
    zip.addFile(file, toEntryName(packageDir, file), { compress: !mediaFormatOf(file) });
  const written = pipeline(zip.outputStream, createWriteStream(target));
  zip.end();
  onProgress({ done: 0, total });
  await written;
  onProgress({ done: total, total });
}

const openZip = (path: string): Promise<yauzl.ZipFile> =>
  new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (error, zip) => {
      if (error) reject(error);
      else resolve(zip);
    });
  });

const readStream = (zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> =>
  new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) reject(error);
      else resolve(stream);
    });
  });

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Visits every entry in order; `visit` decides what to do with it. */
async function eachEntry(
  path: string,
  visit: (zip: yauzl.ZipFile, entry: yauzl.Entry, index: number, total: number) => Promise<boolean>,
): Promise<void> {
  const zip = await openZip(path);
  try {
    await new Promise<void>((resolve, reject) => {
      let index = 0;
      zip.on('entry', (entry: yauzl.Entry) => {
        visit(zip, entry, index++, zip.entryCount)
          .then((stop) => {
            if (stop) resolve();
            else zip.readEntry();
          })
          .catch(reject);
      });
      zip.on('end', () => {
        resolve();
      });
      zip.on('error', reject);
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
}

/** Reads small JSON entries (package.json, masks.json) without extracting anything. */
export async function readZipEntries(
  path: string,
  names: readonly string[],
): Promise<Record<string, Buffer>> {
  const found: Record<string, Buffer> = {};
  await eachEntry(path, async (zip, entry) => {
    if (names.includes(entry.fileName))
      found[entry.fileName] = await streamToBuffer(await readStream(zip, entry));
    return names.every((name) => name in found);
  });
  return found;
}

/** Rejects absolute paths, drive letters and `..` (zip slip). */
export function safeEntryPath(root: string, name: string): string | null {
  if (name.includes('\\') || name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return null;
  if (name.split('/').some((part) => part === '..')) return null;
  const target = join(root, name);
  const relation = relative(root, target);
  return relation === '' || relation.startsWith('..') || isAbsolute(relation) ? null : target;
}

/** Extracts all entries except `skip` into `targetDir`. Throws on unsafe entry names. */
export async function extractZip(
  path: string,
  targetDir: string,
  skip: readonly string[],
  onProgress: (progress: ZipProgress) => void = () => undefined,
): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  await eachEntry(path, async (zip, entry, index, total) => {
    onProgress({ done: index, total });
    if (skip.includes(entry.fileName)) return false;
    const target = safeEntryPath(targetDir, entry.fileName);
    if (!target) throw new Error(`Unsafe entry in package: ${entry.fileName}`);
    if (entry.fileName.endsWith('/')) {
      await mkdir(target, { recursive: true });
      return false;
    }
    await mkdir(dirname(target), { recursive: true });
    await pipeline(await readStream(zip, entry), createWriteStream(target));
    return false;
  });
}
