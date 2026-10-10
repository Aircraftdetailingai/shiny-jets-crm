"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { normalizePlan } from '@/lib/plans';
import Link from 'next/link';
import { publicRequestUrl, embedCode as buildEmbedCode, stickyQuoteButtonSnippet, aiChatSnippet } from '@/lib/share-snippets';

// Settings → Share & Embed (route kept at /settings/developer; /settings/embed
// redirects here). Everything a detailer needs to send customers to their
// request-a-quote form: public link, QR code, embed code, sticky button.

const btnPrimary = 'inline-flex items-center justify-center min-h-[44px] px-4 py-2 bg-v-gold text-white text-xs font-semibold uppercase tracking-wider hover:bg-v-gold-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
const btnSecondary = 'inline-flex items-center justify-center min-h-[44px] px-4 py-2 border border-v-border text-v-text-primary text-xs font-semibold uppercase tracking-wider hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
const codeBox = '[font-variant-ligatures:none] w-full bg-v-charcoal border border-v-border px-3 py-2 text-xs font-mono text-v-text-primary outline-none focus:border-v-gold resize-y';

function Section({ id, title, desc, children }) {
  return (
    <section aria-labelledby={id} className="border border-v-border p-4 sm:p-5 bg-v-surface">
      <h3 id={id} className="text-sm font-semibold text-v-text-primary mb-1">{title}</h3>
      {desc && <p className="text-xs text-v-text-secondary mb-4">{desc}</p>}
      {children}
    </section>
  );
}

export default function DeveloperPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(null);
  const [me, setMe] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [copied, setCopied] = useState(null);
  const [announce, setAnnounce] = useState('');
  const [qr, setQr] = useState({ png: '', svg: '' });
  const [position, setPosition] = useState('right');
  const [widget, setWidget] = useState('sticky'); // 'sticky' | 'chat'
  const [chat, setChat] = useState(null); // { eligible, settings, faqs }

  useEffect(() => {
    try {
      const stored = localStorage.getItem('vector_user');
      const u = stored ? JSON.parse(stored) : null;
      const token = localStorage.getItem('vector_token');
      if (!u || !token) { setAllowed(false); return; }
      setAllowed(true);
      // Seed from the cached user so the link shows instantly, then refresh.
      if (u.id) setMe((m) => m || { id: u.id, slug: u.slug, company: u.company, name: u.name, plan: u.plan, is_admin: u.is_admin });
      fetch('/api/detailers/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : Promise.reject(new Error('load failed')))
        .then(d => { const det = d?.detailer || d; setMe((m) => ({ ...(m || {}), ...det, is_admin: m?.is_admin ?? det?.is_admin })); })
        .catch(() => setLoadError('Could not refresh your account details. The link below uses your saved account.'));
      fetch('/api/ai-chat/settings', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setChat(d); })
        .catch(() => {});
    } catch {
      setAllowed(false);
    }
  }, []);

  const appUrl = (typeof window !== 'undefined' ? window.location.origin : 'https://crm.shinyjets.com');
  const publicUrl = me ? publicRequestUrl(appUrl, me) : null;
  const embedCode = me ? buildEmbedCode(appUrl, me) : null;
  const stickyCode = me ? stickyQuoteButtonSnippet(appUrl, me, { position }) : null;
  const chatCode = me ? aiChatSnippet(appUrl, me, { position }) : null;
  const plan = me?.is_admin ? 'business' : normalizePlan(me?.plan);

  // QR code generated in the browser (no third-party QR service).
  useEffect(() => {
    if (!publicUrl) return;
    let cancelled = false;
    import('qrcode').then(async (mod) => {
      const QR = mod.default || mod;
      const opts = { errorCorrectionLevel: 'M', margin: 2, width: 600, color: { dark: '#000000', light: '#ffffff' } };
      const [png, svg] = await Promise.all([QR.toDataURL(publicUrl, opts), QR.toString(publicUrl, { ...opts, type: 'svg' })]);
      if (!cancelled) setQr({ png, svg });
    }).catch((e) => console.error('QR generation failed:', e));
    return () => { cancelled = true; };
  }, [publicUrl]);

  if (allowed === false) {
    if (typeof window !== 'undefined') router.replace('/login');
    return null;
  }

  const copy = async (text, k, what) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers without async clipboard permission.
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setCopied(k);
    setAnnounce(`${what} copied to clipboard`);
    setTimeout(() => setCopied((c) => (c === k ? null : c)), 2000);
  };

  const download = (format) => {
    const data = format === 'svg' ? qr.svg : qr.png;
    if (!data) return;
    const href = format === 'svg' ? URL.createObjectURL(new Blob([data], { type: 'image/svg+xml' })) : data;
    const a = document.createElement('a');
    a.href = href;
    a.download = `request-a-quote-qr.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (format === 'svg') setTimeout(() => URL.revokeObjectURL(href), 1000);
    setAnnounce(`QR code ${format.toUpperCase()} downloaded`);
  };

  const ready = !!publicUrl;

  return (
    <div className="space-y-6 sm:space-y-8 max-w-3xl">
      <div>
        <h2 className="text-base font-semibold text-v-text-primary pb-2 border-b border-v-gold/40">Share &amp; Embed</h2>
        <p className="text-sm text-v-text-secondary mt-2">Your request-a-quote link, QR code, website embed code, Sticky Request a Quote button and AI chat bubble.</p>
        {!ready && <p className="text-xs text-v-text-secondary mt-1" role="status">Loading your account details…</p>}
        {loadError && <p className="text-xs text-amber-300 mt-1">{loadError}</p>}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      {/* 1 — Request-a-quote link */}
      <Section id="share-link" title="1. Request-a-quote link" desc="Share this anywhere: text, email, social bios, your email signature. Customers land on your branded request form.">
        <label htmlFor="share-link-input" className="sr-only">Request-a-quote link</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input id="share-link-input" readOnly value={publicUrl || ''} placeholder="Loading…" onFocus={(e) => e.target.select()}
            className="[font-variant-ligatures:none] flex-1 min-w-0 bg-v-charcoal border border-v-border px-3 py-2 min-h-[44px] text-sm font-mono text-v-text-primary outline-none focus:border-v-gold" />
          <div className="grid grid-cols-2 sm:flex gap-2">
            <button type="button" disabled={!ready} onClick={() => copy(publicUrl, 'url', 'Request-a-quote link')} className={btnPrimary}>
              {copied === 'url' ? 'Copied ✓' : 'Copy link'}
            </button>
            <a href={publicUrl || undefined} target="_blank" rel="noreferrer" aria-disabled={!ready} className={btnSecondary}>
              Open<span className="sr-only"> request form (opens in a new tab)</span>
            </a>
          </div>
        </div>
      </Section>

      {/* 2 — QR code */}
      <Section id="share-qr" title="2. QR code" desc="Print it on business cards, hangar signage, flyers or your invoice footer. Scanning it opens your request form.">
        <div className="flex flex-col sm:flex-row items-start gap-5">
          <div className="bg-white p-2 border border-v-border shrink-0">
            {qr.png ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr.png} alt={`QR code that opens ${publicUrl}`} width={180} height={180} className="block w-[180px] h-[180px]" />
            ) : (
              <div className="w-[180px] h-[180px] flex items-center justify-center text-xs text-gray-700">Generating…</div>
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <p className="text-xs text-v-text-secondary break-all">Opens: <span className="font-mono text-[11px] text-v-text-primary">{publicUrl || '…'}</span></p>
            <div className="grid grid-cols-2 sm:flex gap-2">
              <button type="button" disabled={!qr.png} onClick={() => download('png')} className={btnPrimary}>Download PNG</button>
              <button type="button" disabled={!qr.svg} onClick={() => download('svg')} className={btnSecondary}>Download SVG</button>
            </div>
            <p className="text-[11px] text-v-text-secondary">PNG for everyday use, SVG for print shops (scales to any size).</p>
          </div>
        </div>
      </Section>

      {/* 3 — Embed code */}
      <Section id="share-embed" title="3. Embed code" desc="Paste this into your website (an HTML / Embed block in Wix, Squarespace, WordPress or Webflow) where the request form should appear.">
        <label htmlFor="share-embed-code" className="sr-only">Embed code</label>
        <textarea id="share-embed-code" readOnly rows={4} value={embedCode || ''} placeholder="Loading…" onFocus={(e) => e.target.select()} className={codeBox} />
        <div className="mt-2">
          <button type="button" disabled={!embedCode} onClick={() => copy(embedCode, 'embed', 'Embed code')} className={btnPrimary}>
            {copied === 'embed' ? 'Copied ✓' : 'Copy embed code'}
          </button>
        </div>
      </Section>

      {/* 4 — Website button: Sticky Request a Quote button OR AI chat bubble */}
      <Section id="share-sticky" title="4. Button for your website" desc="Pick one to float in the corner of every page of your website. Paste its code once, just before </body> (or in your site builder’s site-wide custom code / footer code setting).">
        <fieldset className="mb-4">
          <legend className="text-xs text-v-text-secondary mb-2">Which button?</legend>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              ['sticky', 'Sticky Request a Quote button', 'Opens your request-a-quote form.'],
              ['chat', 'AI chat bubble', 'Answers visitors’ questions from your FAQs, then offers Request a quote or a text back.'],
            ].map(([v, l, d]) => (
              <label key={v} className={`flex items-start gap-3 min-h-[44px] p-3 border cursor-pointer ${widget === v ? 'border-v-gold bg-v-gold/10' : 'border-v-border'}`}>
                <input type="radio" name="site-widget" value={v} checked={widget === v} onChange={() => setWidget(v)} className="mt-0.5 h-5 w-5 accent-[#007CB1]" />
                <span>
                  <span className="block text-sm font-semibold text-v-text-primary">{l}</span>
                  <span className="block text-xs text-v-text-secondary">{d}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mb-3">
          <legend className="text-xs text-v-text-secondary mb-2">Button position</legend>
          <div className="flex gap-2">
            {[['right', 'Bottom right'], ['left', 'Bottom left']].map(([v, l]) => (
              <label key={v} className={`inline-flex items-center gap-2 min-h-[44px] px-3 border cursor-pointer text-xs ${position === v ? 'border-v-gold text-v-text-primary' : 'border-v-border text-v-text-secondary'}`}>
                <input type="radio" name="sticky-pos" value={v} checked={position === v} onChange={() => setPosition(v)} className="accent-[#007CB1]" />
                {l}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Preview */}
        <div className="relative h-28 border border-dashed border-v-border bg-white/5 mb-3 overflow-hidden" aria-hidden="true">
          <p className="absolute top-2 left-3 text-[11px] text-v-text-secondary">Preview: your website</p>
          <span className={`absolute bottom-3 ${position === 'left' ? 'left-3' : 'right-3'} inline-flex items-center gap-2 min-h-[44px] px-5 rounded-full bg-[#007CB1] text-white text-sm font-semibold shadow-lg`}>
            {widget === 'chat' ? (
              <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>Questions?</>
            ) : (
              <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M9 12h6M9 16h6M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /></svg>Request a Quote</>
            )}
          </span>
        </div>

        {widget === 'sticky' ? (
          <>
            <label htmlFor="share-sticky-code" className="sr-only">Sticky Request a Quote button code</label>
            <textarea id="share-sticky-code" readOnly rows={6} value={stickyCode || ''} placeholder="Loading…" onFocus={(e) => e.target.select()} className={codeBox} />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button type="button" disabled={!stickyCode} onClick={() => copy(stickyCode, 'sticky', 'Sticky Request a Quote button code')} className={btnPrimary}>
                {copied === 'sticky' ? 'Copied ✓' : 'Copy button code'}
              </button>
              <span className="text-[11px] text-v-text-secondary">Plain HTML and CSS, no script. Keyboard and screen-reader friendly.</span>
            </div>
          </>
        ) : (
          <>
            {chat && !chat.eligible && (
              <p className="text-xs text-v-text-primary border border-v-gold/40 bg-v-gold/10 p-3 mb-3">The AI chat bubble is included with Business ($89.95/mo or $899/yr). <Link href="/upgrade?plan=business" className="underline font-semibold">Upgrade to Business</Link></p>
            )}
            {chat && chat.eligible && !chat.settings?.enabled && (
              <p className="text-xs text-v-text-primary border border-amber-400/50 bg-amber-400/10 p-3 mb-3">The chat bubble is turned off, so it won’t show on your site yet. Turn it on and review your FAQs in <Link href="/settings/ai-chat" className="underline font-semibold">AI Chat &amp; FAQs</Link>.</p>
            )}
            {chat && chat.eligible && chat.settings?.enabled && (
              <p className="text-xs text-v-text-secondary mb-3">On. It answers from your {chat.faqs?.length || 0} FAQs. <Link href="/settings/ai-chat" className="underline text-v-text-primary">Edit FAQs</Link> · <Link href="/ai-leads" className="underline text-v-text-primary">AI Leads</Link></p>
            )}
            <label htmlFor="share-chat-code" className="sr-only">AI chat bubble code</label>
            <textarea id="share-chat-code" readOnly rows={3} value={chatCode || ''} placeholder="Loading…" onFocus={(e) => e.target.select()} className={codeBox} />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button type="button" disabled={!chatCode} onClick={() => copy(chatCode, 'chat', 'AI chat bubble code')} className={btnPrimary}>
                {copied === 'chat' ? 'Copied ✓' : 'Copy chat code'}
              </button>
              <span className="text-[11px] text-v-text-secondary">Uses your brand color. Answers only from your FAQs and never makes things up.</span>
            </div>
          </>
        )}
      </Section>

      {/* 5 — Custom email sending domain (Business) */}
      <CustomEmailDomainSection plan={plan} />

    </div>
  );
}

function CustomEmailDomainSection({ plan }) {
  const isEligible = plan === 'business';
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
        <p className="text-xs text-v-text-secondary mb-3">Included with Business ($89.95/mo or $899/yr).</p>
        <a href="/upgrade?plan=business"
          className="inline-flex items-center min-h-[44px] px-4 py-2 border border-v-border text-v-text-primary text-xs uppercase tracking-wider hover:bg-white/5 transition-colors">
          Upgrade to Business
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
