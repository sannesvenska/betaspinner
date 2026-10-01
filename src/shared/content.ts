import type { Group } from './game';

/**
 * game-design §5 – content model. `performer` folders are galleries of one performer (§6.2.1);
 * their `group` is stored but ignored.
 */
export type FolderRole = 'content' | 'performer';
export type UnmaskedEffectBehavior = 'full' | 'none';

export interface FolderConfig {
  id: string;
  path: string;
  displayName: string;
  group: Group;
  role: FolderRole;
  enabled: boolean;
  selectionWeight: number;
  shareWeight: number;
  taskRange: [number, number];
  unmaskedEffectBehavior: UnmaskedEffectBehavior;
  minImages: number;
}

/** A folder chosen in the picker, inspected before it is added (setup dialog). */
export interface PickedFolder {
  path: string;
  /** Playable files directly inside (non-recursive, like the scan); null = not readable */
  mediaCount: number | null;
  /** Display name of the library folder with the same path – it would not be added again */
  alreadyAdded: string | null;
}

/** Fields the user picks when adding a folder; everything else starts at defaults. */
export type NewFolderInput = Pick<FolderConfig, 'path' | 'displayName' | 'group' | 'role'>;

export type FolderPatch = Partial<Omit<FolderConfig, 'id' | 'path'>>;

export const FOLDER_DEFAULTS = {
  enabled: true,
  selectionWeight: 50,
  shareWeight: 50,
  taskRange: [6, 18],
  unmaskedEffectBehavior: 'full',
  minImages: 5,
} as const satisfies Partial<FolderConfig>;

export const WEIGHT_RANGE = { min: 1, max: 100 } as const;

/** `animated` = GIF / animated WebP / APNG. Videos are always animated. */
export type MediaKind = 'image' | 'animated' | 'video';

export interface MediaEntry {
  /** Content hash (hex SHA-1) – stable key for masks and recency. */
  hash: string;
  folderId: string;
  path: string;
  fileName: string;
  size: number;
  mtimeMs: number;
  kind: MediaKind;
  mimeType: string;
  /** From the file header; null for videos or unparsable headers. */
  width: number | null;
  height: number | null;
}

export type FolderScanState = 'ok' | 'missing' | 'error';

export interface FolderScanStatus {
  folderId: string;
  state: FolderScanState;
  mediaCount: number;
  /** Files that could not be read or hashed. */
  failedCount: number;
  lastScannedAt: string;
  error?: string;
}

export interface LibraryIndex {
  entries: MediaEntry[];
  folders: Record<string, FolderScanStatus>;
}

export interface ScanProgress {
  processed: number;
  total: number;
  currentFolderId: string | null;
}

export interface LibrarySnapshot {
  folders: FolderConfig[];
  status: Record<string, FolderScanStatus>;
  scanning: boolean;
}

export const MEDIA_PROTOCOL = 'cr-media';
/** Standard schemes need a host part: cr-media://media/<hash> */
export const mediaUrl = (hash: string): string => `${MEDIA_PROTOCOL}://media/${hash}`;

/** Folder is usable for sessions (game-design §5.2 `minImages`). */
export const isFolderEligible = (folder: FolderConfig, status: FolderScanStatus | undefined): boolean =>
  folder.enabled && status?.state === 'ok' && status.mediaCount >= folder.minImages;

/** Unique image of an action card definition, copied into `userData/action-art/` (game-design §10.4). */
export interface ActionArtImage {
  hash: string;
  /** File name inside the action-art store: `<hash><ext>` */
  fileName: string;
  mimeType: string;
  kind: MediaKind;
}
