import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Search customers for this detailer
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

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit')) || 20;
    const tag = searchParams.get('tag');
    const archived = searchParams.get('archived');
    // Sort modes the CustomerAutocomplete component drives:
    //   company (default) — company_name ASC, fall back to last-name for
    //                       personal-name customers (post-processed
    //                       client-side because Postgres doesn't compute
    //                       last_name without a generated column).
    //   name              — last_name ASC, first_name ASC (post-processed).
    //   recent            — created_at DESC (pure SQL).
    const sortMode = (searchParams.get('sort') || 'company').toLowerCase();
    const validSort = ['company', 'name', 'recent'].includes(sortMode) ? sortMode : 'company';

    // Core columns that exist in the customers table
    let selectCols = 'id, name, email, phone, company_name, airport, tail_numbers, notes, tags, is_archived, created_at';
    let customers = [];

    for (let attempt = 0; attempt < 10; attempt++) {
      let query = supabase
        .from('customers')
        .select(selectCols)
        .eq('detailer_id', user.detailer_id || user.id)
        .limit(limit);

      // Apply SQL-level ordering. For `company` and `name` we ask Postgres
      // for a sensible first pass (so the LIMIT picks reasonable rows) then
      // refine client-side. For `recent` the SQL order is final.
      if (validSort === 'recent') {
        query = query.order('created_at', { ascending: false });
      } else if (validSort === 'name') {
        query = query.order('name', { ascending: true, nullsFirst: false });
      } else {
        // 'company' — sort by company_name first, then name as tiebreaker.
        query = query
          .order('company_name', { ascending: true, nullsFirst: false })
          .order('name', { ascending: true, nullsFirst: false });
      }

      if (q) {
        query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,company_name.ilike.%${q}%`);
      }
      if (tag) {
        query = query.contains('tags', [tag]);
      }
      // Filter by archived status (only if column exists in select)
      if (selectCols.includes('is_archived')) {
        if (archived === 'true') {
          query = query.eq('is_archived', true);
        } else {
          query = query.or('is_archived.eq.false,is_archived.is.null');
        }
      }

      const { data, error } = await query;

      if (!error) {
        customers = data || [];
        console.log(`=== CUSTOMERS GET === user=${user.id} found=${customers.length} cols=${selectCols}`);
        break;
      }

      // Table doesn't exist - fall back to quotes
      if (error.code === '42P01' || error.code === 'PGRST205') {
        console.log('=== CUSTOMERS GET === table does not exist, falling back to quotes');
        customers = await getCustomersFromQuotes(supabase, user.id, q, limit);
        break;
      }

      // Unknown column - strip it and retry
      const colMatch = error.message?.match(/column (\w+)\.(\w+) does not exist/)
        || error.message?.match(/Could not find the '([^']+)' column/)
        || error.message?.match(/column "([^"]+)" of relation "customers" does not exist/);
      if (colMatch) {
        const badCol = colMatch[2] || colMatch[1];
        console.log(`=== CUSTOMERS GET === stripping missing column: ${badCol}`);
        selectCols = selectCols.split(',').map(c => c.trim()).filter(c => c !== badCol).join(', ');
        continue;
      }

      // Other error
      console.error('=== CUSTOMERS GET ERROR ===', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Refine ordering for `company` and `name` modes. Postgres got us a
    // sensible first pass + LIMIT, now apply the last-name-aware secondary
    // ordering Postgres can't do cleanly (no generated last_name column).
    function lastWord(s) {
      const t = String(s || '').trim();
      if (!t) return '';
      const parts = t.split(/\s+/);
      return (parts[parts.length - 1] || '').toLowerCase();
    }
    function firstWord(s) {
      const t = String(s || '').trim();
      if (!t) return '';
      return (t.split(/\s+/)[0] || '').toLowerCase();
    }
    if (validSort === 'company') {
      customers = [...customers].sort((a, b) => {
        const ca = (a.company_name || '').trim().toLowerCase();
        const cb = (b.company_name || '').trim().toLowerCase();
        // Company rows first (alpha), then no-company rows (alpha by last
        // word of name, tiebreak first word).
        if (ca && !cb) return -1;
        if (!ca && cb) return 1;
        if (ca && cb) return ca.localeCompare(cb);
        const la = lastWord(a.name), lb = lastWord(b.name);
        if (la !== lb) return la.localeCompare(lb);
        return firstWord(a.name).localeCompare(firstWord(b.name));
      });
    } else if (validSort === 'name') {
      customers = [...customers].sort((a, b) => {
        const la = lastWord(a.name), lb = lastWord(b.name);
        if (la !== lb) return la.localeCompare(lb);
        return firstWord(a.name).localeCompare(firstWord(b.name));
      });
    }

    // Enrich with quote history
    const enriched = await Promise.all(customers.map(async (c) => {
      try {
        const { data: quotes } = await supabase
          .from('quotes')
          .select('id, status, total_price, created_at')
          .eq('detailer_id', user.detailer_id || user.id)
          .eq('client_email', c.email)
          .order('created_at', { ascending: false });

        const allQuotes = quotes || [];
        const paidQuotes = allQuotes.filter(q => q.status === 'completed' || q.status === 'paid');
        const totalRevenue = paidQuotes.reduce((sum, q) => sum + (parseFloat(q.total_price) || 0), 0);

        return {
          ...c,
          quote_count: allQuotes.length,
          total_revenue: totalRevenue,
          last_service_date: paidQuotes.length > 0 ? paidQuotes[0].created_at : null,
        };
      } catch {
        return { ...c, quote_count: 0, last_service_date: null };
      }
    }));

    return Response.json({ customers: enriched });

  } catch (err) {
    console.error('=== CUSTOMERS GET EXCEPTION ===', err);
    return Response.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}

// Fallback: build customer list from existing quotes
async function getCustomersFromQuotes(supabase, detailerId, q, limit) {
  try {
    let query = supabase
      .from('quotes')
      .select('client_name, client_email, client_phone')
      .eq('detailer_id', detailerId)
      .not('client_email', 'is', null);

    if (q) {
      query = query.or(`client_name.ilike.%${q}%,client_email.ilike.%${q}%`);
    }

    const { data } = await query;
    if (!data) return [];

    // Deduplicate by email
    const seen = new Map();
    for (const row of data) {
      if (row.client_email && !seen.has(row.client_email.toLowerCase())) {
        seen.set(row.client_email.toLowerCase(), {
          id: null,
          name: row.client_name || '',
          email: row.client_email,
          phone: row.client_phone || null,
          company_name: null,
          notes: null,
        });
      }
    }

    return Array.from(seen.values()).slice(0, limit);
  } catch {
    return [];
  }
}

// POST - Create or upsert a customer
export async function POST(request) {
  console.log('=== CUSTOMER CREATE START ===');
  try {
    const user = await getAuthUser(request);
    if (!user) {
      console.log('=== CUSTOMER CREATE === unauthorized');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('=== CUSTOMER CREATE === user:', user.id, user.email);

    const supabase = getSupabase();
    if (!supabase) {
      console.error('=== CUSTOMER CREATE === database not configured');
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { name, email, phone, company_name, notes, tags } = body;
    console.log('=== CUSTOMER CREATE === body:', JSON.stringify({ name, email, phone, company_name, hasTags: !!tags }));

    if (!name || !email) {
      console.log('=== CUSTOMER CREATE === missing name or email');
      return Response.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if customer already exists
    try {
      const { data: existing, error: lookupErr } = await supabase
        .from('customers')
        .select('*')
        .eq('detailer_id', user.detailer_id || user.id)
        .eq('email', normalizedEmail)
        .single();

      if (lookupErr) {
        console.log('=== CUSTOMER CREATE === lookup error (ok if not found):', lookupErr.code, lookupErr.message);
      }

      if (existing) {
        console.log('=== CUSTOMER CREATE === found existing:', existing.id);
        // Update existing customer
        const updates = {};
        if (name) updates.name = name;
        if (phone !== undefined) updates.phone = phone;
        if (company_name !== undefined) updates.company_name = company_name;
        if (notes !== undefined) updates.notes = notes;
        if (tags !== undefined) updates.tags = tags;

        const { data: updated, error: updateErr } = await supabase
          .from('customers')
          .update(updates)
          .eq('id', existing.id)
          .select()
          .single();

        if (updateErr) {
          console.error('=== CUSTOMER UPDATE ERROR ===', updateErr);
        } else {
          console.log('=== CUSTOMER UPDATED ===', updated?.id);
        }

        return Response.json({ customer: updated || existing, created: false });
      }
    } catch (e) {
      console.log('=== CUSTOMER CREATE === lookup exception (continuing to create):', e.message);
    }

    // Create new customer
    const row = {
      detailer_id: user.detailer_id || user.id,
      name,
      email: normalizedEmail,
      phone: phone || null,
      company_name: company_name || null,
      notes: notes || '',
      tags: Array.isArray(tags) ? tags : [],
    };

    console.log('=== CUSTOMER CREATE === inserting row:', JSON.stringify(row));

    // Column-stripping retry pattern
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabase
        .from('customers')
        .insert(row)
        .select()
        .single();

      if (!error) {
        console.log('=== CUSTOMER CREATED ===', data?.id, data?.name, data?.email);
        return Response.json({ customer: data, created: true }, { status: 201 });
      }

      const colMatch = error.message?.match(/column "([^"]+)" of relation "customers" does not exist/)
        || error.message?.match(/Could not find the '([^']+)' column of 'customers'/);
      if (colMatch) {
        console.log(`=== CUSTOMER CREATE === stripping missing column: ${colMatch[1]}`);
        delete row[colMatch[1]];
        continue;
      }

      // Table doesn't exist
      if (error.code === '42P01' || error.code === 'PGRST205') {
        console.log('=== CUSTOMER CREATE === customers table does not exist');
        return Response.json({ error: 'Customers table not set up yet', customer: null, created: false }, { status: 200 });
      }

      console.error('=== CUSTOMER CREATE ERROR ===', error.code, error.message, error.details);
      return Response.json({ error: error.message }, { status: 500 });
    }

    console.error('=== CUSTOMER CREATE === exhausted retries');
    return Response.json({ error: 'Failed to create customer' }, { status: 500 });

  } catch (err) {
    console.error('=== CUSTOMER CREATE EXCEPTION ===', err.message, err.stack);
    return Response.json({ error: 'Failed to save customer' }, { status: 500 });
  }
}
