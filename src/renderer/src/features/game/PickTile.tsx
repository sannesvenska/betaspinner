import type { ReactNode } from 'react';
import { classNames } from '@renderer/ui/classNames';
import { KeyHint } from '@renderer/ui/KeyHint';

interface PickTileProps {
  title: string;
  meta?: ReactNode;
  tone: 'good' | 'bad' | 'neutral';
  keyHint?: string;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/** Selectable tile for pickers (effects, rewards, Switcheroo) – design-system §6 picker tile. */
export function PickTile({
  title,
  meta,
  tone,
  keyHint,
  selected = false,
  disabled = false,
  onClick,
}: PickTileProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={classNames(
        'relative flex h-28 w-48 flex-col justify-center gap-1.5 rounded-panel border-l-3 bg-surface px-4 text-left transition-colors duration-150 hover:bg-ring-empty disabled:opacity-40',
        tone === 'good' ? 'border-good' : tone === 'bad' ? 'border-bad' : 'border-line-strong',
        selected && 'outline-2 -outline-offset-2 outline-good',
      )}
    >
      {keyHint && (
        <span className="absolute top-2 right-2">
          <KeyHint keys={keyHint} />
        </span>
      )}
      <span className="font-display text-chip font-semibold uppercase tracking-chip">{title}</span>
      {meta && <span className="font-label text-key uppercase tracking-label text-ink-muted">{meta}</span>}
    </button>
  );
}
