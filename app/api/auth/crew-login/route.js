import { createClient } from '@supabase/supabase-js';
import { createToken, comparePassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { pin_code, email, password } = body;
    const supabase = getSupabase();
    let member = null;

    if (email && password) {
      // Email + password login (from invite acceptance)
      const { data, error } = await supabase
        .from('team_members')
        .select('id, detailer_id, name, email, type, hourly_pay, status, is_lead_tech, can_see_inventory, can_see_equipment, password_hash')
        .eq('email', email.toLowerCase().trim())
        .eq('status', 'active')
        .single();

      if (error || !data) {
        return Response.json({ error: 'Invalid email or password' }, { status: 401 });
      }
      if (!data.password_hash) {
        return Response.json({ error: 'No password set. Use PIN login or accept your invite first.' }, { status: 401 });
      }
      const valid = await comparePassword(password, data.password_hash);
      if (!valid) {
        return Response.json({ error: 'Invalid email or password' }, { status: 401 });
      }
      member = data;
    } else if (pin_code) {
      // PIN login — use .limit(1) instead of .single() in case of duplicate PINs
      const pinTrimmed = String(pin_code).trim();
      if (pinTrimmed.length < 4) {
        return Response.json({ error: 'PIN must be at least 4 digits' }, { status: 400 });
      }
      const { data, error } = await supabase
        .from('team_members')
        .select('id, detailer_id, name, email, type, hourly_pay, status, is_lead_tech, can_see_inventory, can_see_equipment')
        .eq('pin_code', pinTrimmed)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1);
      console.log('[crew-login] PIN attempt:', pinTrimmed, 'found:', data?.length, 'error:', error?.message);
      if (error || !data?.length) {
        return Response.json({ error: 'Invalid PIN' }, { status: 401 });
      }
      member = data[0];
    } else {
      return Response.json({ error: 'PIN or email+password required' }, { status: 400 });
    }

    if (!member) {
      return Response.json({ error: 'Login failed' }, { status: 401 });
    }

    // Get detailer company name for display
    const { data: detailer } = await supabase
      .from('detailers')
      .select('company, name')
      .eq('id', member.detailer_id)
      .single();

    // Create JWT with crew role
    const token = await createToken({
      id: member.id,
      detailer_id: member.detailer_id,
      name: member.name,
      role: 'crew',
      is_lead_tech: member.is_lead_tech || false,
      can_see_inventory: member.can_see_inventory || false,
      can_see_equipment: member.can_see_equipment || false,
    });

    return Response.json({
      token,
      user: {
        id: member.id,
        detailer_id: member.detailer_id,
        name: member.name,
        email: member.email,
        type: member.type,
        hourly_pay: member.hourly_pay || 0,
        role: 'crew',
        is_lead_tech: member.is_lead_tech || false,
        can_see_inventory: member.can_see_inventory || false,
        can_see_equipment: member.can_see_equipment || false,
        company: detailer?.company || detailer?.name || '',
      },
    });
  } catch (err) {
    console.error('Crew login error:', err);
    return Response.json({ error: 'Login failed' }, { status: 500 });
  }
}
