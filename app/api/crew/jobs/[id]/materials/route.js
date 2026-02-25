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

// GET - Fetch products and equipment needed for a specific job
export async function GET(request, { params }) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: quoteId } = await params;
  const supabase = getSupabase();

  // Verify job belongs to crew's detailer
  const { data: quote, error: quoteErr } = await supabase
    .from('quotes')
    .select('id, line_items, selected_services')
    .eq('id', quoteId)
    .eq('detailer_id', user.detailer_id)
    .single();

  if (quoteErr || !quote) {
    return Response.json({ error: 'Job not found' }, { status: 404 });
  }

  // Collect service IDs from line_items and selected_services
  const serviceIds = new Set();
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

  const svcIds = [...serviceIds];
  let productsNeeded = [];
  let equipmentNeeded = [];

  if (svcIds.length > 0) {
    // Fetch products linked to these services
    if (user.can_see_inventory) {
      const { data: spLinks } = await supabase
        .from('service_products')
        .select('service_id, quantity_per_hour, fixed_quantity, notes, products(id, name, category, unit, current_quantity, reorder_threshold, brand, image_url)')
        .in('service_id', svcIds);

      if (spLinks) {
        // Also get service names for context
        const { data: svcs } = await supabase
          .from('services')
          .select('id, name')
          .in('id', svcIds);
        const svcMap = {};
        (svcs || []).forEach(s => { svcMap[s.id] = s.name; });

        // Also get hours per service from line_items for quantity calc
        const hoursMap = {};
        (quote.line_items || []).forEach(li => {
          if (li.service_id && li.hours) hoursMap[li.service_id] = parseFloat(li.hours) || 0;
        });

        // Deduplicate by product_id, summing quantities
        const productMap = {};
        spLinks.forEach(link => {
          const p = link.products;
          if (!p) return;
          const hours = hoursMap[link.service_id] || 0;
          const qty = (parseFloat(link.fixed_quantity) || 0) + ((parseFloat(link.quantity_per_hour) || 0) * hours);

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
              current_quantity: p.current_quantity,
              low_stock: p.reorder_threshold > 0 && p.current_quantity <= p.reorder_threshold,
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
  let productUsage = [];
  if (user.can_see_inventory) {
    const { data: usage } = await supabase
      .from('product_usage')
      .select('id, product_id, amount_used, unit, notes, created_at')
      .eq('quote_id', quoteId);
    productUsage = usage || [];
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

  const { id: quoteId } = await params;
  const { type, item_id, item_name, notes } = await request.json();

  if (!type || !item_name) {
    return Response.json({ error: 'type and item_name required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Verify job belongs to crew's detailer
  const { data: quote } = await supabase
    .from('quotes')
    .select('id')
    .eq('id', quoteId)
    .eq('detailer_id', user.detailer_id)
    .single();

  if (!quote) return Response.json({ error: 'Job not found' }, { status: 404 });

  // Append note to the quote's notes field about missing item
  const timestamp = new Date().toISOString().split('T')[0];
  const missingNote = `[${timestamp} - ${user.name}] MISSING ${type.toUpperCase()}: ${item_name}${notes ? ` - ${notes}` : ''}`;

  const { data: existing } = await supabase
    .from('quotes')
    .select('notes')
    .eq('id', quoteId)
    .single();

  const updatedNotes = existing?.notes
    ? `${existing.notes}\n${missingNote}`
    : missingNote;

  const { error } = await supabase
    .from('quotes')
    .update({ notes: updatedNotes })
    .eq('id', quoteId);

  if (error) {
    console.error('Report missing item error:', error);
    return Response.json({ error: 'Failed to report missing item' }, { status: 500 });
  }

  return Response.json({ success: true });
}
