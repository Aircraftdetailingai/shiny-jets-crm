import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getAuthUser } from '@/lib/auth';
import { resolveDetailerId } from '@/lib/resolve-detailer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

let _resend;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');
  return _resend;
}

// no-store fetch (d7b2d9e) — Next's Data Cache otherwise serves stale
// intake_leads snapshots inside the Function runtime, which is what made
// Brett's Requests page render zero leads while 10 rows existed in DB.
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { fetch: (u, opts) => fetch(u, { ...opts, cache: 'no-store' }) },
  });
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

    const detailerId = await resolveDetailerId(supabase, user);
    console.log('[requests-list] resolved detailerId:', detailerId, 'user.id:', user.id, 'user.detailer_id:', user.detailer_id, 'role:', user.role || 'owner');

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = supabase
      .from('intake_leads')
      .select('*')
      .eq('detailer_id', detailerId)
      .order('created_at', { ascending: false });

    const id = searchParams.get('id');
    if (id) {
      query = query.eq('id', id);
    }
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

    // Surface a draft_quote_id per lead for the Requests row badge.
    let enriched = leads || [];
    if (enriched.length > 0) {
      const leadIds = enriched.map(l => l.id);
      const { data: drafts } = await supabase
        .from('quotes')
        .select('id, lead_id')
        .in('lead_id', leadIds)
        .eq('status', 'draft');
      const byLead = new Map((drafts || []).map(d => [d.lead_id, d.id]));
      enriched = enriched.map(l => ({ ...l, draft_quote_id: byLead.get(l.id) || null }));
    }

    console.log('[requests-list] returned rows:', enriched.length);
    return new Response(JSON.stringify({ leads: enriched }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' },
    });

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
        .select('id, email, company')
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
          from: 'Shiny Jets CRM <noreply@mail.shinyjets.com>',
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

              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com'}/dashboard?tab=leads"
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

      const detailerId = await resolveDetailerId(supabase, user);
      const { lead_id, status } = body;

      const updateData = { status };
      try { updateData.updated_at = new Date().toISOString(); } catch {}

      const { data: lead, error } = await supabase
        .from('intake_leads')
        .update(updateData)
        .eq('id', lead_id)
        .eq('detailer_id', detailerId)
        .select()
        .single();

      // Retry without updated_at if column doesn't exist
      if (error && error.message?.includes('column')) {
        const { data: retry, error: retryErr } = await supabase
          .from('intake_leads')
          .update({ status })
          .eq('id', lead_id)
          .eq('detailer_id', detailerId)
          .select()
          .single();
        if (retryErr) return Response.json({ error: retryErr.message }, { status: 500 });
        return Response.json({ success: true, lead: retry });
      }

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

      const detailerId = await resolveDetailerId(supabase, user);
      const { lead_id } = body;

      // Get lead
      const { data: lead, error: leadError } = await supabase
        .from('intake_leads')
        .select('*')
        .eq('id', lead_id)
        .eq('detailer_id', detailerId)
        .single();

      if (leadError || !lead) {
        return Response.json({ error: 'Lead not found' }, { status: 404 });
      }

      // Create quote from lead, linked via quotes.lead_id (parent ← child FK).
      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .insert({
          detailer_id: detailerId,
          lead_id: lead.id,
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

      // Lead status transitions to 'reviewed' on draft creation, NOT 'quoted'.
      // 'quoted' fires only when the send endpoint succeeds (quotes/[id]/send).
      await supabase
        .from('intake_leads')
        .update({ status: 'reviewed' })
        .eq('id', lead_id);

      return Response.json({ success: true, quote });
    }

    // No action field — treat as direct quote request submission
    // PUBLIC PATH: no Authorization header required. detailer_id arrives in
    // the body after the public form resolves slug → detailer via
    // /api/detailers/resolve. Photo URLs are pre-uploaded by the public
    // /api/lead-intake/upload-photos endpoint (also unauthenticated).
    if (body.detailer_id && (body.name || body.email)) {
      const { detailer_id, name, email, phone, aircraft_model, tail_number, airport, services_requested, notes, photo_urls, sms_opted_in, intake_responses, source } = body;

      console.log('[public-quote-request] detailer_id:', detailer_id, 'source:', source, 'photos:', Array.isArray(photo_urls) ? photo_urls.length : 0, 'name:', name, 'email:', email);

      // Dedupe: public forms can double-submit (retry / double-tap). If a lead
      // with the same detailer_id + lower(email) was created in the last 2
      // minutes, return it instead of inserting a duplicate.
      if (email) {
        const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        const { data: recentLeads, error: dupeErr } = await supabase
          .from('intake_leads')
          .select('*')
          .eq('detailer_id', detailer_id)
          .gte('created_at', since)
          .order('created_at', { ascending: false });
        if (dupeErr) console.error('[public-quote-request] dedupe check failed:', dupeErr.message);
        const match = (recentLeads || []).find(l => (l.email || '').toLowerCase() === email.toLowerCase());
        if (match) {
          console.log(`[public-quote-request] dedupe HIT — returning existing lead ${match.id} for detailer ${detailer_id} email ${email}`);
          return Response.json({ success: true, lead: match, deduped: true });
        }
      }

      const { data: lead, error } = await supabase
        .from('intake_leads')
        .insert({
          detailer_id,
          name: name || '',
          email: email || null,
          phone: phone || null,
          aircraft_model: aircraft_model || null,
          tail_number: tail_number || null,
          airport: airport || null,
          services_requested: services_requested || null,
          notes: notes || null,
          photo_urls: photo_urls || null,
          intake_responses: intake_responses || null,
          sms_opted_in: sms_opted_in || false,
          source: source || 'quote_request',
          status: 'new',
        })
        .select()
        .single();

      if (error) {
        console.error('[public-quote-request] insert error:', error.message, 'detailer_id:', detailer_id);
        return Response.json({ error: error.message }, { status: 500 });
      }

      console.log('[public-quote-request] inserted lead:', lead?.id, 'for detailer:', detailer_id);

      // Send emails (non-blocking — don't hold up the response)
      if (process.env.RESEND_API_KEY) {
        supabase.from('detailers').select('email, company, phone').eq('id', detailer_id).single()
          .then(({ data: detailer }) => {
            const companyName = detailer?.company || 'Your Aircraft Detailer';
            const detailerEmail = detailer?.email;
            const detailerPhone = detailer?.phone;

            const emails = [];

            // 1. Notify detailer
            if (detailerEmail) {
              const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com';
              emails.push(getResend().emails.send({
                from: process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>',
                to: detailerEmail,
                subject: `New Quote Request: ${name || 'Customer'} - ${aircraft_model || 'Aircraft'}`,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #007CB1;">New Quote Request</h2>
                    <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
                      <p><strong>Customer:</strong> ${name || 'Not provided'}</p>
                      <p><strong>Email:</strong> ${email || 'Not provided'}</p>
                      <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
                      <p><strong>Aircraft:</strong> ${aircraft_model || 'Not specified'}</p>
                      ${tail_number ? `<p><strong>Tail:</strong> ${tail_number}</p>` : ''}
                      ${airport ? `<p><strong>Airport:</strong> ${airport}</p>` : ''}
                      <p><strong>Service:</strong> ${services_requested || 'Not specified'}</p>
                      ${notes ? `<p><strong>Notes:</strong><br/>${notes.replace(/\n/g, '<br/>')}</p>` : ''}
                      ${photo_urls?.length ? `<p><strong>Photos:</strong> ${photo_urls.length} uploaded</p>` : ''}
                    </div>
                    <a href="${appUrl}/dashboard?tab=leads" style="display: inline-block; padding: 12px 24px; background: #007CB1; color: white; text-decoration: none; border-radius: 8px; margin-top: 15px;">
                      View Lead &amp; Create Quote
                    </a>
                  </div>
                `,
              }));
            }

            // 2. Send customer confirmation
            if (email) {
              const firstName = (name || '').split(' ')[0] || 'there';
              const aircraftDesc = aircraft_model || tail_number || 'your aircraft';
              emails.push(getResend().emails.send({
                from: `${companyName} via Shiny Jets CRM <noreply@mail.shinyjets.com>`,
                replyTo: detailerEmail || undefined,
                to: email,
                subject: "We got your request — here's what happens next",
                html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:32px 20px;">
  <div style="background:#ffffff;border-radius:12px;padding:36px 28px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <h1 style="font-size:20px;color:#1a1a1a;margin:0 0 20px 0;font-weight:600;">We got your request</h1>
    <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 16px 0;">Hi ${firstName},</p>
    <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 16px 0;">Thanks for reaching out. We received your detailing request for <strong>${aircraftDesc}</strong> and we're on it.</p>
    <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 8px 0;font-weight:600;">Here's what happens next:</p>
    <ul style="font-size:15px;color:#333;line-height:1.8;margin:0 0 20px 0;padding-left:20px;">
      <li>We'll review your request and put together a detailed quote</li>
      <li>You'll receive your quote by email with a link to review, approve, and pay online</li>
      <li>Once approved we'll reach out to confirm your schedule</li>
    </ul>
    <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 24px 0;">If you have any questions in the meantime, just reply to this email.</p>
    <div style="border-top:1px solid #eee;padding-top:20px;margin-top:8px;">
      <p style="font-size:15px;color:#1a1a1a;margin:0 0 4px 0;font-weight:600;">${companyName}</p>
      ${detailerPhone ? `<p style="font-size:14px;color:#555;margin:0 0 2px 0;">${detailerPhone}</p>` : ''}
      ${detailerEmail ? `<p style="font-size:14px;color:#555;margin:0;">${detailerEmail}</p>` : ''}
    </div>
  </div>
</div>
</body></html>`,
              }));
            }

            return Promise.all(emails);
          })
          .catch(err => console.error('Lead emails failed:', err));
      }

      return Response.json({ success: true, lead });
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

    const detailerId = await resolveDetailerId(supabase, user);
    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get('id');

    if (!leadId) {
      return Response.json({ error: 'Lead ID required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('intake_leads')
      .delete()
      .eq('id', leadId)
      .eq('detailer_id', detailerId);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
