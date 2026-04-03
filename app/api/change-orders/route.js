import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

let _resend;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');
  return _resend;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Get change orders for a quote
export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const quoteId = searchParams.get('quote_id');

    if (!quoteId) {
      return Response.json({ error: 'Quote ID required' }, { status: 400 });
    }

    // Verify quote belongs to detailer
    const { data: quote } = await supabase
      .from('quotes')
      .select('id, detailer_id')
      .eq('id', quoteId)
      .single();

    if (!quote || quote.detailer_id !== user.id) {
      return Response.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Get change orders
    const { data: changeOrders, error } = await supabase
      .from('change_orders')
      .select('*')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: true });

    if (error) {
      if (error.code === '42P01') {
        return Response.json({ changeOrders: [] });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ changeOrders: changeOrders || [] });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST - Create a change order
export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { quote_id, services, amount, reason } = await request.json();

    if (!quote_id || !services || !amount) {
      return Response.json({ error: 'Quote ID, services, and amount required' }, { status: 400 });
    }

    // Get quote and verify ownership
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*, detailers (company_name, email)')
      .eq('id', quote_id)
      .single();

    if (quoteError || !quote) {
      return Response.json({ error: 'Quote not found' }, { status: 404 });
    }

    if (quote.detailer_id !== user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Create change order
    const { data: changeOrder, error } = await supabase
      .from('change_orders')
      .insert({
        quote_id,
        detailer_id: user.id,
        services,
        amount: parseFloat(amount),
        reason: reason || '',
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Generate approval link
    const approvalToken = `${changeOrder.id}-${Date.now().toString(36)}`;
    await supabase
      .from('change_orders')
      .update({ approval_token: approvalToken })
      .eq('id', changeOrder.id);

    // Send email to customer
    if (process.env.RESEND_API_KEY && quote.client_email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com';

      const servicesList = services.map(s =>
        `<li>${s.name || s.description}: $${(s.amount || s.price || 0).toFixed(2)}</li>`
      ).join('');

      await getResend().emails.send({
        from: 'Shiny Jets CRM <noreply@shinyjets.com>',
        to: quote.client_email,
        subject: `Additional Services Requested - ${quote.detailers?.company_name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1e3a5f;">Additional Services Requested</h2>

            <p>${quote.detailers?.company_name} has requested additional services for your job.</p>

            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Original Quote:</strong> ${quote.aircraft_model || quote.aircraft_type}</p>
              <p><strong>Original Total:</strong> $${(quote.total_price || 0).toFixed(2)}</p>
            </div>

            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #ffc107;">
              <h3 style="margin-top: 0; color: #856404;">Additional Services Requested</h3>
              <ul style="margin: 10px 0;">
                ${servicesList}
              </ul>
              ${reason ? `<p><strong>Note:</strong> ${reason}</p>` : ''}
              <p style="font-size: 18px; margin-bottom: 0;"><strong>Additional Amount: $${parseFloat(amount).toFixed(2)}</strong></p>
            </div>

            <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="font-size: 18px; margin: 0;"><strong>New Total: $${(parseFloat(quote.total_price || 0) + parseFloat(amount)).toFixed(2)}</strong></p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${appUrl}/change-order/${approvalToken}?action=approve"
                 style="display: inline-block; padding: 15px 30px; background: #22c55e; color: white; text-decoration: none; border-radius: 8px; margin: 0 10px; font-weight: bold;">
                Approve & Pay
              </a>
              <a href="${appUrl}/change-order/${approvalToken}?action=decline"
                 style="display: inline-block; padding: 15px 30px; background: #ef4444; color: white; text-decoration: none; border-radius: 8px; margin: 0 10px; font-weight: bold;">
                Decline
              </a>
            </div>

            <p style="color: #666; font-size: 12px; text-align: center;">
              Have questions? Reply to this email or contact your detailing professional directly.
            </p>
          </div>
        `,
      });
    }

    return Response.json({ success: true, changeOrder });

  } catch (err) {
    console.error('Change order error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// PUT - Update change order status (approve/decline)
export async function PUT(request) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { approval_token, action, payment_intent_id } = await request.json();

    if (!approval_token || !action) {
      return Response.json({ error: 'Approval token and action required' }, { status: 400 });
    }

    // Get change order
    const { data: changeOrder, error: coError } = await supabase
      .from('change_orders')
      .select('*, quotes (*, detailers (company_name, email))')
      .eq('approval_token', approval_token)
      .single();

    if (coError || !changeOrder) {
      return Response.json({ error: 'Change order not found' }, { status: 404 });
    }

    if (changeOrder.status !== 'pending') {
      return Response.json({ error: 'Change order already processed' }, { status: 400 });
    }

    const newStatus = action === 'approve' ? 'approved' : 'declined';

    // Update change order
    const { error: updateError } = await supabase
      .from('change_orders')
      .update({
        status: newStatus,
        payment_intent_id: payment_intent_id || null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', changeOrder.id);

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    // If approved, update quote total
    if (action === 'approve') {
      const newTotal = (changeOrder.quotes.total_price || 0) + changeOrder.amount;

      // Get existing line items and add new ones
      const existingItems = changeOrder.quotes.line_items || [];
      const newItems = changeOrder.services.map(s => ({
        service: s.name || s.description,
        description: s.description || s.name,
        amount: s.amount || s.price || 0,
        isChangeOrder: true,
        changeOrderId: changeOrder.id,
      }));

      await supabase
        .from('quotes')
        .update({
          total_price: newTotal,
          line_items: [...existingItems, ...newItems],
        })
        .eq('id', changeOrder.quote_id);
    }

    // Notify detailer
    if (process.env.RESEND_API_KEY && changeOrder.quotes?.detailers?.email) {
      await getResend().emails.send({
        from: 'Shiny Jets CRM <noreply@shinyjets.com>',
        to: changeOrder.quotes.detailers.email,
        subject: `Change Order ${newStatus === 'approved' ? 'Approved' : 'Declined'} - ${changeOrder.quotes.client_name || 'Customer'}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
            <h2 style="color: ${newStatus === 'approved' ? '#22c55e' : '#ef4444'};">
              Change Order ${newStatus === 'approved' ? 'Approved!' : 'Declined'}
            </h2>

            <p><strong>Customer:</strong> ${changeOrder.quotes.client_name || 'Unknown'}</p>
            <p><strong>Aircraft:</strong> ${changeOrder.quotes.aircraft_model || changeOrder.quotes.aircraft_type}</p>
            <p><strong>Amount:</strong> $${changeOrder.amount.toFixed(2)}</p>

            ${newStatus === 'approved' ? `
              <p style="color: #22c55e; font-weight: bold;">
                The customer has approved and paid for the additional services.
              </p>
            ` : `
              <p style="color: #ef4444;">
                The customer has declined the additional services. You may want to reach out to discuss.
              </p>
            `}
          </div>
        `,
      });
    }

    return Response.json({ success: true, status: newStatus });

  } catch (err) {
    console.error('Change order update error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
