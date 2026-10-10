// Which services and packages belong on a given aircraft model.
//
// Attributes (category, polished brightwork, de-ice boots) are maintained
// on the shared aircraft list. A service or package declares what it needs.
// A shop can force a row on or off for one model; that override wins.
// Nothing in this module returns a price.

export const OFFER_CATEGORIES = [
  { id: 'helicopter', label: 'Helicopter' },
  { id: 'jet', label: 'Jet' },
  { id: 'turboprop', label: 'Turboprop' },
  { id: 'piston', label: 'Piston' },
];

const JET_CATEGORIES = new Set(['light_jet', 'midsize_jet', 'super_midsize_jet', 'large_jet', 'jet']);

// Piston types that commonly carry pneumatic leading-edge boots.
const PISTON_BOOTS = /baron|bonanza|duke|malibu|mirage|\bmatrix\b|seneca|navajo|chieftain|mojave|aerostar|pa-46|\b310\b|\b340\b|\b414\b|\b421\b/;

export function normalizeAircraftCategory(category) {
  const c = String(category || '').toLowerCase().trim();
  if (!c) return null;
  if (c === 'helicopter' || c.includes('heli') || c.includes('rotor')) return 'helicopter';
  if (c === 'turboprop' || c.includes('turboprop')) return 'turboprop';
  if (c === 'piston') return 'piston';
  if (JET_CATEGORIES.has(c) || c.includes('jet')) return 'jet';
  return null;
}

// Gulfstream IV is stored as G4 (also GIV / G-IV). G450 and G400 are not the IV.
export function isGulfstreamIv({ manufacturer, model } = {}) {
  const mfr = String(manufacturer || '').toLowerCase();
  const modelRaw = String(model || '').toLowerCase().trim();
  const gulf = mfr.includes('gulfstream') || modelRaw.includes('gulfstream');
  if (!gulf) return false;
  const compact = modelRaw.replace(/[\s_]+/g, '');
  if (compact === 'g4' || compact === 'g-4' || compact === 'iv') return true;
  if (/^g-?iv(?:-?sp)?$/.test(compact)) return true;
  if (/\bgulfstream\s+iv\b/.test(modelRaw) || /\bg-?iv\b/.test(modelRaw)) return true;
  return false;
}

export function inferAircraftAttributes(row = {}) {
  const category = normalizeAircraftCategory(row.category);
  const brightworkHours = parseFloat(row.brightwork_hours);
  let has_polished_brightwork = true;
  if (category === 'helicopter') has_polished_brightwork = false;
  else if (Number.isFinite(brightworkHours) && brightworkHours <= 0) has_polished_brightwork = false;

  let has_deice_boots = category === 'turboprop';
  const name = `${row.manufacturer || ''} ${row.model || ''}`;
  if (category === 'piston' && PISTON_BOOTS.test(name.toLowerCase())) has_deice_boots = true;
  if (category === 'jet' || category === 'helicopter') has_deice_boots = false;
  if (isGulfstreamIv(row)) has_deice_boots = false;

  return { category, has_polished_brightwork, has_deice_boots };
}

// A stored boolean wins. Null columns fall back to the seed rules so a model
// still filters before the migration has been applied.
export function resolveAircraftAttributes(row = {}) {
  const inferred = inferAircraftAttributes(row);
  return {
    category: inferred.category,
    has_polished_brightwork: typeof row.has_polished_brightwork === 'boolean'
      ? row.has_polished_brightwork
      : inferred.has_polished_brightwork,
    has_deice_boots: typeof row.has_deice_boots === 'boolean'
      ? row.has_deice_boots
      : inferred.has_deice_boots,
  };
}

export function defaultApplicability({ name, hours_field } = {}) {
  const n = String(name || '').toLowerCase();
  const field = String(hours_field || '');
  return {
    requires_brightwork: field === 'brightwork_hours' || n.includes('brightwork') || n.includes('chrome'),
    requires_deice_boots: /de-?ice|deice|boot dressing|leading[- ]edge boot/.test(n),
    allowed_categories: [],
  };
}

export function withDefaultRules(offer = {}) {
  const defaults = defaultApplicability(offer);
  const cats = offer.allowed_categories == null ? defaults.allowed_categories : offer.allowed_categories;
  return {
    ...offer,
    requires_brightwork: offer.requires_brightwork ?? defaults.requires_brightwork,
    requires_deice_boots: offer.requires_deice_boots ?? defaults.requires_deice_boots,
    allowed_categories: Array.isArray(cats) ? cats : [],
  };
}

export function applicabilityFromBody(body = {}) {
  const out = {};
  if (body.requires_brightwork !== undefined) out.requires_brightwork = !!body.requires_brightwork;
  if (body.requires_deice_boots !== undefined) out.requires_deice_boots = !!body.requires_deice_boots;
  if (body.allowed_categories !== undefined) {
    const cats = Array.isArray(body.allowed_categories) ? body.allowed_categories : [];
    const norm = [...new Set(cats.map(normalizeAircraftCategory).filter(Boolean))];
    out.allowed_categories = norm.length ? norm : null;
  }
  return out;
}

function rulesOf(offer) {
  const row = withDefaultRules(offer);
  return {
    requires_brightwork: !!row.requires_brightwork,
    requires_deice_boots: !!row.requires_deice_boots,
    allowed_categories: (row.allowed_categories || []).map(normalizeAircraftCategory).filter(Boolean),
  };
}

// override.enabled true forces the row on, false forces it off.
// No aircraft yet means "show the catalog" — filtering starts once a model is picked.
export function offerApplies(offer, aircraft, override) {
  if (override && override.enabled === false) return false;
  if (override && override.enabled === true) return true;
  if (!aircraft) return true;
  const attrs = aircraft.attributes || resolveAircraftAttributes(aircraft);
  const rules = rulesOf(offer);
  if (rules.requires_brightwork && !attrs.has_polished_brightwork) return false;
  if (rules.requires_deice_boots && !attrs.has_deice_boots) return false;
  if (rules.allowed_categories.length && attrs.category && !rules.allowed_categories.includes(attrs.category)) return false;
  return true;
}

export function packageApplies(pkg, services, aircraft, overrides) {
  const pkgOverride = overrides?.byPackageId?.[pkg?.id];
  if (!offerApplies(pkg, aircraft, pkgOverride)) return false;
  const ids = Array.isArray(pkg?.service_ids) ? pkg.service_ids : [];
  if (!ids.length) return true;
  const included = (services || []).filter((s) => ids.includes(s.id));
  if (!included.length) return true;
  return included.some((s) => offerApplies(s, aircraft, overrides?.byServiceId?.[s.id]));
}

export function filterOffers({ services = [], packages = [], aircraft = null, overrides = null } = {}) {
  const visibleServices = services.filter((s) => offerApplies(s, aircraft, overrides?.byServiceId?.[s.id]));
  const visiblePackages = packages.filter((p) => packageApplies(p, services, aircraft, overrides));
  return { services: visibleServices, packages: visiblePackages };
}

export function indexOverrides(rows) {
  const byServiceId = {};
  const byPackageId = {};
  for (const row of rows || []) {
    if (!row) continue;
    if (row.service_id) byServiceId[row.service_id] = row;
    if (row.package_id) byPackageId[row.package_id] = row;
  }
  return { byServiceId, byPackageId };
}

export function publicServiceShape(row = {}) {
  const rules = withDefaultRules(row);
  return {
    id: row.id,
    name: row.name,
    category: row.category || null,
    requires_brightwork: !!rules.requires_brightwork,
    requires_deice_boots: !!rules.requires_deice_boots,
    allowed_categories: rules.allowed_categories || [],
  };
}

export function publicPackageShape(row = {}, includedNames = []) {
  const rules = withDefaultRules(row);
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    service_ids: row.service_ids || [],
    included_services: includedNames,
    requires_brightwork: !!rules.requires_brightwork,
    requires_deice_boots: !!rules.requires_deice_boots,
    allowed_categories: rules.allowed_categories || [],
  };
}

export function publicOverrideFlags(rows) {
  return (rows || [])
    .filter((r) => r && (r.enabled === true || r.enabled === false))
    .map((r) => ({
      service_id: r.service_id || null,
      package_id: r.package_id || null,
      enabled: r.enabled,
    }));
}

export function shopPinBlocksLearning(row) {
  if (!row || row.pinned_hours == null || row.pinned_hours === '') return false;
  const n = parseFloat(row.pinned_hours);
  return Number.isFinite(n) && n >= 0;
}
