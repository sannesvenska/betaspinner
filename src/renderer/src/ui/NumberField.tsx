import { useId, useState } from 'react';

const PERCENT = 100;

interface NumberFieldProps {
  label: string;
  /** NaN = empty / not a number (shown as the typed text) */
  value: number;
  onChange: (value: number) => void;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  /** Shows and edits the value × 100 with a % suffix */
  percent?: boolean;
  error?: string | null;
  hint?: string | undefined;
  disabled?: boolean;
  /** Narrow fields for ranges */
  compact?: boolean;
}

const display = (value: number, percent: boolean): string =>
  Number.isFinite(value) ? String(Math.round((percent ? value * PERCENT : value) * 1000) / 1000) : '';

/**
 * Numeric input with visible label and inline error (design-system §6 form field). Keeps the typed text
 * while editing so intermediate states ("0.") are possible; reports NaN for unparsable input.
 */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  percent = false,
  error,
  hint,
  disabled = false,
  compact = false,
}: NumberFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const [text, setText] = useState<string | null>(null);
  const message = error ?? hint;
  const scale = percent ? PERCENT : 1;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-label text-label uppercase tracking-label text-ink-muted">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          disabled={disabled}
          min={min === undefined ? undefined : min * scale}
          max={max === undefined ? undefined : max * scale}
          step={step === undefined ? undefined : step * scale}
          value={text ?? display(value, percent)}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          onChange={(event) => {
            setText(event.target.value);
            const parsed = event.target.value.trim() === '' ? Number.NaN : Number(event.target.value);
            onChange(Number.isFinite(parsed) ? parsed / scale : Number.NaN);
          }}
          onBlur={() => {
            setText(null);
          }}
          className={`h-11 rounded-panel border bg-bg px-3 text-body text-ink tabular-nums select-text focus-visible:outline-2 focus-visible:outline-ink disabled:text-ink-muted ${
            compact ? 'w-24' : 'w-36'
          } ${error ? 'border-bad' : 'border-line-strong'}`}
        />
        {percent && <span className="text-body text-ink-muted">%</span>}
      </div>
      {message && (
        <span id={messageId} className={`max-w-64 text-body-sm ${error ? 'text-bad' : 'text-ink-muted'}`}>
          {message}
        </span>
      )}
    </div>
  );
}
