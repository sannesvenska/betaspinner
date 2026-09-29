import { classNames } from './classNames';

interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** On/off toggle with a visible state label (not color-only). */
export function Switch({ label, checked, onChange, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        onChange(!checked);
      }}
      className="inline-flex h-11 items-center gap-3 rounded-panel pr-2 font-display text-button font-semibold uppercase tracking-button text-ink disabled:text-ink-muted"
    >
      <span
        aria-hidden
        className={classNames(
          'relative h-6 w-11 rounded-full border transition-colors duration-150',
          checked ? 'border-ink bg-ink' : 'border-line-strong bg-transparent',
        )}
      >
        <span
          className={classNames(
            'absolute top-0.5 h-4.5 w-4.5 rounded-full transition-[left] duration-150',
            checked ? 'left-5.5 bg-bg' : 'left-0.5 bg-ink-muted',
          )}
        />
      </span>
      {label}
    </button>
  );
}
