import { getAuthUser } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@aircraftdetailing.ai',
  'admin@aircraftdetailing.ai',
  'brett@shinyjets.com',
];

const VALID_HOURS_FIELDS = [
  'ext_wash_hours', 'int_detail_hours', 'leather_hours', 'carpet_hours',
  'wax_hours', 'polish_hours', 'ceramic_hours', 'brightwork_hours',
  'decon_hours', 'spray_ceramic_hours',
];

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function isAdmin(request) {
  const user = await getAuthUser(request);
  if (!user) return null;
  if (!ADMIN_EMAILS.includes(user.email?.toLowerCase())) return null;
  return user;
}

// POST - Update aircraft default hours
export async function POST(request) {
  try {
    const user = await isAdmin(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();

    // Support single or bulk updates
    const updates = body.updates || [body];
    const reason = body.reason || '';
    const results = [];

    for (const update of updates) {
      const { aircraft_id, hours_field, new_value } = update;

      if (!aircraft_id || !hours_field || new_value === undefined) {
        results.push({ aircraft_id, error: 'Missing required fields' });
        continue;
      }

      // Whitelist check to prevent injection
      if (!VALID_HOURS_FIELDS.includes(hours_field)) {
        results.push({ aircraft_id, error: 'Invalid hours_field' });
        continue;
      }

      // Get current value
      const { data: aircraft } = await supabase
        .from('aircraft')
        .select(`id, manufacturer, model, ${hours_field}`)
        .eq('id', aircraft_id)
        .single();

      if (!aircraft) {
        results.push({ aircraft_id, error: 'Aircraft not found' });
        continue;
      }

      const oldValue = parseFloat(aircraft[hours_field]) || 0;
      const newVal = parseFloat(new_value);

      // Get current averages for audit
      const { data: avg } = await supabase
        .from('hours_averages')
        .select('avg_actual_hours, sample_count')
        .eq('aircraft_id', aircraft_id)
        .eq('hours_field', hours_field)
        .single();

      // Update aircraft table
      await supabase
        .from('aircraft')
        .update({ [hours_field]: newVal })
        .eq('id', aircraft_id);

      // Log the change
      await supabase.from('default_hours_updates').insert({
        aircraft_id,
        hours_field,
        old_value: oldValue,
        new_value: newVal,
        reason: update.reason || reason,
        avg_actual_at_time: avg ? parseFloat(avg.avg_actual_hours) : null,
        sample_count_at_time: avg ? avg.sample_count : null,
        updated_by: user.email,
      });

      results.push({
        aircraft_id,
        aircraft: `${aircraft.manufacturer} ${aircraft.model}`,
        hours_field,
        old_value: oldValue,
        new_value: newVal,
        success: true,
      });
    }

    const successCount = results.filter(r => r.success).length;
    return Response.json({ success: true, updated: successCount, results });
  } catch (err) {
    console.error('Update default error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
