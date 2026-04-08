import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET — fetch a single change order request
export async function GET(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const supabase = getSupabase();

  const { data, error } = await supabase.from('change_order_requests')
    .select('*').eq('id', id).eq('detailer_id', user.id).single();
  if (error || !data) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(data);
}

// PATCH — owner reviews: add line items + amount, then send to customer or auto-approve
export async function PATCH(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { line_items, amount, action } = await request.json(); // action: 'send_to_customer' | 'auto_approve' | 'reject'

  const supabase = getSupabase();

  const { data: cor } = await supabase.from('change_order_requests')
    .select('*').eq('id', id).eq('detailer_id', user.id).single();
  if (!cor) return Response.json({ error: 'Not found' }, { status: 404 });

  if (action === 'reject') {
    await supabase.from('change_order_requests').update({ status: 'rejected' }).eq('id', id);
    // Notify crew
    if (cor.team_member_id) {
      try { await supabase.from('notifications').insert({
        detailer_id: user.id, type: 'change_order_rejected',
        title: 'Change Order Rejected', message: `Your change order request was not approved.`,
        metadata: { change_order_request_id: id },
      }); } catch {}
    }
    return Response.json({ success: true, status: 'rejected' });
  }

  const totalAmount = parseFloat(amount) || 0;
  const approvalToken = crypto.randomUUID();

  if (action === 'auto_approve') {
    await supabase.from('change_order_requests').update({
      line_items: line_items || [], amount: totalAmount,
      status: 'approved', auto_approved: true, approved_at: new Date().toISOString(),
      approval_token: approvalToken,
    }).eq('id', id);
    // Notify crew
    if (cor.team_member_id) {
      try { await supabase.from('notifications').insert({
        detailer_id: user.id, type: 'change_order_approved',
        title: 'Change Order Approved', message: `Proceed with: ${cor.description?.slice(0, 80)}`,
        metadata: { change_order_request_id: id },
      }); } catch {}
    }
    return Response.json({ success: true, status: 'approved' });
  }

  // Send to customer
  await supabase.from('change_order_requests').update({
    line_items: line_items || [], amount: totalAmount,
    status: 'pending_customer', approval_token: approvalToken,
  }).eq('id', id);

  // Get quote + customer info
  const { data: quote } = cor.quote_id
    ? await supabase.from('quotes').select('client_name, client_email, aircraft_model, aircraft_type, share_link').eq('id', cor.quote_id).single()
    : { data: null };

  // Send customer email
  if (quote?.client_email && process.env.RESEND_API_KEY) {
    const appUrl = 'https://crm.shinyjets.com';
    const servicesList = (line_items || []).map(li => `<li>${li.name}: $${(parseFloat(li.price) || 0).toFixed(2)}</li>`).join('');
    const photoHtml = cor.photo_url ? `<img src="${cor.photo_url}" alt="Issue" style="max-width:100%;border-radius:8px;margin:12px 0;" />` : '';
    const { data: detailer } = await supabase.from('detailers').select('company').eq('id', user.id).single();

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>',
        to: quote.client_email,
        subject: `Change Order — Additional Work Needed — $${totalAmount.toFixed(2)}`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#333;">Additional Work Required</h2>
          <p>Hi ${(quote.client_name || '').split(' ')[0] || 'there'},</p>
          <p>${detailer?.company || 'Your detailer'} found an issue during work on your ${quote.aircraft_model || quote.aircraft_type || 'aircraft'}.</p>
          ${photoHtml}
          <div style="background:#f5f5f5;padding:12px;border-radius:8px;margin:16px 0;">
            <p style="margin:0 0 8px;font-weight:600;">Description:</p>
            <p style="margin:0;">${cor.description}</p>
          </div>
          <div style="background:#fff3cd;border:1px solid #ffc107;padding:12px;border-radius:8px;margin:16px 0;">
            <p style="font-weight:600;margin:0 0 8px;">Additional Services:</p>
            <ul style="margin:0;padding-left:20px;">${servicesList}</ul>
            <p style="font-weight:700;margin:12px 0 0;font-size:18px;">Total: $${totalAmount.toFixed(2)}</p>
          </div>
          <div style="text-align:center;margin:24px 0;">
            <a href="${appUrl}/change-order/${approvalToken}" style="display:inline-block;background:#007CB1;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Approve & Pay $${totalAmount.toFixed(2)}</a>
          </div>
          <p style="color:#999;font-size:12px;">If you have questions, reply to this email.</p>
        </div>`,
      }),
    });
  }

  return Response.json({ success: true, status: 'pending_customer', token: approvalToken });
}
