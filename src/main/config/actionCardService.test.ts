import { describe, expect, it } from 'vitest';
import type { ActionArtImage } from '@shared/content';
import type { ActionArtStore } from '../content/actionArtStore';
import { createActionCardService } from './actionCardService';
import { DEFAULT_CONFIG, type AppConfig } from './appConfig';
import type { ConfigService } from './configService';

const imageFor = (letter: string): ActionArtImage => ({
  hash: letter.repeat(40),
  fileName: `${letter.repeat(40)}.png`,
  mimeType: 'image/png',
  kind: 'image',
});

function setup() {
  let config: AppConfig = DEFAULT_CONFIG;
  const configService: ConfigService = {
    get: () => config,
    update: (change) => {
      config = change(config);
      return Promise.resolve(config);
    },
  };
  const removed: string[] = [];
  const art: ActionArtStore = {
    directory: 'art',
    // The file name encodes which "file" was picked: C:/pics/<letter>.png
    importFile: (path) => Promise.resolve(imageFor(path.slice(-5, -4))),
    removeIfUnused: (image, cards) => {
      if (!cards.some((card) => card.image?.fileName === image.fileName)) removed.push(image.fileName);
      return Promise.resolve();
    },
    resolve: () => undefined,
  };
  return { service: createActionCardService(configService, art), removed };
}

describe('actionCardService (§10.4)', () => {
  it('assigns unique images and cleans up replaced files', async () => {
    const { service, removed } = setup();
    await service.assignImage('pixelate', 'C:/pics/a.png');
    expect(service.list().find((card) => card.id === 'pixelate')?.image).toEqual(imageFor('a'));

    await expect(service.assignImage('splatter', 'C:/pics/a.png')).rejects.toMatchObject({
      code: 'image_in_use',
    });
    expect(removed).toEqual([]); // still used by pixelate

    await service.assignImage('pixelate', 'C:/pics/b.png');
    expect(removed).toEqual([imageFor('a').fileName]);
    await service.clearImage('pixelate');
    expect(removed).toEqual([imageFor('a').fileName, imageFor('b').fileName]);
  });

  it('duplicates cards as user variants; only user cards can be removed, built-ins reset', async () => {
    const { service } = setup();
    await service.update('squeeze_task', { weight: 99, name: 'Squeeze!' });
    const cards = await service.duplicate('squeeze_task', 'Squeeze hard');
    const variant = cards.find((card) => card.name === 'Squeeze hard');
    expect(variant).toMatchObject({ type: 'squeeze_task', builtIn: false, weight: 99, image: null });

    await expect(service.remove('squeeze_task')).rejects.toMatchObject({ code: 'built_in' });
    await service.remove(variant?.id ?? '');
    expect(service.list().some((card) => card.id === variant?.id)).toBe(false);

    await service.reset('squeeze_task');
    expect(service.list().find((card) => card.id === 'squeeze_task')).toMatchObject({
      weight: 12,
      name: null,
    });
  });
});
