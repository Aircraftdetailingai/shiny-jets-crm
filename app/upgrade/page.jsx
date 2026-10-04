"use client";
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PLAN_MARKETING, PLAN_NAMES, normalizePlan, planRank, STANDALONE_AI } from '@/lib/plans';
import { getShopifyUpgradeUrl, SHOPIFY_MANAGE_URL } from '@/lib/shopify-products';

const ORDER = ['free', 'lite', 'business'];

function UpgradeContent() {
  const params = useSearchParams();
  const highlight = normalizePlan(params.get('plan') || 'lite');
  const [user, setUser] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('vector_user');
      if (raw) setUser(JSON.parse(raw));
    } catch {}
  }, []);

  const current = user ? (user.is_admin ? 'business' : normalizePlan(user.plan)) : null;
  const email = user?.email || '';

  return (
    <div className="min-h-screen bg-v-charcoal text-v-text-primary">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-8 h-14 border-b border-v-border-subtle">
        <Link href={user ? '/dashboard' : '/'} className="text-sm text-v-text-secondary hover:text-v-gold min-h-[44px] inline-flex items-center">
          &larr; {user ? 'Back to dashboard' : 'Shiny Jets CRM'}
        </Link>
        {user && current !== 'free' && (
          <a href={SHOPIFY_MANAGE_URL} target="_blank" rel="noreferrer" className="text-xs text-v-text-secondary underline hover:text-v-gold min-h-[44px] inline-flex items-center">
            Manage subscription
          </a>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-4xl font-light tracking-wide mb-3">Plans &amp; pricing</h1>
          <p className="text-sm sm:text-base text-v-text-secondary max-w-2xl mx-auto">
            Start free. Upgrade when you need invoicing, jobs and automation (Lite), or Detailing AI, a crew, dispatch and full white-label (Business).
          </p>
          {current && (
            <p className="mt-4 text-sm">
              Your current plan: <span className="text-v-gold font-semibold">{PLAN_NAMES[current]}</span>
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
          {ORDER.map((id) => {
            const tier = PLAN_MARKETING[id];
            const isCurrent = current === id;
            const isHighlighted = !current ? id === highlight : (id === highlight && planRank(id) > planRank(current));
            const isLower = current && planRank(id) < planRank(current);
            return (
              <section
                key={id}
                className={`relative flex flex-col rounded-xl border p-5 sm:p-6 ${isHighlighted ? 'border-v-gold bg-v-gold/5' : 'border-v-border bg-white/[0.02]'}`}
              >
                {isCurrent && (
                  <span className="absolute top-3 right-3 text-[10px] uppercase tracking-widest bg-v-gold/20 text-v-gold px-2 py-0.5 rounded">Current</span>
                )}
                <h2 className="text-lg font-semibold mb-1">{tier.name}</h2>
                <p className="text-xs text-v-text-secondary mb-4">{tier.tagline}</p>
                <p className="mb-1">
                  <span className="text-3xl font-light">{tier.priceLabel}</span>
                  <span className="text-sm text-v-text-secondary"> {tier.cadence}</span>
                </p>
                <p className="text-xs text-v-text-secondary min-h-[1rem] mb-4">{tier.altPriceLabel || tier.note || ''}</p>
                {tier.altPriceLabel && tier.note && <p className="text-xs text-v-text-secondary mb-4">{tier.note}</p>}
                <ul className="space-y-2 text-sm text-v-text-secondary mb-6 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-v-gold shrink-0">&#10003;</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {id === 'free' ? (
                  !user ? (
                    <Link href="/signup" className="inline-flex items-center justify-center min-h-[44px] px-4 rounded border border-v-border text-sm hover:border-v-gold">
                      Start free
                    </Link>
                  ) : (
                    <p className="text-xs text-center text-v-text-secondary min-h-[44px] flex items-center justify-center">
                      {isCurrent ? 'You are on Free' : 'Included in every plan'}
                    </p>
                  )
                ) : isCurrent ? (
                  <p className="text-xs text-center text-v-gold min-h-[44px] flex items-center justify-center">You&apos;re on {tier.name}</p>
                ) : isLower ? (
                  <p className="text-xs text-center text-v-text-secondary min-h-[44px] flex items-center justify-center">Included in your plan</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <a
                      href={getShopifyUpgradeUrl(id, email)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center min-h-[44px] px-4 rounded bg-v-gold text-v-charcoal text-sm font-semibold hover:bg-v-gold-dim"
                    >
                      Get {tier.name} — {tier.priceLabel}{tier.cadence}
                    </a>
                    {id === 'business' && (
                      <a
                        href={getShopifyUpgradeUrl('business_yearly', email)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center min-h-[44px] px-4 rounded border border-v-gold text-v-gold text-sm hover:bg-v-gold/10"
                      >
                        Pay yearly — $899/yr
                      </a>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm text-v-text-secondary">
          <div className="rounded-lg border border-v-border p-4">
            <h3 className="text-v-text-primary font-medium mb-1">Just want Detailing AI?</h3>
            <p>
              Detailing AI is included with Business. You can also get it on its own for ${STANDALONE_AI.monthly}/mo or ${STANDALONE_AI.yearly}/yr at{' '}
              <a href={STANDALONE_AI.url} target="_blank" rel="noopener noreferrer" className="text-v-text-primary underline underline-offset-2 hover:text-v-gold">
                aircraftdetailing.ai<span className="sr-only"> (opens in a new tab)</span>
              </a>.
            </p>
          </div>
          <div className="rounded-lg border border-v-border p-4">
            <h3 className="text-v-text-primary font-medium mb-1">Pricing Tool subscribers</h3>
            <p>A quarterly Pricing Tool subscription includes CRM Lite at no extra cost. Business includes Pricing Tool access.</p>
          </div>
          <div className="rounded-lg border border-v-border p-4">
            <h3 className="text-v-text-primary font-medium mb-1">Platform fee</h3>
            <p>Online payments collected through Shiny Jets carry a platform fee of 5% on Free, 2% on Lite and 0% on Business.</p>
          </div>
        </div>
        <p className="mt-6 text-xs text-center text-v-text-secondary">
          Checkout is handled by the Shiny Jets store. Use the same email as your CRM account so your plan activates automatically.
        </p>
      </main>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-v-charcoal" />}>
      <UpgradeContent />
    </Suspense>
  );
}
