"use client";
import { useState } from 'react';

const TIERS = [
  {
    key: 'free',
    name: 'Free',
    price: 0,
    period: 'forever',
    description: 'Get started with Vector',
    features: [
      'Up to 3 quotes/month',
      'Basic aircraft database',
      'Share quotes via link',
      'Email support',
      '10% platform fee',
    ],
    cta: 'Start Free',
    highlight: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 79,
    period: '/month',
    description: 'Most popular for full-time detailers',
    features: [
      'Unlimited quotes',
      'Full aircraft database (300+ models)',
      'Custom services & packages',
      'SMS alerts to you',
      'Remove Vector branding',
      'Priority support',
      '2% platform fee',
    ],
    cta: 'Go Pro',
    highlight: true,
  },
  {
    key: 'business',
    name: 'Business',
    price: 149,
    period: '/month',
    description: 'For teams and high-volume shops',
    features: [
      'Unlimited quotes',
      'Full aircraft database (300+ models)',
      'Custom services & packages',
      'SMS alerts to you',
      'SMS to clients',
      'Team management',
      'Priority support',
      '1% platform fee',
    ],
    cta: 'Get Business',
    highlight: false,
  },
];

const FEATURES = [
  {
    title: 'Aircraft-Specific Pricing',
    description: 'Select from 220+ aircraft models with pre-loaded dimensions and hour estimates. Your hourly rate multiplied by aircraft hours gives you accurate quotes every time.',
    icon: '&#9992;',
  },
  {
    title: 'Custom Services & Packages',
    description: 'Build your service menu with interior and exterior services. Bundle them into packages with drag-and-drop ease and offer bundle discounts.',
    icon: '&#9881;',
  },
  {
    title: 'One-Click Quote Sharing',
    description: 'Send professional quotes via link, email, or SMS. Clients view a branded quote page and can accept with one click.',
    icon: '&#128233;',
  },
  {
    title: 'Stripe Payments',
    description: 'Get paid directly through your quotes. Connect Stripe and let clients pay online when they accept your quote.',
    icon: '&#128179;',
  },
  {
    title: 'Job Calendar',
    description: 'Track scheduled jobs, manage your workload, and never miss a detail appointment.',
    icon: '&#128197;',
  },
  {
    title: 'Growth Analytics',
    description: 'Track revenue, job completion rates, and ROI. Understand your business performance at a glance.',
    icon: '&#128200;',
  },
];

export default function LandingPage() {
  const [annualBilling, setAnnualBilling] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f]">
      {/* Navigation */}
      <nav className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
        <div className="flex items-center space-x-2 text-white text-2xl font-bold">
          <span>&#9992;</span>
          <span>Vector</span>
        </div>
        <div className="flex items-center space-x-6">
          <a href="#features" className="text-gray-300 hover:text-white hidden sm:inline">Features</a>
          <a href="#pricing" className="text-gray-300 hover:text-white hidden sm:inline">Pricing</a>
          <a href="/login" className="px-4 py-2 text-white border border-white/30 rounded-lg hover:bg-white/10">
            Sign In
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 pt-16 pb-24 text-center">
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
          Professional Quoting for<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-600">
            Aircraft Detailers
          </span>
        </h1>
        <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-10">
          Build accurate quotes in seconds. Select the aircraft, pick your services,
          and send a professional quote your clients can accept and pay online.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="/"
            className="px-8 py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold rounded-lg text-lg hover:opacity-90 shadow-lg shadow-amber-500/30"
          >
            Start Free &mdash; No Credit Card
          </a>
          <a
            href="#features"
            className="px-8 py-4 border border-white/30 text-white font-semibold rounded-lg text-lg hover:bg-white/10"
          >
            See How It Works
          </a>
        </div>
        <p className="text-gray-400 mt-6 text-sm">
          Trusted by aircraft detailing professionals across the country
        </p>
      </section>

      {/* How It Works */}
      <section className="bg-white/5 py-20">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            Build a Quote in 3 Steps
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Select Aircraft',
                desc: 'Choose from 220+ aircraft models. Hours and surface area are pre-loaded for each model.',
              },
              {
                step: '2',
                title: 'Pick Services',
                desc: 'Select individual services or a package. Price auto-calculates from pre-loaded hours or your own hours and your hourly rate.',
              },
              {
                step: '3',
                title: 'Send & Get Paid',
                desc: 'Share your professional quote via link, email, or SMS. Clients accept and pay online.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-gray-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-white text-center mb-4">
            Everything You Need to Quote, Book, and Grow
          </h2>
          <p className="text-gray-400 text-center mb-12 max-w-2xl mx-auto">
            Built specifically for aircraft detailers. No generic tools, no bloated features &mdash; just what you need.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="bg-white/5 border border-white/10 rounded-xl p-6 hover:border-amber-500/50 transition-colors"
              >
                <div
                  className="text-3xl mb-4"
                  dangerouslySetInnerHTML={{ __html: feature.icon }}
                />
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-gray-400 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 bg-white/5">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-white text-center mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-gray-400 text-center mb-12 max-w-2xl mx-auto">
            Start free and upgrade as your business grows. No hidden fees, no long-term contracts.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {TIERS.map((tier) => (
              <div
                key={tier.key}
                className={`rounded-xl p-6 flex flex-col ${
                  tier.highlight
                    ? 'bg-gradient-to-b from-amber-500/20 to-amber-600/10 border-2 border-amber-500 relative'
                    : 'bg-white/5 border border-white/10'
                }`}
              >
                {tier.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    MOST POPULAR
                  </div>
                )}
                <h3 className="text-xl font-bold text-white mb-1">{tier.name}</h3>
                <p className="text-gray-400 text-sm mb-4">{tier.description}</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">
                    {tier.price === 0 ? 'Free' : `$${tier.price}`}
                  </span>
                  {tier.price > 0 && (
                    <span className="text-gray-400 text-sm">{tier.period}</span>
                  )}
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="text-amber-400 mt-0.5">&#10003;</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="/"
                  className={`w-full py-3 rounded-lg font-semibold text-center block ${
                    tier.highlight
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:opacity-90'
                      : 'border border-white/30 text-white hover:bg-white/10'
                  }`}
                >
                  {tier.cta}
                </a>
              </div>
            ))}
          </div>

          <p className="text-center text-gray-500 mt-8 text-sm">
            All plans include a platform fee on completed transactions. Upgrade anytime to reduce your fee rate.
          </p>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Streamline Your Quoting?
          </h2>
          <p className="text-gray-400 mb-8">
            Join aircraft detailing professionals who save hours every week with Vector.
            Start free &mdash; no credit card required.
          </p>
          <a
            href="/"
            className="inline-block px-8 py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold rounded-lg text-lg hover:opacity-90 shadow-lg shadow-amber-500/30"
          >
            Get Started Free
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-2 text-white font-bold">
            <span>&#9992;</span>
            <span>Vector</span>
            <span className="text-gray-500 font-normal text-sm ml-2">by Aircraft Detailing 101</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-400">
            <a href="/login" className="hover:text-white">Sign In</a>
            <a href="#pricing" className="hover:text-white">Pricing</a>
            <a href="#features" className="hover:text-white">Features</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
