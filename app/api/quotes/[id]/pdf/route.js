import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { generateQuotePdf } from '@/lib/quote-pdf';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  // Accept both param names. `shareToken` is what SendQuoteModal sends;
  // `token` is the legacy name some customer-facing links may still use.
  const shareToken = searchParams.get('shareToken') || searchParams.get('token');

  const supabase = getSupabase();

  let quote;
  if (shareToken) {
    const { data } = await supabase.from('quotes').select('*').eq('id', id).eq('share_link', shareToken).single();
    quote = data;
  }
  // Auth fallback: an authenticated owner can always fetch their own quote's
  // PDF, even if the share_link is absent or stale (e.g. right after save,
  // before replica catch-up, or when opening from the CRM rather than a link).
  if (!quote) {
    const user = await getAuthUser(request);
    if (user) {
      const { data } = await supabase.from('quotes').select('*').eq('id', id).eq('detailer_id', user.detailer_id || user.id).single();
      quote = data;
    } else if (!shareToken) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  if (!quote) return new Response('Quote not found', { status: 404 });

  const { buffer, filename } = await generateQuotePdf(quote, { supabase });

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      // No caching: the PDF is regenerated from live quote data on every edit,
      // so a cached copy (browser or edge) serves a stale quote in the Send
      // modal iframe after a change ships.
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
    },
  });
}
