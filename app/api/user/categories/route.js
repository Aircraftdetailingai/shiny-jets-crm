import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Default categories with suggested services for aircraft detailing
const DEFAULT_CATEGORIES = [
  {
    name: 'Exterior',
    key: 'exterior',
    order: 1,
    services: [
      { name: 'Maintenance Wash', hours: 2, rate: 75, description: 'Clean landing gear, remove engine oil/exhaust soot/bugs, dry wash all exterior painted surfaces' },
      { name: 'Decontamination Wash', hours: 2.5, rate: 85, description: 'Clay bar treatment to remove embedded contaminants' },
      { name: 'One-Step Polish', hours: 4, rate: 95, description: 'Machine polish to remove light scratches and oxidation' },
      { name: 'Wax', hours: 2, rate: 85, description: 'Hand-applied carnauba wax protection' },
      { name: 'Spray Ceramic', hours: 1.5, rate: 90, description: 'Sprayable ceramic coating for 3-6 month protection' },
      { name: 'Ceramic Coating', hours: 8, rate: 125, description: 'Professional ceramic coating for 2+ year protection' },
    ],
  },
  {
    name: 'Interior',
    key: 'interior',
    order: 2,
    services: [
      { name: 'Vacuum & Wipe Down', hours: 1.5, rate: 75, description: 'Vacuum all carpets, wipe down hard surfaces' },
      { name: 'Carpet Extraction', hours: 2, rate: 85, description: 'Deep clean and extract carpets' },
      { name: 'Leather Clean & Condition', hours: 1.5, rate: 85, description: 'Clean and condition all leather surfaces' },
      { name: 'Transparencies', hours: 0.5, rate: 75, description: 'Clean all transparencies (windows, windshield, lenses)' },
    ],
  },
  {
    name: 'Brightwork',
    key: 'brightwork',
    order: 3,
    services: [
      { name: 'Polish Brightwork', hours: 3, rate: 95, description: 'Polish all chrome and metal trim' },
      { name: 'Protect Brightwork', hours: 1, rate: 85, description: 'Apply protective coating to brightwork' },
    ],
  },
  {
    name: 'Packages',
    key: 'packages',
    order: 4,
    services: [
      { name: 'Bronze', hours: 3, rate: 75, description: 'Exterior wash + interior vacuum & wipe down' },
      { name: 'Silver', hours: 5, rate: 80, description: 'Bronze + carpet extraction + leather conditioning' },
      { name: 'Gold', hours: 7, rate: 85, description: 'Silver + wax' },
      { name: 'Platinum', hours: 10, rate: 90, description: 'Silver + decon + polish + spray ceramic' },
      { name: 'Shiny Jet', hours: 14, rate: 100, description: 'Silver + decon + polish + pro ceramic coating' },
    ],
  },
];

// GET - Get user's categories
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

    // Get categories
    const { data: categories, error } = await supabase
      .from('service_categories')
      .select('*')
      .eq('detailer_id', user.id)
      .order('display_order', { ascending: true });

    if (error) {
      // If table doesn't exist, return empty with defaults available
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return Response.json({
          categories: [],
          defaults: DEFAULT_CATEGORIES,
          tableNotCreated: true
        });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Return actual categories (empty array if none), plus defaults for importing
    return Response.json({
      categories: categories || [],
      defaults: DEFAULT_CATEGORIES
    });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST - Create a new category
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

    const { name } = await request.json();
    if (!name) {
      return Response.json({ error: 'Category name required' }, { status: 400 });
    }

    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

    // Get max order
    const { data: existing } = await supabase
      .from('service_categories')
      .select('display_order')
      .eq('detailer_id', user.id)
      .order('display_order', { ascending: false })
      .limit(1);

    const nextOrder = (existing?.[0]?.display_order || 0) + 1;

    const { data: category, error } = await supabase
      .from('service_categories')
      .insert({
        detailer_id: user.id,
        name,
        key,
        display_order: nextOrder,
      })
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ category }, { status: 201 });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// PUT - Update a category
export async function PUT(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { id, name, display_order } = await request.json();
    if (!id) {
      return Response.json({ error: 'Category ID required' }, { status: 400 });
    }

    const updates = {};
    if (name) updates.name = name;
    if (display_order !== undefined) updates.display_order = display_order;

    const { data: category, error } = await supabase
      .from('service_categories')
      .update(updates)
      .eq('id', id)
      .eq('detailer_id', user.id)
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ category });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// DELETE - Delete a category
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

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return Response.json({ error: 'Category ID required' }, { status: 400 });
    }

    // Delete category (services will need to be reassigned or deleted separately)
    const { error } = await supabase
      .from('service_categories')
      .delete()
      .eq('id', id)
      .eq('detailer_id', user.id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
