// Which aircraft name to show for an intake lead.
//
// The customer picks their aircraft (e.g. "Beechcraft King Air 350") in the
// public intake form. The form also runs a silent FAA N-number lookup on the
// tail, which returns the type-certificate designation instead of the
// marketing name (a King Air 350 is registered as "RAYTHEON B300"). Older
// versions of the form let that registry string overwrite the customer's
// choice before saving, so some leads have aircraft_model = "Raytheon B300".
//
// Rules:
//  - The customer's selection is always the primary value.
//  - FAA registry data is secondary context only ("FAA registry: Raytheon B300")
//    and is only shown when it says something different.
//  - New leads store the registry result under intake_responses._faa_registry
//    (keys starting with "_" are internal and hidden from the responses list).
//  - Legacy leads whose aircraft_model is a raw registry string are mapped to
//    the marketing name when the FAA designation is unambiguous (King Air
//    family), keeping the raw string as the secondary registry line.

// FAA model designation -> marketing model name, for designations that map
// to exactly one model. Only Beech/Raytheon/Hawker Beechcraft/Textron King Air
// types are listed; anything else is shown as-is.
const KING_AIR_FAA_MODELS = {
  B300: 'King Air 350',
  B300C: 'King Air 350C',
  '300': 'King Air 300',
  '300LW': 'King Air 300',
  B200: 'King Air B200',
  B200C: 'King Air B200C',
  B200GT: 'King Air 250',
  B200CGT: 'King Air 250',
  '200': 'King Air 200',
  C90: 'King Air C90',
  C90A: 'King Air C90',
  C90GT: 'King Air C90GT',
  C90GTI: 'King Air C90GTi',
  C90GTX: 'King Air C90GTx',
  E90: 'King Air E90',
  F90: 'King Air F90',
  '100': 'King Air 100',
  A100: 'King Air A100',
  B100: 'King Air B100',
};
const BEECH_FAA_MAKERS = /^(raytheon|beech|beechcraft|hawker beechcraft|textron)(\s+(aircraft|aviation|corp\.?|co\.?|inc\.?))*$/i;

const clean = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
const norm = (v) => clean(v).toLowerCase();

/**
 * Map a raw FAA "Manufacturer Model" string (e.g. "Raytheon B300") to the
 * marketing name ("Beechcraft King Air 350"). Returns null when there is no
 * unambiguous mapping.
 */
export function marketingNameFromRegistry(manufacturer, model) {
  const mfr = clean(manufacturer);
  const mdl = clean(model).toUpperCase().replace(/[\s-]+/g, '');
  if (!mfr || !mdl || !BEECH_FAA_MAKERS.test(mfr)) return null;
  const name = KING_AIR_FAA_MODELS[mdl];
  return name ? `Beechcraft ${name}` : null;
}

function splitMakeModel(str) {
  const s = clean(str);
  if (!s) return null;
  // Try two-word makers first ("Hawker Beechcraft B300").
  const parts = s.split(' ');
  for (let i = Math.min(parts.length - 1, 3); i >= 1; i -= 1) {
    const mfr = parts.slice(0, i).join(' ');
    const mdl = parts.slice(i).join(' ');
    if (BEECH_FAA_MAKERS.test(mfr)) return { manufacturer: mfr, model: mdl };
  }
  return null;
}

/**
 * @param {object} lead intake_leads row ({ aircraft_model, intake_responses })
 * @returns {{ primary: string, registry: string|null }}
 *   primary  – the customer-selected aircraft ('' when none)
 *   registry – the FAA registry make/model when it differs from primary, else null
 */
export function leadAircraft(lead) {
  const stored = clean(lead?.aircraft_model);
  const reg = lead?.intake_responses && typeof lead.intake_responses === 'object'
    ? lead.intake_responses._faa_registry
    : null;
  const regDisplay = reg && typeof reg === 'object'
    ? clean(reg.display || `${clean(reg.manufacturer)} ${clean(reg.model)}`)
    : clean(reg);

  let primary = stored;
  let registry = regDisplay || null;

  // Legacy rows: aircraft_model holds the raw registry string.
  if (stored) {
    const split = splitMakeModel(stored);
    const mapped = split && marketingNameFromRegistry(split.manufacturer, split.model);
    if (mapped) {
      primary = mapped;
      registry = registry || stored;
    }
  }
  if (!primary && registry) {
    // No customer selection at all — fall back to the registry (mapped if possible).
    const split = splitMakeModel(registry);
    primary = (split && marketingNameFromRegistry(split.manufacturer, split.model)) || registry;
  }
  if (registry && norm(registry) === norm(primary)) registry = null;
  return { primary, registry };
}

/** Plain string for emails / search: the customer-selected aircraft. */
export function leadAircraftName(lead, fallback = '') {
  return leadAircraft(lead).primary || fallback;
}

/** Intake response keys starting with "_" are internal metadata. */
export function isInternalIntakeKey(key) {
  return typeof key === 'string' && key.startsWith('_');
}
