'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ShopifySetupPage() {
  const router = useRouter();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testEmail, setTestEmail] = useState('');
  const [testPlan, setTestPlan] = useState('lite');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/shopify/webhook/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      setStatus(await res.json());
    } catch (err) {
      console.error('Failed to fetch status:', err);
    } finally {
      setLoading(false);
    }
  }

  async function runTest() {
    if (!testEmail) return;
    setTesting(true);
    setTestResult(null);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/shopify/webhook/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: testEmail, plan: testPlan }),
      });
      setTestResult(await res.json());
    } catch (err) {
      setTestResult({ success: false, steps: [{ step: 'request', status: 'error', detail: err.message }] });
    } finally {
      setTesting(false);
    }
  }

  const StatusBadge = ({ ok, label }) => (
    <div className="flex items-center gap-3 py-3">
      <div className={`w-3 h-3 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      <span className="text-sm text-v-text-primary">{label}</span>
      <span className={`text-xs px-2 py-0.5 rounded ${ok ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
        {ok ? 'Configured' : 'Not Set'}
      </span>
    </div>
  );

  if (loading) {
    return (
      <div className="p-8 text-v-text-secondary">Loading...</div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-heading text-v-text-primary">Shopify Integration Setup</h1>
          <p className="text-sm text-v-text-secondary mt-1">Connect Seal Subscriptions to Shiny Jets CRM</p>
        </div>
        <button
          onClick={() => router.push('/admin')}
          className="text-sm text-v-text-secondary hover:text-v-text-primary transition-colors"
        >
          ← Back to Admin
        </button>
      </div>

      {/* Environment Variables Status */}
      <div className="bg-v-surface border border-v-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-v-text-primary mb-4">Environment Variables</h2>
        <StatusBadge ok={status?.shopify_webhook_secret} label="SHOPIFY_WEBHOOK_SECRET" />
        <StatusBadge ok={!!status?.shopify_store_url} label="SHOPIFY_STORE_URL" />
        <StatusBadge ok={!!status?.next_public_app_url} label="NEXT_PUBLIC_APP_URL" />
        {!status?.shopify_webhook_secret && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-300">
            SHOPIFY_WEBHOOK_SECRET is not configured. Webhooks will be rejected with 401. Add it in Vercel → Project Settings → Environment Variables.
          </div>
        )}
      </div>

      {/* Webhook Endpoints */}
      <div className="bg-v-surface border border-v-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-v-text-primary mb-4">Webhook Endpoints</h2>
        <p className="text-sm text-v-text-secondary mb-3">Configure these in Shopify Admin → Settings → Notifications → Webhooks</p>
        <div className="space-y-3">
          <div className="bg-v-charcoal p-3 rounded border border-v-border">
            <p className="text-xs text-v-text-secondary mb-1">Primary (new — handles plan upgrades + cancellations)</p>
            <code className="text-sm text-v-gold break-all">{status?.webhook_endpoint}</code>
          </div>
          <div className="bg-v-charcoal p-3 rounded border border-v-border">
            <p className="text-xs text-v-text-secondary mb-1">Legacy (handles SMS + temp passwords)</p>
            <code className="text-sm text-v-text-secondary break-all">{status?.alt_webhook_endpoint}</code>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-v-text-primary mb-2">Required Webhook Events:</p>
          <ul className="text-sm text-v-text-secondary space-y-1 ml-4">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-v-gold" />
              <code>orders/paid</code> — Activates subscription when customer pays
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-v-gold" />
              <code>subscription_contracts/update</code> — Handles plan changes & cancellations
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-v-text-secondary" />
              <code>subscription_billing_attempts/failure</code> — Suspends on payment failure (optional)
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-v-text-secondary" />
              <code>subscription_billing_attempts/success</code> — Reactivates after payment (optional)
            </li>
          </ul>
        </div>
      </div>

      {/* Product Setup Instructions */}
      <div className="bg-v-surface border border-v-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-v-text-primary mb-4">Shopify Products to Create</h2>
        <p className="text-sm text-v-text-secondary mb-4">
          Create/update these CRM subscription products in Shopify (see SHOPIFY-PRODUCT-COPY.md). Use Seal Subscriptions to enable recurring billing.
        </p>

        <div className="space-y-4">
          {[
            { name: 'Shiny Jets CRM Free', price: '$0', sku: 'SJ-CRM-FREE', features: '5 sent quotes/month, customers + aircraft history, quote PDF + share link, request link, 1 user, 5% platform fee' },
            { name: 'Shiny Jets CRM Lite', price: '$39.95/mo', sku: 'SJ-CRM-LITE', features: 'Unlimited quotes, follow-ups, Google Calendar, invoices + deposits, jobs + photos, customer portal, your logo, 2% platform fee (30 days per unit)' },
            { name: 'Shiny Jets CRM Business', price: '$89.95/mo', sku: 'SJ-CRM-BUSINESS', features: 'Everything in Lite + Detailing AI, Pricing Tool, up to 3 users, crew app, dispatch, reports, white-label, 0% platform fee (30 days per unit)' },
            { name: 'Shiny Jets CRM Business (Annual)', price: '$899/yr', sku: 'SJ-CRM-BUSINESS-YEARLY', features: 'Business billed yearly (365 days per unit)' },
          ].map((product) => (
            <div key={product.sku} className="bg-v-charcoal p-4 rounded border border-v-border">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-v-text-primary">{product.name}</span>
                <span className="text-v-gold font-semibold">{product.price}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-v-text-secondary">
                <span>SKU: <code className="text-v-text-primary">{product.sku}</code></span>
                <span>Type: Digital / Subscription</span>
              </div>
              <p className="text-xs text-v-text-secondary mt-2">{product.features}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 bg-v-gold/10 border border-v-gold/30 rounded">
          <p className="text-sm text-v-text-primary">
            <span className="font-semibold">Plan matching:</span> The webhook matches CRM orders by exact SKU first
            (<code>SJ-CRM-FREE</code>, <code>SJ-CRM-LITE</code>, <code>SJ-CRM-BUSINESS</code>, <code>SJ-CRM-BUSINESS-YEARLY</code>; legacy <code>SJ-CRM-PRO</code> → Lite and <code>SJ-CRM-ENTERPRISE</code> → Business),
            then by CRM product title, then by exact price ($39.95 / $89.95 / $899) only when the line item has no SKU.
            Quarterly Pricing Tool orders (<code>PRICING-QUARTERLY</code>) also grant Lite for 90 days per unit.
          </p>
        </div>
      </div>

      {/* Seal Subscriptions Setup */}
      <div className="bg-v-surface border border-v-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-v-text-primary mb-4">Seal Subscriptions Configuration</h2>
        <ol className="text-sm text-v-text-secondary space-y-3 ml-4 list-decimal">
          <li>Install <strong className="text-v-text-primary">Seal Subscriptions</strong> from the Shopify App Store</li>
          <li>Create a subscription rule for each product with <strong className="text-v-text-primary">monthly</strong> billing frequency (yearly for SJ-CRM-BUSINESS-YEARLY)</li>
          <li>Set delivery policy to <strong className="text-v-text-primary">Digital / No shipping</strong></li>
          <li>Enable <strong className="text-v-text-primary">auto-charge</strong> for recurring payments</li>
          <li>Go to Shopify Admin → Settings → Notifications → Webhooks</li>
          <li>Copy the <strong className="text-v-text-primary">webhook signing secret</strong> shown at the bottom</li>
          <li>Add it as <code className="text-v-text-primary">SHOPIFY_WEBHOOK_SECRET</code> in Vercel env vars</li>
          <li>Add webhooks for <code>orders/paid</code> and <code>subscription_contracts/update</code> pointing to the endpoint above</li>
        </ol>
      </div>

      {/* Test Webhook */}
      <div className="bg-v-surface border border-v-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-v-text-primary mb-4">Test Webhook Integration</h2>
        <p className="text-sm text-v-text-secondary mb-4">
          Simulate an <code>orders/paid</code> event. This will actually update the detailer&apos;s plan in the database.
        </p>

        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="Detailer email to test"
            className="flex-1 min-w-[200px] px-3 py-2 bg-v-charcoal border border-v-border rounded text-v-text-primary placeholder:text-v-text-secondary text-sm"
          />
          <select
            value={testPlan}
            onChange={(e) => setTestPlan(e.target.value)}
            className="px-3 py-2 bg-v-charcoal border border-v-border rounded text-v-text-primary text-sm"
          >
            <option value="lite">Lite ($39.95)</option>
            <option value="business">Business ($89.95)</option>
          </select>
          <button
            onClick={runTest}
            disabled={testing || !testEmail}
            className="px-6 py-2 bg-v-gold text-white text-sm font-medium rounded hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {testing ? 'Testing...' : 'Run Test'}
          </button>
        </div>

        {testResult && (
          <div className={`p-4 rounded border ${testResult.success ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-3 h-3 rounded-full ${testResult.success ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className={`text-sm font-semibold ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
                {testResult.success ? 'Test Passed' : 'Test Failed'}
              </span>
            </div>
            <div className="space-y-2">
              {testResult.steps?.map((step, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                    step.status === 'success' ? 'bg-green-500' :
                    step.status === 'error' ? 'bg-red-500' :
                    step.status === 'warning' ? 'bg-yellow-500' :
                    'bg-v-text-secondary'
                  }`} />
                  <div>
                    <span className="text-v-text-primary font-medium">{step.step}:</span>{' '}
                    <span className="text-v-text-secondary">{step.detail}</span>
                  </div>
                </div>
              ))}
            </div>
            {testResult.steps?.find(s => s.test_payload) && (
              <details className="mt-3">
                <summary className="text-xs text-v-text-secondary cursor-pointer hover:text-v-text-primary">View test payload</summary>
                <pre className="mt-2 text-xs text-v-text-secondary bg-v-charcoal p-3 rounded overflow-x-auto">
                  {JSON.stringify(testResult.steps.find(s => s.test_payload).test_payload, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
