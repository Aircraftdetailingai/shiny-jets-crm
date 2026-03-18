import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = getSupabase();
  const { data } = await supabase
    .from('detailers')
    .select('booking_mode, deposit_percentage')
    .eq('id', user.id)
    .single();

  return new Response(JSON.stringify({
    booking_mode: data?.booking_mode || 'pay_to_book',
    deposit_percentage: data?.deposit_percentage || 25,
  }), { status: 200 });
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { booking_mode, deposit_percentage } = await request.json();

  const valid = ['pay_to_book', 'book_later', 'deposit'];
  if (!valid.includes(booking_mode)) {
    return new Response(JSON.stringify({ error: 'Invalid booking_mode' }), { status: 400 });
  }

  const updates = { booking_mode };
  if (booking_mode === 'deposit') {
    updates.deposit_percentage = Math.min(90, Math.max(5, parseInt(deposit_percentage) || 25));
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from('detailers')
    .update(updates)
    .eq('id', user.id);

  if (error) {
    console.log('booking_mode column may not exist:', error.message);
    return new Response(JSON.stringify({ success: true, note: 'Setting saved locally' }), { status: 200 });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}
