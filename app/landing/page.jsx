"use client";
import { useState } from 'react';

const TIERS = [
  {
    key: 'free',
    name: 'Free',
    monthlyPrice: 0,
    annualPrice: 0,
    description: 'Get started with Vector',
    features: [
      'Up to 3 quotes/month',
      'Basic aircraft database',
      'Share quotes via link',
      'Email support',
      '5% platform fee',
    ],
    cta: 'START FREE',
    highlight: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    monthlyPrice: 79,
    annualPrice: 59,
    description: 'Most popular for full-time detailers',
    features: [
      'Unlimited quotes',
      'Full aircraft database (208 models)',
      'Custom services & packages',
      'Email notifications',
      'Remove Vector branding',
      'Priority support',
      '2% platform fee',
    ],
    cta: 'GO PRO',
    highlight: true,
  },
  {
    key: 'business',
    name: 'Business',
    monthlyPrice: 149,
    annualPrice: 112,
    description: 'For teams and high-volume shops',
    features: [
      'Unlimited quotes',
      'Full aircraft database (208 models)',
      'Custom services & packages',
      'Email notifications',
      'Team management',
      'Priority support',
      '1% platform fee',
    ],
    cta: 'GET BUSINESS',
    highlight: false,
  },
];

const FEATURES = [
  {
    num: '01',
    title: 'Aircraft-Specific Pricing',
    description: 'Select from 208 aircraft models with pre-loaded dimensions and hour estimates. Your hourly rate multiplied by aircraft hours gives you accurate quotes every time.',
  },
  {
    num: '02',
    title: 'Custom Services & Packages',
    description: 'Build your service menu with interior and exterior services. Bundle them into packages with drag-and-drop ease and offer bundle discounts.',
  },
  {
    num: '03',
    title: 'One-Click Quote Sharing',
    description: 'Send professional quotes via link or email. Clients view a branded quote page and can accept with one click.',
  },
  {
    num: '04',
    title: 'Integrated Payments',
    description: 'Get paid directly through your quotes. Connect Stripe and let clients pay online when they accept your quote.',
  },
  {
    num: '05',
    title: 'Job Calendar',
    description: 'Track scheduled jobs, manage your workload, and never miss a detail appointment.',
  },
  {
    num: '06',
    title: 'Growth Analytics',
    description: 'Track revenue, job completion rates, and ROI. Understand your business performance at a glance.',
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Select Aircraft',
    description: 'Choose from 208 aircraft models. Hours and surface area are pre-loaded for each model.',
  },
  {
    num: '02',
    title: 'Pick Services',
    description: 'Select individual services or a package. Price auto-calculates from your hourly rate and aircraft hours.',
  },
  {
    num: '03',
    title: 'Send & Get Paid',
    description: 'Share your professional quote via link or email. Clients accept and pay online instantly.',
  },
];

export default function LandingPage() {
  const [annualBilling, setAnnualBilling] = useState(false);

  return (
    <div className="min-h-screen" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ===== HERO ===== */}
      <section className="relative min-h-screen flex flex-col overflow-hidden" style={{ background: 'linear-gradient(135deg, #080C12 0%, #0D1B2A 60%, #111827 100%)' }}>

        {/* Animated diagonal gold lines overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 80px,
              #C9A84C 80px,
              #C9A84C 81px
            )`,
            backgroundSize: '113px 113px',
            animation: 'diagonalSlide 20s linear infinite',
          }}
        />

        {/* Subtle radial glow */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: '20%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '800px',
            height: '800px',
            background: 'radial-gradient(ellipse, rgba(201,168,76,0.06) 0%, transparent 70%)',
          }}
        />

        {/* Floating gold particles (CSS-only) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="hero-particle" style={{ left: '10%', animationDelay: '0s', animationDuration: '18s' }} />
          <div className="hero-particle" style={{ left: '25%', animationDelay: '3s', animationDuration: '22s' }} />
          <div className="hero-particle" style={{ left: '45%', animationDelay: '7s', animationDuration: '16s' }} />
          <div className="hero-particle" style={{ left: '65%', animationDelay: '2s', animationDuration: '24s' }} />
          <div className="hero-particle" style={{ left: '80%', animationDelay: '5s', animationDuration: '20s' }} />
          <div className="hero-particle" style={{ left: '90%', animationDelay: '10s', animationDuration: '19s' }} />
          <div className="hero-particle" style={{ left: '35%', animationDelay: '12s', animationDuration: '21s' }} />
          <div className="hero-particle" style={{ left: '55%', animationDelay: '8s', animationDuration: '17s' }} />
        </div>

        {/* Navigation */}
        <nav className="relative z-10 max-w-7xl w-full mx-auto px-6 py-8 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-[1px] bg-v-gold" />
            <span className="text-[#F5F5F5] text-xs tracking-[0.3em] uppercase font-light">Vector</span>
            <span className="ml-2 px-2 py-0.5 text-[9px] tracking-[0.15em] uppercase border border-v-gold/50 text-v-gold rounded-full">Beta</span>
          </div>
          <div className="flex items-center gap-8">
            <a href="#how" className="text-[#8A9BB0] text-xs tracking-[0.2em] uppercase hover:text-v-gold transition-colors hidden sm:inline">Process</a>
            <a href="#features" className="text-[#8A9BB0] text-xs tracking-[0.2em] uppercase hover:text-v-gold transition-colors hidden sm:inline">Features</a>
            <a href="#pricing" className="text-[#8A9BB0] text-xs tracking-[0.2em] uppercase hover:text-v-gold transition-colors hidden sm:inline">Pricing</a>
            <a href="/login" className="px-5 py-2 border border-[#2A3A50] text-[#F5F5F5] text-xs tracking-[0.2em] uppercase hover:border-v-gold hover:text-v-gold transition-colors">
              Sign In
            </a>
          </div>
        </nav>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-20">
          <p className="text-[#8A9BB0] text-[10px] tracking-[0.4em] uppercase mb-8">Est. 2024</p>

          <h1
            className="text-white text-center mb-6"
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontWeight: 200,
              letterSpacing: '0.4em',
              fontSize: 'clamp(1.5rem, 5vw, 3.5rem)',
              lineHeight: 1.2,
            }}
          >
            VECTOR AVIATION
          </h1>

          {/* Gold rule */}
          <div className="w-20 h-[1px] bg-v-gold mx-auto mb-8" />

          <p className="text-v-gold text-[10px] sm:text-xs tracking-[0.3em] uppercase text-center max-w-xl mb-12">
            The Professional Standard in Aircraft Detailing Software
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="/signup"
              className="px-10 py-4 bg-v-gold text-[#080C12] text-xs tracking-[0.25em] uppercase font-medium hover:bg-[#D4B85A] transition-colors text-center"
            >
              Join as a Founding Member
            </a>
            <a
              href="#how"
              className="px-10 py-4 border border-[#F5F5F5]/30 text-[#F5F5F5] text-xs tracking-[0.25em] uppercase hover:border-v-gold hover:text-v-gold transition-colors text-center"
            >
              See How It Works
            </a>
          </div>

          <p className="text-[#8A9BB0]/40 text-[10px] tracking-[0.2em] uppercase mt-12">
            No Credit Card Required
          </p>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-10">
          <div className="w-[1px] h-8 bg-gradient-to-b from-transparent to-v-gold/30" />
        </div>
      </section>


      {/* ===== HOW IT WORKS ===== */}
      <section id="how" className="py-24 sm:py-32" style={{ background: '#080C12' }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-20">
            <p className="text-v-gold text-[10px] tracking-[0.4em] uppercase mb-4">Process</p>
            <h2
              className="text-[#F5F5F5] text-2xl sm:text-3xl mb-4"
              style={{ fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 300, letterSpacing: '0.1em' }}
            >
              Build a Quote in Three Steps
            </h2>
            <div className="w-12 h-[1px] bg-v-gold mx-auto" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
            {STEPS.map((step) => (
              <div key={step.num} className="relative text-center md:text-left">
                {/* Large faint number */}
                <span
                  className="block text-[5rem] leading-none font-light mb-4"
                  style={{
                    fontFamily: '"Playfair Display", Georgia, serif',
                    color: 'rgba(201,168,76,0.08)',
                    letterSpacing: '0.05em',
                  }}
                >
                  {step.num}
                </span>
                <h3
                  className="text-[#F5F5F5] text-lg mb-3"
                  style={{ fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 400, letterSpacing: '0.05em' }}
                >
                  {step.title}
                </h3>
                <p className="text-[#8A9BB0] text-sm leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ===== FEATURES ===== */}
      <section id="features" className="py-24 sm:py-32" style={{ background: '#0D1B2A' }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-20">
            <p className="text-v-gold text-[10px] tracking-[0.4em] uppercase mb-4">Capabilities</p>
            <h2
              className="text-[#F5F5F5] text-2xl sm:text-3xl mb-4"
              style={{ fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 300, letterSpacing: '0.1em' }}
            >
              Everything You Need
            </h2>
            <div className="w-12 h-[1px] bg-v-gold mx-auto" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-16">
            {FEATURES.map((feature) => (
              <div key={feature.num} className="flex gap-6">
                {/* Number accent */}
                <span
                  className="flex-shrink-0 text-[2.5rem] leading-none font-light"
                  style={{
                    fontFamily: '"Playfair Display", Georgia, serif',
                    color: 'rgba(201,168,76,0.12)',
                    letterSpacing: '0.05em',
                    minWidth: '3rem',
                  }}
                >
                  {feature.num}
                </span>
                <div>
                  <h3
                    className="text-[#F5F5F5] text-base mb-2"
                    style={{ fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 400, letterSpacing: '0.05em' }}
                  >
                    {feature.title}
                  </h3>
                  <p className="text-[#8A9BB0] text-sm leading-relaxed">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ===== PRICING ===== */}
      <section id="pricing" className="py-24 sm:py-32" style={{ background: '#080C12' }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-v-gold text-[10px] tracking-[0.4em] uppercase mb-4">Investment</p>
            <h2
              className="text-[#F5F5F5] text-2xl sm:text-3xl mb-4"
              style={{ fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 300, letterSpacing: '0.1em' }}
            >
              Transparent Pricing
            </h2>
            <div className="w-12 h-[1px] bg-v-gold mx-auto mb-6" />
            <p className="text-[#8A9BB0] text-sm max-w-lg mx-auto">
              Start free and upgrade as your business grows. No hidden fees, no long-term contracts.
            </p>
          </div>

          {/* Billing Toggle */}
          <div className="flex justify-center mb-14">
            <div className="inline-flex items-center gap-0 border border-[#2A3A50]">
              <button
                onClick={() => setAnnualBilling(false)}
                className={`px-6 py-2.5 text-[10px] tracking-[0.2em] uppercase font-medium transition-all ${
                  !annualBilling ? 'bg-v-gold text-[#080C12]' : 'text-[#8A9BB0] hover:text-[#F5F5F5]'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setAnnualBilling(true)}
                className={`px-6 py-2.5 text-[10px] tracking-[0.2em] uppercase font-medium transition-all ${
                  annualBilling ? 'bg-v-gold text-[#080C12]' : 'text-[#8A9BB0] hover:text-[#F5F5F5]'
                }`}
              >
                Annual
                <span className="ml-2 text-[9px]" style={{ color: annualBilling ? '#080C12' : '#4ade80' }}>-25%</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {TIERS.map((tier) => {
              const price = annualBilling ? tier.annualPrice : tier.monthlyPrice;
              const showSavings = annualBilling && tier.monthlyPrice > 0;
              return (
                <div
                  key={tier.key}
                  className={`p-8 flex flex-col ${
                    tier.highlight
                      ? 'border-2 border-v-gold relative'
                      : 'border border-[#2A3A50]'
                  }`}
                  style={{ background: tier.highlight ? 'rgba(201,168,76,0.04)' : '#0D1B2A' }}
                >
                  {tier.highlight && (
                    <div className="absolute -top-px left-8 right-8 h-[2px] bg-v-gold" />
                  )}
                  {tier.highlight && (
                    <p className="text-v-gold text-[9px] tracking-[0.3em] uppercase mb-4">Most Popular</p>
                  )}
                  <h3
                    className="text-[#F5F5F5] text-xl mb-1"
                    style={{ fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 400, letterSpacing: '0.05em' }}
                  >
                    {tier.name}
                  </h3>
                  <p className="text-[#8A9BB0] text-xs mb-6">{tier.description}</p>

                  <div className="mb-8">
                    <span
                      className="text-[#F5F5F5] text-[2.5rem] font-light"
                      style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
                    >
                      {price === 0 ? 'Free' : `$${price}`}
                    </span>
                    {price > 0 && (
                      <span className="text-[#8A9BB0] text-xs ml-1">/mo</span>
                    )}
                    {showSavings && (
                      <div className="mt-2">
                        <span className="text-[#8A9BB0]/40 text-xs line-through">${tier.monthlyPrice}/mo</span>
                        <span className="ml-2 text-[#4ade80] text-[10px] tracking-[0.1em] uppercase">Save ${(tier.monthlyPrice - tier.annualPrice) * 12}/yr</span>
                      </div>
                    )}
                    {annualBilling && price > 0 && (
                      <p className="text-[#8A9BB0]/40 text-[10px] mt-1">Billed ${price * 12}/year</p>
                    )}
                  </div>

                  <div className="w-full h-[1px] bg-[#2A3A50] mb-8" />

                  <ul className="space-y-3 mb-10 flex-1">
                    {tier.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-[#8A9BB0]">
                        <span className="text-v-gold text-xs mt-0.5">&#10003;</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <a
                    href="/signup"
                    className={`w-full py-3.5 text-center text-[10px] tracking-[0.25em] uppercase font-medium transition-colors block ${
                      tier.highlight
                        ? 'bg-v-gold text-[#080C12] hover:bg-[#D4B85A]'
                        : 'border border-[#2A3A50] text-[#F5F5F5] hover:border-v-gold hover:text-v-gold'
                    }`}
                  >
                    {tier.cta}
                  </a>
                </div>
              );
            })}
          </div>

          <p className="text-center text-[#8A9BB0]/40 mt-10 text-xs tracking-[0.1em]">
            All plans include a platform fee on completed transactions. Upgrade anytime to reduce your fee rate.
          </p>
        </div>
      </section>


      {/* ===== FINAL CTA ===== */}
      <section className="py-24 sm:py-32 relative overflow-hidden" style={{ background: '#0D1B2A' }}>
        {/* Subtle diagonal lines */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 60px,
              #C9A84C 60px,
              #C9A84C 61px
            )`,
          }}
        />

        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <p className="text-v-gold text-[10px] tracking-[0.4em] uppercase mb-4">Begin</p>
          <h2
            className="text-[#F5F5F5] text-2xl sm:text-3xl mb-4"
            style={{ fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 300, letterSpacing: '0.1em' }}
          >
            Ready to Elevate Your Business?
          </h2>
          <div className="w-12 h-[1px] bg-v-gold mx-auto mb-6" />
          <p className="text-[#8A9BB0] text-sm mb-10 max-w-md mx-auto leading-relaxed">
            Join aircraft detailing professionals who save hours every week with Vector.
            Start free — no credit card required.
          </p>
          <a
            href="/signup"
            className="inline-block px-12 py-4 bg-v-gold text-[#080C12] text-xs tracking-[0.25em] uppercase font-medium hover:bg-[#D4B85A] transition-colors"
          >
            Get Started Free
          </a>
        </div>
      </section>


      {/* ===== FOOTER ===== */}
      <footer className="py-10 border-t border-[#1A2236]" style={{ background: '#080C12' }}>
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-6 h-[1px] bg-v-gold" />
            <span className="text-[#F5F5F5] text-xs tracking-[0.2em] uppercase font-light">Vector Aviation</span>
          </div>
          <div className="flex items-center gap-8 text-[10px] tracking-[0.2em] uppercase text-[#8A9BB0]">
            <a href="/login" className="hover:text-v-gold transition-colors">Sign In</a>
            <a href="#pricing" className="hover:text-v-gold transition-colors">Pricing</a>
            <a href="#features" className="hover:text-v-gold transition-colors">Features</a>
            <a href="/terms" className="hover:text-v-gold transition-colors">Terms</a>
            <a href="/privacy" className="hover:text-v-gold transition-colors">Privacy</a>
          </div>
        </div>
      </footer>


      {/* ===== CSS ANIMATIONS ===== */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@200;300;400&display=swap');

        @keyframes diagonalSlide {
          0% { background-position: 0 0; }
          100% { background-position: 113px 113px; }
        }

        @keyframes floatUp {
          0% {
            transform: translateY(100vh) scale(0);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateY(-10vh) scale(1);
            opacity: 0;
          }
        }

        .hero-particle {
          position: absolute;
          bottom: -10px;
          width: 2px;
          height: 2px;
          background: #C9A84C;
          border-radius: 50%;
          opacity: 0;
          animation: floatUp linear infinite;
        }
      `}</style>
    </div>
  );
}
