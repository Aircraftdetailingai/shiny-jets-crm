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

const EQUIPMENT_CATEGORIES = [
  'polisher',
  'extractor',
  'pressure_washer',
  'vacuum',
  'steamer',
  'lighting',
  'lift',
  'generator',
  'compressor',
  'other',
];

const CATEGORY_LABELS = {
  polisher: 'Polisher',
  extractor: 'Extractor',
  pressure_washer: 'Pressure Washer',
  vacuum: 'Vacuum',
  steamer: 'Steamer',
  lighting: 'Lighting',
  lift: 'Lift/Ladder',
  generator: 'Generator',
  compressor: 'Compressor',
  other: 'Other',
};

// Helper: retry insert/update, stripping unknown columns
async function retryStrippingColumns(supabase, table, operation, row, matchCols) {
  let data, error;
  for (let attempt = 0; attempt < 10; attempt++) {
    let result;
    if (operation === 'insert') {
      result = await supabase.from(table).insert(row).select().single();
    } else {
      let q = supabase.from(table).update(row);
      for (const [col, val] of Object.entries(matchCols)) {
        q = q.eq(col, val);
      }
      result = await q.select().single();
    }
    data = result.data;
    error = result.error;
    if (!error) break;

    const colMatch = error.message?.match(/column "([^"]+)" of relation "[^"]+" does not exist/)
      || error.message?.match(/Could not find the '([^']+)' column of '[^']+'/);
    if (colMatch) {
      delete row[colMatch[1]];
      continue;
    }
    break;
  }
  return { data, error };
}

// GET - Get user's equipment with ROI calculations
export async function GET(request) {
  const user = await getUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { data: equipment } = await supabase
    .from('equipment')
    .select('*')
    .eq('detailer_id', user.id)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  const now = new Date();

  // Calculate ROI and maintenance alerts
  const equipmentWithROI = (equipment || []).map(item => {
    const costPerJob = item.jobs_completed > 0
      ? (item.purchase_price || 0) / item.jobs_completed
      : null;

    // Maintenance due check
    let maintenanceDue = false;
    let maintenanceOverdue = false;
    if (item.next_maintenance) {
      const maintDate = new Date(item.next_maintenance);
      const daysUntil = Math.ceil((maintDate - now) / (1000 * 60 * 60 * 24));
      maintenanceDue = daysUntil <= 7 && daysUntil >= 0;
      maintenanceOverdue = daysUntil < 0;
    }

    // Warranty check
    let warrantyActive = false;
    if (item.warranty_expiry) {
      warrantyActive = new Date(item.warranty_expiry) > now;
    }

    return {
      ...item,
      cost_per_job: costPerJob ? Math.round(costPerJob * 100) / 100 : null,
      maintenance_due: maintenanceDue,
      maintenance_overdue: maintenanceOverdue,
      warranty_active: warrantyActive,
    };
  });

  // Calculate totals
  const totalInvestment = (equipment || []).reduce((sum, e) => sum + (e.purchase_price || 0), 0);
  const totalJobs = (equipment || []).reduce((sum, e) => sum + (e.jobs_completed || 0), 0);
  const needsAttention = equipmentWithROI.filter(e =>
    e.status === 'needs_repair' || e.maintenance_overdue || e.maintenance_due
  ).length;

  return Response.json({
    equipment: equipmentWithROI,
    categories: EQUIPMENT_CATEGORIES,
    categoryLabels: CATEGORY_LABELS,
    stats: {
      totalInvestment,
      totalJobs,
      avgCostPerJob: totalJobs > 0 ? Math.round((totalInvestment / totalJobs) * 100) / 100 : null,
      needsAttention,
      activeCount: (equipment || []).filter(e => e.status === 'active').length,
    },
  });
}

// POST - Add new equipment
export async function POST(request) {
  const user = await getUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Database not configured' }, { status: 500 });
  }

  const body = await request.json();
  const {
    name,
    brand,
    model,
    category,
    purchasePrice,
    purchaseDate,
    warrantyExpiry,
    nextMaintenance,
    maintenanceNotes,
    status,
  } = body;

  if (!name) {
    return Response.json({ error: 'Equipment name required' }, { status: 400 });
  }

  const row = {
    detailer_id: user.id,
    name,
    brand: brand || null,
    model: model || null,
    category: category || 'other',
    purchase_price: parseFloat(purchasePrice) || 0,
    purchase_date: purchaseDate || null,
    warranty_expiry: warrantyExpiry || null,
    next_maintenance: nextMaintenance || null,
    maintenance_notes: maintenanceNotes || '',
    jobs_completed: 0,
    status: status || 'active',
  };

  const { data: item, error } = await retryStrippingColumns(supabase, 'equipment', 'insert', row);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ equipment: item });
}

// PUT - Update equipment
export async function PUT(request) {
  const user = await getUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Database not configured' }, { status: 500 });
  }

  const body = await request.json();
  const {
    id,
    name,
    brand,
    model,
    category,
    purchasePrice,
    purchaseDate,
    warrantyExpiry,
    nextMaintenance,
    jobsCompleted,
    maintenanceNotes,
    status,
  } = body;

  if (!id) {
    return Response.json({ error: 'Equipment ID required' }, { status: 400 });
  }

  const updates = {
    updated_at: new Date().toISOString(),
  };

  if (name !== undefined) updates.name = name;
  if (brand !== undefined) updates.brand = brand || null;
  if (model !== undefined) updates.model = model || null;
  if (category !== undefined) updates.category = category;
  if (purchasePrice !== undefined) updates.purchase_price = parseFloat(purchasePrice) || 0;
  if (purchaseDate !== undefined) updates.purchase_date = purchaseDate || null;
  if (warrantyExpiry !== undefined) updates.warranty_expiry = warrantyExpiry || null;
  if (nextMaintenance !== undefined) updates.next_maintenance = nextMaintenance || null;
  if (jobsCompleted !== undefined) updates.jobs_completed = parseInt(jobsCompleted) || 0;
  if (maintenanceNotes !== undefined) updates.maintenance_notes = maintenanceNotes;
  if (status !== undefined) updates.status = status;

  const { data: item, error } = await retryStrippingColumns(
    supabase, 'equipment', 'update', updates, { id, detailer_id: user.id }
  );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ equipment: item });
}

// PATCH - Increment job count for equipment
export async function PATCH(request) {
  const user = await getUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Database not configured' }, { status: 500 });
  }

  const body = await request.json();
  const { id, increment = 1 } = body;

  if (!id) {
    return Response.json({ error: 'Equipment ID required' }, { status: 400 });
  }

  // Get current count
  const { data: current } = await supabase
    .from('equipment')
    .select('jobs_completed')
    .eq('id', id)
    .eq('detailer_id', user.id)
    .single();

  if (!current) {
    return Response.json({ error: 'Equipment not found' }, { status: 404 });
  }

  const { data: item, error } = await supabase
    .from('equipment')
    .update({
      jobs_completed: (current.jobs_completed || 0) + increment,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('detailer_id', user.id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ equipment: item });
}

// DELETE - Remove equipment
export async function DELETE(request) {
  const user = await getUser(request);
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
    return Response.json({ error: 'Equipment ID required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('equipment')
    .delete()
    .eq('id', id)
    .eq('detailer_id', user.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
