import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { LanguagePackId } from '@shared/settings';
import enNsfw from './locales/en-nsfw.json';

/**
 * A language pack id is `<language>-<wording set>`. The language maps to i18next's `lng`,
 * the wording set to its namespace – i18next would otherwise reformat an id like `en-nsfw`.
 */
const splitPackId = (packId: LanguagePackId): { language: string; namespace: string } => {
  const [language = 'en', namespace = 'nsfw'] = packId.split('-');
  return { language, namespace };
};

const DEFAULT_PACK: LanguagePackId = 'en-nsfw';

export async function initI18n(packId: LanguagePackId = DEFAULT_PACK): Promise<void> {
  const { language, namespace } = splitPackId(packId);
  await i18next.use(initReactI18next).init({
    resources: { en: { nsfw: enNsfw } },
    lng: language,
    ns: [namespace],
    defaultNS: namespace,
    fallbackLng: false,
    interpolation: { escapeValue: false }, // React escapes already
  });
}

export { i18next };
