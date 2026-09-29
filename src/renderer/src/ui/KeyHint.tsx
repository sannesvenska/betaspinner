import { classNames } from './classNames';

interface KeyHintProps {
  keys: string;
  /** Use on filled ink backgrounds. */
  inverted?: boolean;
}

export function KeyHint({ keys, inverted = false }: KeyHintProps) {
  return (
    <kbd
      className={classNames(
        'rounded-panel border px-1.5 py-0.5 font-label text-key tracking-normal',
        inverted ? 'border-on-ink/40 text-on-ink' : 'border-line-strong text-ink-muted',
      )}
    >
      {keys}
    </kbd>
  );
}
