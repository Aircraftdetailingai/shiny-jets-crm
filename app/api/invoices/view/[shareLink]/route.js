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

    // Fetch detailer branding
    const { data: detailer } = await supabase
      .from('detailers')
      .select('company, theme_primary, logo_url')
      .eq('id', invoice.detailer_id)
      .single();

    return Response.json({
      invoice: { ...invoice, ...updates },
      detailer: {
        company: detailer?.company || '',
        theme_primary: detailer?.theme_primary || '',
        logo_url: detailer?.logo_url || '',
      },
    });
  } catch (err) {
    console.error('Invoice view error:', err);
    return Response.json({ error: 'Failed to fetch invoice' }, { status: 500 });
  }
}
