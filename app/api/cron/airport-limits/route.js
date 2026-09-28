import { createClient } from '@supabase/supabase-js';
import { planLookupKeys } from '@/lib/plans';
import { sendEmail } from '@/lib/email';
import { airportLimitWarningTemplate, airportLimitEnforcedTemplate } from '@/lib/email-templates';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

function isCronAuthed(request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return token === process.env.CRON_SECRET;
}

// Vercel cron fires GET; manual triggers via curl can use either. Both paths
// route through the same handler so the cron + ops debugging line up.
export async function GET(request) { return run(request); }
export async function POST(request) { return run(request); }

async function run(request) {
  if (!isCronAuthed(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const summary = { checked: 0, warned: 0, enforced: 0, cleared: 0, skipped_no_plan: 0, errors: [] };

  // Pull plan_limits once. Per-tier columns: primary_limit, secondary_limit.
  const { data: limitRows, error: limitsErr } = await supabase
    .from('plan_limits')
    .select('plan, primary_limit, secondary_limit');
  if (limitsErr) {
    console.error('[airport-limits-cron] plan_limits read failed:', limitsErr.message);
    return Response.json({ error: 'plan_limits read failed' }, { status: 500 });
  }
  const limitByPlan = Object.fromEntries(
    (limitRows || []).map(r => [r.plan, { primary: r.primary_limit, secondary: r.secondary_limit }]),
  );

  const { data: detailers, error: dErr } = await supabase
    .from('detailers')
    .select('id, plan, email, company');
  if (dErr) {
    console.error('[airport-limits-cron] detailers read failed:', dErr.message);
    return Response.json({ error: 'detailers read failed' }, { status: 500 });
  }

  for (const detailer of detailers || []) {
    summary.checked += 1;
    const plan = detailer.plan;
    // Raw plan first (legacy rows keep their limits), then new-tier aliases.
    const limits = plan ? planLookupKeys(plan).map((k) => limitByPlan[k]).find(Boolean) || null : null;
    if (!limits || typeof limits.primary !== 'number' || typeof limits.secondary !== 'number') {
      console.warn('[airport-limits-cron] skipping detailer', detailer.id, '— plan not in plan_limits:', plan);
      summary.skipped_no_plan += 1;
      continue;
    }
    const primaryLimit = limits.primary;
    const secondaryLimit = limits.secondary;

    // Count active by tier with two head-only queries.
    const [primaryCountRes, secondaryCountRes] = await Promise.all([
      supabase
        .from('detailer_locations')
        .select('id', { count: 'exact', head: true })
        .eq('detailer_id', detailer.id)
        .eq('active', true)
        .eq('tier', 'primary'),
      supabase
        .from('detailer_locations')
        .select('id', { count: 'exact', head: true })
        .eq('detailer_id', detailer.id)
        .eq('active', true)
        .eq('tier', 'secondary'),
    ]);
    const primaryCurrent = primaryCountRes.count || 0;
    const secondaryCurrent = secondaryCountRes.count || 0;
    const primaryOver = primaryCurrent - primaryLimit;
    const secondaryOver = secondaryCurrent - secondaryLimit;

    const { data: existingWarning } = await supabase
      .from('airport_limit_warnings')
      .select('*')
      .eq('detailer_id', detailer.id)
      .maybeSingle();

    if (primaryOver <= 0 && secondaryOver <= 0) {
      if (existingWarning) {
        // Trimmed down or upgraded — wipe the warning state so a future
        // over-limit event starts a fresh 30-day clock.
        await supabase.from('airport_limit_warnings').delete().eq('detailer_id', detailer.id);
        summary.cleared += 1;
        console.log('[airport-limits-cron] cleared warning for', detailer.id, '— now under limit on both tiers');
      }
      continue;
    }

    if (!existingWarning) {
      const nowIso = new Date().toISOString();
      const deadlineIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const totalCurrent = primaryCurrent + secondaryCurrent;
      const totalLimit = primaryLimit + secondaryLimit;
      const { error: insertErr } = await supabase.from('airport_limit_warnings').insert({
        detailer_id: detailer.id,
        plan_at_warning: plan,
        airport_count_at_warning: totalCurrent,
        airport_limit_at_warning: totalLimit,
        notice_sent_at: nowIso,
        deadline_at: deadlineIso,
      });
      if (insertErr) {
        console.error('[airport-limits-cron] insert warning failed for', detailer.id, insertErr.message);
        summary.errors.push({ detailer_id: detailer.id, step: 'insert_warning', error: insertErr.message });
        continue;
      }

      if (detailer.email) {
        const tmpl = airportLimitWarningTemplate({
          company: detailer.company || 'there',
          plan,
          primaryCurrent,
          primaryLimit,
          secondaryCurrent,
          secondaryLimit,
          primaryOver: Math.max(0, primaryOver),
          secondaryOver: Math.max(0, secondaryOver),
          deadlineIso,
        });
        try {
          await sendEmail({
            to: detailer.email,
            subject: tmpl.subject,
            html: tmpl.html,
            text: tmpl.text,
          });
        } catch (err) {
          console.error('[airport-limits-cron] warning email send failed for', detailer.id, err.message);
          summary.errors.push({ detailer_id: detailer.id, step: 'warning_email', error: err.message });
        }
      }
      summary.warned += 1;
      console.log('[airport-limits-cron] warned', detailer.id, 'plan', plan,
        'primary', primaryCurrent, '/', primaryLimit,
        'secondary', secondaryCurrent, '/', secondaryLimit,
        'deadline', deadlineIso);
      continue;
    }

    // Existing warning row — check whether the deadline has passed and we
    // haven't yet enforced. enforced_at is the single-write idempotency
    // guard; once set, we never re-enforce on the same warning row.
    if (existingWarning.enforced_at) continue;
    if (new Date(existingWarning.deadline_at).getTime() > Date.now()) continue;

    // Deactivate excess in each tier separately, oldest by created_at first
    // (we keep the OLDEST `limit` active and flip the rest). Tie-break by id
    // for determinism when created_at matches.
    const deactivateForTier = async (tierName, tierLimit) => {
      const { data: orderedActive } = await supabase
        .from('detailer_locations')
        .select('id, name, airport_icao, created_at, tier')
        .eq('detailer_id', detailer.id)
        .eq('active', true)
        .eq('tier', tierName)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      const toDeactivate = (orderedActive || []).slice(tierLimit);
      if (toDeactivate.length === 0) return [];
      const { error: deacErr } = await supabase
        .from('detailer_locations')
        .update({ active: false })
        .in('id', toDeactivate.map(r => r.id));
      if (deacErr) {
        console.error(`[airport-limits-cron] ${tierName} deactivation failed for`, detailer.id, deacErr.message);
        summary.errors.push({ detailer_id: detailer.id, step: `deactivate_${tierName}`, error: deacErr.message });
        return [];
      }
      return toDeactivate.map(r => ({ name: r.name, icao: r.airport_icao, tier: tierName }));
    };

    const deactivatedPrimary = primaryOver > 0 ? await deactivateForTier('primary', primaryLimit) : [];
    const deactivatedSecondary = secondaryOver > 0 ? await deactivateForTier('secondary', secondaryLimit) : [];
    const deactivated = [...deactivatedPrimary, ...deactivatedSecondary];
    if (deactivated.length === 0) {
      // Either both tiers came back empty (race) or both updates failed.
      continue;
    }

    await supabase
      .from('airport_limit_warnings')
      .update({ enforced_at: new Date().toISOString(), airports_deactivated: deactivated.length })
      .eq('detailer_id', detailer.id);

    if (detailer.email) {
      const tmpl = airportLimitEnforcedTemplate({
        company: detailer.company || 'there',
        plan,
        primaryLimit,
        secondaryLimit,
        deactivated,
      });
      try {
        await sendEmail({
          to: detailer.email,
          subject: tmpl.subject,
          html: tmpl.html,
          text: tmpl.text,
        });
      } catch (err) {
        console.error('[airport-limits-cron] enforced email send failed for', detailer.id, err.message);
        summary.errors.push({ detailer_id: detailer.id, step: 'enforced_email', error: err.message });
      }
    }
    summary.enforced += 1;
    console.log('[airport-limits-cron] enforced', detailer.id,
      'deactivated_primary', deactivatedPrimary.length,
      'deactivated_secondary', deactivatedSecondary.length);
  }

  console.log('[airport-limits-cron] run complete', JSON.stringify(summary));
  return Response.json({ ok: true, ...summary });
}
