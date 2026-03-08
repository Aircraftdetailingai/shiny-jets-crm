import { getAuthUser } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Check onboarding status
export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'DB error' }, { status: 500 });

    const { data } = await supabase
      .from('detailers')
      .select('onboarding_complete, onboarding_step, company, name, phone')
      .eq('id', user.id)
      .single();

    return Response.json({
      onboarding_complete: data?.onboarding_complete || false,
      onboarding_step: data?.onboarding_step || 0,
      company: data?.company || '',
      name: data?.name || '',
      phone: data?.phone || '',
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

    // Save company info
    if (action === 'save_company') {
      const { company, name, phone, agreed_to_terms_at } = body;
      const updates = { onboarding_step: 2 };
      if (company) updates.company = company;
      if (name) updates.name = name;
      if (phone) updates.phone = phone;
      if (agreed_to_terms_at) updates.agreed_to_terms_at = agreed_to_terms_at;

      const { error: updateErr } = await supabase.from('detailers').update(updates).eq('id', user.id);
      if (updateErr && updateErr.message?.includes('column')) {
        delete updates.agreed_to_terms_at;
        await supabase.from('detailers').update(updates).eq('id', user.id);
      }

      // Update localStorage user
      const { data: updated } = await supabase
        .from('detailers')
        .select('id, email, name, company, phone, plan, status')
        .eq('id', user.id)
        .single();

      return Response.json({ success: true, user: updated });
    }

    // Save services
    if (action === 'save_services') {
      const { services } = body;
      if (services && services.length > 0) {
        const toInsert = services.map(svc => ({
          detailer_id: user.id,
          name: svc.name,
          description: svc.description || '',
          hourly_rate: parseFloat(svc.hourly_rate) || 0,
          hours_field: svc.hours_field || 'ext_wash_hours',
        }));

        await supabase.from('services').insert(toInsert);
      }
      await supabase.from('detailers').update({ onboarding_step: 3 }).eq('id', user.id);
      return Response.json({ success: true });
    }

    // Save rates
    if (action === 'save_rates') {
      const { rates } = body; // Array of { service_id, hourly_rate }
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

    // Save preferences
    if (action === 'save_preferences') {
      const { minimum_fee, pass_fee_to_customer, preferred_language, preferred_currency } = body;
      const updates = { onboarding_step: 5 };
      if (minimum_fee !== undefined) updates.minimum_callout_fee = parseFloat(minimum_fee) || 0;
      if (pass_fee_to_customer !== undefined) updates.pass_fee_to_customer = pass_fee_to_customer;
      if (preferred_language) updates.preferred_language = preferred_language;
      if (preferred_currency) updates.preferred_currency = preferred_currency;

      // Use column-stripping retry for new columns
      const { error: updateErr } = await supabase.from('detailers').update(updates).eq('id', user.id);
      if (updateErr && updateErr.message?.includes('column')) {
        delete updates.preferred_language;
        delete updates.preferred_currency;
        await supabase.from('detailers').update(updates).eq('id', user.id);
      }
      return Response.json({ success: true });
    }

    // Complete onboarding
    if (action === 'complete') {
      await supabase
        .from('detailers')
        .update({ onboarding_complete: true, onboarding_step: 6 })
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
        .update({ onboarding_complete: true })
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
