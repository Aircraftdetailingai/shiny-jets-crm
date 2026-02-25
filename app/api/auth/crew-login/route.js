import { createClient } from '@supabase/supabase-js';
import { createToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  try {
    const { pin_code } = await request.json();

    if (!pin_code || pin_code.length < 4) {
      return Response.json({ error: 'PIN must be at least 4 digits' }, { status: 400 });
    }

    const supabase = getSupabase();

    // Look up active team member by PIN
    const { data: member, error } = await supabase
      .from('team_members')
      .select('id, detailer_id, name, email, type, status, is_lead_tech, can_see_inventory, can_see_equipment')
      .eq('pin_code', pin_code)
      .eq('status', 'active')
      .single();

    if (error || !member) {
      return Response.json({ error: 'Invalid PIN' }, { status: 401 });
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
        type: member.type,
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
