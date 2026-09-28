import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { normalizePlan } from '@/lib/plans';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { checklist, business_description, portfolio_urls } = body;

  if (!checklist || typeof checklist !== 'object') {
    return Response.json({ error: 'Checklist is required' }, { status: 400 });
  }

  const requiredFields = ['equipment', 'chemicals', 'training', 'insurance', 'experience', 'standards'];
  for (const field of requiredFields) {
    if (checklist[field] !== true) {
      return Response.json({ error: `All checklist items must be confirmed` }, { status: 400 });
    }
  }

  const supabase = getSupabase();

  // Get detailer info
  const { data: detailer, error: detError } = await supabase
    .from('detailers')
    .select('id, company, email, verified_finish_status, plan')
    .eq('id', user.detailerId || user.detailer_id || user.id)
    .single();

  if (detError || !detailer) {
    return Response.json({ error: 'Detailer not found' }, { status: 404 });
  }

  if (normalizePlan(detailer.plan) !== 'business') {
    return Response.json({ error: 'The Verified Finish badge is available on the Business plan ($89.95/mo or $899/yr).', code: 'PLAN_REQUIRED', upgrade_url: '/upgrade?plan=business' }, { status: 403 });
  }

  if (detailer.verified_finish_status === 'pending') {
    return Response.json({ error: 'Application already pending' }, { status: 400 });
  }

  const applicationNotes = JSON.stringify({
    checklist,
    business_description: business_description || '',
    portfolio_urls: portfolio_urls || [],
    submitted_at: new Date().toISOString(),
  });

  const { error: updateError } = await supabase
    .from('detailers')
    .update({
      verified_finish_status: 'pending',
      verified_finish_applied_at: new Date().toISOString(),
      verified_finish_notes: applicationNotes,
    })
    .eq('id', detailer.id);

  if (updateError) {
    console.error('[verified-finish/apply] Update error:', updateError);
    return Response.json({ error: 'Failed to submit application' }, { status: 500 });
  }

  // Send notification email to admin
  try {
    await sendEmail({
      to: 'brett@shinyjets.com',
      subject: `New Verified Finish Application from ${detailer.company || detailer.email}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #C9A84C;">New Verified Finish Application</h2>
          <p><strong>Company:</strong> ${detailer.company || 'N/A'}</p>
          <p><strong>Email:</strong> ${detailer.email}</p>
          <p><strong>Business Description:</strong> ${business_description || 'Not provided'}</p>
          <p><strong>Portfolio URLs:</strong></p>
          <ul>
            ${(portfolio_urls || []).map(u => `<li><a href="${u}">${u}</a></li>`).join('') || '<li>None provided</li>'}
          </ul>
          <h3>Checklist</h3>
          <ul>
            ${requiredFields.map(f => `<li>${f}: ${checklist[f] ? '✓' : '✗'}</li>`).join('')}
          </ul>
          <p><a href="https://app.vectorav.ai/admin/verified-finish" style="color: #C9A84C;">Review Application →</a></p>
        </div>
      `,
    });
  } catch (emailErr) {
    console.error('[verified-finish/apply] Email error:', emailErr);
  }

  return Response.json({ success: true });
}
