import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { logNotification } from '@/lib/notification-log';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { payment_method, amount, note } = await request.json();

  const supabase = getSupabase();

  // Verify quote belongs to detailer
  const { data: quote, error: qErr } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', id)
    .eq('detailer_id', user.detailer_id || user.id)
    .single();

  if (qErr || !quote) return Response.json({ error: 'Quote not found' }, { status: 404 });

  const now = new Date().toISOString();
  const paidAmount = parseFloat(amount) || quote.total_price || 0;

  // Mark quote as paid
  await supabase.from('quotes').update({
    status: 'paid',
    paid_at: now,
    payment_method: payment_method || 'other',
    amount_paid: paidAmount,
    payment_note: note || null,
  }).eq('id', id);

  // Create job record
  try {
    await supabase.from('jobs').insert({
      quote_id: id,
      detailer_id: user.detailer_id || user.id,
      customer_name: quote.client_name,
      customer_email: quote.client_email,
      tail_number: quote.tail_number,
      aircraft_make: quote.aircraft_type,
      aircraft_model: quote.aircraft_model,
      airport: quote.airport,
      scheduled_date: quote.scheduled_date || null,
      total_price: paidAmount,
      status: 'scheduled',
    });
  } catch (jobErr) {
    console.error('[mark-paid] Job creation failed:', jobErr);
  }

  // Send notification email to detailer
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const aircraft = quote.aircraft_model || quote.aircraft_type || 'Aircraft';
      const subj = `Payment recorded — ${aircraft} — $${paidAmount.toFixed(2)}`;
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>',
          to: user.email,
          subject: subj,
          html: `<div style="font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
            <h2 style="color:#007CB1;">Payment Recorded</h2>
            <p><strong>Customer:</strong> ${quote.client_name || 'Customer'}</p>
            <p><strong>Aircraft:</strong> ${aircraft}</p>
            <p><strong>Amount:</strong> $${paidAmount.toFixed(2)}</p>
            <p><strong>Method:</strong> ${payment_method || 'Other'}</p>
            ${note ? `<p><strong>Note:</strong> ${note}</p>` : ''}
            <p style="color:#999;font-size:12px;margin-top:24px;">Shiny Jets CRM</p>
          </div>`,
        }),
      });
      let rid = null;
      if (r.ok) {
        try { const j = await r.json(); rid = j?.id || j?.data?.id || null; } catch (_) {}
      }
      await logNotification({
        detailer_id: user.detailer_id || user.id,
        notification_type: 'payment_recorded_detailer_notify',
        recipient: user.email,
        channel: 'email',
        status: r.ok ? 'sent' : 'failed',
        resend_id: rid,
        error_message: r.ok ? null : await r.text().catch(() => 'unknown'),
        message_preview: subj,
        quote_id: id,
      });
    }
  } catch (e) {
    await logNotification({
      detailer_id: user.detailer_id || user.id,
      notification_type: 'payment_recorded_detailer_notify',
      recipient: user.email,
      channel: 'email',
      status: 'failed',
      error_message: e?.message || String(e),
      quote_id: id,
    });
  }

  return Response.json({ success: true, status: 'paid' });
}
