import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Public endpoint: customer views invoice by share link
export async function GET(request, { params }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { shareLink } = await params;

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('share_link', shareLink)
      .single();

    if (error || !invoice) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Mark as viewed if not already
    const updates = {};
    if (!invoice.viewed_at) {
      updates.viewed_at = new Date().toISOString();
    }
    if (invoice.status === 'sent') {
      updates.status = 'viewed';
    }

    if (Object.keys(updates).length > 0) {
      await supabase
        .from('invoices')
        .update(updates)
        .eq('id', invoice.id);
    }

    // Fetch detailer branding — explicit list of only what the customer-facing
    // invoice page renders. Never select password_hash, stripe_secret_key,
    // stripe_publishable_key, ach_routing_number, ach_account_number, or
    // webauthn_challenge — this response ships to the public share link.
    const { data: detailer } = await supabase
      .from('detailers')
      .select([
        'company', 'phone', 'email',
        'logo_url', 'theme_logo_url',
        'portal_theme', 'theme_primary', 'theme_accent', 'theme_bg', 'theme_surface',
        'font_embed_url', 'font_heading', 'font_body',
        'quote_display_mode', 'quote_package_name', 'quote_show_breakdown',
      ].join(', '))
      .eq('id', invoice.detailer_id)
      .single();

    return Response.json({
      invoice: { ...invoice, ...updates },
      detailer: detailer || {},
    });
  } catch (err) {
    console.error('Invoice view error:', err);
    return Response.json({ error: 'Failed to fetch invoice' }, { status: 500 });
  }
}
