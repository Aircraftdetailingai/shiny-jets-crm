import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { sendInvoiceReminderEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    const { id } = await params;

    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !invoice) return Response.json({ error: 'Invoice not found' }, { status: 404 });
    if (invoice.detailer_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

    if (!invoice.customer_email) {
      return Response.json({ error: 'No customer email on invoice' }, { status: 400 });
    }

    if (invoice.status === 'paid') {
      return Response.json({ error: 'Invoice already paid' }, { status: 400 });
    }

    const result = await sendInvoiceReminderEmail({ invoice });

    if (!result.success) {
      return Response.json({ error: result.error || 'Failed to send reminder' }, { status: 500 });
    }

    // Update last_reminder_at
    await supabase
      .from('invoices')
      .update({ last_reminder_at: new Date().toISOString() })
      .eq('id', id);

    return Response.json({ success: true });
  } catch (err) {
    console.error('Invoice reminder error:', err);
    return Response.json({ error: 'Failed to send reminder' }, { status: 500 });
  }
}
