export { LanguageProvider as I18nProvider, useTranslation, LANGUAGES, languages } from './useTranslation';

export function t(key, lang = 'en', translations) {
  const keys = key.split('.');
  let value = translations[lang];
  for (const k of keys) {
    value = value?.[k];
  }
  if (value !== undefined) return value;
  let fallback = translations['en'];
  for (const k of keys) {
    fallback = fallback?.[k];
  }
  return fallback || key;
}
