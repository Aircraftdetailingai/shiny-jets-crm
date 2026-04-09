"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const FEATURES = [
  { icon: '📋', title: 'Instant Quotes', desc: 'Build accurate quotes in 60 seconds with our 300+ aircraft database. Send branded PDFs customers can accept and pay online.' },
  { icon: '📅', title: 'Job Management', desc: 'Schedule jobs, assign crew, track before/after photos, and manage the full lifecycle from quote to completion.' },
  { icon: '👥', title: 'Crew Dashboard', desc: 'Your team gets their own mobile dashboard — assigned jobs, time clock, photo uploads, and product logging.' },
  { icon: '🔄', title: 'Change Orders', desc: 'Crew finds an issue mid-job? Snap a photo, submit a change order, and get customer approval in minutes.' },
  { icon: '✈️', title: 'Customer Portal', desc: 'Customers view quotes, approve and pay online, schedule appointments, and see their service history.' },
  { icon: '📊', title: 'Business Analytics', desc: 'Revenue reports, product usage tracking, crew hours, and recurring service reminders — all in one place.' },
];

const TIERS = [
  { name: 'Free', price: '$0', period: '/mo', features: ['5 quotes/month', 'Aircraft database', 'FAA tail lookup', 'Basic customer management'], cta: 'Get Started', highlight: false },
  { name: 'Pro', price: '$79', period: '/mo', features: ['Unlimited quotes', 'Online payments', 'Google Calendar sync', 'Automated follow-ups', 'Review requests'], cta: 'Start Free Trial', highlight: true },
  { name: 'Business', price: '$149', period: '/mo', features: ['Everything in Pro', 'Crew management', 'Change orders', 'Product tracking', 'Custom intake flows'], cta: 'Start Free Trial', highlight: false },
  { name: 'Enterprise', price: '$899', price: '$899', period: '/mo', features: ['Everything in Business', 'White-label branding', 'Flight hours tracking', 'Priority support', 'Custom integrations'], cta: 'Contact Sales', highlight: false },
];

export default function RootPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (token) {
      router.replace('/dashboard');
    } else {
      setIsLoggedIn(false);
    }
  }, [router]);

  if (isLoggedIn === null) {
    return (
      <div className="min-h-screen bg-[#0a0e14] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0081b8] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0e14] text-white" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0e14]/90 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">&#9992;</span>
            <span className="text-lg font-semibold tracking-wide">Shiny Jets</span>
            <span className="text-white/30 text-xs font-light ml-1">CRM</span>
          </div>
          <Link href="/login" className="px-5 py-2 bg-[#0081b8] text-white text-sm font-medium rounded-lg hover:bg-[#006a9e] transition-colors">
            Log In
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-[#0081b8] text-xs font-medium uppercase tracking-[0.3em] mb-4">Aircraft Detailing Software</p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-light leading-tight mb-6">
            The CRM Built for<br />
            <span className="font-semibold text-[#0081b8]">Aircraft Detailers</span>
          </h1>
          <p className="text-white/50 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Build quotes in 60 seconds. Accept payments online. Manage your crew. Track every job from request to completion.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup?plan=free" className="px-8 py-4 bg-[#0081b8] text-white font-semibold rounded-lg hover:bg-[#006a9e] transition-colors text-sm uppercase tracking-wider">
              Get Started Free
            </Link>
            <Link href="/login" className="px-8 py-4 border border-white/20 text-white/80 font-medium rounded-lg hover:border-white/40 hover:text-white transition-colors text-sm uppercase tracking-wider">
              Sign In
            </Link>
          </div>
          <p className="text-white/30 text-xs mt-6">No credit card required. Free plan includes 5 quotes/month.</p>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[#0081b8] text-xs font-medium uppercase tracking-[0.3em] mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl font-light">Everything you need to run your business</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map((f, i) => (
              <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6 hover:border-[#0081b8]/30 transition-colors">
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[#0081b8] text-xs font-medium uppercase tracking-[0.3em] mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-light">Simple, transparent pricing</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {TIERS.map((t, i) => (
              <div key={i} className={`rounded-xl p-6 ${t.highlight ? 'bg-[#0081b8]/10 border-2 border-[#0081b8]/50 relative' : 'bg-white/[0.03] border border-white/[0.06]'}`}>
                {t.highlight && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#0081b8] text-white text-[10px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full">Most Popular</div>}
                <h3 className="text-lg font-semibold mb-1">{t.name}</h3>
                <div className="mb-4">
                  <span className="text-3xl font-bold">{t.price}</span>
                  <span className="text-white/40 text-sm">{t.period}</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {t.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-white/60">
                      <span className="text-[#0081b8] mt-0.5">&#10003;</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={t.name === 'Enterprise' ? 'mailto:brett@shinyjets.com' : '/signup?plan=free'}
                  className={`block text-center py-3 rounded-lg text-sm font-semibold transition-colors ${
                    t.highlight ? 'bg-[#0081b8] text-white hover:bg-[#006a9e]' : 'border border-white/20 text-white/80 hover:border-white/40'
                  }`}>
                  {t.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-white/[0.02]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-light mb-4">Ready to streamline your business?</h2>
          <p className="text-white/50 mb-8">Join aircraft detailers who use Shiny Jets CRM to quote faster, get paid sooner, and grow their business.</p>
          <Link href="/signup?plan=free" className="inline-block px-8 py-4 bg-[#0081b8] text-white font-semibold rounded-lg hover:bg-[#006a9e] transition-colors text-sm uppercase tracking-wider">
            Get Started Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span>&#9992;</span>
            <span className="font-semibold">Shiny Jets CRM</span>
          </div>
          <div className="flex gap-6 text-sm text-white/40">
            <a href="https://shinyjets.com" className="hover:text-white transition-colors">shinyjets.com</a>
            <Link href="/legal/quote-terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <a href="mailto:support@shinyjets.com" className="hover:text-white transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
