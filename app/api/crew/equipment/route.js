import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

async function getCrewUser(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const payload = await verifyToken(authHeader.slice(7));
  if (!payload || payload.role !== 'crew') return null;
  return payload;
}

// GET - List equipment (no costs shown to crew)
export async function GET(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  if (!user.can_see_equipment) {
    return Response.json({ error: 'No equipment access' }, { status: 403 });
  }

  const supabase = getSupabase();

  const { data: equipment, error } = await supabase
    .from('equipment')
    .select('id, name, category, brand, model, status, maintenance_notes, next_maintenance, image_url')
    .eq('detailer_id', user.detailer_id)
    .order('name', { ascending: true });

  if (error) {
    console.error('Crew equipment fetch error:', error);
    return Response.json({ error: 'Failed to fetch equipment' }, { status: 500 });
  }

  // Strip cost fields - crew never sees pricing
  const sanitized = (equipment || []).map(e => ({
    id: e.id,
    name: e.name,
    category: e.category,
    brand: e.brand,
    model: e.model,
    status: e.status,
    maintenance_notes: e.maintenance_notes,
    needs_maintenance: e.next_maintenance && new Date(e.next_maintenance) <= new Date(),
    next_maintenance: e.next_maintenance,
    image_url: e.image_url,
  }));

  return Response.json({ equipment: sanitized });
}

// POST - Report an equipment issue
export async function POST(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  if (!user.can_see_equipment) {
    return Response.json({ error: 'No equipment access' }, { status: 403 });
  }

  const { equipment_id, issue } = await request.json();

  if (!equipment_id || !issue) {
    return Response.json({ error: 'equipment_id and issue are required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Verify equipment belongs to crew's detailer
  const { data: equip } = await supabase
    .from('equipment')
    .select('id, maintenance_notes')
    .eq('id', equipment_id)
    .eq('detailer_id', user.detailer_id)
    .single();

  if (!equip) return Response.json({ error: 'Equipment not found' }, { status: 404 });

  const timestamp = new Date().toISOString().split('T')[0];
  const newNote = `[${timestamp} - ${user.name}] ${issue}`;
  const updatedNotes = equip.maintenance_notes
    ? `${newNote}\n${equip.maintenance_notes}`
    : newNote;

  const { error } = await supabase
    .from('equipment')
    .update({
      status: 'needs_repair',
      maintenance_notes: updatedNotes,
    })
    .eq('id', equipment_id);

  if (error) {
    console.error('Report equipment issue error:', error);
    return Response.json({ error: 'Failed to report issue' }, { status: 500 });
  }

  return Response.json({ success: true });
}
