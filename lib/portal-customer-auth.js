import { createClient } from '@supabase/supabase-js';
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const COOKIE_NAME = 'portal_token';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function createPortalToken(payload) {
  return await new SignJWT({ ...payload, type: 'portal_customer' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(JWT_SECRET);
}

export async function verifyPortalToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.type !== 'portal_customer') return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getPortalUser(request) {
  // Check Bearer header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const user = await verifyPortalToken(authHeader.slice(7));
    if (user) return user;
  }
  // Check cookie
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (token) return await verifyPortalToken(token);
  } catch {}
  return null;
}

export async function getPortalCustomer(request) {
  const user = await getPortalUser(request);
  if (!user?.customer_id) return null;
  const supabase = getSupabase();
  const { data } = await supabase.from('customer_accounts').select('*').eq('id', user.customer_id).single();
  return data;
}

export function generateMagicToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < 48; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
  return token;
}
