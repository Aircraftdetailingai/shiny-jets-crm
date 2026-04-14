"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LANGUAGES } from '@/lib/landing-translations';

const PRICING_AMOUNTS = [
  { monthlyPrice: 0, annualPrice: 0 },
  { monthlyPrice: 79, annualPrice: 59 },
  { monthlyPrice: 149, annualPrice: 112 },
];

const PROBLEM_ICONS = ['\u23F1\uFE0F', '\u2708\uFE0F', '\uD83D\uDCA1'];
const FEATURE_ICONS = ['\u2708\uFE0F', '\u26A1', '\uD83D\uDCE7', '\uD83D\uDCB3', '\uD83D\uDCC5', '\uD83D\uDCC8'];

export default function LandingPage({ t, lang = 'en' }) {
  const router = useRouter();
  const [billingAnnual, setBillingAnnual] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    const user = localStorage.getItem('vector_user');
    if (token && user) {
      router.push('/dashboard');
    }
  }, [router]);

  const langHref = (code) => code === 'en' ? '/' : `/${code}`;

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0f1e]/90 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2 text-white text-xl font-bold">
            <img src="/images/shiny-jets-logo.png" alt="Shiny Jets CRM" className="h-8 object-contain" />
          </div>
          <div className="flex items-center space-x-4 sm:space-x-6">
            <a href="#features" className="text-gray-400 hover:text-white text-sm hidden sm:inline transition-colors">{t.nav.features}</a>
            <a href="#pricing" className="text-gray-400 hover:text-white text-sm hidden sm:inline transition-colors">{t.nav.pricing}</a>
            <a href="#faq" className="text-gray-400 hover:text-white text-sm hidden sm:inline transition-colors">{t.nav.faq}</a>

            {/* Language Selector */}
            <div className="relative">
              <button
                onClick={() => setLangOpen(!langOpen)}
                className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
              >
                <span className="text-base">{LANGUAGES.find(l => l.code === lang)?.flag || '\uD83C\uDF10'}</span>
                <span className="hidden sm:inline">{LANGUAGES.find(l => l.code === lang)?.label || 'EN'}</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {langOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-[#1a2235] border border-white/10 rounded-xl shadow-2xl z-50 py-2 max-h-80 overflow-y-auto">
                    {LANGUAGES.map(l => (
                      <a
                        key={l.code}
                        href={langHref(l.code)}
                        className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          l.code === lang ? 'text-v-gold bg-v-gold/10' : 'text-gray-300 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <span className="text-base">{l.flag}</span>
                        <span>{l.label}</span>
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>

            <a href="/login" className="text-gray-300 hover:text-white text-sm transition-colors">{t.nav.signIn}</a>
            <a href="/login" className="px-4 py-2 bg-gradient-to-r from-v-gold to-v-gold-dim text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity">
              {t.nav.startFree}
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 sm:pt-40 sm:pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-block px-4 py-1.5 rounded-full bg-v-gold/10 border border-v-gold/20 text-v-gold text-sm font-medium mb-8">
              {t.hero.badge}
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold text-white mb-6 leading-[1.1] tracking-tight">
              {t.hero.headline}{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-v-gold to-v-gold-dim">
                {t.hero.headlineHighlight}
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              {t.hero.sub}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/login"
                className="px-8 py-4 bg-gradient-to-r from-v-gold to-v-gold-dim text-white font-semibold rounded-xl text-lg hover:opacity-90 shadow-lg shadow-v-gold/25 transition-opacity"
              >
                {t.hero.cta}
              </a>
              <a
                href="#how-it-works"
                className="px-8 py-4 border border-white/15 text-white font-semibold rounded-xl text-lg hover:bg-white/5 transition-colors"
              >
                {t.hero.cta2}
              </a>
            </div>
            <p className="text-gray-500 mt-6 text-sm">{t.hero.noCc}</p>
          </div>

          {/* Dashboard mockup */}
          <div className="mt-16 max-w-5xl mx-auto">
            <div className="rounded-xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-1">
              <div className="rounded-lg bg-[#0f172a] p-6 sm:p-8">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-3 h-3 rounded-full bg-red-500/60"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500/60"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500/60"></div>
                  <span className="text-gray-500 text-xs ml-2">Shiny Jets CRM Dashboard</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                  <div className="bg-white/5 rounded-lg p-4">
                    <p className="text-gray-400 text-xs mb-1">{t.mockup.quotes}</p>
                    <p className="text-white text-2xl font-bold">24</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-4">
                    <p className="text-gray-400 text-xs mb-1">{t.mockup.revenue}</p>
                    <p className="text-white text-2xl font-bold">$18,450</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-4">
                    <p className="text-gray-400 text-xs mb-1">{t.mockup.conversion}</p>
                    <p className="text-white text-2xl font-bold">73%</p>
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-medium text-sm">{t.mockup.recentQuote}</span>
                    <span className="text-v-gold text-sm font-medium">$4,890</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem / Solution */}
      <section className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {t.problems.map((p, i) => (
              <div key={i} className="text-center p-8 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="text-4xl mb-4">{PROBLEM_ICONS[i]}</div>
                <h3 className="text-xl font-bold text-white mb-3">{p.title}</h3>
                <p className="text-gray-400">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{t.howItWorks.title}</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">{t.howItWorks.sub}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {t.steps.map((step, i) => (
              <div key={i} className="relative">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-v-gold to-v-gold-dim flex items-center justify-center text-white text-xl font-bold mb-5 shadow-lg shadow-v-gold/20">
                  {i + 1}
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{step.title}</h3>
                <p className="text-gray-400 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{t.features.title}</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">{t.features.sub}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {t.features.items.map((f, i) => (
              <div key={i} className="p-6 rounded-xl bg-white/[0.03] border border-white/5 hover:border-v-gold/30 transition-colors">
                <div className="text-3xl mb-4">{FEATURE_ICONS[i]}</div>
                <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{t.pricing.title}</h2>
            <p className="text-gray-400 max-w-2xl mx-auto mb-8">{t.pricing.sub}</p>

            {/* Billing Toggle */}
            <div className="inline-flex items-center gap-3 bg-white/[0.05] border border-white/10 rounded-full p-1.5">
              <button
                onClick={() => setBillingAnnual(false)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  !billingAnnual ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t.pricing.monthly}
              </button>
              <button
                onClick={() => setBillingAnnual(true)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  billingAnnual ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t.pricing.annual}
                <span className="ml-1.5 text-xs font-bold text-green-500">-25%</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {t.pricing.tiers.map((tier, i) => {
              const amounts = PRICING_AMOUNTS[i] || PRICING_AMOUNTS[0];
              const price = billingAnnual ? amounts.annualPrice : amounts.monthlyPrice;
              const showSavings = billingAnnual && amounts.monthlyPrice > 0;
              const isHighlight = i === 1;
              return (
                <div
                  key={i}
                  className={`rounded-2xl p-6 flex flex-col ${
                    isHighlight
                      ? 'bg-gradient-to-b from-v-gold/10 to-v-gold-dim/5 border-2 border-v-gold relative'
                      : 'bg-white/[0.03] border border-white/10'
                  }`}
                >
                  {isHighlight && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-v-gold to-v-gold-dim text-white text-xs font-bold px-4 py-1 rounded-full shadow-lg">
                      {t.pricing.mostPopular}
                    </div>
                  )}
                  <h3 className="text-xl font-bold text-white">{tier.name}</h3>
                  <p className="text-gray-400 text-sm mt-1 mb-5">{tier.desc}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-white">{price === 0 ? '$0' : `$${price}`}</span>
                    <span className="text-gray-400 text-sm">{t.pricing.mo}</span>
                    {showSavings && (
                      <div className="mt-1">
                        <span className="text-gray-500 text-sm line-through">${amounts.monthlyPrice}{t.pricing.mo}</span>
                        <span className="ml-2 text-green-400 text-xs font-semibold">{t.pricing.save} ${(amounts.monthlyPrice - amounts.annualPrice) * 12}{t.pricing.yr}</span>
                      </div>
                    )}
                    {billingAnnual && price > 0 && (
                      <p className="text-gray-500 text-xs mt-1">{t.pricing.billed} ${price * 12}{t.pricing.year}</p>
                    )}
                  </div>
                  <ul className="space-y-2.5 mb-6 flex-1">
                    {tier.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-2.5 text-sm">
                        <span className="text-v-gold mt-0.5 flex-shrink-0">{'\u2713'}</span>
                        <span className="text-gray-300">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <a
                    href={i === 0 ? '/signup' : i === 1 ? 'https://shinyjets.com/products/aircraft-detailing-crm-pro' : i === 2 ? 'https://shinyjets.com/products/aircraft-detailing-crm-business' : '/login'}
                    target={i > 0 ? '_blank' : undefined}
                    rel={i > 0 ? 'noreferrer' : undefined}
                    className={`w-full py-3 rounded-xl font-semibold text-center block text-sm transition-opacity ${
                      isHighlight
                        ? 'bg-gradient-to-r from-v-gold to-v-gold-dim text-white hover:opacity-90 shadow-lg shadow-v-gold/25'
                        : 'border border-white/20 text-white hover:bg-white/5'
                    }`}
                  >
                    {tier.cta}
                  </a>
                </div>
              );
            })}
          </div>
          <p className="text-center text-gray-500 mt-8 text-sm">{t.pricing.footer}</p>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{t.testimonials.title}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {t.testimonials.items.map((item, i) => (
              <div key={i} className="p-6 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="flex gap-1 text-v-gold mb-4">
                  {[...Array(5)].map((_, j) => <span key={j}>{'\u2605'}</span>)}
                </div>
                <p className="text-gray-300 text-sm leading-relaxed mb-6">&ldquo;{item.quote}&rdquo;</p>
                <div>
                  <p className="text-white font-medium text-sm">{item.name}</p>
                  <p className="text-gray-500 text-xs">{item.location}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 border-t border-white/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{t.faqs.title}</h2>
          </div>
          <div className="space-y-4">
            {t.faqs.items.map((faq, i) => (
              <details key={i} className="group rounded-xl bg-white/[0.03] border border-white/5 overflow-hidden">
                <summary className="flex justify-between items-center cursor-pointer p-6 text-white font-medium hover:bg-white/[0.02] transition-colors">
                  <span>{faq.q}</span>
                  <span className="text-gray-400 group-open:rotate-45 transition-transform text-xl ml-4 flex-shrink-0">+</span>
                </summary>
                <div className="px-6 pb-6 text-gray-400 text-sm leading-relaxed">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-20 border-t border-white/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{t.footerCta.title}</h2>
          <p className="text-gray-400 mb-8 text-lg">{t.footerCta.sub}</p>
          <a
            href="/login"
            className="inline-block px-10 py-4 bg-gradient-to-r from-v-gold to-v-gold-dim text-white font-semibold rounded-xl text-lg hover:opacity-90 shadow-lg shadow-v-gold/25 transition-opacity"
          >
            {t.footerCta.cta}
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center space-x-2 text-white font-bold">
              <img src="/images/shiny-jets-logo.png" alt="Shiny Jets CRM" className="h-6 object-contain" />
              <span className="text-gray-500 font-normal text-sm ml-2">{t.footer.by}</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <a href="/login" className="hover:text-white transition-colors">{t.nav.signIn}</a>
              <a href="#pricing" className="hover:text-white transition-colors">{t.nav.pricing}</a>
              <a href="#features" className="hover:text-white transition-colors">{t.nav.features}</a>
              <a href="#faq" className="hover:text-white transition-colors">{t.nav.faq}</a>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 text-sm">{t.footer.copy}</p>
            <div className="flex gap-6 text-sm text-gray-500">
              <a href="/terms" className="hover:text-gray-300 transition-colors">{t.footer.terms}</a>
              <a href="/privacy" className="hover:text-gray-300 transition-colors">{t.footer.privacy}</a>
              <a href="mailto:support@shinyjets.com" className="hover:text-gray-300 transition-colors">{t.footer.contact}</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
