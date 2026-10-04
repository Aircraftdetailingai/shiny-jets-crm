import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { customerCreatePasswordError, customerLoginDecision } from '@/lib/customer-account-auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// POST — create account (guest→account after payment) or login
export async function POST(request) {
  const { action, email, password, name, phone, company, quote_id } = await request.json();
  if (!email) return Response.json({ error: 'Email required' }, { status: 400 });

  const supabase = getSupabase();
  const emailLower = email.toLowerCase().trim();

  if (action === 'create') {
    const passwordError = customerCreatePasswordError(password);
    if (passwordError) return Response.json({ error: passwordError }, { status: 400 });

    // Check if account exists
    const { data: existing } = await supabase.from('customer_accounts').select('id').eq('email', emailLower).maybeSingle();
    if (existing) return Response.json({ error: 'Account already exists. Please log in.' }, { status: 409 });

    const password_hash = await bcrypt.hash(password, 10);
    const { data: account, error } = await supabase.from('customer_accounts').insert({
      email: emailLower, name: name || '', phone: phone || null, company: company || null, password_hash,
    }).select().single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Link quote if provided
    if (quote_id) {
      await supabase.from('quotes').update({ customer_account_id: account.id }).eq('id', quote_id);
      // Save aircraft from quote
      const { data: quote } = await supabase.from('quotes').select('tail_number, aircraft_model, detailer_id').eq('id', quote_id).single();
      if (quote?.tail_number) {
        await supabase.from('customer_aircraft').upsert({
          customer_account_id: account.id, detailer_id: quote.detailer_id,
          tail_number: quote.tail_number, model: quote.aircraft_model,
        }, { onConflict: 'customer_account_id,tail_number' });
      }
    }

    const token = await issueToken(account);
    return Response.json({ success: true, token, account: { id: account.id, email: account.email, name: account.name } });
  }

  if (action === 'login') {
    const { data: account } = await supabase.from('customer_accounts').select('*').eq('email', emailLower).maybeSingle();
    let passwordMatches = false;
    if (account?.password_hash && password) {
      passwordMatches = await bcrypt.compare(password, account.password_hash);
    }
    const decision = customerLoginDecision({ account, password, passwordMatches });
    if (!decision.ok) return Response.json({ error: decision.error }, { status: decision.status });
    const token = await issueToken(account);
    return Response.json({ success: true, token, account: { id: account.id, email: account.email, name: account.name } });
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 });
}

async function issueToken(account) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return new SignJWT({ id: account.id, email: account.email, type: 'customer' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(secret);
}
