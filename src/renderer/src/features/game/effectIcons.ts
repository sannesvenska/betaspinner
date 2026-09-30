import type { ActionId } from '@shared/actions';
import type { EffectType } from '@shared/session/types';
import type { UiIconName } from '@renderer/ui/icons/iconPaths';

/** Icon per effect type (design-system §6): the action icon that causes it, the shield icon for Shield. */
export const EFFECT_ICONS: Readonly<Record<EffectType, ActionId | UiIconName>> = {
  double_trouble: 'double_trouble',
  pace_slow: 'take_it_slow',
  pace_fast: 'speed_it_up',
  u_turn: 'u_turn',
  pixelate: 'pixelate',
  splatter: 'splatter',
  success_multiplier: 'hail_mary',
  shield: 'shield',
};

export const GOOD_EFFECTS: readonly EffectType[] = ['success_multiplier', 'shield'];
