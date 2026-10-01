import type { Group } from '@shared/game';
import type { ActionId } from '@shared/actions';
import { classNames } from './classNames';
import { Icon } from './icons/Icon';
import type { UiIconName } from './icons/iconPaths';
import { Tooltip } from './Tooltip';

const CHIP_ICON_SIZE = 16;

interface ChipProps {
  group: Group;
  icon: ActionId | UiIconName;
  name: string;
  /** Remaining rounds, level, multiplier … */
  meta: string;
  description: string;
}

/** Active effect chip: group bar + icon + name (never color-only). */
export function Chip({ group, icon, name, meta, description }: ChipProps) {
  return (
    <Tooltip content={description} placement="top">
      {(describedById) => (
        <span
          tabIndex={0}
          aria-describedby={describedById}
          className={classNames(
            'flex h-10 animate-[bs-chip-in_200ms_ease-out] items-center gap-2.5 rounded-panel border-l-3 bg-surface px-3 font-display text-chip font-semibold uppercase tracking-chip',
            group === 'good' ? 'border-good text-good' : 'border-bad text-ink',
          )}
        >
          <Icon name={icon} size={CHIP_ICON_SIZE} className={group === 'good' ? 'text-good' : 'text-bad'} />
          {name}
          <span className="font-label text-label tracking-normal text-ink-muted">{meta}</span>
        </span>
      )}
    </Tooltip>
  );
}
