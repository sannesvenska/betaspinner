import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { classNames } from './classNames';
import { KeyHint } from './KeyHint';

type ButtonVariant = 'primary' | 'outline' | 'text';
type ButtonSize = 'console' | 'primary';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  keyHint?: string;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-bg font-bold hover:bg-ink-2 disabled:bg-ink-muted',
  outline: 'border border-line-strong text-ink hover:bg-surface disabled:text-ink-muted',
  text: 'text-ink-muted hover:text-ink disabled:opacity-60',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  console: 'h-13 px-5 text-button',
  primary: 'h-18 px-10 text-button-lg',
};

export function Button({
  variant = 'outline',
  size = 'console',
  keyHint,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classNames(
        'inline-flex min-w-11 items-center justify-center gap-3 rounded-panel font-display font-semibold uppercase tracking-button transition-colors duration-150',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {children}
      {keyHint && <KeyHint keys={keyHint} inverted={variant === 'primary'} />}
    </button>
  );
}
