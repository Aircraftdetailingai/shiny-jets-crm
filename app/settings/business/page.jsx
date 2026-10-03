import Link from 'next/link';
import SettingsShell from '../_SettingsShell';

export const metadata = { title: 'Business Info — Vector' };

export default function BusinessSettingsPage() {
  return (
    <>
      {/* Settings landing page (/settings redirects here): make the
          request-a-quote link / QR / embed tools easy to find. */}
      <Link
        href="/settings/developer"
        className="group mb-4 flex items-center gap-3 border border-v-gold/40 bg-v-gold/10 px-4 py-3 hover:bg-v-gold/15 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <svg className="w-6 h-6 shrink-0 text-v-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h3v-3" /></svg>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-v-text-primary">Share &amp; Embed · QR code</span>
          <span className="block text-xs text-v-text-secondary">Request-a-quote link, QR code, website embed code and Sticky Request a Quote button</span>
        </span>
        <span className="text-v-gold text-lg group-hover:translate-x-0.5 transition-transform" aria-hidden="true">→</span>
      </Link>
      <SettingsShell bucket="business" />
    </>
  );
}
