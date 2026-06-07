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
      if (!u?.is_admin) { setAllowed(false); return; }
      setAllowed(true);
      const token = localStorage.getItem('vector_token');
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
    if (typeof window !== 'undefined') router.replace('/404');
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
