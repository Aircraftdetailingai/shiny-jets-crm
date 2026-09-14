/**
 * Shared helpers for customer aircraft portal (/portal/aircraft/*).
 * Shapes jobs/quotes + job_media for customer-safe responses.
 */

const COMPLETED_STATUSES = new Set(['completed', 'complete', 'paid']);
const ACTIVE_FOR_LIVE = new Set(['scheduled', 'in_progress', 'accepted']);

function normalizeStatus(status) {
  if (status === 'complete') return 'completed';
  return status || null;
}

function safeTitle(service) {
  const fromLines = Array.isArray(service.line_items)
    ? service.line_items.map((li) => li.description || li.service || li.name).filter(Boolean)
    : [];
  if (fromLines.length) return fromLines[0];
  if (service.aircraft) return service.aircraft;
  return 'Service';
}

/**
 * Map raw quote/job rows into customer-safe service summaries.
 * progress_percentage is only included when share_progress_with_customer is true.
 */
export function shapePortalServices(quotes = [], jobs = []) {
  const fromQuotes = (quotes || []).map((q) => {
    const share = !!q.share_progress_with_customer;
    const rawPct = q.progress_percentage;
    const hasPct = rawPct !== null && rawPct !== undefined && rawPct !== '';
    const pct = hasPct ? Math.min(100, Math.max(0, parseInt(rawPct, 10) || 0)) : null;
    return {
      id: q.id,
      _source: 'quotes',
      aircraft: q.aircraft_model || q.aircraft_type || null,
      status: normalizeStatus(q.status),
      total_price: q.total_price,
      scheduled_date: q.scheduled_date,
      completed_at: q.completed_at,
      created_at: q.created_at,
      airport: q.airport || null,
      line_items: Array.isArray(q.line_items) ? q.line_items : null,
      detailer_id: q.detailer_id || null,
      progress_percentage: share && pct !== null ? pct : null,
      _share_progress: share,
    };
  });

  const fromJobs = (jobs || []).map((j) => {
    const share = !!j.share_progress_with_customer;
    const rawPct = j.progress_percentage;
    const hasPct = rawPct !== null && rawPct !== undefined && rawPct !== '';
    const pct = hasPct ? Math.min(100, Math.max(0, parseInt(rawPct, 10) || 0)) : null;
    return {
      id: j.id,
      _source: 'jobs',
      aircraft: [j.aircraft_make, j.aircraft_model].filter(Boolean).join(' ') || null,
      status: normalizeStatus(j.status),
      total_price: j.total_price,
      scheduled_date: j.scheduled_date,
      completed_at: j.completed_at,
      created_at: j.created_at,
      airport: j.airport || null,
      line_items: null,
      detailer_id: j.detailer_id || null,
      progress_percentage: share && pct !== null ? pct : null,
      _share_progress: share,
    };
  });

  const all = [...fromQuotes, ...fromJobs].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at),
  );

  return all.map((s) => ({
    ...s,
    title: safeTitle(s),
  }));
}

/** Strip internal fields before JSON response. */
export function publicServices(services) {
  return (services || []).map((s) => {
    const { _share_progress, _source, detailer_id, ...pub } = s;
    return pub;
  });
}

function classifyPhoto(m, { fromLiveJob } = {}) {
  const photoType = (m.photo_type || '').toLowerCase();
  const mediaType = (m.media_type || '').toLowerCase();
  if (photoType === 'in_progress' || mediaType.includes('progress')) return 'in_progress';
  if (photoType === 'post_job' || mediaType.startsWith('after')) return 'after';
  if (photoType === 'pre_job' || mediaType.startsWith('before')) return 'before';
  // Untagged media on a live shared job → live stream
  return fromLiveJob ? 'in_progress' : 'before';
}

/**
 * Fetch job_media for completed services + shared in-progress services.
 * Queries both quote_id and job_id columns.
 */
export async function fetchPortalPhotos(supabase, services) {
  const completedIds = (services || [])
    .filter((s) => COMPLETED_STATUSES.has(s.status))
    .map((s) => s.id);

  const liveIds = (services || [])
    .filter((s) => s._share_progress && ACTIVE_FOR_LIVE.has(s.status))
    .map((s) => s.id);

  const allIds = [...new Set([...completedIds, ...liveIds])];
  if (allIds.length === 0) return [];

  let media = null;
  const { data, error } = await supabase
    .from('job_media')
    .select('id, quote_id, job_id, media_type, photo_type, url, created_at')
    .or(`quote_id.in.(${allIds.join(',')}),job_id.in.(${allIds.join(',')})`)
    .order('created_at', { ascending: false })
    .limit(80);

  if (!error) {
    media = data || [];
  } else {
    // Older schemas may lack job_id / photo_type — degrade gracefully
    let select = 'id, quote_id, media_type, url, created_at';
    const { data: fallback, error: err2 } = await supabase
      .from('job_media')
      .select(select)
      .in('quote_id', allIds)
      .order('created_at', { ascending: false })
      .limit(80);
    if (!err2) media = fallback || [];
    else media = [];
  }

  const liveSet = new Set(liveIds);
  const completedSet = new Set(completedIds);

  return (media || [])
    .map((m) => {
      const refId = m.job_id || m.quote_id;
      if (!liveSet.has(refId) && !completedSet.has(refId)) return null;
      const fromLiveJob = liveSet.has(refId);
      return {
        id: m.id,
        quote_id: m.quote_id || null,
        job_id: m.job_id || null,
        media_type: m.media_type,
        photo_type: m.photo_type || null,
        category: classifyPhoto(m, { fromLiveJob }),
        url: m.url,
        created_at: m.created_at,
        live: fromLiveJob,
      };
    })
    .filter(Boolean);
}

export function computePortalStats(services, photos) {
  const totalSpent = (services || [])
    .filter((s) => ['completed', 'paid'].includes(s.status))
    .reduce((sum, s) => sum + parseFloat(s.total_price || 0), 0);
  const lastService = (services || []).find((s) => s.status === 'completed');
  const daysSinceService = lastService?.completed_at
    ? Math.floor((Date.now() - new Date(lastService.completed_at).getTime()) / 86400000)
    : null;
  return {
    total_services: (services || []).length,
    total_spent: totalSpent,
    days_since_last_service: daysSinceService,
    last_service_date: lastService?.completed_at || lastService?.scheduled_date || null,
    photo_count: (photos || []).length,
  };
}

export { COMPLETED_STATUSES, ACTIVE_FOR_LIVE, normalizeStatus };
