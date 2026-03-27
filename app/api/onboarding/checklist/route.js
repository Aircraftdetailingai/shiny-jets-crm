import { getAuthUser } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Return completion status for all 5 onboarding checklist steps
export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'DB error' }, { status: 500 });

    const [detailerRes, servicesRes, quotesRes] = await Promise.all([
      supabase
        .from('detailers')
        .select('company, phone, plan')
        .eq('id', user.id)
        .single(),
      supabase
        .from('services')
        .select('id, hourly_rate', { count: 'exact', head: false })
        .eq('detailer_id', user.id),
      supabase
        .from('quotes')
        .select('id', { count: 'exact', head: true })
        .eq('detailer_id', user.id),
    ]);

    const detailer = detailerRes.data || {};
    const services = servicesRes.data || [];
    const servicesCount = services.length;
    const servicesWithPricing = services.filter(s => s.hourly_rate != null && s.hourly_rate > 0).length;
    const quotesCount = quotesRes.count || 0;

    const steps = [
      {
        id: 'profile',
        title: 'Complete your profile',
        description: 'Add your company name and phone number',
        complete: !!(detailer.company && detailer.company.trim() && detailer.phone && detailer.phone.trim()),
        cta: '/settings',
        ctaLabel: 'Edit Profile',
      },
      {
        id: 'aircraft',
        title: 'Add aircraft types',
        description: 'Set up the aircraft types you service',
        complete: servicesCount > 0,
        cta: '/settings/services',
        ctaLabel: 'Add Aircraft',
      },
      {
        id: 'services',
        title: 'Set your pricing',
        description: 'Add rates for your services',
        complete: servicesWithPricing > 0,
        cta: '/settings/services',
        ctaLabel: 'Set Pricing',
      },
      {
        id: 'quote',
        title: 'Send your first quote',
        description: 'Create and send a quote to a customer',
        complete: quotesCount > 0,
        cta: '/quotes/new',
        ctaLabel: 'Create Quote',
      },
      {
        id: 'billing',
        title: 'Upgrade your plan',
        description: 'Unlock all features with a paid plan',
        complete: !!(detailer.plan && detailer.plan !== 'free'),
        cta: '/settings',
        ctaLabel: 'View Plans',
      },
    ];

    const completedCount = steps.filter(s => s.complete).length;

    return Response.json({
      steps,
      completedCount,
      allComplete: completedCount === steps.length,
    });
  } catch (err) {
    console.error('Checklist GET error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST - Permanently dismiss the onboarding checklist
export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'DB error' }, { status: 500 });

    const { error } = await supabase
      .from('detailers')
      .update({ onboarding_completed: true, onboarding_complete: true })
      .eq('id', user.id);

    // Column-stripping retry if onboarding_completed doesn't exist yet
    if (error && error.message?.includes('column')) {
      // Column doesn't exist yet — store in localStorage only (handled client-side)
      return Response.json({ success: true, fallback: true });
    }

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('Checklist POST error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
