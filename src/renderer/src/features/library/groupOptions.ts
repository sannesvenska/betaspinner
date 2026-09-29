import type { TFunction } from 'i18next';
import type { FolderRole } from '@shared/content';
import type { Group } from '@shared/game';

export const groupOptions = (t: TFunction) =>
  [
    { value: 'good', label: t('library.group.good'), tone: 'good' },
    { value: 'bad', label: t('library.group.bad'), tone: 'bad' },
  ] as const satisfies readonly { value: Group; label: string; tone: Group }[];

export const roleOptions = (t: TFunction) =>
  [
    { value: 'content', label: t('library.role.content') },
    { value: 'action', label: t('library.role.action') },
  ] as const satisfies readonly { value: FolderRole; label: string }[];
