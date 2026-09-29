import { useId } from 'react';
import { classNames } from './classNames';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Group color accent (never the only signal – the label carries the meaning). */
  tone?: 'good' | 'bad';
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** Radio group styled as segments; arrow keys move between options (native radio behavior). */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: SegmentedControlProps<T>) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-2 font-label text-label uppercase tracking-label text-ink-muted">{label}</legend>
      <div className="flex">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={classNames(
                'relative flex h-11 min-w-28 cursor-pointer items-center justify-center border border-line-strong px-4 font-display text-button font-semibold uppercase tracking-button transition-colors duration-150 first:rounded-l-panel last:rounded-r-panel not-first:-ml-px has-focus-visible:z-10 has-focus-visible:outline-2 has-focus-visible:outline-ink',
                selected ? 'z-1 bg-surface text-ink' : 'text-ink-muted hover:text-ink',
                selected &&
                  option.tone === 'good' &&
                  'border-b-good shadow-[inset_0_-3px_0_var(--color-good)]',
                selected && option.tone === 'bad' && 'border-b-bad shadow-[inset_0_-3px_0_var(--color-bad)]',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => {
                  onChange(option.value);
                }}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
