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

// GET - Get leads for detailer
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
    const status = searchParams.get('status');

    let query = supabase
      .from('intake_leads')
      .select('*')
      .eq('detailer_id', user.id)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: leads, error } = await query;

    if (error) {
      if (error.code === '42P01') {
        return Response.json({ leads: [] });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ leads: leads || [] });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST - Create lead (from widget) or update lead status
export async function POST(request) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'create_from_widget') {
      // Widget creating a new lead
      const { detailer_id, customer_name, customer_email, customer_phone, answers, source } = body;

      if (!detailer_id) {
        return Response.json({ error: 'Detailer ID required' }, { status: 400 });
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

      // Create lead
      const { data: lead, error } = await supabase
        .from('intake_leads')
        .insert({
          detailer_id,
          customer_name: customer_name || 'Unknown',
          customer_email: customer_email || null,
          customer_phone: customer_phone || null,
          answers: answers || {},
          source: source || 'widget',
          status: 'new',
        })
        .select()
        .single();

      if (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }

      // Notify detailer
      if (process.env.RESEND_API_KEY && detailer.email) {
        // Format answers for email
        const answersList = Object.entries(answers || {})
          .map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`)
          .join('');

        await getResend().emails.send({
          from: 'Vector <noreply@aircraftdetailing.ai>',
          to: detailer.email,
          subject: `New Lead: ${customer_name || 'Website Visitor'}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #1e3a5f;">New Lead from Your Website!</h2>

              <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <p><strong>Name:</strong> ${customer_name || 'Not provided'}</p>
                <p><strong>Email:</strong> ${customer_email || 'Not provided'}</p>
                <p><strong>Phone:</strong> ${customer_phone || 'Not provided'}</p>
              </div>

              ${answersList ? `
                <h3>Answers:</h3>
                <ul style="background: #f5f5f5; padding: 15px 15px 15px 35px; border-radius: 8px;">
                  ${answersList}
                </ul>
              ` : ''}

              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.aircraftdetailing.ai'}/dashboard?tab=leads"
                 style="display: inline-block; padding: 12px 24px; background: #f59e0b; color: white; text-decoration: none; border-radius: 8px; margin-top: 15px;">
                View Lead & Create Quote
              </a>
            </div>
          `,
        });
      }

      return Response.json({ success: true, lead });
    }

    if (action === 'update_status') {
      // Detailer updating lead status
      const user = await getAuthUser(request);
      if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const { lead_id, status } = body;

      const { data: lead, error } = await supabase
        .from('intake_leads')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', lead_id)
        .eq('detailer_id', user.id)
        .select()
        .single();

      if (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }

      return Response.json({ success: true, lead });
    }

    if (action === 'convert_to_quote') {
      // Convert lead to a quote
      const user = await getAuthUser(request);
      if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const { lead_id } = body;

      // Get lead
      const { data: lead, error: leadError } = await supabase
        .from('intake_leads')
        .select('*')
        .eq('id', lead_id)
        .eq('detailer_id', user.id)
        .single();

      if (leadError || !lead) {
        return Response.json({ error: 'Lead not found' }, { status: 404 });
      }

      // Create quote from lead
      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .insert({
          detailer_id: user.id,
          customer_name: lead.customer_name,
          customer_email: lead.customer_email,
          customer_phone: lead.customer_phone,
          aircraft_type: lead.answers?.aircraft_type || lead.answers?.services || '',
          tail_number: lead.answers?.tail_number || '',
          location: lead.answers?.location || '',
          notes: `Lead from website intake:\n${JSON.stringify(lead.answers, null, 2)}`,
          status: 'draft',
          share_link: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        })
        .select()
        .single();

      if (quoteError) {
        return Response.json({ error: quoteError.message }, { status: 500 });
      }

      // Update lead status
      await supabase
        .from('intake_leads')
        .update({ status: 'converted', quote_id: quote.id })
        .eq('id', lead_id);

      return Response.json({ success: true, quote });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// DELETE - Delete a lead
export async function DELETE(request) {
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
    const leadId = searchParams.get('id');

    if (!leadId) {
      return Response.json({ error: 'Lead ID required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('intake_leads')
      .delete()
      .eq('id', leadId)
      .eq('detailer_id', user.id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
