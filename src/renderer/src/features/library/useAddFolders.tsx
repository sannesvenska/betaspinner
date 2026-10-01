import { useState, type ReactNode } from 'react';
import type { PickedFolder } from '@shared/content';
import { useLibraryStore } from '@renderer/stores/libraryStore';
import { AddFoldersDialog } from './AddFoldersDialog';

interface AddFoldersFlow {
  /** Opens the native picker, then the setup dialog. */
  start: () => Promise<void>;
  /** Render this somewhere in the screen. */
  dialog: ReactNode;
  pickError: string | null;
}

/** `onAdded` receives the ids of the folders that were actually added (in pick order). */
export function useAddFolders(onAdded?: (folderIds: string[]) => void): AddFoldersFlow {
  const addFolders = useLibraryStore((state) => state.addFolders);
  const [picked, setPicked] = useState<PickedFolder[] | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const start = async () => {
    const result = await window.api.invoke('library:pickFolders', undefined);
    if (!result.ok) {
      setPickError(result.error);
      return;
    }
    setPickError(null);
    if (result.data.length > 0) setPicked(result.data);
  };

  const dialog = picked ? (
    <AddFoldersDialog
      picked={picked}
      onCancel={() => {
        setPicked(null);
      }}
      onSubmit={async (inputs) => {
        const before = new Set(useLibraryStore.getState().snapshot?.folders.map((folder) => folder.id));
        // Errors surface through the library store's error state
        if (await addFolders(inputs)) {
          setPicked(null);
          const added = (useLibraryStore.getState().snapshot?.folders ?? []).filter(
            (folder) => !before.has(folder.id),
          );
          onAdded?.(added.map((folder) => folder.id));
        }
      }}
    />
  ) : null;

  return { start, dialog, pickError };
}
