import type { TFunction } from 'i18next';
import type { FolderConfig, FolderScanStatus } from '@shared/content';

export const folderBaseName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

export type FolderHealth = 'ok' | 'scanning' | 'missing' | 'error' | 'disabled' | 'tooFew';

export function folderHealth(
  folder: FolderConfig,
  status: FolderScanStatus | undefined,
  scanning: boolean,
): FolderHealth {
  if (!status) return scanning ? 'scanning' : 'error';
  if (status.state === 'missing') return 'missing';
  if (status.state === 'error') return 'error';
  if (!folder.enabled) return 'disabled';
  if (status.mediaCount < folder.minImages) return 'tooFew';
  return 'ok';
}

export function folderHealthText(
  t: TFunction,
  health: FolderHealth,
  folder: FolderConfig,
  status: FolderScanStatus | undefined,
): string {
  const count = status?.mediaCount ?? 0;
  switch (health) {
    case 'ok':
      return t('library.status.ok', { count });
    case 'scanning':
      return t('library.status.scanning');
    case 'missing':
      return t('library.status.missing');
    case 'error':
      return t('library.status.error');
    case 'disabled':
      return t('library.status.disabled', { count });
    case 'tooFew':
      return t('library.status.tooFew', { count, min: folder.minImages });
  }
}
