import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request) {
  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const manufacturer = searchParams.get('manufacturer') || searchParams.get('make');
  const category = searchParams.get('category');

  let query = supabase
    .from('aircraft')
    .select('id, manufacturer, model, category, seats, surface_area_sqft')
    .order('model');

  if (manufacturer) query = query.eq('manufacturer', manufacturer);
  if (category) query = query.eq('category', category);

  const { data, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch models' }), { status: 500 });
  }

  let models = (data || []).map(m => ({ ...m, custom: false }));

  // If authenticated, include custom aircraft models
  const user = await getAuthUser(request);
  if (user?.id) {
    let customQuery = supabase
      .from('custom_aircraft')
      .select('id, manufacturer, model, category')
      .eq('detailer_id', user.id)
      .order('model');

    if (manufacturer) customQuery = customQuery.eq('manufacturer', manufacturer);
    if (category) customQuery = customQuery.eq('category', category);

    const { data: customData } = await customQuery;

    if (customData) {
      models = [...models, ...customData.map(c => ({
        id: c.id, manufacturer: c.manufacturer, model: c.model,
        category: c.category, custom: true,
      }))];
    }
  }

  return new Response(JSON.stringify({ models }), { status: 200 });
}
