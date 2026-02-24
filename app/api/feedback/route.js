import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

// GET - Load quote info by feedback token (public, no auth needed)
export async function GET(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return Response.json({ error: 'Token required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Find quote by feedback_token
  const { data: quote, error } = await supabase
    .from('quotes')
    .select('id, client_name, client_email, aircraft_model, aircraft_type, total_price, detailer_id, feedback_token')
    .eq('feedback_token', token)
    .single();

  if (error || !quote) {
    return Response.json({ error: 'Invalid or expired feedback link' }, { status: 404 });
  }

  // Check if already submitted
  const { data: existing } = await supabase
    .from('feedback')
    .select('id')
    .eq('quote_id', quote.id)
    .single();

  if (existing) {
    return Response.json({ error: 'Feedback already submitted', alreadySubmitted: true }, { status: 400 });
  }

  // Get detailer info
  const { data: detailer } = await supabase
    .from('detailers')
    .select('id, name, company')
    .eq('id', quote.detailer_id)
    .single();

  return Response.json({
    quote: {
      id: quote.id,
      clientName: quote.client_name,
      aircraft: quote.aircraft_model || quote.aircraft_type || 'Aircraft',
    },
    detailer: {
      name: detailer?.name,
      company: detailer?.company || detailer?.name || 'Your Detailer',
    },
  });
}

// POST - Submit feedback (public, no auth needed)
export async function POST(request) {
  const body = await request.json();
  const { token, rating, comment } = body;

  if (!token) {
    return Response.json({ error: 'Token required' }, { status: 400 });
  }

  if (!rating || rating < 1 || rating > 5) {
    return Response.json({ error: 'Rating must be 1-5' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Find quote
  const { data: quote, error } = await supabase
    .from('quotes')
    .select('id, detailer_id, client_name, client_email')
    .eq('feedback_token', token)
    .single();

  if (error || !quote) {
    return Response.json({ error: 'Invalid feedback link' }, { status: 404 });
  }

  // Check if already submitted
  const { data: existing } = await supabase
    .from('feedback')
    .select('id')
    .eq('quote_id', quote.id)
    .single();

  if (existing) {
    return Response.json({ error: 'Feedback already submitted' }, { status: 400 });
  }

  // Insert feedback
  const { data: feedback, error: insertError } = await supabase
    .from('feedback')
    .insert({
      quote_id: quote.id,
      detailer_id: quote.detailer_id,
      customer_email: quote.client_email,
      customer_name: quote.client_name,
      rating: parseInt(rating),
      comment: (comment || '').trim().slice(0, 1000),
    })
    .select()
    .single();

  if (insertError) {
    console.error('Feedback insert error:', insertError);
    return Response.json({ error: 'Failed to save feedback' }, { status: 500 });
  }

  return Response.json({ success: true, id: feedback.id });
}
