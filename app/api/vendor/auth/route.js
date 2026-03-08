import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key');

async function createToken(vendor) {
  return await new SignJWT({
    id: vendor.id,
    email: vendor.email,
    company_name: vendor.company_name,
    type: 'vendor',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(JWT_SECRET);
}

// POST - Login or Register
export async function POST(request) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { action, email, password, company_name, website, contact_name, agreed_to_terms_at } = body;

    if (!email || !password) {
      return Response.json({ error: 'Email and password required' }, { status: 400 });
    }

    if (action === 'register') {
      // Register new vendor
      if (!company_name) {
        return Response.json({ error: 'Company name required' }, { status: 400 });
      }

      // Check if vendor exists
      const { data: existing } = await supabase
        .from('vendors')
        .select('id')
        .eq('email', email.toLowerCase())
        .single();

      if (existing) {
        return Response.json({ error: 'Email already registered' }, { status: 400 });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create vendor (pending approval)
      const insertData = {
        email: email.toLowerCase(),
        password: hashedPassword,
        company_name,
        contact_name: contact_name || '',
        website: website || '',
        commission_tier: 'basic',
        status: 'pending', // Requires approval
      };
      if (agreed_to_terms_at) insertData.agreed_to_terms_at = agreed_to_terms_at;

      let vendor, error;
      ({ data: vendor, error } = await supabase
        .from('vendors')
        .insert(insertData)
        .select()
        .single());

      // Retry without agreed_to_terms_at if column doesn't exist
      if (error && error.message?.includes('column')) {
        delete insertData.agreed_to_terms_at;
        ({ data: vendor, error } = await supabase
          .from('vendors')
          .insert(insertData)
          .select()
          .single());
      }

      if (error) {
        if (error.code === '42P01') {
          return Response.json({ error: 'Vendors table not created. Run database migration.' }, { status: 500 });
        }
        return Response.json({ error: error.message }, { status: 500 });
      }

      return Response.json({
        success: true,
        message: 'Registration submitted. Awaiting approval.',
        vendor: {
          id: vendor.id,
          email: vendor.email,
          company_name: vendor.company_name,
          status: vendor.status,
        },
      });

    } else {
      // Login
      const { data: vendor, error } = await supabase
        .from('vendors')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();

      if (error || !vendor) {
        return Response.json({ error: 'Invalid email or password' }, { status: 401 });
      }

      // Check password
      const validPassword = await bcrypt.compare(password, vendor.password);
      if (!validPassword) {
        return Response.json({ error: 'Invalid email or password' }, { status: 401 });
      }

      // Check status
      if (vendor.status === 'pending') {
        return Response.json({ error: 'Account pending approval' }, { status: 403 });
      }
      if (vendor.status === 'rejected') {
        return Response.json({ error: 'Account has been rejected' }, { status: 403 });
      }
      if (vendor.status === 'suspended') {
        return Response.json({ error: 'Account has been suspended' }, { status: 403 });
      }

      // Create token
      const token = await createToken(vendor);

      // Remove password from response
      const { password: _, ...vendorData } = vendor;

      return Response.json({
        success: true,
        token,
        vendor: vendorData,
      });
    }

  } catch (err) {
    console.error('Vendor auth error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
