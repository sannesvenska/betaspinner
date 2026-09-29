import 'i18next';
import type enNsfw from './locales/en-nsfw.json';

// Typed translation keys: unknown keys are compile errors
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'nsfw';
    resources: { nsfw: typeof enNsfw };
  }
}
