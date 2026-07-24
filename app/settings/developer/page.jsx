"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

function slugify(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function DeveloperPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(null);
  const [me, setMe] = useState(null);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('vector_user');
      const u = stored ? JSON.parse(stored) : null;
      const token = localStorage.getItem('vector_token');
      if (!u || !token) { setAllowed(false); return; }
      setAllowed(true);
      fetch('/api/detailers/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => setMe(d?.detailer || d))
        .catch(() => {});
    } catch {
      setAllowed(false);
    }
  }, []);

  if (allowed === null) return <div className="p-4 text-v-text-secondary text-sm">Loading…</div>;
  if (!allowed) {
    if (typeof window !== 'undefined') router.replace('/login');
    return null;
  }

  const appUrl = (typeof window !== 'undefined' ? window.location.origin : 'https://crm.shinyjets.com');
  const slug = me?.slug || slugify(me?.company) || me?.id || 'YOUR_SLUG';
  const plan = (me?.plan || 'free').toLowerCase();
  const publicUrl = `${appUrl}/request/${slug}`;
  const embedCode = `<iframe src="${appUrl}/request/${slug}?embed=1" width="100%" height="800" style="border:none;"></iframe>`;
  const qrPngUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(publicUrl)}`;
  const qrSvgUrl = `https://api.qrserver.com/v1/create-qr-code/?format=svg&size=400x400&data=${encodeURIComponent(publicUrl)}`;
  const isBusiness = plan === 'business';

  const copy = async (text, k) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(k);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  const downloadQR = async (format) => {
    const src = format === 'svg' ? qrSvgUrl : qrPngUrl;
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quote-request-qr.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('QR download failed:', e);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xs font-medium uppercase tracking-widest text-v-gold pb-2 border-b border-v-gold/20">Developer</h2>
        <p className="text-xs text-v-text-secondary mt-2">Public link, QR, embed, and API access for your account.</p>
      </div>

      {/* Section 1 — Public quote-request link */}
      <section className="border border-v-border p-5 bg-v-surface">
        <h3 className="text-sm font-semibold text-v-text-primary mb-1">Public quote-request link</h3>
        <p className="text-xs text-v-text-secondary mb-4">Share this anywhere. Customers land on your branded request form.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input readOnly value={publicUrl}
            className="flex-1 bg-v-charcoal border border-v-border px-3 py-2 text-xs font-mono text-v-text-primary outline-none" />
          <button onClick={() => copy(publicUrl, 'url')}
            className="px-4 py-2 bg-v-gold text-white text-xs uppercase tracking-wider hover:bg-v-gold-dim transition-colors">
            {copied === 'url' ? 'Copied' : 'Copy'}
          </button>
          <a href={publicUrl} target="_blank" rel="noreferrer"
            className="px-4 py-2 border border-v-border text-v-text-primary text-xs uppercase tracking-wider hover:bg-white/5 transition-colors text-center">
            Open
          </a>
        </div>
      </section>

      {/* Section 2 — QR code */}
      <section className="border border-v-border p-5 bg-v-surface">
        <h3 className="text-sm font-semibold text-v-text-primary mb-1">QR code</h3>
        <p className="text-xs text-v-text-secondary mb-4">Print on cards, hangar signage, or your invoice footer.</p>
        <div className="flex flex-col sm:flex-row items-start gap-5">
          <div className="bg-white p-3 border border-v-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrPngUrl} alt="Quote request QR code" width={180} height={180} />
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-xs text-v-text-secondary">Encodes: <span className="font-mono text-[11px] bg-v-charcoal px-1.5 py-0.5">{publicUrl}</span></p>
            <div className="flex gap-2 flex-wrap pt-2">
              <button onClick={() => downloadQR('png')}
                className="px-4 py-2 bg-v-gold text-white text-xs uppercase tracking-wider hover:bg-v-gold-dim transition-colors">
                Download PNG
              </button>
              <button onClick={() => downloadQR('svg')}
                className="px-4 py-2 border border-v-border text-v-text-primary text-xs uppercase tracking-wider hover:bg-white/5 transition-colors">
                Download SVG
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3 — Embed snippet */}
      <section className="border border-v-border p-5 bg-v-surface">
        <h3 className="text-sm font-semibold text-v-text-primary mb-1">Embed code</h3>
        <p className="text-xs text-v-text-secondary mb-3">Paste this into your website where you want the quote-request form to appear.</p>
        <textarea readOnly rows={3} value={embedCode}
          className="w-full bg-v-charcoal border border-v-border px-3 py-2 text-xs font-mono text-v-text-primary outline-none resize-none" />
        <div className="mt-2">
          <button onClick={() => copy(embedCode, 'embed')}
            className="px-4 py-2 bg-v-gold text-white text-xs uppercase tracking-wider hover:bg-v-gold-dim transition-colors">
            {copied === 'embed' ? 'Copied' : 'Copy iframe'}
          </button>
        </div>
      </section>

      {/* Section 4 — Custom email sending domain (enterprise-only) */}
      <CustomEmailDomainSection plan={plan} />

      {/* Section 5 — API access (plan-gated) */}
      <section className="border border-v-border p-5 bg-v-surface">
        <h3 className="text-sm font-semibold text-v-text-primary mb-1">API access</h3>
        {isBusiness ? (
          <>
            <p className="text-xs text-v-text-secondary mb-3">Issue an API key for programmatic access to your CRM data.</p>
            <p className="text-xs text-v-text-secondary/70">Key issuance ships in a follow-up — contact brett@shinyjets.com to request one now.</p>
          </>
        ) : (
          <>
            <p className="text-xs text-v-text-secondary mb-3">API access is available on the Business plan.</p>
            <a href="/settings/payments"
              className="inline-block px-4 py-2 bg-v-gold text-white text-xs uppercase tracking-wider hover:bg-v-gold-dim transition-colors">
              Upgrade to Business
            </a>
          </>
        )}
      </section>
    </div>
  );
}

function CustomEmailDomainSection({ plan }) {
  const isEligible = plan === 'business' || plan === 'enterprise';
  const [state, setState] = useStateOrLoad(isEligible);
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(null);

  const copy = async (text, k) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(k);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  const refresh = async () => {
    const token = localStorage.getItem('vector_token');
    const res = await fetch('/api/email-domain', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setState(await res.json());
  };

  const setup = async () => {
    setBusy(true); setError('');
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/email-domain/setup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Setup failed');
      setState((s) => ({ ...(s || {}), domain: d.domain, resendDomainId: d.resendDomainId, status: d.status, records: d.records, verifiedAt: null }));
      await refresh();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true); setError('');
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/email-domain/verify', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Verify failed');
      setState((s) => ({ ...(s || {}), status: d.status, verifiedAt: d.verified ? new Date().toISOString() : null, records: d.records || s?.records }));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('Remove your custom email domain? Emails will revert to noreply@mail.shinyjets.com.')) return;
    setBusy(true); setError('');
    try {
      const token = localStorage.getItem('vector_token');
      await fetch('/api/email-domain', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setState({ isEnterprise: true, domain: null, verifiedAt: null, resendDomainId: null });
      setDomain('');
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!isEligible) {
    return (
      <section className="border border-v-border p-5 bg-v-surface">
        <h3 className="text-sm font-semibold text-v-text-primary mb-1">Custom sending domain</h3>
        <p className="text-xs text-v-text-secondary mb-3">Send customer emails from <span className="font-mono">noreply@yourcompany.com</span> instead of the platform domain.</p>
        <p className="text-xs text-v-text-secondary mb-3">Available on the Business and Enterprise plans.</p>
        <a href="mailto:brett@shinyjets.com?subject=Business%20plan%20-%20custom%20email%20domain"
          className="inline-block px-4 py-2 border border-v-border text-v-text-primary text-xs uppercase tracking-wider hover:bg-white/5 transition-colors">
          Contact about upgrading
        </a>
      </section>
    );
  }

  const hasDomain = !!state?.domain;
  const verified = !!state?.verifiedAt || state?.status === 'verified';

  return (
    <section className="border border-v-border p-5 bg-v-surface">
      <h3 className="text-sm font-semibold text-v-text-primary mb-1">Custom sending domain</h3>
      <p className="text-xs text-v-text-secondary mb-4">Customer emails will be sent from <span className="font-mono">noreply@yourdomain.com</span> after verification.</p>

      {!hasDomain && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="yourcompany.com"
            className="flex-1 bg-v-charcoal border border-v-border px-3 py-2 text-xs font-mono text-v-text-primary outline-none"
          />
          <button onClick={setup} disabled={busy || !domain.trim()}
            className="px-4 py-2 bg-v-gold text-white text-xs uppercase tracking-wider hover:bg-v-gold-dim transition-colors disabled:opacity-50">
            {busy ? 'Setting up…' : 'Set up domain'}
          </button>
        </div>
      )}

      {hasDomain && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs text-v-text-secondary">Domain: <span className="font-mono text-v-text-primary">{state.domain}</span></p>
              <p className="text-[11px] mt-1">
                {verified ? (
                  <span className="text-emerald-400 uppercase tracking-wider">✓ Verified — live</span>
                ) : (
                  <span className="text-amber-400 uppercase tracking-wider">Pending DNS verification</span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              {!verified && (
                <button onClick={verify} disabled={busy}
                  className="px-4 py-2 bg-v-gold text-white text-xs uppercase tracking-wider hover:bg-v-gold-dim transition-colors disabled:opacity-50">
                  {busy ? 'Checking…' : 'Verify'}
                </button>
              )}
              <button onClick={remove} disabled={busy}
                className="px-4 py-2 border border-red-500/30 text-red-400 text-xs uppercase tracking-wider hover:bg-red-500/10 transition-colors disabled:opacity-50">
                Remove
              </button>
            </div>
          </div>

          {Array.isArray(state.records) && state.records.length > 0 && (
            <div className="border border-v-border bg-v-charcoal p-3 mt-2">
              <p className="text-[11px] uppercase tracking-wider text-v-text-secondary mb-2">DNS records to add at your registrar</p>
              <div className="space-y-2">
                {state.records.map((rec, idx) => {
                  const value = rec.value || rec.record_value || rec.target;
                  const name = rec.name || rec.record_name || rec.host || '';
                  const type = rec.type || rec.record_type || '';
                  const k = `rec_${idx}`;
                  return (
                    <div key={k} className="text-[11px] font-mono break-all bg-v-surface border border-v-border p-2">
                      <div className="flex gap-2 flex-wrap">
                        <span className="text-v-text-secondary">{type}</span>
                        <span className="text-v-text-primary">{name || '@'}</span>
                      </div>
                      <div className="flex items-start gap-2 mt-1">
                        <span className="text-v-text-secondary flex-1 break-all">{value}</span>
                        <button onClick={() => copy(value, k)} className="text-v-gold hover:underline shrink-0">
                          {copied === k ? 'copied' : 'copy'}
                        </button>
                      </div>
                      {rec.ttl != null && <p className="text-v-text-secondary mt-1">TTL: {rec.ttl}</p>}
                    </div>
                  );
                })}
              </div>
              {!verified && (
                <p className="text-[11px] text-v-text-secondary mt-2">DNS usually propagates in 5–15 min. Click Verify after you add the records.</p>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
    </section>
  );
}

function useStateOrLoad(isEligible) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!isEligible) return;
    const token = localStorage.getItem('vector_token');
    if (!token) return;
    fetch('/api/email-domain', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setState(d); })
      .catch(() => {});
  }, [isEligible]);
  return [state, setState];
}
