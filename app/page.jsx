"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { tp, SUPPORTED_LANGUAGES, detectBrowserLanguage } from '@/lib/translations';
import LandingLanguageSelector from '@/components/LandingLanguageSelector';
import { getTranslation } from '@/lib/landing-translations';

const FEATURE_CATEGORIES = [
  {
    title: 'Quoting & Payments',
    icon: '\uD83D\uDCB0',
    features: [
      { name: '300+ Aircraft Database', desc: 'Pre-loaded service hours from Robinson R22 to Boeing 747. Use our defaults or upload your own.' },
      { name: 'One-Click Quote Creation', desc: 'Select aircraft, pick services, and generate an accurate quote in under 60 seconds.' },
      { name: 'Professional PDF Quotes', desc: 'Send branded, professional quotes via email or SMS. Track when clients open them.' },
      { name: 'Stripe Payments', desc: 'Clients accept and pay online with one click. Funds go directly to your Stripe account.' },
      { name: 'Multi-Currency Support', desc: '20+ currencies supported. Quote in USD, EUR, GBP, AUD, CAD, and more.' },
      { name: 'Recurring Services', desc: 'Automate repeat customers with recurring service schedules and reminders.' },
    ],
  },
  {
    title: 'Customer Management',
    icon: '\uD83D\uDC65',
    features: [
      { name: 'Customer Portal', desc: 'Branded portal where clients view quote history, make payments, and track services.' },
      { name: 'Smart Follow-Ups', desc: 'Automated engagement tracking with perfectly timed reminders. Never lose a deal.' },
      { name: 'Auto-Discount Before Expiry', desc: 'Automatically send a discount offer before quotes expire to close more deals.' },
      { name: 'Contact Preferences', desc: 'Respect how each customer prefers to be reached — email, SMS, or both.' },
      { name: 'Points & Rewards', desc: 'Loyalty program that keeps customers coming back with points on every service.' },
      { name: 'Tags & Segmentation', desc: 'Organize customers with tags and segments for targeted follow-ups.' },
    ],
  },
  {
    title: 'Team Management',
    icon: '\uD83D\uDC77',
    features: [
      { name: 'Role-Based Permissions', desc: 'Owner, Manager, Lead Tech, Employee, and Contractor roles with granular access.' },
      { name: 'Crew Dashboard & PIN Login', desc: 'Simplified mobile-first dashboard for field crews. No passwords needed.' },
      { name: 'Clock In/Out Tracking', desc: 'GPS-enabled time tracking for every team member on every job.' },
      { name: 'Job Assignments', desc: 'Assign jobs to specific team members with automatic notifications.' },
      { name: 'Photo Uploads from Field', desc: 'Crew takes before/after photos directly from their mobile device.' },
      { name: 'Product & Equipment Logging', desc: 'Track product usage and report equipment issues from the field.' },
    ],
  },
  {
    title: 'Business Tools',
    icon: '\uD83D\uDCCA',
    features: [
      { name: 'AI Sales Assistant', desc: 'AI-powered lead intake that qualifies prospects and creates quotes automatically.' },
      { name: 'Reports & Analytics', desc: 'Revenue, conversion rates, ROI, profitability — all the metrics that matter.' },
      { name: 'Equipment Tracking', desc: 'Track all your equipment with auto-fill from product links and maintenance logs.' },
      { name: 'Product Inventory', desc: 'Monitor stock levels with automatic reorder alerts when you run low.' },
      { name: 'Invoice Generation', desc: 'Create and send professional invoices with automatic payment tracking.' },
      { name: 'Weather Integration', desc: 'Airport weather forecasts on your dashboard. Rain warnings for scheduled jobs.' },
    ],
  },
];

const STEPS = [
  { num: '1', title: 'Add Your Services & Rates', desc: 'Set up your service menu and hourly rates. Exterior wash, ceramic coating, interior detail — whatever you offer.' },
  { num: '2', title: 'Select Aircraft, Build Quote', desc: 'Choose from 300+ pre-loaded aircraft or add your own hours. Vector calculates the price — you stay in control.' },
  { num: '3', title: 'Send to Client, Get Paid', desc: 'Email or text the quote. Your client views a professional branded page and pays online with one click.' },
];

const TIERS = [
  {
    key: 'free',
    monthlyPrice: 0,
    annualPrice: 0,
    featureKeys: ['freeF1', 'freeF2', 'freeF3', 'freeF4', 'freeF5'],
    highlight: false,
  },
  {
    key: 'pro',
    monthlyPrice: 79,
    annualPrice: 59,
    featureKeys: ['proF1', 'proF2', 'proF3', 'proF4', 'proF5'],
    highlight: true,
  },
  {
    key: 'business',
    monthlyPrice: 149,
    annualPrice: 112,
    featureKeys: ['businessF1', 'businessF2', 'businessF3', 'businessF4', 'businessF5'],
    highlight: false,
  },
  {
    key: 'enterprise',
    monthlyPrice: 299,
    annualPrice: 224,
    featureKeys: ['enterpriseF1', 'enterpriseF2', 'enterpriseF3', 'enterpriseF4', 'enterpriseF5', 'enterpriseF6'],
    highlight: false,
  },
];

const FAQS = [
  { q: 'How does pricing work?', a: 'Vector multiplies your hourly rate by the service hours for each aircraft. We pre-load default hours for 300+ models, but you can upload your own or adjust hours on any quote. A G450 ceramic coating might default to 7.2 hours \u2014 at $190/hr that\'s $1,368 \u2014 but you can change it to whatever fits your crew.' },
  { q: 'Can I customize my services?', a: 'Absolutely. Add any service you offer \u2014 exterior wash, interior detail, ceramic coating, brightwork, decon, or create your own. Bundle them into packages with automatic discounts.' },
  { q: 'What payment methods do you accept?', a: 'Clients pay via Stripe \u2014 all major credit cards, Apple Pay, and Google Pay. Funds go directly to your connected Stripe account. We support 20+ currencies.' },
  { q: 'Is there a long-term contract?', a: 'No contracts. Start free, upgrade anytime, cancel anytime. The free plan is free forever with up to 3 quotes per month.' },
  { q: 'How does the team management work?', a: 'Business plan includes 5 team members with role-based permissions. Crew members get a simplified mobile dashboard with PIN login, time tracking, job assignments, and photo uploads. Enterprise plan includes unlimited team members.' },
  { q: 'What integrations are included?', a: 'Stripe Connect for payments, Resend for professional emails, Twilio for SMS, plus a full PWA mobile app that works offline. Enterprise plan includes API access for custom integrations.' },
  { q: 'How do smart follow-ups work?', a: 'Vector automatically tracks when customers open quotes. If they don\'t open it in 2 days, you get notified. If they view it but don\'t book in 3 days, you get a reminder. Five days before expiry, the customer gets a reminder. Two days before, you can auto-send a discount offer to close the deal.' },
];

const INTEGRATIONS = [
  { name: 'Stripe', desc: 'Payments', icon: '\uD83D\uDCB3' },
  { name: 'Email', desc: 'Resend', icon: '\uD83D\uDCE7' },
  { name: 'SMS', desc: 'Twilio', icon: '\uD83D\uDCF1' },
  { name: 'PWA', desc: 'Mobile App', icon: '\uD83D\uDCF2' },
  { name: 'Weather', desc: 'Open-Meteo', icon: '\u26C5' },
  { name: 'PDF', desc: 'Documents', icon: '\uD83D\uDCC4' },
];

export default function LandingPage() {
  const router = useRouter();
  const [billingAnnual, setBillingAnnual] = useState(false);
  const [openCategory, setOpenCategory] = useState(0);
  const [lang, setLang] = useState('en');

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    const user = localStorage.getItem('vector_user');
    if (token && user) {
      router.push('/dashboard');
      return;
    }
    const saved = localStorage.getItem('vector_landing_lang');
    setLang(saved || detectBrowserLanguage());
  }, [router]);

  const handleLangChange = (code) => {
    setLang(code);
    localStorage.setItem('vector_landing_lang', code);
  };

  const P = (key) => tp(lang, key);
  const T = getTranslation(lang);

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0f1e]/90 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2 text-white text-xl font-bold">
            <span className="text-2xl">{'\u2708\uFE0F'}</span>
            <span>Vector</span>
          </div>
          <div className="flex items-center space-x-4 sm:space-x-6">
            <a href="#features" className="text-gray-400 hover:text-white text-sm hidden sm:inline transition-colors">{T.nav.features}</a>
            <a href="#pricing" className="text-gray-400 hover:text-white text-sm hidden sm:inline transition-colors">{T.nav.pricing}</a>
            <a href="#faq" className="text-gray-400 hover:text-white text-sm hidden sm:inline transition-colors">{T.nav.faq}</a>
            <LandingLanguageSelector lang={lang} onChange={handleLangChange} />
            <a href="/login" className="text-gray-300 hover:text-white text-sm transition-colors">{T.nav.signIn}</a>
            <a href="/login" className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity">
              {T.nav.startFree}
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 sm:pt-40 sm:pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-block px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium mb-8">
              {T.hero.badge}
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold text-white mb-6 leading-[1.1] tracking-tight">
              {T.hero.headline}{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-600">
                {T.hero.headlineHighlight}
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              {T.hero.sub}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/login"
                className="px-8 py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold rounded-xl text-lg hover:opacity-90 shadow-lg shadow-amber-500/25 transition-opacity"
              >
                {T.hero.cta}
              </a>
              <a
                href="#how-it-works"
                className="px-8 py-4 border border-white/15 text-white font-semibold rounded-xl text-lg hover:bg-white/5 transition-colors"
              >
                {T.hero.cta2}
              </a>
            </div>
            <p className="text-gray-500 mt-6 text-sm">{T.hero.noCc}</p>
          </div>

          {/* Dashboard mockup */}
          <div className="mt-16 max-w-5xl mx-auto">
            <div className="rounded-xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-1">
              <div className="rounded-lg bg-[#0f172a] p-6 sm:p-8">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-3 h-3 rounded-full bg-red-500/60"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500/60"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500/60"></div>
                  <span className="text-gray-500 text-xs ml-2">Vector Dashboard</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white/5 rounded-lg p-4">
                    <p className="text-gray-400 text-xs mb-1">Quotes This Month</p>
                    <p className="text-white text-2xl font-bold">24</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-4">
                    <p className="text-gray-400 text-xs mb-1">Revenue Booked</p>
                    <p className="text-white text-2xl font-bold">$18,450</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-4">
                    <p className="text-gray-400 text-xs mb-1">Conversion Rate</p>
                    <p className="text-white text-2xl font-bold">73%</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-4">
                    <p className="text-gray-400 text-xs mb-1">Team Members</p>
                    <p className="text-white text-2xl font-bold">5</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-white/5 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-white font-medium text-sm">Recent: Gulfstream G450</span>
                      <span className="text-amber-400 text-sm font-medium">$4,890</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs">Exterior</span>
                      <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs">Ceramic</span>
                      <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs">Interior</span>
                      <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">Paid</span>
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-white font-medium text-sm">KTEB Weather</span>
                      <span className="text-green-400 text-sm">72°F Clear</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">Mon 68°</span>
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">Tue 71°</span>
                      <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs">Wed Rain</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Trust Badges */}
          <div className="mt-16 max-w-4xl mx-auto">
            <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-4">
              {[
                { label: '100+ Detailers', icon: '\uD83D\uDC65' },
                { label: '10,000+ Quotes Sent', icon: '\uD83D\uDCE8' },
                { label: '300+ Aircraft Models', icon: '\u2708\uFE0F' },
                { label: '20+ Currencies', icon: '\uD83C\uDF0D' },
                { label: '9 Languages', icon: '\uD83D\uDDE3\uFE0F' },
              ].map((b) => (
                <div key={b.label} className="flex items-center gap-2 text-gray-400 text-sm">
                  <span className="text-lg">{b.icon}</span>
                  <span>{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Problem / Solution */}
      <section className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {['\u23F1\uFE0F', '\u2708\uFE0F', '\uD83D\uDCA1'].map((icon, i) => (
              <div key={i} className="text-center p-8 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="text-4xl mb-4">{icon}</div>
                <h3 className="text-xl font-bold text-white mb-3">{T.problems[i].title}</h3>
                <p className="text-gray-400">{T.problems[i].desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{T.howItWorks.title}</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">{T.howItWorks.sub}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {T.steps.map((step, i) => (
              <div key={i} className="relative">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white text-xl font-bold mb-5 shadow-lg shadow-amber-500/20">
                  {i + 1}
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{step.title}</h3>
                <p className="text-gray-400 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features - Categorized */}
      <section id="features" className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              {T.features.title}
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              {T.features.sub}
            </p>
          </div>

          {/* Category Tabs */}
          <div className="flex flex-wrap justify-center gap-2 mb-12">
            {FEATURE_CATEGORIES.map((cat, i) => (
              <button
                key={cat.title}
                onClick={() => setOpenCategory(i)}
                className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                  openCategory === i
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/25'
                    : 'bg-white/[0.05] text-gray-400 hover:text-white hover:bg-white/[0.08] border border-white/10'
                }`}
              >
                <span className="mr-1.5">{cat.icon}</span>
                {cat.title}
              </button>
            ))}
          </div>

          {/* Feature Grid for Active Category */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {FEATURE_CATEGORIES[openCategory].features.map((f) => (
              <div key={f.name} className="p-6 rounded-xl bg-white/[0.03] border border-white/5 hover:border-amber-500/30 transition-colors">
                <h3 className="text-lg font-semibold text-white mb-2">{f.name}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Integrations Bar */}
          <div className="mt-16 pt-12 border-t border-white/5">
            <p className="text-center text-gray-500 text-sm uppercase tracking-wider mb-8">Integrations</p>
            <div className="flex flex-wrap justify-center gap-6">
              {INTEGRATIONS.map((int) => (
                <div key={int.name} className="flex items-center gap-3 px-5 py-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <span className="text-2xl">{int.icon}</span>
                  <div>
                    <p className="text-white text-sm font-medium">{int.name}</p>
                    <p className="text-gray-500 text-xs">{int.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{P('pricingTitle')}</h2>
            <p className="text-gray-400 max-w-2xl mx-auto mb-6">{P('pricingSubtitle')}</p>

            {/* Promo Code Callout */}
            <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-full px-5 py-2 mb-8">
              <span className="text-green-400 text-lg">{'\uD83C\uDF89'}</span>
              <span className="text-green-400 text-sm font-semibold">{P('promoCode')}</span>
            </div>

            {/* Billing Toggle + Language Selector */}
            <div className="flex justify-center items-center gap-4 flex-wrap">
              <div className="inline-flex items-center gap-3 bg-white/[0.05] border border-white/10 rounded-full p-1.5">
                <button
                  onClick={() => setBillingAnnual(false)}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                    !billingAnnual ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {P('monthly')}
                </button>
                <button
                  onClick={() => setBillingAnnual(true)}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
                    billingAnnual ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {P('annual')}
                  <span className="text-xs font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">{P('save25')}</span>
                </button>
              </div>

            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
            {TIERS.map((tier) => {
              const price = billingAnnual ? tier.annualPrice : tier.monthlyPrice;
              const showSavings = billingAnnual && tier.monthlyPrice > 0;
              const tierName = P(`${tier.key}Name`);
              const tierDesc = P(`${tier.key}Desc`);
              const tierCta = P(`${tier.key}Cta`);
              return (
              <div
                key={tier.key}
                className={`rounded-2xl p-5 sm:p-6 flex flex-col ${
                  tier.highlight
                    ? 'bg-gradient-to-b from-amber-500/10 to-amber-600/5 border-2 border-amber-500 relative'
                    : 'bg-white/[0.03] border border-white/10'
                }`}
              >
                {tier.highlight && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-bold px-4 py-1 rounded-full shadow-lg">
                    {P('mostPopular')}
                  </div>
                )}
                <h3 className="text-xl font-bold text-white">{tierName}</h3>
                <p className="text-gray-400 text-sm mt-1 mb-5">{tierDesc}</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">{price === 0 ? '$0' : `$${price}`}</span>
                  <span className="text-gray-400 text-sm">{P('perMonth')}</span>
                  {showSavings && (
                    <div className="mt-1">
                      <span className="text-gray-500 text-sm line-through">${tier.monthlyPrice}{P('perMonth')}</span>
                      <span className="ml-2 text-green-400 text-xs font-semibold">{P('savePerYear').replace('${amount}', String((tier.monthlyPrice - tier.annualPrice) * 12))}</span>
                    </div>
                  )}
                  {billingAnnual && price > 0 && (
                    <p className="text-gray-500 text-xs mt-1">{P('billedYearly').replace('${amount}', String(price * 12))}</p>
                  )}
                </div>
                <ul className="space-y-2.5 mb-6 flex-1">
                  {tier.featureKeys.map((fk, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className="text-amber-400 mt-0.5 flex-shrink-0">{'\u2713'}</span>
                      <span className="text-gray-300">{P(fk)}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="/login"
                  className={`w-full py-3 rounded-xl font-semibold text-center block text-sm transition-opacity ${
                    tier.highlight
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:opacity-90 shadow-lg shadow-amber-500/25'
                      : 'border border-white/20 text-white hover:bg-white/5'
                  }`}
                >
                  {tierCta}
                </a>
              </div>
              );
            })}
          </div>
          <p className="text-center text-gray-500 mt-8 text-sm">
            {P('platformFeeNote')}
          </p>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{T.testimonials.title}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              { quote: 'Vector saved me 10 hours a week on quoting. I used to spend 30 minutes per quote with spreadsheets \u2014 now it takes 60 seconds.', name: 'Aircraft Detailer', location: 'Scottsdale, AZ' },
              { quote: 'The smart follow-ups are incredible. I got three clients to book just from the automated reminders. It\'s like having a sales assistant working 24/7.', name: 'Detailing Business Owner', location: 'Van Nuys, CA' },
              { quote: 'My crew uses the mobile app every day. Clock in, check their jobs, upload photos \u2014 everything is tracked. Managing 5 guys is way easier now.', name: 'Aviation Detailer', location: 'Teterboro, NJ' },
            ].map((t, i) => (
              <div key={i} className="p-6 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="flex gap-1 text-amber-400 mb-4">
                  {[...Array(5)].map((_, j) => <span key={j}>{'\u2605'}</span>)}
                </div>
                <p className="text-gray-300 text-sm leading-relaxed mb-6">&ldquo;{t.quote}&rdquo;</p>
                <div>
                  <p className="text-white font-medium text-sm">{t.name}</p>
                  <p className="text-gray-500 text-xs">{t.location}</p>
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
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{T.faqs.title}</h2>
          </div>
          <div className="space-y-4">
            {FAQS.map((faq, i) => (
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
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {T.footerCta.title}
          </h2>
          <p className="text-gray-400 mb-8 text-lg">
            {T.footerCta.sub}
          </p>
          <a
            href="/login"
            className="inline-block px-10 py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold rounded-xl text-lg hover:opacity-90 shadow-lg shadow-amber-500/25 transition-opacity"
          >
            {T.footerCta.cta}
          </a>
          <div className="mt-8 flex flex-wrap justify-center gap-6 text-gray-500 text-sm">
            <span>No credit card required</span>
            <span>Free plan forever</span>
            <span>Cancel anytime</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center space-x-2 text-white font-bold">
              <span className="text-xl">{'\u2708\uFE0F'}</span>
              <span>Vector</span>
              <span className="text-gray-500 font-normal text-sm ml-2">{T.footer.by}</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <a href="/login" className="hover:text-white transition-colors">{T.nav.signIn}</a>
              <a href="#pricing" className="hover:text-white transition-colors">{T.nav.pricing}</a>
              <a href="#features" className="hover:text-white transition-colors">{T.nav.features}</a>
              <a href="#faq" className="hover:text-white transition-colors">{T.nav.faq}</a>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 text-sm">{T.footer.copy}</p>
            <div className="flex gap-6 text-sm text-gray-500">
              <a href="/terms" className="hover:text-gray-300 transition-colors">{T.footer.terms}</a>
              <a href="/privacy" className="hover:text-gray-300 transition-colors">{T.footer.privacy}</a>
              <a href="mailto:support@vectorav.ai" className="hover:text-gray-300 transition-colors">{T.footer.contact}</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
