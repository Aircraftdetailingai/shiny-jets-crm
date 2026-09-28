import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { nanoid } from 'nanoid';
import { requireFeature } from '@/lib/plan-gate';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - List campaigns
export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const planGate = await requireFeature(request, 'marketing', { user: user });
    if (planGate) return planGate;

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { data, error } = await supabase
      .from('marketing_campaigns')
      .select('*')
      .eq('detailer_id', user.detailer_id || user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Campaigns fetch error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ campaigns: data || [] });
  } catch (err) {
    console.error('Marketing GET error:', err);
    return Response.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
  }
}

// POST - Create campaign
export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const planGate = await requireFeature(request, 'marketing', { user: user });
    if (planGate) return planGate;

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json();
    const { name, subject, template_type, content, segment, scheduled_at } = body;

    if (!name || !subject || !content) {
      return Response.json({ error: 'Name, subject, and content are required' }, { status: 400 });
    }

    // Count recipients based on segment
    const recipientCount = await countRecipients(supabase, user.id, segment || 'all');

    const row = {
      detailer_id: user.detailer_id || user.id,
      name,
      subject,
      template_type: template_type || 'promotional',
      content,
      segment: segment || 'all',
      status: scheduled_at ? 'scheduled' : 'draft',
      scheduled_at: scheduled_at || null,
      recipient_count: recipientCount,
      sent_count: 0,
      open_count: 0,
      unsubscribe_token: nanoid(12),
    };

    // Insert with retry for missing columns
    let insertRow = { ...row };
    let data, error;

    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await supabase.from('marketing_campaigns').insert(insertRow).select().single();
      data = result.data;
      error = result.error;

      if (!error) break;

      const colMatch = error.message?.match(/column "([^"]+)" of relation "marketing_campaigns" does not exist/)
        || error.message?.match(/Could not find the '([^']+)' column of 'marketing_campaigns'/);
      if (colMatch) {
        delete insertRow[colMatch[1]];
        continue;
      }
      break;
    }

    if (error) {
      console.error('Campaign create error:', JSON.stringify(error));
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ campaign: data }, { status: 201 });
  } catch (err) {
    console.error('Marketing POST error:', err);
    return Response.json({ error: 'Failed to create campaign' }, { status: 500 });
  }
}

async function countRecipients(supabase, detailerId, segment) {
  try {
    let query = supabase
      .from('quotes')
      .select('client_email', { count: 'exact', head: false })
      .eq('detailer_id', detailerId)
      .not('client_email', 'is', null)
      .neq('client_email', '');

    if (segment === 'paid') {
      query = query.in('status', ['paid', 'completed']);
    } else if (segment === 'pending') {
      query = query.eq('status', 'sent');
    } else if (segment === 'repeat') {
      // Customers with 2+ quotes
      const { data } = await supabase
        .from('quotes')
        .select('client_email')
        .eq('detailer_id', detailerId)
        .not('client_email', 'is', null)
        .neq('client_email', '');

      if (data) {
        const counts = {};
        data.forEach(q => { if (q.client_email) counts[q.client_email] = (counts[q.client_email] || 0) + 1; });
        return Object.values(counts).filter(c => c >= 2).length;
      }
      return 0;
    }

    const { data, count } = await query;
    // Deduplicate emails
    if (data) {
      const unique = new Set(data.map(q => q.client_email?.toLowerCase()).filter(Boolean));
      return unique.size;
    }
    return count || 0;
  } catch {
    return 0;
  }
}
