import type { TFunction } from 'i18next';
import type { Notice } from '@shared/session/types';

/** Human text for an engine notice (acknowledge-only step). */
export function noticeText(t: TFunction, notice: Notice): string {
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
      return t('notice.shieldBlocked', { action: t(`action.${notice.action}.name`) });
    case 'decision_maker':
      return t('notice.decisionMaker');
    case 'guess_result': {
      const [first, second] = notice.numbers;
      return t(notice.match ? 'notice.guessMatch' : 'notice.guessMiss', { roll: notice.roll, first, second });
    }
    case 'goal_moved':
      return t('notice.goalMoved', { from: notice.from, to: notice.to });
    case 'player_moved':
      return t('notice.playerMoved', { from: notice.from, to: notice.to });
    case 'relocation_skipped':
      return t('notice.relocationSkipped');
    case 'switcheroo_done':
      return t('notice.switcherooDone', { changed: notice.changed, total: notice.total });
    case 'switcheroo_unavailable':
      return t('notice.switcherooUnavailable');
    case 'penalty_fields_removed':
      return t('notice.penaltyFieldsRemoved', { count: notice.count });
  }
}
