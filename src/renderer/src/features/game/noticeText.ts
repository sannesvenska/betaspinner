import type { TFunction } from 'i18next';
import type { ActionCardDefinition, Notice } from '@shared/session/types';
import { actionCardName } from '@renderer/stores/actionCardsStore';

/** Notices about the board itself (§8.4, §8.8, §9.4): their title is the notice, never the action name. */
export const isBoardNotice = (notice: Notice): boolean =>
  notice.type === 'goal_drifted' ||
  notice.type === 'collectible_tier' ||
  notice.type === 'pixelate_relief' ||
  (notice.type === 'cards_converted' && notice.source !== 'redemption');

/** Human text for an engine notice (acknowledge-only step). */
export function noticeText(t: TFunction, notice: Notice, cards: readonly ActionCardDefinition[]): string {
  switch (notice.type) {
    case 'effect_applied':
      return t(`notice.effectApplied.${notice.effect}`, { value: notice.value, rounds: notice.rounds });
    case 'effects_cleared':
      return t('notice.effectsCleared');
    case 'effect_removed':
      return t('notice.effectRemoved', { effect: t(`effect.${notice.effect}.name`) });
    case 'nothing_to_remove':
      return t('notice.nothingToRemove');
    case 'shield_blocked':
      return t('notice.shieldBlocked', {
        action: actionCardName(t, cards, notice.actionCardId, notice.action),
      });
    case 'decision_maker':
      return t('notice.decisionMaker');
    case 'guess_result': {
      const [first, second] = notice.numbers;
      return t(notice.match ? 'notice.guessMatch' : 'notice.guessMiss', { roll: notice.roll, first, second });
    }
    case 'goal_moved':
      return t('notice.goalMoved', { from: notice.from, to: notice.to });
    case 'goal_drifted':
      return t('notice.goalDrifted', { to: notice.to });
    case 'player_moved':
      return t('notice.playerMoved', { from: notice.from, to: notice.to });
    case 'relocation_skipped':
      return t('notice.relocationSkipped');
    case 'cards_converted':
      return t(`notice.converted.${notice.source}`, { count: notice.count });
    case 'nothing_to_convert':
      return t('notice.nothingToConvert');
    case 'collectible_tier':
      if (notice.bonus.type === 'convert_bad' && notice.bonus.count === 0)
        return t('notice.tier.convertNone', { collected: notice.collected });
      return notice.bonus.type === 'convert_bad'
        ? t('notice.tier.convert', { collected: notice.collected, count: notice.bonus.count })
        : t('notice.tier.chance', { collected: notice.collected, percent: notice.bonus.percent });
    case 'switcheroo_done':
      return t('notice.switcherooDone', { changed: notice.changed, total: notice.total });
    case 'switcheroo_unavailable':
      return t('notice.switcherooUnavailable');
    case 'penalty_fields_removed':
      return t('notice.penaltyFieldsRemoved', { count: notice.count });
    case 'pixelate_relief':
      return notice.level > 0
        ? t('notice.pixelateRelief', { level: notice.level })
        : t('notice.pixelateReliefGone');
    case 'splatter_cleaned':
      return t('notice.splatterCleaned', { count: notice.count });
  }
}
