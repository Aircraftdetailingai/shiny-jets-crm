import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit')) || 100;
    const sortField = searchParams.get('sort') || 'created_at';
    const order = searchParams.get('order') || 'desc';
    const status = searchParams.get('status');

    // Build query
    let query = supabase
      .from('quotes')
      .select('*')
      .eq('detailer_id', user.id)
      .order(sortField, { ascending: order === 'asc' })
      .limit(limit);

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Quotes fetch error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Transform data to include aircraft_name for display
    const quotes = (data || []).map(q => ({
      ...q,
      aircraft_name: q.aircraft_model
        ? `${q.aircraft_type || ''} ${q.aircraft_model}`.trim()
        : q.aircraft_type || 'Unknown Aircraft',
    }));

    return Response.json({ quotes });

  } catch (err) {
    console.error('Quotes API error:', err);
    return Response.json({ error: 'Failed to fetch quotes' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // --- Server-side quota enforcement ---
    const { data: detailer } = await supabase
      .from('detailers')
      .select('plan, quotes_this_month, quote_reset_date')
      .eq('id', user.id)
      .single();

    const plan = detailer?.plan || 'free';
    let quotesThisMonth = detailer?.quotes_this_month || 0;
    const resetDate = detailer?.quote_reset_date ? new Date(detailer.quote_reset_date) : null;
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Auto-reset if quote_reset_date is before this month
    if (!resetDate || resetDate < firstOfMonth) {
      quotesThisMonth = 0;
      await supabase
        .from('detailers')
        .update({ quotes_this_month: 0, quote_reset_date: firstOfMonth.toISOString().slice(0, 10) })
        .eq('id', user.id);
    }

    // Import canCreateQuote
    const { canCreateQuote, getTier } = await import('@/lib/pricing-tiers');
    const tierConfig = getTier(plan);

    if (!canCreateQuote(plan, quotesThisMonth)) {
      return Response.json({
        error: 'Quote limit reached',
        upgrade: true,
        quotesUsed: quotesThisMonth,
        quotesLimit: tierConfig.quotesPerMonth,
        message: `You've used all ${tierConfig.quotesPerMonth} free quotes this month. Upgrade to Pro for unlimited quotes.`,
      }, { status: 403 });
    }
    // --- End quota enforcement ---

    const body = await request.json();
    console.log('Quote POST body:', JSON.stringify({
      aircraft_type: body.aircraft_type,
      aircraft_model: body.aircraft_model,
      total_price: body.total_price,
      selected_services_count: body.selected_services?.length,
      services_keys: body.services ? Object.keys(body.services) : null,
      line_items_count: body.line_items?.length,
      keys: Object.keys(body),
    }));

    const {
      aircraft_type,
      aircraft_model,
      aircraft_id,
      surface_area_sqft,
      services,
      selected_services,
      selected_package_id,
      selected_package_name,
      base_hours,
      total_hours,
      total_price,
      notes,
      line_items,
      labor_total,
      products_total,
      efficiency_factor,
      access_difficulty,
      job_location,
      minimum_fee_applied,
      calculated_price,
      package_savings,
      discount_percent,
      addon_fees,
      addon_total,
      customer_id,
      customer_phone,
      customer_company,
      airport,
      product_estimates,
    } = body;

    // Validate: need at minimum an aircraft type or model, and some price
    const hasAircraft = aircraft_type || aircraft_model;
    const hasServices = services || (selected_services && selected_services.length > 0) || (line_items && line_items.length > 0);
    if (!hasAircraft && !hasServices && !total_price) {
      console.error('Quote truly empty - no aircraft, services, or price');
      return Response.json({ error: 'Please select an aircraft and services before sending' }, { status: 400 });
    }

    const shareLink = nanoid(8);
    const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Store all extra pricing data as JSON metadata for columns that may not exist yet
    const quoteMetadata = {
      line_items: line_items || [],
      selected_services: selected_services || [],
      selected_package_id: selected_package_id || null,
      selected_package_name: selected_package_name || null,
      labor_total: labor_total || 0,
      products_total: products_total || 0,
      access_difficulty: access_difficulty || 1.0,
      job_location: job_location || null,
      minimum_fee_applied: minimum_fee_applied || false,
      calculated_price: calculated_price || total_price,
      discount_percent: discount_percent || 0,
      addon_fees: addon_fees || [],
      addon_total: addon_total || 0,
    };

    // Build insert row - start with core columns that definitely exist
    const insertRow = {
      detailer_id: user.id,
      aircraft_type,
      aircraft_model: aircraft_model || '',
      total_price: parseFloat(total_price) || 0,
      total_hours: parseFloat(total_hours) || 0,
      notes: notes || '',
      share_link: shareLink,
      valid_until: validUntil,
      status: 'draft',
      services: services || {},
    };

    // Try adding optional columns - these may or may not exist in the DB
    const optionalColumns = {
      aircraft_id: aircraft_id || null,
      surface_area_sqft: surface_area_sqft ? parseFloat(surface_area_sqft) : null,
      services: services || {},
      selected_services: selected_services || null,
      selected_package_id: selected_package_id || null,
      selected_package_name: selected_package_name || null,
      base_hours: parseFloat(base_hours) || 0,
      line_items: line_items || [],
      labor_total: parseFloat(labor_total) || 0,
      products_total: parseFloat(products_total) || 0,
      efficiency_factor: parseFloat(efficiency_factor) || 1.0,
      access_difficulty: parseFloat(access_difficulty) || 1.0,
      job_location: job_location || null,
      minimum_fee_applied: minimum_fee_applied || false,
      calculated_price: parseFloat(calculated_price) || parseFloat(total_price) || 0,
      package_savings: parseFloat(package_savings) || 0,
      discount_percent: parseFloat(discount_percent) || 0,
      addon_fees: addon_fees || [],
      addon_total: parseFloat(addon_total) || 0,
      customer_id: customer_id || null,
      customer_phone: customer_phone || null,
      customer_company: customer_company || null,
      airport: airport || null,
      product_estimates: product_estimates || [],
      metadata: quoteMetadata,
    };

    // Try full insert first, then strip failing columns
    let row = { ...insertRow, ...optionalColumns };
    let data, error;

    for (let attempt = 0; attempt < 10; attempt++) {
      const result = await supabase.from('quotes').insert(row).select().single();
      data = result.data;
      error = result.error;

      if (!error) break;

      // If error is about a missing column, strip it and retry
      // Matches both PostgreSQL and PostgREST error formats
      const colMatch = error.message?.match(/column "([^"]+)" of relation "quotes" does not exist/)
        || error.message?.match(/Could not find the '([^']+)' column of 'quotes'/);
      if (colMatch) {
        const badCol = colMatch[1];
        console.log(`Quote insert: stripping unknown column "${badCol}", retrying...`);
        delete row[badCol];
        continue;
      }

      // Some other error - log and break
      console.error('Quote create error:', JSON.stringify(error));
      break;
    }

    if (error) {
      console.error('Quote create final error:', JSON.stringify(error));
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Increment quotes_this_month on successful creation
    await supabase
      .from('detailers')
      .update({ quotes_this_month: quotesThisMonth + 1 })
      .eq('id', user.id);

    return Response.json(data, { status: 201 });

  } catch (err) {
    console.error('Quote POST error:', err);
    return Response.json({ error: 'Failed to create quote' }, { status: 500 });
  }
}
