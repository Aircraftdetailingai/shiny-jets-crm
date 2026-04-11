import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@vectorav.ai',
  'admin@vectorav.ai',
  'brett@shinyjets.com',
];

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function isAdmin(request) {
  const user = await getAuthUser(request);
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email?.toLowerCase());
}

const SEED_REWARDS = [
  {
    name: '10% Off Next Month',
    description: 'Get 10% off your next subscription',
    points_cost: 500,
    quantity_available: 999,
    category: 'credits',
    min_tier: 'pro',
    reward_type: 'discount',
    reward_value: JSON.stringify({ percent: 10 }),
    active: true,
  },
  {
    name: '25% Off Next Month',
    description: 'Get 25% off your next subscription',
    points_cost: 1000,
    quantity_available: 999,
    category: 'credits',
    min_tier: 'pro',
    reward_type: 'discount',
    reward_value: JSON.stringify({ percent: 25 }),
    active: true,
  },
  {
    name: 'Free Month - Pro',
    description: 'One month of Pro plan free',
    points_cost: 5000,
    quantity_available: 99,
    category: 'credits',
    min_tier: 'pro',
    reward_type: 'subscription',
    reward_value: JSON.stringify({ months: 1, plan: 'pro' }),
    active: true,
  },
  {
    name: 'Shiny Jets Hat',
    description: 'Premium embroidered Shiny Jets CRM hat',
    points_cost: 1000,
    quantity_available: 0,
    category: 'swag',
    min_tier: 'pro',
    reward_type: 'physical',
    reward_value: JSON.stringify({ item: 'hat', sizes: ['one-size'] }),
    active: true,
  },
  {
    name: 'Shiny Jets Polo',
    description: 'Premium Shiny Jets CRM polo shirt',
    points_cost: 2000,
    quantity_available: 0,
    category: 'swag',
    min_tier: 'pro',
    reward_type: 'physical',
    reward_value: JSON.stringify({ item: 'polo', sizes: ['S', 'M', 'L', 'XL'] }),
    active: true,
  },
  {
    name: 'Microfiber 10-Pack',
    description: 'Premium detailing microfibers',
    points_cost: 1500,
    quantity_available: 0,
    category: 'supplies',
    min_tier: 'pro',
    reward_type: 'physical',
    reward_value: '{}',
    active: true,
  },
  {
    name: 'VIP Coaching Call',
    description: '30-min 1-on-1 strategy call with the Shiny Jets team',
    points_cost: 15000,
    quantity_available: 5,
    category: 'vip',
    min_tier: 'enterprise',
    reward_type: 'digital',
    reward_value: JSON.stringify({ duration: 30 }),
    active: true,
  },
];

export async function POST(request) {
  try {
    if (!await isAdmin(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'DB error' }, { status: 500 });

    // Check if items already exist
    const { data: existing } = await supabase
      .from('reward_inventory')
      .select('id')
      .limit(1);

    if (existing && existing.length > 0) {
      return Response.json({ error: 'Inventory already has items. Clear first or add manually.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('reward_inventory')
      .insert(SEED_REWARDS)
      .select();

    if (error) {
      if (error.code === '42P01') {
        return Response.json({ error: 'reward_inventory table not found. Run migration first.' }, { status: 500 });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true, count: data.length, items: data });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
