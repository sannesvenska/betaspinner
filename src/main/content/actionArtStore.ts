import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { ActionArtImage } from '@shared/content';
import type { ActionCardDefinition } from '@shared/session/types';
import { describeMedia } from './describeMedia';
import type { ResolvedMedia } from './mediaProtocol';

export interface ActionArtStore {
  readonly directory: string;
  /** Copies a media file into the store (idempotent per content hash). */
  importFile: (sourcePath: string) => Promise<ActionArtImage>;
  /** Deletes a stored file that no card references any more (app-owned copy). */
  removeIfUnused: (image: ActionArtImage, cards: readonly ActionCardDefinition[]) => Promise<void>;
  /** Media protocol lookup: only images assigned to a card are served. */
  resolve: (hash: string, cards: readonly ActionCardDefinition[]) => ResolvedMedia | undefined;
}

/** game-design §10.4: action card images live in `userData/action-art/<hash><ext>`. */
export function createActionArtStore(userDataPath: string): ActionArtStore {
  const directory = join(userDataPath, 'action-art');

  async function importFile(sourcePath: string): Promise<ActionArtImage> {
    const { size } = await stat(sourcePath);
    const media = await describeMedia(sourcePath, size);
    const fileName = `${media.hash}${extname(sourcePath).toLowerCase()}`;
    await mkdir(directory, { recursive: true });
    await copyFile(sourcePath, join(directory, fileName));
    return { hash: media.hash, fileName, mimeType: media.mimeType, kind: media.kind };
  }

  async function removeIfUnused(
    image: ActionArtImage,
    cards: readonly ActionCardDefinition[],
  ): Promise<void> {
    if (cards.some((card) => card.image?.fileName === image.fileName)) return;
    await rm(join(directory, image.fileName), { force: true });
  }

  function resolve(hash: string, cards: readonly ActionCardDefinition[]): ResolvedMedia | undefined {
    const image = cards.find((card) => card.image?.hash === hash)?.image;
    if (!image) return undefined;
    return { path: join(directory, image.fileName), folderPath: directory, mimeType: image.mimeType };
  }

  return { directory, importFile, removeIfUnused, resolve };
}
