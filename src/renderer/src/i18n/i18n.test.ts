import { describe, expect, it } from 'vitest';
import { i18next, initI18n } from './i18n';

describe('initI18n', () => {
  it('resolves keys and interpolation from the en-nsfw pack', async () => {
    await initI18n('en-nsfw');

    expect(i18next.t('app.title')).toBe('Betaspinner');
    expect(i18next.t('common.roundsShort', { count: 3 })).toBe('3 rd.');
  });
});
