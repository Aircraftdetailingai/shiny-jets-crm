/** Human-readable labels for aircraft category / size enums. */
export const AIRCRAFT_CATEGORY_LABELS = {
  piston: 'Piston',
  single_piston: 'Single Piston',
  twin_piston: 'Twin Piston',
  turboprop: 'Turboprop',
  light_jet: 'Light Jet',
  very_light_jet: 'Very Light Jet',
  midsize_jet: 'Midsize Jet',
  mid_jet: 'Midsize Jet',
  super_midsize_jet: 'Super Midsize Jet',
  super_mid_jet: 'Super Midsize Jet',
  large_jet: 'Large Jet',
  heavy_jet: 'Heavy Jet',
  ultra_long_range: 'Ultra Long Range',
  helicopter: 'Helicopter',
  ultralight: 'Ultralight',
  experimental: 'Experimental',
};

/**
 * True when a value is one of the category enums (large_jet, TURBOPROP,
 * "Light Jet", ...) rather than a real manufacturer / model name. Used to
 * keep category slugs out of manufacturer fields and display names.
 */
export function isAircraftCategory(value) {
  if (value == null) return false;
  const key = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!key) return false;
  return Object.prototype.hasOwnProperty.call(AIRCRAFT_CATEGORY_LABELS, key) || key === 'unknown';
}

/** Turn snake_case enums into Title Case words when no map entry exists. */
export function humanizeAircraftCategory(value) {
  if (value == null || value === '') return '';
  const key = String(value).trim();
  if (!key) return '';
  const norm = key.toLowerCase().replace(/[\s-]+/g, '_');
  if (AIRCRAFT_CATEGORY_LABELS[norm]) return AIRCRAFT_CATEGORY_LABELS[norm];
  if (norm === 'unknown') return '';
  // Already human ("Gulfstream G4") — leave alone if it has no underscores
  if (!key.includes('_')) return key;
  return key
    .split('_')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Remove a leading category slug that older code prepended to aircraft
 * names ("large_jet Gulfstream G4", "LARGE_JET GULFSTREAM G4",
 * "Light Jet Citation CJ3") and collapse whitespace.
 */
export function stripCategoryPrefix(name) {
  if (name == null) return '';
  let s = String(name).trim().replace(/\s+/g, ' ');
  if (!s) return '';
  // Longest labels first so "super_midsize_jet" wins over "midsize_jet".
  const keys = Object.keys(AIRCRAFT_CATEGORY_LABELS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const slugRe = new RegExp(`^${key}\\b[\\s:·-]*`, 'i');
    const labelRe = new RegExp(`^${AIRCRAFT_CATEGORY_LABELS[key].replace(/ /g, '\\s+')}\\s+(?=\\S)`, 'i');
    if (slugRe.test(s)) { s = s.replace(slugRe, ''); break; }
    // Only strip a human label when something follows it ("Large Jet G650"),
    // never when the label IS the whole value.
    if (labelRe.test(s) && s.replace(labelRe, '').length > 0 && key.includes('_')) {
      s = s.replace(labelRe, '');
      break;
    }
  }
  if (/^unknown\s+/i.test(s)) s = s.replace(/^unknown\s+/i, '');
  return s.trim();
}

/**
 * Canonical "Make Model" display string from manufacturer + model columns.
 * - drops a manufacturer that is really a category slug (large_jet …)
 * - strips a category prefix baked into the model
 * - avoids "Gulfstream Gulfstream G4" when the model already includes the make
 */
export function aircraftMakeModel(manufacturer, model) {
  const make = isAircraftCategory(manufacturer) ? '' : stripCategoryPrefix(manufacturer || '');
  const mdl = stripCategoryPrefix(model || '');
  if (make && mdl) {
    const lm = mdl.toLowerCase();
    const lk = make.toLowerCase();
    if (lm.startsWith(lk)) return mdl;
    // make column already carries the full name ("Gulfstream G4" + "G4")
    if (lk === lm || lk.endsWith(` ${lm}`)) return make;
    return `${make} ${mdl}`;
  }
  return mdl || make || '';
}

/** Prefer model; fall back to humanized type/category. */
export function aircraftDisplayName({ aircraft_model, aircraft_type, aircraft_name, aircraft_make } = {}) {
  // Legacy manual jobs map aircraft_make into aircraft_type, so a
  // non-category aircraft_type is treated as the make.
  const makeSrc = aircraft_make || (aircraft_type && !isAircraftCategory(aircraft_type) ? aircraft_type : '');
  const make = makeSrc && !isAircraftCategory(makeSrc) ? makeSrc : '';
  const model = aircraftMakeModel(make, aircraft_model);
  if (model) return model;
  const named = stripCategoryPrefix(aircraft_name || '');
  if (named && !isAircraftCategory(named) && !/^unknown aircraft$/i.test(named)) return named;
  // aircraft_type may be a real make on legacy manual jobs ("Gulfstream").
  if (aircraft_type && !isAircraftCategory(aircraft_type)) return humanizeAircraftCategory(aircraft_type);
  return humanizeAircraftCategory(aircraft_type) || 'Aircraft';
}
