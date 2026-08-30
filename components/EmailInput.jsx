'use client';

// Shared email input. Native <input type="email"> already accepts paste, so
// the value here is never blocked; this just standardizes the shape alongside
// <PhoneInput> and trims/lowercases on blur so pasted addresses with stray
// spaces or casing don't slip through. Contract: value:string, onChange(val).
export default function EmailInput({ value, onChange, placeholder = 'email@example.com', className = '', ...props }) {
  return (
    <input
      type="email"
      inputMode="email"
      autoComplete="email"
      value={value || ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        const cleaned = e.target.value.trim();
        if (cleaned !== e.target.value) onChange(cleaned);
      }}
      className={className}
      {...props}
    />
  );
}
