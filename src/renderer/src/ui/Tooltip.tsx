import { useId, type ReactNode } from 'react';

interface TooltipProps {
  content: ReactNode;
  /** Render the trigger and wire `aria-describedby` to it. */
  children: (describedById: string) => ReactNode;
  placement?: 'top' | 'bottom';
}

/** Shown on hover and keyboard focus (never hover-only). */
export function Tooltip({ content, children, placement = 'top' }: TooltipProps) {
  const id = useId();
  return (
    <span className="group relative inline-flex">
      {children(id)}
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute left-0 z-20 w-max max-w-72 rounded-panel bg-surface px-3 py-2 text-body-sm text-ink-2 opacity-0 shadow-dialog transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 ${
          placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
        }`}
      >
        {content}
      </span>
    </span>
  );
}
