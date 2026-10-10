"use client";

import MarkdownLite from '@/components/MarkdownLite';
import { resolveShopTermsText, shopTermsAreCustom } from '@/lib/customer-service-terms';

// Shop terms on a quote, invoice, or portal. A saved PDF replaces the text.
// A blank shop field shows the default wording, so the customer is never
// asked to agree to terms that are not on the page.
export default function ServiceTermsBox({ termsText, termsPdfUrl, className = '' }) {
  return (
    <div className={`border border-[var(--brand-border,#1A2236)] p-5 mb-4 text-left ${className}`}>
      <p className="text-[var(--brand-text-secondary,#8A9BB0)] text-[10px] tracking-[0.3em] uppercase mb-3">Service terms</p>
      {termsPdfUrl ? (
        <div>
          <a
            href={termsPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--brand-primary,#007CB1)] text-sm hover:underline"
          >
            Open this shop&apos;s terms (PDF)
          </a>
          <p className="text-[var(--brand-text-secondary,#8A9BB0)]/70 text-xs mt-2 leading-relaxed">
            This shop uses its own PDF instead of the default wording. Please read it before you agree.
          </p>
        </div>
      ) : (
        <div className="text-[var(--brand-text,#F5F5F5)] text-xs max-h-64 overflow-y-auto leading-relaxed">
          {!shopTermsAreCustom(termsText) && (
            <p className="text-[var(--brand-text-secondary,#8A9BB0)]/60 text-[10px] mb-2">Standard wording for this shop</p>
          )}
          <MarkdownLite source={resolveShopTermsText(termsText)} />
        </div>
      )}
    </div>
  );
}

export function ServiceTermsAgreeLabel() {
  return (
    <span>
      I agree to the service terms above, including what the quote covers, when payment is due, any card fee shown, and the cancellation rules. I also agree to the{' '}
      <a
        href="/legal/quote-terms"
        target="_blank"
        rel="noreferrer"
        className="text-[var(--brand-primary,#007CB1)] underline"
        onClick={(e) => e.stopPropagation()}
      >
        Shiny Jets service terms
      </a>
      .
    </span>
  );
}
