import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { prepareImportedService } from '@/lib/service-defaults';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// POST - Import multiple services at once
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
    const { services } = body;

    if (!services || !Array.isArray(services) || services.length === 0) {
      return Response.json({ error: 'No services provided' }, { status: 400 });
    }

    const toInsert = services.map(svc => {
      const prepared = prepareImportedService(svc);
      const row = {
        detailer_id: user.detailer_id || user.id,
        name: prepared.name,
        description: prepared.description || '',
        hourly_rate: prepared.hourly_rate || 0,
      };
      if (prepared.hours_field) row.hours_field = prepared.hours_field;
      if (prepared.category) row.category = prepared.category;
      if (prepared.default_hours) row.default_hours = prepared.default_hours;
      return row;
    });

    // Column-stripping retry
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: insertedServices, error } = await supabase
        .from('services')
        .insert(toInsert)
        .select();

      if (!error) {
        return Response.json({ services: insertedServices || [] }, { status: 201 });
      }

      const colMatch = error.message?.match(/column "([^"]+)".*does not exist/)
        || error.message?.match(/Could not find the '([^']+)' column/);
      if (colMatch) {
        for (const row of toInsert) { delete row[colMatch[1]]; }
        continue;
      }

      console.error('Failed to import services:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ error: 'Failed to import services after retries' }, { status: 500 });

  } catch (err) {
    console.error('Services import error:', err);
    return Response.json({ error: 'Failed to import services' }, { status: 500 });
  }
}
