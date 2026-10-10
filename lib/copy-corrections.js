// Known typos shipped in an early service catalog and intake-flow option.
// The seed lists in this repo use the corrected spelling. These helpers
// repair rows that were saved before that, including JSON stored on
// intake_flows, until the SQL migration has been applied.

export const SERVICE_NAME_FIXES = {
  'Restore Un-Pressurized Windows - Exteriro': 'Restore Un-Pressurized Windows - Exterior',
};

const INTAKE_REPLACEMENTS = [
  ['Verfied Finish', 'Verified Finish'],
  ['Exteriro', 'Exterior'],
];

export function correctServiceName(name) {
  if (typeof name !== 'string' || !name) return name;
  if (SERVICE_NAME_FIXES[name]) return SERVICE_NAME_FIXES[name];
  return name.includes('Exteriro') ? name.replaceAll('Exteriro', 'Exterior') : name;
}

export function correctIntakeCopy(value) {
  if (typeof value === 'string') {
    let next = value;
    for (const [from, to] of INTAKE_REPLACEMENTS) {
      if (next.includes(from)) next = next.replaceAll(from, to);
    }
    return next;
  }
  if (Array.isArray(value)) return value.map(correctIntakeCopy);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = correctIntakeCopy(child);
    return out;
  }
  return value;
}
