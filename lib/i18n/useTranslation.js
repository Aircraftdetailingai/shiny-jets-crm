'use client';
import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import en from './en.json';

const languages = {
  en: { name: 'English', flag: '\u{1F1FA}\u{1F1F8}' },
  es: { name: 'Español', flag: '\u{1F1EA}\u{1F1F8}' },
  fr: { name: 'Français', flag: '\u{1F1EB}\u{1F1F7}' },
  pt: { name: 'Português', flag: '\u{1F1E7}\u{1F1F7}' },
  de: { name: 'Deutsch', flag: '\u{1F1E9}\u{1F1EA}' },
  it: { name: 'Italiano', flag: '\u{1F1EE}\u{1F1F9}' },
  nl: { name: 'Nederlands', flag: '\u{1F1F3}\u{1F1F1}' },
  ja: { name: '日本語', flag: '\u{1F1EF}\u{1F1F5}' },
  zh: { name: '中文', flag: '\u{1F1E8}\u{1F1F3}' },
};

const translations = { en };
const LanguageContext = createContext(null);

export const LANGUAGES = Object.entries(languages).map(([code, { name, flag }]) => ({
  code,
  label: name,
  flag,
}));

function getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

async function loadTranslation(lang) {
  if (translations[lang]) return translations[lang];
  try {
    const mod = await import(`./${lang}.json`);
    translations[lang] = mod.default || mod;
    return translations[lang];
  } catch (err) {
    console.warn(`Failed to load translations for "${lang}", falling back to English`);
    return translations.en;
  }
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState('en');
  const [loaded, setLoaded] = useState({ en: true });

  useEffect(() => {
    const saved = typeof window !== 'undefined'
      ? localStorage.getItem('vector_language') || navigator.language?.slice(0, 2) || 'en'
      : 'en';
    const code = saved.toLowerCase();
    if (languages[code] && code !== 'en') {
      changeLang(code);
    }
  }, []);

  const changeLang = useCallback(async (code) => {
    if (!languages[code]) return;
    if (!loaded[code]) {
      await loadTranslation(code);
      setLoaded(prev => ({ ...prev, [code]: true }));
    }
    setLangState(code);
    if (typeof window !== 'undefined') {
      localStorage.setItem('vector_language', code);
    }
  }, [loaded]);

  const t = useCallback((key, params = {}) => {
    const str = getNestedValue(translations[lang], key) || getNestedValue(translations.en, key) || key;
    if (typeof str !== 'string') return key;
    return Object.entries(params).reduce(
      (result, [k, v]) => result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
      str
    );
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ t, lang, setLang: changeLang, languages }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return {
      t: (key, params = {}) => {
        const str = getNestedValue(translations.en, key);
        if (typeof str !== 'string') return key;
        return Object.entries(params).reduce(
          (result, [k, v]) => result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
          str
        );
      },
      lang: 'en',
      setLang: () => {},
      languages,
    };
  }
  return ctx;
}
