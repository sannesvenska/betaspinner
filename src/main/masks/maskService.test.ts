import { describe, expect, it } from 'vitest';
import type { MaskRegion } from '@shared/masks';
import { mediaFor } from '@shared/session/testFixtures';
import type { JsonStore } from '../storage/jsonStore';
import { createMaskService, EMPTY_MASK_FILE, normalizeMaskFile, type MaskFile } from './maskService';

function memoryStore(initial: MaskFile): JsonStore<MaskFile> & { current: () => MaskFile } {
  let value = initial;
  return {
    filePath: 'memory',
    read: () => Promise.resolve(value),
    write: (next) => {
      value = next;
      return Promise.resolve();
    },
    current: () => value,
  };
}

// mediaFor pads hashes with '0' – make them valid hex
const media = [...mediaFor('a', 3), ...mediaFor('b', 2)].map((entry, index) => ({
  ...entry,
  hash: String(index).repeat(40),
  fileName: `${10 - index}.png`,
}));
const region: MaskRegion = {
  id: 'r1',
  shape: 'rect',
  rect: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
  effects: ['pixelate'],
  feather: 0.02,
};

async function setup() {
  const store = memoryStore(EMPTY_MASK_FILE);
  const service = await createMaskService({
    store,
    media: () => media,
    now: () => new Date('2026-10-01T10:00:00.000Z'),
  });
  return { store, service };
}

describe('maskService (§12.2 / §12.3)', () => {
  it('saves regions keyed by hash and derives the status', async () => {
    const { store, service } = await setup();
    const hash = media[0]?.hash ?? '';
    const saved = await service.save({ imageHash: hash, regions: [region] });
    expect(saved).toMatchObject({ status: 'masked', updatedAt: '2026-10-01T10:00:00.000Z' });
    expect(store.current().masks[hash]?.regions).toHaveLength(1);
    // Removing every region falls back to unreviewed and drops the entry
    await service.save({ imageHash: hash, regions: [] });
    expect(store.current().masks[hash]).toBeUndefined();
    await service.save({ imageHash: hash, regions: [], status: 'no_regions' });
    expect(service.getMany([hash])[hash]?.status).toBe('no_regions');
  });

  it('bulk "no regions" never overwrites existing regions; clear removes masks', async () => {
    const { service } = await setup();
    const [first, second] = media.map((entry) => entry.hash);
    await service.save({ imageHash: first ?? '', regions: [region] });
    expect(await service.bulk([first ?? '', second ?? ''], 'no_regions')).toBe(1);
    expect(service.getMany([first ?? ''])[first ?? '']?.status).toBe('masked');
    expect(await service.bulk([first ?? '', second ?? ''], 'clear')).toBe(2);
    expect(service.getMany([first ?? '', second ?? ''])).toEqual({});
  });

  it('reports review progress per folder and filters folder listings', async () => {
    const { service } = await setup();
    await service.save({ imageHash: media[0]?.hash ?? '', regions: [region] });
    await service.bulk([media[1]?.hash ?? ''], 'no_regions');
    expect(service.summary()).toEqual({
      a: { total: 3, reviewed: 2, masked: 1, noRegions: 1 },
      b: { total: 2, reviewed: 0, masked: 0, noRegions: 0 },
    });
    const all = service.listFolder('a', 'all');
    expect(all.map((entry) => entry.fileName)).toEqual(['8.png', '9.png', '10.png']); // numeric order
    expect(service.listFolder('a', 'unreviewed').map((entry) => entry.fileName)).toEqual(['8.png']);
    expect(service.listFolder('a', 'masked')[0]).toMatchObject({ maskStatus: 'masked', regionCount: 1 });
  });

  it('drops broken and unreviewed entries when reading the file', () => {
    expect(
      normalizeMaskFile({
        masks: {
          x: { imageHash: 'f'.repeat(40), status: 'no_regions', regions: [] },
          y: { imageHash: 'e'.repeat(40), status: 'unreviewed', regions: [] },
          z: { imageHash: 'broken' },
        },
      }).masks,
    ).toEqual({
      ['f'.repeat(40)]: {
        imageHash: 'f'.repeat(40),
        status: 'no_regions',
        regions: [],
        updatedAt: new Date(0).toISOString(),
      },
    });
  });
});
