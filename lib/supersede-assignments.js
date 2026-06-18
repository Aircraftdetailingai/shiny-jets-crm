// When a job is marked complete, close out any assignments still 'pending'
// (assigned but never acknowledged) by flipping them to 'superseded' —
// "the job finished before they responded; they did not work this job."
//
// Distinct from 'accepted' (worked) and 'declined' (actively declined), which
// are left untouched. Each flipped row is recorded in crew_activity_log for
// audit. Call this AFTER a successful jobs.status='complete' write. Best-effort:
// never throw into the caller's complete flow.
export async function supersedePendingAssignments(supabase, jobId) {
  if (!jobId) return { superseded: 0 };

  // Flip pending -> superseded, returning the affected rows.
  const { data: flipped, error } = await supabase
    .from('job_assignments')
    .update({ status: 'superseded' })
    .eq('job_id', jobId)
    .eq('status', 'pending')
    .select('id, team_member_id, created_at');
  if (error || !flipped?.length) return { superseded: 0 };

  const nowIso = new Date().toISOString();

  // notified_at = COALESCE(notified_at, now()) — only stamp rows that were never
  // notified, preserving an original notify time where one exists.
  try {
    await supabase
      .from('job_assignments')
      .update({ notified_at: nowIso })
      .in('id', flipped.map((r) => r.id))
      .is('notified_at', null);
  } catch (e) {
    // notified_at column may not exist on older deploys — non-fatal.
    console.error('[supersede-assignments] notified_at stamp skipped:', e?.message || e);
  }

  // Job context + member names for the activity log.
  const { data: job } = await supabase
    .from('jobs')
    .select('id, detailer_id, tail_number, aircraft_model')
    .eq('id', jobId)
    .maybeSingle();

  const memberIds = [...new Set(flipped.map((r) => r.team_member_id).filter(Boolean))];
  let nameById = {};
  if (memberIds.length) {
    const { data: members } = await supabase
      .from('team_members')
      .select('id, name')
      .in('id', memberIds);
    nameById = Object.fromEntries((members || []).map((m) => [m.id, m.name]));
  }

  const logs = flipped.map((r) => ({
    detailer_id: job?.detailer_id || null,
    team_member_id: r.team_member_id,
    team_member_name: nameById[r.team_member_id] || null,
    job_id: jobId,
    action_type: 'assignment_superseded',
    action_details: {
      original_assigned_at: r.created_at,
      superseded_at: nowIso,
      reason: 'job_completed_before_response',
      job_tail: job?.tail_number || null,
      job_aircraft: job?.aircraft_model || null,
    },
  }));
  try {
    if (logs.length) await supabase.from('crew_activity_log').insert(logs);
  } catch (e) {
    console.error('[supersede-assignments] activity log error:', e?.message || e);
  }

  return { superseded: flipped.length };
}
