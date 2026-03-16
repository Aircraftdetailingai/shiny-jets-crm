import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getUser(request) {
  try {
    const cookieStore = await cookies();
    const authCookie = cookieStore.get('auth_token')?.value;
    if (authCookie) {
      const user = await verifyToken(authCookie);
      if (user) return user;
    }
  } catch (e) {}
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return await verifyToken(authHeader.slice(7));
  }
  return null;
}

// GET - Get all services for a detailer
export async function GET(request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    // Fetch from primary services table
    const { data: services, error } = await supabase
      .from('services')
      .select('*')
      .eq('detailer_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch services:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    let mergedServices = services || [];

    // Merge default_hours from detailer_services if services are missing them
    const needsMerge = mergedServices.some(s => s.default_hours == null);
    if (needsMerge) {
      try {
        const { data: detailerServices } = await supabase
          .from('detailer_services')
          .select('service_name, db_field, default_hours, hourly_rate')
          .eq('detailer_id', user.id)
          .eq('enabled', true);

        if (detailerServices && detailerServices.length > 0) {
          mergedServices = mergedServices.map(svc => {
            if (svc.default_hours != null) return svc;

            // Match by hours_field == db_field first, then by name
            const match = detailerServices.find(ds =>
              (svc.hours_field && ds.db_field && svc.hours_field === ds.db_field) ||
              ds.service_name?.toLowerCase() === svc.name?.toLowerCase()
            );

            if (match && match.default_hours != null) {
              return { ...svc, default_hours: match.default_hours };
            }
            return svc;
          });
        }
      } catch (e) {
        // detailer_services table may not exist — that's fine, skip merge
      }
    }

    return Response.json({ services: mergedServices });

  } catch (err) {
    console.error('Services GET error:', err);
    return Response.json({ error: 'Failed to fetch services' }, { status: 500 });
  }
}

// POST - Create a new service
export async function POST(request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { name, description, hourly_rate, hours_field, product_cost_per_hour, product_notes, default_hours } = body;

    if (!name) {
      return Response.json({ error: 'Name is required' }, { status: 400 });
    }

    const row = {
      detailer_id: user.id,
      name,
      description: description || '',
      hourly_rate: parseFloat(hourly_rate) || 0,
    };

    // Add hours_field if provided (column may not exist yet in DB - that's OK)
    if (hours_field) {
      row.hours_field = hours_field;
    }
    if (default_hours !== undefined && default_hours !== null) {
      row.default_hours = parseFloat(default_hours) || null;
    }
    if (product_cost_per_hour !== undefined) {
      row.product_cost_per_hour = parseFloat(product_cost_per_hour) || 0;
    }
    if (product_notes !== undefined) {
      row.product_notes = product_notes || '';
    }

    const { data: service, error } = await supabase
      .from('services')
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error('Failed to create service:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ service }, { status: 201 });

  } catch (err) {
    console.error('Services POST error:', err);
    return Response.json({ error: 'Failed to create service' }, { status: 500 });
  }
}
