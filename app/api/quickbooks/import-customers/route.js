import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { refreshAccessToken, queryCustomers, mapQBCustomerToVector } from '@/lib/quickbooks';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

async function getUser(request) {
  try {
    const cookieStore = await cookies();
    const authCookie = cookieStore.get('auth_token')?.value;
    if (authCookie) {
      const user = await verifyToken(authCookie);
      if (user) return user;
    }
  } catch (e) {}
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return await verifyToken(authHeader.slice(7));
  }
  return null;
}

export async function POST(request) {
  const user = await getUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  try {
    // Fetch connection
    const { data: connection, error: connErr } = await supabase
      .from('quickbooks_connections')
      .select('*')
      .eq('detailer_id', user.id)
      .single();

    if (connErr || !connection) {
      return Response.json({ error: 'QuickBooks not connected' }, { status: 400 });
    }

    let accessToken = connection.access_token;

    // Refresh token if expired or within 5 min of expiry
    const expiresAt = new Date(connection.token_expires_at);
    const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);

    if (expiresAt <= fiveMinFromNow) {
      try {
        const newTokens = await refreshAccessToken(connection.refresh_token);
        accessToken = newTokens.access_token;

        await supabase
          .from('quickbooks_connections')
          .update({
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token,
            token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('detailer_id', user.id);
      } catch (refreshErr) {
        console.error('QB token refresh failed:', refreshErr);
        return Response.json({
          error: 'QuickBooks session expired. Please reconnect.',
          reconnect: true,
        }, { status: 401 });
      }
    }

    // Fetch customers from QuickBooks
    const qbCustomers = await queryCustomers(accessToken, connection.realm_id);

    let imported = 0;
    let skipped = 0;
    let updated = 0;
    const errors = [];

    for (const qbCust of qbCustomers) {
      const mapped = mapQBCustomerToVector(qbCust);

      // Skip customers without email or name
      if (!mapped.email || !mapped.name) {
        skipped++;
        continue;
      }

      const email = mapped.email.toLowerCase().trim();

      try {
        // Check if customer already exists
        const { data: existing } = await supabase
          .from('customers')
          .select('id, phone, company_name')
          .eq('detailer_id', user.id)
          .eq('email', email)
          .maybeSingle();

        if (existing) {
          // Fill in missing fields only — never overwrite
          const updates = {};
          if (!existing.phone && mapped.phone) updates.phone = mapped.phone;
          if (!existing.company_name && mapped.company_name) updates.company_name = mapped.company_name;

          if (Object.keys(updates).length > 0) {
            updates.updated_at = new Date().toISOString();
            await supabase.from('customers').update(updates).eq('id', existing.id);
            updated++;
          } else {
            skipped++;
          }
        } else {
          // Insert new customer with column-stripping retry
          let row = {
            detailer_id: user.id,
            name: mapped.name,
            email,
            phone: mapped.phone || null,
            company_name: mapped.company_name || null,
          };

          let success = false;
          for (let attempt = 0; attempt < 5; attempt++) {
            const { error: insertErr } = await supabase.from('customers').insert(row);

            if (!insertErr) {
              imported++;
              success = true;
              break;
            }

            const colMatch = insertErr.message?.match(
              /column "([^"]+)" of relation "customers" does not exist/
            ) || insertErr.message?.match(
              /Could not find the '([^']+)' column of 'customers'/
            );

            if (colMatch) {
              delete row[colMatch[1]];
              continue;
            }

            errors.push(`${mapped.name}: ${insertErr.message}`);
            break;
          }
        }
      } catch (e) {
        errors.push(`${mapped.name}: ${e.message}`);
      }
    }

    return Response.json({
      success: true,
      total: qbCustomers.length,
      imported,
      updated,
      skipped,
      errors: errors.slice(0, 10),
    });
  } catch (err) {
    console.error('QB import error:', err);
    return Response.json({ error: err.message || 'Import failed' }, { status: 500 });
  }
}
