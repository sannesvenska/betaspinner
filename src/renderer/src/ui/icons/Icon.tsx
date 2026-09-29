import type { ActionId } from '@shared/actions';
import { ACTION_ICON_PATHS, UI_ICON_PATHS, type UiIconName } from './iconPaths';

const DEFAULT_ICON_SIZE = 24;
const SMALL_ICON_SIZE = 16;
const STROKE_WIDTH = 1.5;
/** Thinner strokes disappear at small sizes. */
const SMALL_STROKE_WIDTH = 1.8;

interface IconProps {
  name: UiIconName | ActionId;
  size?: number;
  className?: string;
  /** Decorative by default; pass a label to expose it to assistive tech. */
  label?: string;
}

export function Icon({ name, size = DEFAULT_ICON_SIZE, className, label }: IconProps) {
  const path =
    name in UI_ICON_PATHS ? UI_ICON_PATHS[name as UiIconName] : ACTION_ICON_PATHS[name as ActionId];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={size <= SMALL_ICON_SIZE ? SMALL_STROKE_WIDTH : STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={path} />
    </svg>
  );
}
