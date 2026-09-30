import { describe, expect, it } from 'vitest';
import {
  ACTION_CARD_FIELDS,
  ACTION_PARAM_BOUNDS,
  FOLDER_FIELDS,
  PENALTY_RULE_FIELDS,
  PERFORMER_RULE_FIELDS,
  SESSION_RULE_FIELDS,
} from '@shared/config/gameConfig';
import { DEFAULT_ACTION_CARDS } from '@shared/session/defaults';
import enNsfw from '@renderer/i18n/locales/en-nsfw.json';
import { fieldId } from './fieldLabels';

describe('admin labels', () => {
  it('has a label for every schema field, group, select option and action param', () => {
    const specs = [
      ...SESSION_RULE_FIELDS,
      ...PERFORMER_RULE_FIELDS,
      ...PENALTY_RULE_FIELDS,
      ...FOLDER_FIELDS,
      ...ACTION_CARD_FIELDS,
    ];
    const admin = enNsfw.admin;
    for (const spec of specs) {
      expect(admin.field, spec.key).toHaveProperty(fieldId(spec.key));
      expect(admin.group, spec.group).toHaveProperty(spec.group);
      for (const option of spec.options ?? [])
        expect(admin.option, `${spec.key}.${option}`).toHaveProperty([spec.key, option]);
    }
    const paramKeys = new Set(DEFAULT_ACTION_CARDS.flatMap((card) => Object.keys(card.params)));
    for (const key of paramKeys) {
      expect(ACTION_PARAM_BOUNDS, key).toHaveProperty(key);
      expect(admin.param, key).toHaveProperty(key);
    }
  });
});
