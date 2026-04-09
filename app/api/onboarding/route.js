import { getAuthUser } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import { sendCustomerIntroEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Check onboarding status (expanded for resume support)
export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'DB error' }, { status: 500 });

    const { data } = await supabase
      .from('detailers')
      .select('*')
      .eq('id', user.id)
      .single();

    // If no detailer found (e.g. crew token used), skip onboarding
    if (!data) {
      return Response.json({ onboarding_complete: true, service_count: 0 });
    }

    // Get service count for resume support
    const { count: serviceCount } = await supabase
      .from('services')
      .select('id', { count: 'exact', head: true })
      .eq('detailer_id', user.id);

    return Response.json({
      onboarding_complete: data?.onboarding_complete || false,
      onboarding_step: data?.onboarding_step || 0,
      company: data?.company || '',
      name: data?.name || '',
      phone: data?.phone || '',
      country: data?.country || '',
      home_airport: data?.home_airport || '',
      logo_url: data?.logo_url || null,
      theme_primary: data?.theme_primary || '#007CB1',
      theme_colors: data?.theme_colors || [],
      portal_theme: data?.portal_theme || 'dark',
      service_count: serviceCount || 0,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST - Save onboarding progress
export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'DB error' }, { status: 500 });

    const body = await request.json();
    const { action } = body;

    // Save business profile (Step 1)
    if (action === 'save_profile') {
      const { company, name, phone, country, home_airport, agreed_to_terms_at, terms_accepted_version } = body;
      const updates = { onboarding_step: 1 };
      if (company) updates.company = company;
      if (name) updates.name = name;
      if (phone) updates.phone = phone;
      if (country) updates.country = country;
      if (home_airport) updates.home_airport = home_airport;
      if (agreed_to_terms_at) updates.agreed_to_terms_at = agreed_to_terms_at;
      if (terms_accepted_version) updates.terms_accepted_version = terms_accepted_version;

      // Column-stripping retry
      for (let attempt = 0; attempt < 4; attempt++) {
        const { error: updateErr } = await supabase.from('detailers').update(updates).eq('id', user.id);
        if (!updateErr) break;
        const colMatch = updateErr.message?.match(/column "([^"]+)".*does not exist/)
          || updateErr.message?.match(/Could not find the '([^']+)' column/);
        if (colMatch) { delete updates[colMatch[1]]; continue; }
        break;
      }

      const { data: updated } = await supabase
        .from('detailers')
        .select('id, email, name, company, phone, plan, status')
        .eq('id', user.id)
        .single();

      return Response.json({ success: true, user: updated });
    }

    // Legacy: save_company (keep for backwards compat)
    if (action === 'save_company') {
      const { company, name, phone, agreed_to_terms_at, terms_accepted_version } = body;
      const updates = { onboarding_step: 2 };
      if (company) updates.company = company;
      if (name) updates.name = name;
      if (phone) updates.phone = phone;
      if (agreed_to_terms_at) updates.agreed_to_terms_at = agreed_to_terms_at;
      if (terms_accepted_version) updates.terms_accepted_version = terms_accepted_version;

      const { error: updateErr } = await supabase.from('detailers').update(updates).eq('id', user.id);
      if (updateErr && updateErr.message?.includes('column')) {
        delete updates.agreed_to_terms_at;
        delete updates.terms_accepted_version;
        await supabase.from('detailers').update(updates).eq('id', user.id);
      }

      const { data: updated } = await supabase
        .from('detailers')
        .select('id, email, name, company, phone, plan, status')
        .eq('id', user.id)
        .single();

      return Response.json({ success: true, user: updated });
    }

    // Save services (Step 2) — actual insert handled by /api/services/import
    if (action === 'save_services') {
      await supabase.from('detailers').update({ onboarding_step: 2 }).eq('id', user.id);
      return Response.json({ success: true });
    }

    // Save rates (legacy)
    if (action === 'save_rates') {
      const { rates } = body;
      if (rates && rates.length > 0) {
        for (const r of rates) {
          await supabase
            .from('services')
            .update({ hourly_rate: parseFloat(r.hourly_rate) || 0 })
            .eq('id', r.service_id)
            .eq('detailer_id', user.id);
        }
      }
      await supabase.from('detailers').update({ onboarding_step: 4 }).eq('id', user.id);
      return Response.json({ success: true });
    }

    // Save preferences (legacy)
    if (action === 'save_preferences') {
      const { minimum_fee, pass_fee_to_customer, preferred_language, preferred_currency } = body;
      const updates = { onboarding_step: 5 };
      if (minimum_fee !== undefined) updates.minimum_callout_fee = parseFloat(minimum_fee) || 0;
      if (pass_fee_to_customer !== undefined) updates.pass_fee_to_customer = pass_fee_to_customer;
      if (preferred_language) updates.preferred_language = preferred_language;
      if (preferred_currency) updates.preferred_currency = preferred_currency;

      const { error: updateErr } = await supabase.from('detailers').update(updates).eq('id', user.id);
      if (updateErr && updateErr.message?.includes('column')) {
        delete updates.preferred_language;
        delete updates.preferred_currency;
        await supabase.from('detailers').update(updates).eq('id', user.id);
      }
      return Response.json({ success: true });
    }

    // Send customer invite email (Step 4)
    if (action === 'send_customer_invite') {
      const { email, name: customerName } = body;
      if (!email) return Response.json({ error: 'Customer email required' }, { status: 400 });

      // Create customer record
      const normalizedEmail = email.toLowerCase().trim();

      // Check if customer exists first
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('detailer_id', user.id)
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (existingCustomer) {
        await supabase.from('customers').update({ name: customerName || '' }).eq('id', existingCustomer.id);
      } else {
        await supabase.from('customers').insert({
          detailer_id: user.id,
          email: normalizedEmail,
          name: customerName || '',
        });
      }

      // Get detailer info for email
      const { data: detailer } = await supabase
        .from('detailers')
        .select('id, email, name, company')
        .eq('id', user.id)
        .single();

      // Send intro email
      try {
        await sendCustomerIntroEmail({
          customerEmail: normalizedEmail,
          customerName: customerName || '',
          detailer,
        });
      } catch (e) {
        console.error('Customer intro email error:', e);
      }

      await supabase.from('detailers').update({ onboarding_step: 4 }).eq('id', user.id);
      return Response.json({ success: true });
    }

    // Complete onboarding
    if (action === 'complete') {
      await supabase
        .from('detailers')
        .update({ onboarding_complete: true, onboarding_completed: true, onboarding_step: 5 })
        .eq('id', user.id);

      // Award 50 points
      try {
        const { data: detailer } = await supabase
          .from('detailers')
          .select('total_points, lifetime_points')
          .eq('id', user.id)
          .single();

        if (detailer) {
          await supabase.from('detailers').update({
            total_points: (detailer.total_points || 0) + 50,
            lifetime_points: (detailer.lifetime_points || 0) + 50,
          }).eq('id', user.id);
        }
      } catch (e) {
        console.error('Points award error:', e);
      }

      return Response.json({ success: true });
    }

    // Skip onboarding
    if (action === 'skip') {
      await supabase
        .from('detailers')
        .update({ onboarding_complete: true, onboarding_completed: true })
        .eq('id', user.id);
      return Response.json({ success: true });
    }

    // Save step progress
    if (action === 'save_step') {
      await supabase
        .from('detailers')
        .update({ onboarding_step: body.step || 0 })
        .eq('id', user.id);
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('Onboarding error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
