import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import jwt from 'jsonwebtoken';

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

const JWT_SECRET = process.env.JWT_SECRET || 'customer-portal-secret-key';

function getCustomerFromToken(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type !== 'customer') return null;
    return decoded;
  } catch {
    return null;
  }
}

// GET - Get messages for customer
export async function GET(request) {
  try {
    const customer = getCustomerFromToken(request);
    if (!customer) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const detailerId = searchParams.get('detailer_id');

    let query = supabase
      .from('customer_messages')
      .select(`
        *,
        detailers (id, company_name, logo)
      `)
      .eq('customer_email', customer.email.toLowerCase())
      .order('created_at', { ascending: true });

    if (detailerId) {
      query = query.eq('detailer_id', detailerId);
    }

    const { data: messages, error } = await query;

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Mark messages as read
    await supabase
      .from('customer_messages')
      .update({ read: true })
      .eq('customer_email', customer.email.toLowerCase())
      .eq('sender', 'detailer')
      .eq('read', false);

    return Response.json({ messages: messages || [] });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST - Send message to detailer
export async function POST(request) {
  try {
    const customer = getCustomerFromToken(request);
    if (!customer) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { detailer_id, message, quote_id } = await request.json();

    if (!detailer_id || !message) {
      return Response.json({ error: 'Detailer ID and message required' }, { status: 400 });
    }

    // Get detailer info
    const { data: detailer } = await supabase
      .from('detailers')
      .select('id, email, company_name')
      .eq('id', detailer_id)
      .single();

    if (!detailer) {
      return Response.json({ error: 'Detailer not found' }, { status: 404 });
    }

    // Save message
    const { data: newMessage, error } = await supabase
      .from('customer_messages')
      .insert({
        detailer_id,
        customer_email: customer.email.toLowerCase(),
        customer_name: customer.name,
        quote_id,
        message,
        sender: 'customer',
        read: false,
      })
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Notify detailer via email
    if (process.env.RESEND_API_KEY && detailer.email) {
      await getResend().emails.send({
        from: 'Shiny Jets CRM <noreply@shinyjets.com>',
        to: detailer.email,
        subject: `New message from ${customer.name || customer.email}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1e3a5f;">New Customer Message</h2>
            <p><strong>From:</strong> ${customer.name || customer.email}</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
              ${message}
            </div>
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com'}/dashboard"
               style="display: inline-block; padding: 12px 24px; background: #f59e0b; color: white; text-decoration: none; border-radius: 8px;">
              Reply in Dashboard
            </a>
          </div>
        `,
      });
    }

    return Response.json({ success: true, message: newMessage });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
