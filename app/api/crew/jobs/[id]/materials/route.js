import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

async function getCrewUser(request) {
  const payload = await getAuthUser(request);
  if (!payload || payload.role !== 'crew') return null;
  return payload;
}

// GET - Fetch products and equipment needed for a specific job
export async function GET(request, { params }) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: refId } = await params;
  const supabase = getSupabase();

  // Verify job belongs to crew's detailer — check both quotes and jobs tables
  let quote = null;
  let jobRecord = null;
  const { data: q } = await supabase
    .from('quotes')
    .select('id, line_items, selected_services')
    .eq('id', refId)
    .eq('detailer_id', user.detailer_id)
    .maybeSingle();
  if (q) {
    quote = q;
  } else {
    const { data: j } = await supabase
      .from('jobs')
      .select('id, services')
      .eq('id', refId)
      .eq('detailer_id', user.detailer_id)
      .maybeSingle();
    if (j) jobRecord = j;
  }

  if (!quote && !jobRecord) {
    console.log('[crew/jobs/materials] not found:', refId, 'detailer:', user.detailer_id);
    return Response.json({ error: 'Job not found' }, { status: 404 });
  }

  // Collect service IDs from line_items, selected_services, or jobs.services
  const serviceIds = new Set();
  if (quote) {
    if (Array.isArray(quote.line_items)) {
      quote.line_items.forEach(li => {
        if (li.service_id) serviceIds.add(li.service_id);
      });
    }
    if (Array.isArray(quote.selected_services)) {
      quote.selected_services.forEach(id => {
        if (id) serviceIds.add(id);
      });
    }
  } else if (jobRecord) {
    // Manual jobs may store services as JSON array of objects with id or service_id
    let svcs = jobRecord.services;
    if (typeof svcs === 'string') { try { svcs = JSON.parse(svcs); } catch { svcs = []; } }
    if (Array.isArray(svcs)) {
      svcs.forEach(s => {
        const id = typeof s === 'object' ? (s.service_id || s.id) : null;
        if (id) serviceIds.add(id);
      });
    }
  }

  const svcIds = [...serviceIds];
  let productsNeeded = [];
  let equipmentNeeded = [];

  if (svcIds.length > 0) {
    // Fetch products linked to these services
    if (user.can_see_inventory) {
      const { data: spLinks } = await supabase
        .from('service_products')
        .select('service_id, quantity_per_job, notes, products(id, name, category, unit, quantity, reorder_level, brand, image_url)')
        .in('service_id', svcIds);

      if (spLinks) {
        // Also get service names for context
        const { data: svcs } = await supabase
          .from('services')
          .select('id, name')
          .in('id', svcIds);
        const svcMap = {};
        (svcs || []).forEach(s => { svcMap[s.id] = s.name; });

        // Deduplicate by product_id, summing quantities
        const productMap = {};
        spLinks.forEach(link => {
          const p = link.products;
          if (!p) return;
          const qty = parseFloat(link.quantity_per_job) || 0;

          if (productMap[p.id]) {
            productMap[p.id].quantity_needed += qty;
            if (!productMap[p.id].for_services.includes(svcMap[link.service_id] || '')) {
              productMap[p.id].for_services.push(svcMap[link.service_id] || '');
            }
          } else {
            productMap[p.id] = {
              id: p.id,
              name: p.name,
              category: p.category,
              unit: p.unit,
              brand: p.brand,
              image_url: p.image_url,
              current_quantity: p.quantity,
              low_stock: p.reorder_level > 0 && p.quantity <= p.reorder_level,
              quantity_needed: qty,
              for_services: [svcMap[link.service_id] || ''].filter(Boolean),
            };
          }
        });
        productsNeeded = Object.values(productMap);
      }
    }

    // Fetch equipment linked to these services
    if (user.can_see_equipment) {
      const { data: seLinks } = await supabase
        .from('service_equipment')
        .select('service_id, notes, equipment(id, name, category, brand, model, status, image_url)')
        .in('service_id', svcIds);

      if (seLinks) {
        const { data: svcs } = await supabase
          .from('services')
          .select('id, name')
          .in('id', svcIds);
        const svcMap = {};
        (svcs || []).forEach(s => { svcMap[s.id] = s.name; });

        // Deduplicate by equipment_id
        const equipMap = {};
        seLinks.forEach(link => {
          const e = link.equipment;
          if (!e) return;
          if (!equipMap[e.id]) {
            equipMap[e.id] = {
              id: e.id,
              name: e.name,
              category: e.category,
              brand: e.brand,
              model: e.model,
              status: e.status,
              image_url: e.image_url,
              for_services: [svcMap[link.service_id] || ''].filter(Boolean),
            };
          } else {
            if (!equipMap[e.id].for_services.includes(svcMap[link.service_id] || '')) {
              equipMap[e.id].for_services.push(svcMap[link.service_id] || '');
            }
          }
        });
        equipmentNeeded = Object.values(equipMap);
      }
    }
  }

  // Also fetch existing product usage for this job (check-off state)
  // Query both legacy product_usage table and newer job_product_usage table
  let productUsage = [];
  if (user.can_see_inventory) {
    const { data: usage } = await supabase
      .from('product_usage')
      .select('id, product_id, amount_used, unit, notes, created_at')
      .or(`quote_id.eq.${refId},job_id.eq.${refId}`);
    productUsage = usage || [];

    // Also include job_product_usage entries. Surface is_unlisted +
    // product_name / product_brand so the staff dashboard can render the
    // freeform name with an "Unlisted" badge for entries that aren't in
    // the catalog. Column-stripping retry handles older deploys where
    // is_unlisted / product_brand may not yet exist.
    let jpuSelect = 'id, product_id, product_name, product_brand, is_unlisted, actual_quantity, amount_used, unit, notes, created_at';
    let jpu = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, error } = await supabase
        .from('job_product_usage')
        .select(jpuSelect)
        .or(`quote_id.eq.${refId},job_id.eq.${refId}`);
      if (!error) { jpu = data; break; }
      const colMatch = error.message?.match(/column[^"]*"([^"]+)"[^"]*does not exist/)
        || error.message?.match(/column ([a-z_.]+) does not exist/);
      if (colMatch) {
        jpuSelect = jpuSelect.split(',').map(s => s.trim()).filter(c => c !== colMatch[1] && !c.endsWith(`.${colMatch[1]}`)).join(', ');
        continue;
      }
      break;
    }
    if (jpu) {
      productUsage.push(...jpu.map(u => ({
        id: u.id,
        product_id: u.product_id,
        product_name: u.product_name || null,
        product_brand: u.product_brand || null,
        is_unlisted: !!u.is_unlisted,
        amount_used: u.actual_quantity || u.amount_used,
        unit: u.unit, notes: u.notes, created_at: u.created_at,
      })));
    }
  }

  return Response.json({
    products: productsNeeded,
    equipment: equipmentNeeded,
    product_usage: productUsage,
  });
}

// POST - Report a missing product or equipment item
export async function POST(request, { params }) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: refId } = await params;
  const { type, item_id, item_name, notes } = await request.json();

  if (!type || !item_name) {
    return Response.json({ error: 'type and item_name required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Verify job belongs to crew's detailer (check both tables)
  let table = null;
  const { data: quoteRow } = await supabase.from('quotes').select('id, notes').eq('id', refId).eq('detailer_id', user.detailer_id).maybeSingle();
  if (quoteRow) {
    table = 'quotes';
  } else {
    const { data: jobRow } = await supabase.from('jobs').select('id, notes').eq('id', refId).eq('detailer_id', user.detailer_id).maybeSingle();
    if (jobRow) table = 'jobs';
  }
  if (!table) return Response.json({ error: 'Job not found' }, { status: 404 });

  // Append note to the record's notes field about missing item
  const timestamp = new Date().toISOString().split('T')[0];
  const missingNote = `[${timestamp} - ${user.name}] MISSING ${type.toUpperCase()}: ${item_name}${notes ? ` - ${notes}` : ''}`;

  const existing = quoteRow || (await supabase.from(table).select('notes').eq('id', refId).single()).data;
  const updatedNotes = existing?.notes ? `${existing.notes}\n${missingNote}` : missingNote;

  const { error } = await supabase
    .from(table)
    .update({ notes: updatedNotes })
    .eq('id', refId);

  if (error) {
    console.error('Report missing item error:', error);
    return Response.json({ error: 'Failed to report missing item' }, { status: 500 });
  }

  return Response.json({ success: true });
}
