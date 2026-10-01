import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createJsonStore, type JsonStoreOptions } from './jsonStore';

interface Sample {
  name: string;
  count: number;
}

const DEFAULTS: Sample = { name: 'default', count: 0 };

const normalizeSample = (data: unknown): Sample => {
  if (typeof data !== 'object' || data === null) throw new Error('not an object');
  const record = data as Record<string, unknown>;
  if (typeof record.name !== 'string' || typeof record.count !== 'number') throw new Error('invalid');
  return { name: record.name, count: record.count };
};

let directory: string;

const makeStore = (overrides: Partial<JsonStoreOptions<Sample>> = {}) =>
  createJsonStore<Sample>({
    directory,
    fileName: 'sample.json',
    schemaVersion: 1,
    defaults: DEFAULTS,
    normalize: normalizeSample,
    ...overrides,
  });

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'bs-store-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('createJsonStore', () => {
  it('returns defaults when the file does not exist', async () => {
    expect(await makeStore().read()).toEqual(DEFAULTS);
  });

  it('round-trips data inside a schema version envelope', async () => {
    const store = makeStore();
    await store.write({ name: 'a', count: 3 });

    expect(await store.read()).toEqual({ name: 'a', count: 3 });
    const onDisk = JSON.parse(await readFile(store.filePath, 'utf8')) as unknown;
    expect(onDisk).toEqual({ schemaVersion: 1, data: { name: 'a', count: 3 } });
  });

  it('leaves no temp files behind and keeps the last of concurrent writes', async () => {
    const store = makeStore();
    await Promise.all([1, 2, 3, 4, 5].map((count) => store.write({ name: 'x', count })));

    expect(await store.read()).toEqual({ name: 'x', count: 5 });
    expect(await readdir(directory)).toEqual(['sample.json']);
  });

  it('applies migrations in order', async () => {
    await writeFile(
      join(directory, 'sample.json'),
      JSON.stringify({ schemaVersion: 1, data: { title: 'old' } }),
    );
    const store = makeStore({
      schemaVersion: 3,
      migrations: {
        1: (data) => ({ name: (data as { title: string }).title }),
        2: (data) => ({ ...(data as object), count: 7 }),
      },
    });

    expect(await store.read()).toEqual({ name: 'old', count: 7 });
  });

  it('rejects files from a newer schema version without touching them', async () => {
    const payload = JSON.stringify({ schemaVersion: 9, data: {} });
    await writeFile(join(directory, 'sample.json'), payload);

    await expect(makeStore().read()).rejects.toThrow(/newer/);
    expect(await readFile(join(directory, 'sample.json'), 'utf8')).toBe(payload);
  });

  it('quarantines corrupt JSON and falls back to defaults', async () => {
    await writeFile(join(directory, 'sample.json'), '{ broken');

    expect(await makeStore().read()).toEqual(DEFAULTS);
    const files = await readdir(directory);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^sample\.json\.corrupt-\d+$/);
  });

  it('quarantines data that fails normalization', async () => {
    await writeFile(join(directory, 'sample.json'), JSON.stringify({ schemaVersion: 1, data: { name: 5 } }));

    expect(await makeStore().read()).toEqual(DEFAULTS);
  });
});
