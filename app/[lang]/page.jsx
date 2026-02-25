import { getTranslation, LANGUAGES } from '@/lib/landing-translations';
import LandingPage from '@/components/LandingPage';

const VALID_LANGS = ['es', 'pt', 'fr', 'de', 'it', 'nl', 'ja', 'zh'];

// Only allow params from generateStaticParams — prevents matching /login, /dashboard, etc.
export const dynamicParams = false;

export function generateStaticParams() {
  return VALID_LANGS.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const t = getTranslation(lang);
  const langLabel = LANGUAGES.find(l => l.code === lang)?.label || lang;

  return {
    title: `Vector - ${t.hero.headlineHighlight} | ${langLabel}`,
    description: t.hero.sub,
    alternates: {
      languages: Object.fromEntries([
        ['en', 'https://vectorav.ai'],
        ...VALID_LANGS.map(l => [l, `https://vectorav.ai/${l}`]),
      ]),
    },
    other: {
      'og:locale': lang,
    },
  };
}

export default async function LocalizedLandingPage({ params }) {
  const { lang } = await params;
  const t = getTranslation(lang);
  return <LandingPage t={t} lang={lang} />;
}
