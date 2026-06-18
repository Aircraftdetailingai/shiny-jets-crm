// Service SOP resolver — Level 1 (service default) + Level 2 (aircraft override).
//
// Brett's spec is ADDITIVE: when an aircraft override exists, return BOTH
// the default and the override. The UI flags the override distinctly
// ("Aircraft-specific SOP") so staff can see both procedures and pick the
// right one for the situation.
//
// USAGE:
//   const ctx = await loadSopContext(supabase, { detailer_id, aircraft_id });
//   for (const item of jobServices) {
//     const { default: l1, override: l2 } = ctx.resolve(item);
//     // l1 / l2 are { url, summary } | null
//   }
//
// Shape tolerance per Brett's spec — jobs.services is ambiguous in
// production. The resolver accepts:
//   - bare string ("Maintenance Wash") -> name lookup, scoped by detailer
//   - object with service_id              -> direct lookup
//   - object with { custom: true }         -> always returns null/null
//   - object with name (no service_id)     -> name lookup fallback

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

export async function loadSopContext(supabase, { detailer_id, aircraft_id }) {
  if (!supabase || !detailer_id) {
    return makeContext({ servicesById: new Map(), servicesByName: new Map(), overridesByService: new Map() });
  }

  // Pull every service for this detailer in one query — most jobs have
  // 1-6 services so an in-memory map is cheaper than N round-trips.
  const { data: services } = await supabase
    .from('services')
    .select('id, name, sop_url, sop_summary, created_at')
    .eq('detailer_id', detailer_id);

  const servicesById = new Map();
  const servicesByName = new Map();
  for (const svc of services || []) {
    servicesById.set(svc.id, svc);
    const key = normalizeName(svc.name);
    if (!key) continue;
    // Deterministic tiebreaker for bare-string lookups when a detailer
    // has duplicate service names: oldest created_at wins (the canonical
    // original). Stage 2 may upgrade this to "most recently used on this
    // aircraft" once we plumb usage history in.
    const prior = servicesByName.get(key);
    if (!prior || (svc.created_at && prior.created_at && svc.created_at < prior.created_at)) {
      servicesByName.set(key, svc);
    }
  }

  // Per-aircraft overrides for this detailer. Only relevant when an
  // aircraft_id is in play — bare-string-only renders (no tail context)
  // skip this entirely.
  const overridesByService = new Map();
  if (aircraft_id) {
    const { data: overrides } = await supabase
      .from('aircraft_service_sops')
      .select('id, service_id, sop_url, sop_summary')
      .eq('detailer_id', detailer_id)
      .eq('aircraft_id', aircraft_id);
    for (const o of overrides || []) {
      overridesByService.set(o.service_id, {
        id: o.id,
        url: o.sop_url,
        summary: o.sop_summary || null,
      });
    }
  }

  return makeContext({ servicesById, servicesByName, overridesByService });
}

function makeContext({ servicesById, servicesByName, overridesByService }) {
  return {
    /**
     * Resolve SOPs for one line item from jobs.services / quotes.line_items.
     * Returns { default, override }, both either { url, summary } or null.
     */
    resolve(item) {
      // Custom services explicitly have no SOP context.
      if (item && typeof item === 'object' && item.custom === true) {
        return { default: null, override: null };
      }

      let service = null;
      if (typeof item === 'string') {
        service = servicesByName.get(normalizeName(item)) || null;
      } else if (item && typeof item === 'object') {
        if (item.service_id && servicesById.has(item.service_id)) {
          service = servicesById.get(item.service_id);
        } else {
          // No service_id but maybe name/description — fall back to name lookup
          const name = item.name || item.description || item.service_name;
          if (name) service = servicesByName.get(normalizeName(name)) || null;
        }
      }

      const defaultSop = service?.sop_url
        ? { url: service.sop_url, summary: service.sop_summary || null }
        : null;

      const override = service?.id && overridesByService.has(service.id)
        ? overridesByService.get(service.id)
        : null;

      return { default: defaultSop, override };
    },

    /** Returns the resolved service record (or null) for a line item. */
    resolveService(item) {
      if (item && typeof item === 'object' && item.custom === true) return null;
      if (typeof item === 'string') return servicesByName.get(normalizeName(item)) || null;
      if (item && typeof item === 'object') {
        if (item.service_id && servicesById.has(item.service_id)) return servicesById.get(item.service_id);
        const name = item.name || item.description || item.service_name;
        if (name) return servicesByName.get(normalizeName(name)) || null;
      }
      return null;
    },
  };
}
