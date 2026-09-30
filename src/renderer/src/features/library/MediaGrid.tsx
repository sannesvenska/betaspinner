import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaEntry } from '@shared/content';
import { Alert } from '@renderer/ui/Alert';
import { Button } from '@renderer/ui/Button';
import { Media } from '@renderer/ui/Media';

const PAGE_SIZE = 60;

interface MediaGridProps {
  folderId: string;
  /** Changes when the folder was rescanned – triggers a reload. */
  revision: string;
}

type GridState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; entries: MediaEntry[]; total: number };

/** Paged preview grid (virtualization follows with the Media Library, AP11). Remount per folder via `key`. */
export function MediaGrid({ folderId, revision }: MediaGridProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<GridState>({ status: 'loading' });
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    void window.api.invoke('library:listMedia', { folderId, offset: 0, limit }).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: 'ready', entries: result.data.entries, total: result.data.total }
          : { status: 'error', error: result.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [folderId, limit, revision]);

  if (state.status === 'loading') {
    return <div className="font-label text-label text-ink-muted">{t('app.loading')}</div>;
  }
  if (state.status === 'error') return <Alert>{state.error}</Alert>;
  if (state.total === 0) return <p className="text-body text-ink-muted">{t('library.detail.noMedia')}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="font-label text-label uppercase tracking-label text-ink-muted">
        {t('library.detail.showing', { shown: state.entries.length, total: state.total })}
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
        {state.entries.map((entry) => (
          <li
            key={`${entry.hash}-${entry.fileName}`}
            className="aspect-square overflow-hidden bg-stage"
            title={entry.fileName}
          >
            <Media hash={entry.hash} kind={entry.kind} alt={entry.fileName} variant="thumbnail" />
          </li>
        ))}
      </ul>
      {state.entries.length < state.total && (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => {
            setLimit((current) => current + PAGE_SIZE);
          }}
        >
          {t('library.detail.loadMore')}
        </Button>
      )}
    </div>
  );
}
