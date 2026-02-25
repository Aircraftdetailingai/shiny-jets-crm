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

    // Try to fetch from customers table
    let customers = [];
    try {
      let query = supabase
        .from('customers')
        .select('id, name, email, phone, company_name, notes, tags, poc_name, poc_phone, poc_email, poc_role, emergency_contact_name, emergency_contact_phone, contact_notes, created_at, updated_at')
        .eq('detailer_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (q) {
        query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,company_name.ilike.%${q}%`);
      }

      // Filter by tag if provided
      const tag = searchParams.get('tag');
      if (tag) {
        query = query.contains('tags', [tag]);
      }

      const { data, error } = await query;
      if (error) {
        // Table doesn't exist yet - fall back to quotes-based customer list
        if (error.code === '42P01' || error.code === 'PGRST205') {
          customers = await getCustomersFromQuotes(supabase, user.id, q, limit);
        } else {
          console.error('Customers fetch error:', error);
          return Response.json({ error: error.message }, { status: 500 });
        }
      } else {
        customers = data || [];
      }
    } catch (e) {
      console.error('Customers query failed:', e);
      customers = await getCustomersFromQuotes(supabase, user.id, q, limit);
    }

    // Enrich with quote history (use client_email - the actual column name)
    const enriched = await Promise.all(customers.map(async (c) => {
      try {
        const { data: quotes } = await supabase
          .from('quotes')
          .select('id, status, created_at')
          .eq('detailer_id', user.id)
          .eq('client_email', c.email)
          .order('created_at', { ascending: false });

        const allQuotes = quotes || [];
        const completedQuotes = allQuotes.filter(q => q.status === 'completed' || q.status === 'paid');

        return {
          ...c,
          quote_count: allQuotes.length,
          last_service_date: completedQuotes.length > 0 ? completedQuotes[0].created_at : null,
        };
      } catch {
        return { ...c, quote_count: 0, last_service_date: null };
      }
    }));

    return Response.json({ customers: enriched });

  } catch (err) {
    console.error('Customers API error:', err);
    return Response.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}

// Fallback: build customer list from existing quotes (uses actual column names)
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

    // Deduplicate by email, keep most recent data
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
    const { name, email, phone, company_name, notes, tags } = body;

    if (!name || !email) {
      return Response.json({ error: 'Name and email are required' }, { status: 400 });
    }

    // Check if customer already exists
    try {
      const { data: existing } = await supabase
        .from('customers')
        .select('*')
        .eq('detailer_id', user.id)
        .eq('email', email.toLowerCase().trim())
        .single();

      if (existing) {
        // Update existing customer
        const updates = { updated_at: new Date().toISOString() };
        if (name) updates.name = name;
        if (phone !== undefined) updates.phone = phone;
        if (company_name !== undefined) updates.company_name = company_name;
        if (notes !== undefined) updates.notes = notes;
        if (tags !== undefined) updates.tags = tags;

        const { data: updated } = await supabase
          .from('customers')
          .update(updates)
          .eq('id', existing.id)
          .select()
          .single();

        return Response.json({ customer: updated || existing, created: false });
      }
    } catch {
      // Table might not exist or no match - continue to create
    }

    // Create new customer
    const row = {
      detailer_id: user.id,
      name,
      email: email.toLowerCase().trim(),
      phone: phone || null,
      company_name: company_name || null,
      notes: notes || '',
      tags: Array.isArray(tags) ? tags : [],
    };

    // Column-stripping retry pattern
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabase
        .from('customers')
        .insert(row)
        .select()
        .single();

      if (!error) {
        return Response.json({ customer: data, created: true }, { status: 201 });
      }

      const colMatch = error.message?.match(/column "([^"]+)" of relation "customers" does not exist/)
        || error.message?.match(/Could not find the '([^']+)' column of 'customers'/);
      if (colMatch) {
        delete row[colMatch[1]];
        continue;
      }

      // Table doesn't exist
      if (error.code === '42P01' || error.code === 'PGRST205') {
        console.log('Customers table does not exist yet - skipping create.');
        return Response.json({ error: 'Customers table not set up yet', customer: null, created: false }, { status: 200 });
      }

      console.error('Customer create error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ error: 'Failed to create customer' }, { status: 500 });

  } catch (err) {
    console.error('Customers POST error:', err);
    return Response.json({ error: 'Failed to save customer' }, { status: 500 });
  }
}
