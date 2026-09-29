import type { ReactNode } from 'react';

interface StatProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function Stat({ label, children, className }: StatProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="font-label text-label uppercase tracking-label text-ink-muted">{label}</div>
      <div className={`font-display text-stat font-semibold ${className ?? ''}`}>{children}</div>
    </div>
  );
}
