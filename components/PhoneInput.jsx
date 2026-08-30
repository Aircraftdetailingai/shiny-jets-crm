'use client';

import { normalizePhone } from '@/lib/phone';

// Paste-safe phone input. Replaces the react-phone-number-input masking that
// silently dropped pasted national numbers. A plain <input type="tel"> that:
//   - never blocks paste (normalizes the pasted text instead)
//   - lets you type freely; coerces toward E.164 on blur
//   - keeps the same contract as before: value:string, onChange(val:string)
export default function PhoneInput({ value, onChange, placeholder = 'Phone number', className = '', ...props }) {
  const handlePaste = (e) => {
    const text = (e.clipboardData || window.clipboardData)?.getData('text') ?? '';
    // Prevent the raw paste, then set the normalized value ourselves. This is
    // the one legitimate preventDefault on paste — we handle the content.
    e.preventDefault();
    onChange(normalizePhone(text));
  };

  return (
    <input
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={value || ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onPaste={handlePaste}
      onBlur={(e) => {
        const n = normalizePhone(e.target.value);
        if (n !== e.target.value) onChange(n);
      }}
      className={className}
      {...props}
    />
  );
}
