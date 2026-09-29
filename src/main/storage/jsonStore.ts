import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Migrates the payload of version `n` to version `n + 1`. Keyed by the source version. */
export type Migration = (data: unknown) => unknown;

export interface JsonStoreOptions<T> {
  directory: string;
  fileName: string;
  schemaVersion: number;
  defaults: T;
  migrations?: Readonly<Record<number, Migration>>;
  /** Turns (possibly partial or foreign) stored data into a valid T; throw to mark the file as corrupt. */
  normalize: (data: unknown) => T;
}

export interface JsonStore<T> {
  readonly filePath: string;
  read: () => Promise<T>;
  write: (data: T) => Promise<void>;
}

interface Envelope {
  schemaVersion: number;
  data: unknown;
}

const RENAME_RETRY_COUNT = 5;
const RENAME_RETRY_DELAY_MS = 40;
/** Windows antivirus / indexer can briefly lock files. */
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

const errorCode = (error: unknown): string | undefined =>
  error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;

const delay = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

const isEnvelope = (value: unknown): value is Envelope =>
  typeof value === 'object' &&
  value !== null &&
  'schemaVersion' in value &&
  typeof value.schemaVersion === 'number' &&
  'data' in value;

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = errorCode(error);
      if (attempt >= RENAME_RETRY_COUNT || code === undefined || !RETRYABLE_RENAME_CODES.has(code))
        throw error;
      await delay(RENAME_RETRY_DELAY_MS * (attempt + 1));
    }
  }
}

export function migrate(
  envelope: Envelope,
  targetVersion: number,
  migrations: Readonly<Record<number, Migration>>,
): unknown {
  if (envelope.schemaVersion > targetVersion) {
    throw new Error(
      `File schema version ${envelope.schemaVersion} is newer than supported version ${targetVersion}`,
    );
  }
  let data = envelope.data;
  for (let version = envelope.schemaVersion; version < targetVersion; version++) {
    const step = migrations[version];
    if (!step) throw new Error(`Missing migration from schema version ${version} to ${version + 1}`);
    data = step(data);
  }
  return data;
}

/**
 * JSON file with a schema version envelope, migrations and atomic writes (temp file + rename).
 * Writes are serialized per store. A corrupt file is kept as `<name>.corrupt-<timestamp>` and defaults are used.
 * A file written by a newer app version is never overwritten silently: `read` rejects instead.
 */
export function createJsonStore<T>(options: JsonStoreOptions<T>): JsonStore<T> {
  const filePath = join(options.directory, options.fileName);
  let writeQueue: Promise<void> = Promise.resolve();

  async function quarantineCorruptFile(): Promise<void> {
    const backupPath = `${filePath}.corrupt-${Date.now()}`;
    await renameWithRetry(filePath, backupPath);
  }

  async function read(): Promise<T> {
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return options.defaults;
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await quarantineCorruptFile();
      return options.defaults;
    }
    if (!isEnvelope(parsed)) {
      await quarantineCorruptFile();
      return options.defaults;
    }

    // Newer-version errors propagate on purpose (see doc comment)
    const migrated = migrate(parsed, options.schemaVersion, options.migrations ?? {});
    try {
      return options.normalize(migrated);
    } catch {
      await quarantineCorruptFile();
      return options.defaults;
    }
  }

  async function writeNow(data: T): Promise<void> {
    await mkdir(options.directory, { recursive: true });
    const envelope: Envelope = { schemaVersion: options.schemaVersion, data };
    const tempPath = `${filePath}.${process.pid}.tmp`;
    try {
      await writeFile(tempPath, JSON.stringify(envelope, null, 2), 'utf8');
      await renameWithRetry(tempPath, filePath);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
  }

  function write(data: T): Promise<void> {
    const next = writeQueue.then(() => writeNow(data));
    // Keep the queue alive after a failed write; the caller still receives the rejection
    writeQueue = next.catch(() => undefined);
    return next;
  }

  return { filePath, read, write };
}
