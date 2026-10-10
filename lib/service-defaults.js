import { defaultApplicability } from './applicability';
import { correctServiceName } from './copy-corrections';

// Default service catalog and the numbers a new shop starts with.
//
// Import used to persist a name and an hourly rate only. Hours were left
// null, and a few rows pointed at the wrong aircraft-hours column (Decon
// Wash stored as a plain exterior wash). Quotes then fell through to 1.0h
// or to the wrong catalog column.
//
// default_hours is the shop starting point when no aircraft is selected.
// Once an aircraft is selected, the catalog column (hours_field) and any
// learned calibration or per-model pin take over — see lib/resolve-service-hours.js.

export const DEFAULT_HOURS_BY_FIELD = {
  ext_wash_hours: 2,
  decon_hours: 3,
  polish_hours: 12,
  wax_hours: 6,
  ceramic_hours: 18,
  spray_ceramic_hours: 8,
  int_detail_hours: 6,
  carpet_hours: 3,
  leather_hours: 4,
  brightwork_hours: 6,
};

export const DEFAULT_SERVICE_CATALOG = [
  { name: 'Maintenance Wash', description: 'Regular exterior wash', hourly_rate: 120, category: 'exterior', hours_field: 'ext_wash_hours', default_hours: 2 },
  { name: 'Decon Wash', description: 'Deep clean with iron remover and clay bar', hourly_rate: 130, category: 'exterior', hours_field: 'decon_hours', default_hours: 3 },
  { name: 'One-Step Polish', description: 'Light polish to remove minor swirls', hourly_rate: 140, category: 'exterior', hours_field: 'polish_hours', default_hours: 12 },
  { name: 'Wax Application', description: 'Protective wax coating', hourly_rate: 100, category: 'exterior', hours_field: 'wax_hours', default_hours: 6 },
  { name: 'Spray Ceramic', description: 'Ceramic spray sealant', hourly_rate: 120, category: 'exterior', hours_field: 'spray_ceramic_hours', default_hours: 8 },
  { name: 'Ceramic Coating', description: 'Professional ceramic coating, 2+ year protection', hourly_rate: 175, category: 'exterior', hours_field: 'ceramic_hours', default_hours: 18 },
  { name: 'Vacuum & Wipe Down', description: 'Interior vacuum and surface wipe', hourly_rate: 100, category: 'interior', hours_field: 'int_detail_hours', default_hours: 6 },
  { name: 'Carpet Extraction', description: 'Deep carpet and upholstery cleaning', hourly_rate: 110, category: 'interior', hours_field: 'carpet_hours', default_hours: 3 },
  { name: 'Leather Clean & Condition', description: 'Full leather treatment', hourly_rate: 115, category: 'interior', hours_field: 'leather_hours', default_hours: 4 },
  { name: 'Polish Brightwork', description: 'Metal and chrome polishing', hourly_rate: 130, category: 'exterior', hours_field: 'brightwork_hours', default_hours: 6 },
];

function autoDetectHoursField(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('decon')) return 'decon_hours';
  if (n.includes('polish') && !n.includes('bright')) return 'polish_hours';
  if (n.includes('wax')) return 'wax_hours';
  if (n.includes('leather') || n.includes('seat')) return 'leather_hours';
  if (n.includes('carpet') || n.includes('extract') || n.includes('upholster')) return 'carpet_hours';
  if (n.includes('spray ceramic') || n.includes('spray coat')) return 'spray_ceramic_hours';
  if (n.includes('ceramic') || n.includes('coating')) return 'ceramic_hours';
  if (n.includes('bright') || n.includes('chrome')) return 'brightwork_hours';
  if (n.includes('interior') || n.includes('vacuum') || n.includes('wipe') || n.includes('cabin')) return 'int_detail_hours';
  if (n.includes('wash') || n.includes('exterior') || n.includes('rinse')) return 'ext_wash_hours';
  return null;
}

function categoryToHoursField(category, name) {
  const n = (name || '').toLowerCase();
  switch (category) {
    case 'brightwork':
      return 'brightwork_hours';
    case 'interior':
      if (n.includes('leather') || n.includes('seat')) return 'leather_hours';
      if (n.includes('carpet') || n.includes('extract') || n.includes('upholster')) return 'carpet_hours';
      return 'int_detail_hours';
    case 'exterior':
    case 'paint_correction':
    case 'coating': {
      if (n.includes('decon')) return 'decon_hours';
      if (n.includes('spray ceramic') || n.includes('spray coat')) return 'spray_ceramic_hours';
      if (n.includes('ceramic') || n.includes('coating')) return 'ceramic_hours';
      if (n.includes('wax')) return 'wax_hours';
      if (n.includes('polish') && !n.includes('bright')) return 'polish_hours';
      if (n.includes('bright') || n.includes('chrome')) return 'brightwork_hours';
      return 'ext_wash_hours';
    }
    default:
      return null;
  }
}

export function detectHoursField(name, category) {
  return categoryToHoursField(category, name) || autoDetectHoursField(name);
}

// Explicit hours_field wins, except the onboarding bug that stored Decon Wash
// (and any other specifically-named service) as a generic exterior wash.
export function resolveHoursField({ name, category, hours_field } = {}) {
  const detected = detectHoursField(name, category);
  if (!hours_field) return detected;
  if (hours_field === 'ext_wash_hours' && detected && detected !== 'ext_wash_hours') return detected;
  return hours_field;
}

function catalogMatch(name) {
  const n = String(name || '').toLowerCase().trim();
  if (!n) return null;
  return DEFAULT_SERVICE_CATALOG.find((s) => s.name.toLowerCase() === n) || null;
}

function positive(value) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Fill rate, hours column, and a non-zero starting hour value. Unknown
// custom services keep a positive rate the caller sent and only gain a
// default hour count when we can tell which column they belong to.
export function prepareImportedService(input) {
  const src = input || {};
  const correctedName = correctServiceName(src.name);
  const known = catalogMatch(correctedName);
  const name = correctedName || known?.name || '';
  const category = src.category || known?.category || null;
  const hours_field = resolveHoursField({
    name,
    category,
    hours_field: src.hours_field || known?.hours_field || null,
  });
  const hourly_rate = positive(src.hourly_rate) || positive(known?.hourly_rate) || 0;
  const default_hours = positive(src.default_hours)
    || positive(known?.default_hours)
    || (hours_field ? DEFAULT_HOURS_BY_FIELD[hours_field] : null)
    || null;
  const rules = defaultApplicability({ name, hours_field });
  const allowed = Array.isArray(src.allowed_categories) ? src.allowed_categories : rules.allowed_categories;
  return {
    name,
    description: correctServiceName(src.description || known?.description || ''),
    category,
    hourly_rate,
    hours_field,
    default_hours,
    requires_brightwork: src.requires_brightwork ?? rules.requires_brightwork,
    requires_deice_boots: src.requires_deice_boots ?? rules.requires_deice_boots,
    allowed_categories: allowed,
  };
}
