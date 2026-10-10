// Shop-scoped time entries. Members are already limited to one detailer;
// callers still drop rows stamped with a different detailer_id.

const FULL_COLUMNS = 'id, team_member_id, detailer_id, date, hours_worked, clock_in, clock_out, job_id, quote_id';
const BARE_COLUMNS = 'id, team_member_id, detailer_id, date, hours_worked, clock_in, clock_out, quote_id';

export async function fetchShopTimeEntries(supabase, memberIds) {
  if (!memberIds?.length) return [];
  let result = await supabase
    .from('time_entries')
    .select(FULL_COLUMNS)
    .in('team_member_id', memberIds);
  if (result.error && /job_id/.test(result.error.message || '')) {
    result = await supabase
      .from('time_entries')
      .select(BARE_COLUMNS)
      .in('team_member_id', memberIds);
  }
  if (result.error) {
    const err = new Error(result.error.message || 'Failed to load time entries');
    err.cause = result.error;
    throw err;
  }
  return result.data || [];
}
