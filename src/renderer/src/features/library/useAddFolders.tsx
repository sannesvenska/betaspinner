import { useState, type ReactNode } from 'react';
import { useLibraryStore } from '@renderer/stores/libraryStore';
import { AddFoldersDialog } from './AddFoldersDialog';

interface AddFoldersFlow {
  /** Opens the native picker, then the setup dialog. */
  start: () => Promise<void>;
  /** Render this somewhere in the screen. */
  dialog: ReactNode;
  pickError: string | null;
}

export function useAddFolders(onAdded?: () => void): AddFoldersFlow {
  const addFolders = useLibraryStore((state) => state.addFolders);
  const [paths, setPaths] = useState<string[] | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const start = async () => {
    const result = await window.api.invoke('library:pickFolders', undefined);
    if (!result.ok) {
      setPickError(result.error);
      return;
    }
    setPickError(null);
    if (result.data.length > 0) setPaths(result.data);
  };

  const dialog = paths ? (
    <AddFoldersDialog
      paths={paths}
      onCancel={() => {
        setPaths(null);
      }}
      onSubmit={async (inputs) => {
        // Errors surface through the library store's error state
        if (await addFolders(inputs)) {
          setPaths(null);
          onAdded?.();
        }
      }}
    />
  ) : null;

  return { start, dialog, pickError };
}
