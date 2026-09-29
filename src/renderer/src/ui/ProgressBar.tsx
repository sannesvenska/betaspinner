const PERCENT = 100;

interface ProgressBarProps {
  value: number;
  max: number;
  label: string;
}

export function ProgressBar({ value, max, label }: ProgressBarProps) {
  const percent = max > 0 ? Math.min(PERCENT, (value / max) * PERCENT) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-1.5 w-full overflow-hidden rounded-panel bg-ring-empty"
    >
      <div className="h-full bg-ink transition-[width] duration-150" style={{ width: `${percent}%` }} />
    </div>
  );
}
