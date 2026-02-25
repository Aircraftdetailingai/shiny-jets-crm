"use client";
import { useState, useRef, useEffect } from 'react';
import { LANGUAGES } from '@/lib/landing-translations';

export default function LandingLanguageSelector({ lang, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
        aria-label="Select language"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
        <span className="hidden sm:inline">{current.flag} {current.code.toUpperCase()}</span>
        <span className="sm:hidden">{current.flag}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 bg-[#1a2332] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
          {LANGUAGES.map(l => (
            <a
              key={l.code}
              href={l.code === 'en' ? '/' : `/${l.code}`}
              onClick={() => {
                localStorage.setItem('vector_landing_lang', l.code);
                if (onChange) onChange(l.code);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/5 transition-colors ${
                l.code === lang ? 'text-amber-400 bg-white/[0.03]' : 'text-gray-300'
              }`}
            >
              <span className="text-base">{l.flag}</span>
              <span>{l.label}</span>
              {l.code === lang && <span className="ml-auto text-amber-400 text-xs">&#10003;</span>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
