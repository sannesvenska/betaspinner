import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { ActionArtImage } from '@shared/content';
import type { ActionCardDefinition } from '@shared/session/types';
import { describeMedia } from './describeMedia';
import type { ResolvedMedia } from './mediaProtocol';

export interface ActionArtStore {
  readonly directory: string;
  /** Copies a media file into the store (idempotent per content hash). */
  importFile: (
    sourcePath: string,
  ) => Promise<ActionArtImage & { width: number | null; height: number | null }>;
  /** Deletes a stored file that nothing references any more (app-owned copy). */
  removeIfUnused: (image: ActionArtImage, used: readonly (ActionArtImage | null)[]) => Promise<void>;
  /** Media protocol lookup: only images that are in use are served. */
  resolve: (hash: string, used: readonly (ActionArtImage | null)[]) => ResolvedMedia | undefined;
}

/** Images of action card definitions (input for `resolve` / `removeIfUnused`). */
export const cardImages = (cards: readonly ActionCardDefinition[]): (ActionArtImage | null)[] =>
  cards.map((card) => card.image);

/**
 * App-owned image copies: action card images in `userData/action-art/` (game-design §10.4), draft card
 * images in `userData/draft-art/` (§6.0). File name = content hash + extension.
 */
export function createActionArtStore(userDataPath: string, folderName = 'action-art'): ActionArtStore {
  const directory = join(userDataPath, folderName);

  async function importFile(sourcePath: string) {
    const { size } = await stat(sourcePath);
    const media = await describeMedia(sourcePath, size);
    const fileName = `${media.hash}${extname(sourcePath).toLowerCase()}`;
    await mkdir(directory, { recursive: true });
    await copyFile(sourcePath, join(directory, fileName));
    return {
      hash: media.hash,
      fileName,
      mimeType: media.mimeType,
      kind: media.kind,
      width: media.width,
      height: media.height,
    };
  }

  async function removeIfUnused(
    image: ActionArtImage,
    used: readonly (ActionArtImage | null)[],
  ): Promise<void> {
    if (used.some((entry) => entry?.fileName === image.fileName)) return;
    await rm(join(directory, image.fileName), { force: true });
  }

  function resolve(hash: string, used: readonly (ActionArtImage | null)[]): ResolvedMedia | undefined {
    const image = used.find((entry) => entry?.hash === hash);
    if (!image) return undefined;
    return { path: join(directory, image.fileName), folderPath: directory, mimeType: image.mimeType };
  }

  return { directory, importFile, removeIfUnused, resolve };
}
