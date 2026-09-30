import { useEffect, useState } from 'react';
import type { MediaEntry } from '@shared/content';
import { Media } from '@renderer/ui/Media';

const PREVIEW_COUNT = 3;

/** First images of a folder as a small strip – helps choosing a Switcheroo category. */
export function FolderPreview({ folderId }: { folderId: string }) {
  const [entries, setEntries] = useState<MediaEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    void window.api
      .invoke('library:listMedia', { folderId, offset: 0, limit: PREVIEW_COUNT })
      .then((result) => {
        if (!cancelled && result.ok) setEntries(result.data.entries);
      });
    return () => {
      cancelled = true;
    };
  }, [folderId]);

  return (
    <div className="flex h-12 gap-1" aria-hidden>
      {entries.map((entry) => (
        <div key={entry.hash} className="aspect-square h-full overflow-hidden bg-stage">
          <Media hash={entry.hash} kind={entry.kind} variant="thumbnail" />
        </div>
      ))}
    </div>
  );
}
