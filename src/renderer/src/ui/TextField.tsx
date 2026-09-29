import { useId, type InputHTMLAttributes } from 'react';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string | null;
}

/** Visible label, helper text and inline error (never placeholder-only). */
export function TextField({ label, hint, error, className, ...rest }: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-label text-label uppercase tracking-label text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={`h-11 rounded-panel border bg-bg px-3 text-body text-ink select-text focus-visible:outline-2 focus-visible:outline-ink ${
          error ? 'border-bad' : 'border-line-strong'
        } ${className ?? ''}`}
        {...rest}
      />
      {message && (
        <span id={messageId} className={`text-body-sm ${error ? 'text-bad' : 'text-ink-muted'}`}>
          {message}
        </span>
      )}
    </div>
  );
}
