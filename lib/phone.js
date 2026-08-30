// Normalize a phone number toward E.164 without ever rejecting input.
//
// Used by the shared <PhoneInput>. The old react-phone-number-input masking
// silently swallowed pasted national numbers ("pasting does nothing"); this
// coerces instead of blocking: US 10-digit → +1XXXXXXXXXX, 11-digit leading 1
// → +1…, anything already starting with + is left as-is (international), and
// partial/unrecognized input is returned untouched so typing still works.
export function normalizePhone(raw) {
  if (!raw) return '';
  const d = String(raw).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d;
  const digits = d.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return d;
}
