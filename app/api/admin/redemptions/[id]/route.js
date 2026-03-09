import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@aircraftdetailing.ai',
  'admin@aircraftdetailing.ai',
  'brett@shinyjets.com',
  'brett@vectorav.ai',
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

// PUT - Update redemption status
export async function PUT(request, { params }) {
  try {
    if (!await isAdmin(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'DB error' }, { status: 500 });

    const { id } = params;
    const body = await request.json();
    const { status, tracking_number } = body;

    if (!status) return Response.json({ error: 'Status required' }, { status: 400 });

    // If cancelling, refund points
    if (status === 'cancelled') {
      const { data: redemption } = await supabase
        .from('reward_redemptions')
        .select('detailer_id, points_spent, status')
        .eq('id', id)
        .single();

      if (redemption && redemption.status !== 'cancelled') {
        // Refund points
        const { data: detailer } = await supabase
          .from('detailers')
          .select('points_balance')
          .eq('id', redemption.detailer_id)
          .single();

        if (detailer) {
          await supabase
            .from('detailers')
            .update({ points_balance: (detailer.points_balance || 0) + redemption.points_spent })
            .eq('id', redemption.detailer_id);

          // Log refund in points ledger
          await supabase
            .from('points_ledger')
            .insert({
              detailer_id: redemption.detailer_id,
              action: 'REFUND_REDEMPTION',
              base_points: redemption.points_spent,
              multiplier: 1.0,
              final_points: redemption.points_spent,
              description: `Refund: cancelled redemption`,
              metadata: { redemption_id: id },
            });
        }
      }
    }

    const updates = { status };
    if (tracking_number) {
      updates.metadata = { tracking_number };
    }

    const { data, error } = await supabase
      .from('reward_redemptions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ redemption: data });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
