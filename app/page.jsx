"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const FEATURES = [
  { icon: '\u2708\uFE0F', title: '300+ Aircraft Database', desc: 'Pre-loaded hours for 300+ aircraft — or upload your own. Use our defaults as a starting point and adjust per job.' },
  { icon: '\uD83D\uDCB0', title: 'Instant Quoting', desc: 'Select aircraft, pick services, adjust hours if needed. Your hourly rate times your hours equals an accurate quote in 60 seconds.' },
  { icon: '\uD83D\uDCE7', title: 'Email & SMS Delivery', desc: 'Send professional quotes directly to clients via email or text. Track when they view it.' },
  { icon: '\uD83D\uDCB3', title: 'Get Paid Online', desc: 'Stripe payments built right into every quote. Clients accept and pay with one click.' },
  { icon: '\uD83D\uDCC5', title: 'Calendar & Scheduling', desc: 'Track all your jobs in one place. Never double-book or miss an appointment.' },
  { icon: '\uD83D\uDCCA', title: 'Track Your Growth', desc: 'ROI dashboard, revenue analytics, points, and rewards. Watch your business grow.' },
];

const STEPS = [
  { num: '1', title: 'Add Your Services & Rates', desc: 'Set up your service menu and hourly rates. Exterior wash, ceramic coating, interior detail — whatever you offer.' },
  { num: '2', title: 'Select Aircraft, Build Quote', desc: 'Choose from 300+ pre-loaded aircraft or add your own hours. Vector calculates the price — you stay in control.' },
  { num: '3', title: 'Send to Client, Get Paid', desc: 'Email or text the quote. Your client views a professional branded page and pays online with one click.' },
];

const TIERS = [
  {
    name: 'Free',
    price: '$0',
    period: '/mo',
    desc: 'Try Vector risk-free',
    features: ['3 quotes/month', '300+ aircraft database', 'Email quotes', 'Stripe payments', '10% platform fee'],
    cta: 'Start Free',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$79',
    period: '/mo',
    desc: 'For full-time detailers',
    features: ['Unlimited quotes', '300+ aircraft database', 'Email & SMS quotes', 'SMS alerts to you', 'Remove Vector branding', 'Calendar & scheduling', 'Priority support', '2% platform fee'],
    cta: 'Go Pro',
    highlight: true,
  },
  {
    name: 'Business',
    price: '$149',
    period: '/mo',
    desc: 'For teams & high-volume shops',
    features: ['Everything in Pro', 'Multi-user access', 'Vendor portal', 'API access', 'ROI analytics', 'SMS to clients', 'Dedicated support', '1% platform fee'],
    cta: 'Get Business',
    highlight: false,
  },
];

const FAQS = [
  { q: 'How does pricing work?', a: 'Vector multiplies your hourly rate by the service hours for each aircraft. We pre-load default hours for 300+ models, but you can upload your own or adjust hours on any quote. A G450 ceramic coating might default to 7.2 hours — at $190/hr that\'s $1,368 — but you can change it to whatever fits your crew.' },
  { q: 'Can I customize my services?', a: 'Absolutely. Add any service you offer — exterior wash, interior detail, ceramic coating, brightwork, decon, or create your own. Bundle them into packages with automatic discounts.' },
  { q: 'What payment methods do you accept?', a: 'Clients pay via Stripe — all major credit cards, Apple Pay, and Google Pay. Funds go directly to your connected Stripe account.' },
  { q: 'Is there a long-term contract?', a: 'No contracts. Start free, upgrade anytime, cancel anytime. The free plan is free forever with up to 3 quotes per month.' },
  { q: 'How accurate are the aircraft hours?', a: 'Our database covers 300+ aircraft with default hours derived from real-world detailing data. You can use the defaults as-is, upload your own hours for any aircraft, or adjust hours directly on each quote. The platform learns from actual job data over time and improves defaults for everyone.' },
];

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    const user = localStorage.getItem('vector_user');
    if (token && user) {
      router.push('/dashboard');
    }
  }, [router]);

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
            <a href="#features" className="text-gray-400 hover:text-white text-sm hidden sm:inline transition-colors">Features</a>
            <a href="#pricing" className="text-gray-400 hover:text-white text-sm hidden sm:inline transition-colors">Pricing</a>
            <a href="#faq" className="text-gray-400 hover:text-white text-sm hidden sm:inline transition-colors">FAQ</a>
            <a href="/login" className="text-gray-300 hover:text-white text-sm transition-colors">Sign In</a>
            <a href="/login" className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity">
              Start Free
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 sm:pt-40 sm:pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-block px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium mb-8">
              Built for Aircraft Detailers
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold text-white mb-6 leading-[1.1] tracking-tight">
              Quoting Software Built for{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-600">
                Aircraft Detailers
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Create professional quotes in 60 seconds. Get paid faster. Grow your business.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/login"
                className="px-8 py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold rounded-xl text-lg hover:opacity-90 shadow-lg shadow-amber-500/25 transition-opacity"
              >
                Start Free Trial
              </a>
              <a
                href="#how-it-works"
                className="px-8 py-4 border border-white/15 text-white font-semibold rounded-xl text-lg hover:bg-white/5 transition-colors"
              >
                See How It Works
              </a>
            </div>
            <p className="text-gray-500 mt-6 text-sm">No credit card required. Free plan available forever.</p>
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
                <div className="grid grid-cols-3 gap-4 mb-6">
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
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-white font-medium text-sm">Recent Quote: Gulfstream G450</span>
                    <span className="text-amber-400 text-sm font-medium">$4,890</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs">Exterior Wash</span>
                    <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs">Ceramic Coating</span>
                    <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs">Interior Detail</span>
                    <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">Sent</span>
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
            <div className="text-center p-8 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="text-4xl mb-4">{'\u23F1\uFE0F'}</div>
              <h3 className="text-xl font-bold text-white mb-3">Stop Wasting Hours on Quotes</h3>
              <p className="text-gray-400">No more spreadsheets, calculators, or back-of-napkin math. Vector automates the entire process.</p>
            </div>
            <div className="text-center p-8 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="text-4xl mb-4">{'\u2708\uFE0F'}</div>
              <h3 className="text-xl font-bold text-white mb-3">300+ Aircraft, Your Hours</h3>
              <p className="text-gray-400">Default hours for 300+ aircraft from a Robinson R22 to a Boeing 747. Use ours, upload yours, or adjust per job.</p>
            </div>
            <div className="text-center p-8 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="text-4xl mb-4">{'\uD83D\uDCA1'}</div>
              <h3 className="text-xl font-bold text-white mb-3">Your Rate &times; Your Hours</h3>
              <p className="text-gray-400">Set your hourly rate. Pick the aircraft. Adjust the hours if you want. Vector handles the math — you control the numbers.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">How It Works</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">From setup to getting paid — three simple steps.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {STEPS.map((step) => (
              <div key={step.num} className="relative">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white text-xl font-bold mb-5 shadow-lg shadow-amber-500/20">
                  {step.num}
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
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Everything You Need to Quote, Book & Grow
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Built specifically for aircraft detailers. No generic tools, no bloated features.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="p-6 rounded-xl bg-white/[0.03] border border-white/5 hover:border-amber-500/30 transition-colors">
                <div className="text-3xl mb-4">{f.icon}</div>
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
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Simple, Transparent Pricing</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">Start free and upgrade as you grow. No hidden fees, no long-term contracts.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`rounded-2xl p-8 flex flex-col ${
                  tier.highlight
                    ? 'bg-gradient-to-b from-amber-500/10 to-amber-600/5 border-2 border-amber-500 relative'
                    : 'bg-white/[0.03] border border-white/10'
                }`}
              >
                {tier.highlight && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-bold px-4 py-1 rounded-full shadow-lg">
                    MOST POPULAR
                  </div>
                )}
                <h3 className="text-xl font-bold text-white">{tier.name}</h3>
                <p className="text-gray-400 text-sm mt-1 mb-6">{tier.desc}</p>
                <div className="mb-8">
                  <span className="text-5xl font-bold text-white">{tier.price}</span>
                  <span className="text-gray-400 text-sm">{tier.period}</span>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <span className="text-amber-400 mt-0.5 flex-shrink-0">{'\u2713'}</span>
                      <span className="text-gray-300">{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="/login"
                  className={`w-full py-3.5 rounded-xl font-semibold text-center block transition-opacity ${
                    tier.highlight
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:opacity-90 shadow-lg shadow-amber-500/25'
                      : 'border border-white/20 text-white hover:bg-white/5'
                  }`}
                >
                  {tier.cta}
                </a>
              </div>
            ))}
          </div>
          <p className="text-center text-gray-500 mt-8 text-sm">
            All plans include Stripe payment processing. Platform fee covers payment processing, hosting, and support.
          </p>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">What Detailers Are Saying</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              { quote: 'Vector saved me 10 hours a week on quoting. I used to spend 30 minutes per quote with spreadsheets — now it takes 60 seconds.', name: 'Aircraft Detailer', location: 'Scottsdale, AZ' },
              { quote: 'The aircraft database is a game changer. I started with the default hours and now I\'ve dialed in my own numbers for every model. Never underbid a job again.', name: 'Detailing Business Owner', location: 'Van Nuys, CA' },
              { quote: 'My clients love getting professional quotes they can accept and pay online. It makes my business look way more polished.', name: 'Aviation Detailer', location: 'Teterboro, NJ' },
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
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Frequently Asked Questions</h2>
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
            Ready to Grow Your Detailing Business?
          </h2>
          <p className="text-gray-400 mb-8 text-lg">
            Join aircraft detailing professionals who save hours every week with Vector. Start free — no credit card required.
          </p>
          <a
            href="/login"
            className="inline-block px-10 py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold rounded-xl text-lg hover:opacity-90 shadow-lg shadow-amber-500/25 transition-opacity"
          >
            Start Free Trial
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center space-x-2 text-white font-bold">
              <span className="text-xl">{'\u2708\uFE0F'}</span>
              <span>Vector</span>
              <span className="text-gray-500 font-normal text-sm ml-2">by Aircraft Detailing 101</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <a href="/login" className="hover:text-white transition-colors">Sign In</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 text-sm">&copy; 2025 Vector Aviation Software. All rights reserved.</p>
            <div className="flex gap-6 text-sm text-gray-500">
              <a href="#" className="hover:text-gray-300 transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-gray-300 transition-colors">Privacy Policy</a>
              <a href="mailto:support@vectorav.ai" className="hover:text-gray-300 transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
