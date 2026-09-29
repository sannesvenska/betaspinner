import type { LibraryIndex, ScanProgress } from '@shared/content';
import type { ScanFolder } from './scanLibrary';

/** Messages between the main process and the scanner worker thread. */
export interface ScanRequest {
  folders: ScanFolder[];
  previous: LibraryIndex;
}

export type ScanWorkerMessage =
  | { type: 'progress'; progress: ScanProgress }
  | { type: 'done'; index: LibraryIndex }
  | { type: 'error'; message: string };
