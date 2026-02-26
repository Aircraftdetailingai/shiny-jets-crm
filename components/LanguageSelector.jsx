"use client";
import { useState, useRef, useEffect } from 'react';
import { useTranslation, LANGUAGES } from '@/lib/i18n';

export default function LanguageSelector({ variant = 'dropdown', className = '' }) {
  const { lang, setLang } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const current = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

  if (variant === 'inline') {
    return (
      <div className={`flex gap-1 ${className}`}>
        {LANGUAGES.map(l => (
          <button
            key={l.code}
            onClick={() => setLang(l.code)}
            className={`px-2 py-1 rounded text-sm transition-colors ${
              lang === l.code
                ? 'bg-amber-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
            title={l.label}
          >
            {l.flag}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors"
      >
        <span>{current.flag}</span>
        <span className="hidden sm:inline">{current.label}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="slide-in-right absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border overflow-hidden z-50">
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                lang === l.code ? 'bg-amber-50 text-amber-700 font-medium' : 'text-gray-700'
              }`}
            >
              <span>{l.flag}</span>
              <span>{l.label}</span>
              {lang === l.code && <span className="ml-auto text-amber-500">&#10003;</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
