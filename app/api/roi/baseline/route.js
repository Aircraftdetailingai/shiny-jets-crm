import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Get user's baseline data
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

    const { data: baseline } = await supabase
      .from('detailer_baselines')
      .select('*')
      .eq('detailer_id', user.id)
      .single();

    return Response.json({
      baseline: baseline || null,
      hasBaseline: !!baseline,
    });

  } catch (err) {
    console.error('Baseline GET error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST - Save user's baseline data
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

    const body = await request.json();
    const {
      annual_revenue_estimate,
      quote_creation_time_minutes,
      quote_conversion_rate,
      admin_hours_per_week,
    } = body;

    // Get user's current hourly rate
    const { data: detailer } = await supabase
      .from('detailers')
      .select('default_labor_rate')
      .eq('id', user.id)
      .single();

    // Check if baseline exists
    const { data: existing } = await supabase
      .from('detailer_baselines')
      .select('id')
      .eq('detailer_id', user.id)
      .single();

    const baselineData = {
      detailer_id: user.id,
      annual_revenue_estimate: parseFloat(annual_revenue_estimate) || null,
      quote_creation_time_minutes: parseInt(quote_creation_time_minutes) || null,
      quote_conversion_rate: parseInt(quote_conversion_rate) || null,
      admin_hours_per_week: parseFloat(admin_hours_per_week) || null,
      hourly_rate_at_signup: detailer?.default_labor_rate || 75,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('detailer_baselines')
        .update(baselineData)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('detailer_baselines')
        .insert(baselineData)
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    return Response.json({
      success: true,
      baseline: result,
    });

  } catch (err) {
    console.error('Baseline POST error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
