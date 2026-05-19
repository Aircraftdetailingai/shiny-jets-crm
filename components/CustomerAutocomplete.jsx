"use client";
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * Customer-name input with a mobile-friendly autocomplete dropdown.
 *
 * The dropdown is rendered into a React portal at document.body so it escapes
 * the modal's `max-h-[90vh] overflow-y-auto` scroll container. Position is
 * computed from the input's getBoundingClientRect and re-pinned on
 * resize/scroll. Portal logic from commit f18d00f — DO NOT MODIFY.
 *
 * Sort modes (persisted per-user in localStorage):
 *   company — Company A-Z (default). Personal-name rows fall back to last
 *             name, then first name. Display: company_name in bold with
 *             "{name} · email · phone" subtitle.
 *   name    — Last, First. Display: "Last, First" bold with
 *             "{company_name} · email · phone" subtitle when company exists.
 *   recent  — Most recently added. Same row shape as company.
 *
 * Empty-state-on-focus: when the input is focused and the value is empty,
 * the dropdown shows the first 8 customers in the chosen sort order so the
 * user has a baseline list before typing.
 *
 * Props: value, onChange, onSelect, onCreateNew, placeholder, className, listClassName.
 */
const SORT_STORAGE_KEY = 'customer_autocomplete_sort';
const SORT_OPTIONS = [
  { value: 'company', label: 'Company A-Z' },
  { value: 'name', label: 'Name (Last, First)' },
  { value: 'recent', label: 'Recently added' },
];

function readStoredSort() {
  if (typeof window === 'undefined') return 'company';
  try {
    const v = window.localStorage.getItem(SORT_STORAGE_KEY);
    return SORT_OPTIONS.find((o) => o.value === v) ? v : 'company';
  } catch {
    return 'company';
  }
}

function splitName(n) {
  const t = String(n || '').trim();
  if (!t) return { first: '', last: '' };
  const parts = t.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

function primaryLine(c, sortMode) {
  const company = (c.company_name || '').trim();
  const name = (c.name || '').trim();
  if (sortMode === 'name') {
    const { first, last } = splitName(name);
    if (last) return `${last}, ${first}`;
    return name || '—';
  }
  // company + recent: show company if present, else name
  return company || name || '—';
}

function secondaryLine(c, sortMode) {
  const company = (c.company_name || '').trim();
  const name = (c.name || '').trim();
  const email = (c.email || '').trim();
  const phone = (c.phone || '').trim();
  // For 'name' mode, surface company in the subtitle (rather than name, which
  // is already in the primary line). For 'company'/'recent', surface the
  // person's name in the subtitle (rather than company, which is primary).
  const lead = sortMode === 'name'
    ? company
    : (company && name ? name : '');
  const tail = [email, phone].filter(Boolean).join(' \u00b7 ');
  if (lead && tail) return `${lead} \u00b7 ${tail}`;
  return lead || tail;
}

export default function CustomerAutocomplete({
  value,
  onChange,
  onSelect,
  onCreateNew,
  placeholder = 'Customer name',
  className = '',
  listClassName = '',
}) {
  const [matches, setMatches] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const [sortMode, setSortMode] = useState('company');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const sortBtnRef = useRef(null);
  const sortMenuRef = useRef(null);
  const debounceRef = useRef(null);

  // Hydrate persisted sort once on mount (avoids SSR mismatch by deferring
  // the localStorage read until after first render).
  useEffect(() => { setSortMode(readStoredSort()); }, []);

  // Persist sort changes.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(SORT_STORAGE_KEY, sortMode); } catch {}
  }, [sortMode]);

  // Fetch against /api/customers — debounced when typing, immediate on
  // empty-state-on-focus / sort change. Empty value with input focused
  // returns the first 8 by the chosen sort so the user has a baseline list.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = (value || '').trim();
    // Only fetch when the input is focused — avoids a fetch on every
    // remount.
    if (!open) {
      setMatches([]);
      setLoading(false);
      return;
    }
    const runFetch = async () => {
      setLoading(true);
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : null;
        const params = new URLSearchParams({ limit: '8', sort: sortMode });
        if (q.length >= 2) params.set('q', q);
        const url = `/api/customers?${params.toString()}`;
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: 'no-store',
        });
        if (!res.ok) {
          console.error('[CustomerAutocomplete] fetch failed', url, res.status);
          setMatches([]);
          return;
        }
        const data = await res.json();
        const list = Array.isArray(data?.customers) ? data.customers.slice(0, 8) : [];
        console.log('[CustomerAutocomplete] fetch', url, res.status, 'matches=', list.length);
        setMatches(list);
      } catch (err) {
        console.error('[CustomerAutocomplete] fetch threw', err?.message || err);
        setMatches([]);
      } finally {
        setLoading(false);
      }
    };
    // Empty-state and sort-change fire immediately; typed-query debounces.
    const delay = q.length >= 2 ? 200 : 0;
    debounceRef.current = setTimeout(runFetch, delay);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value, sortMode, open]);

  // Pin the dropdown to the input's viewport rect. Re-runs on resize/scroll
  // and on visualViewport changes — iOS Safari's window.innerHeight doesn't
  // shrink when the keyboard opens, but visualViewport.height does. The
  // offsetTop/offsetLeft fields capture the visual viewport's displacement
  // from the layout viewport, so subtracting them keeps the portal glued to
  // the input even when iOS shifts the page up for the keyboard.
  const recomputeRect = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const offsetTop = vv ? vv.offsetTop : 0;
    const offsetLeft = vv ? vv.offsetLeft : 0;
    setAnchorRect({
      top: r.bottom - offsetTop,
      left: r.left - offsetLeft,
      width: r.width,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    recomputeRect();
    const handler = () => recomputeRect();
    window.addEventListener('resize', handler);
    // capture=true so we catch scrolls on inner overflow containers (the
    // modal's max-h scroll area).
    window.addEventListener('scroll', handler, true);
    // visualViewport events fire when the iOS keyboard slides in/out — the
    // dropdown needs to reflow with them so it stays anchored to the input.
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (vv) {
      vv.addEventListener('resize', handler);
      vv.addEventListener('scroll', handler);
    }
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
      if (vv) {
        vv.removeEventListener('resize', handler);
        vv.removeEventListener('scroll', handler);
      }
    };
  }, [open, recomputeRect]);

  // Tap-outside-to-close. Allow taps in input, dropdown, sort button, or
  // sort menu to keep dropdown open.
  useEffect(() => {
    if (!open && !sortMenuOpen) return;
    const onDocPointerDown = (e) => {
      const inInput = inputRef.current && inputRef.current.contains(e.target);
      const inDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      const inSortBtn = sortBtnRef.current && sortBtnRef.current.contains(e.target);
      const inSortMenu = sortMenuRef.current && sortMenuRef.current.contains(e.target);
      if (!inInput && !inDropdown && !inSortBtn && !inSortMenu) {
        setOpen(false);
        setSortMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [open, sortMenuOpen]);

  const handleFocus = () => {
    setOpen(true);
    setTimeout(() => {
      try { inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
    }, 250);
  };

  const handleChange = (e) => {
    onChange?.(e.target.value);
    setOpen(true);
  };

  const pickCustomer = (c) => {
    onSelect?.(c);
    setOpen(false);
    setSortMenuOpen(false);
  };

  const pickCreateNew = () => {
    const typed = (value || '').trim();
    // Empty is now valid — the parent's onCreateNew handler clears
    // customer_id and lets the user fill name/email manually.
    if (onCreateNew) onCreateNew(typed);
    else if (typed) onChange?.(typed);
    setOpen(false);
    setSortMenuOpen(false);
  };

  const q = (value || '').trim();
  // Show dropdown whenever the input is focused. Empty state shows the
  // first 8 by sort; >=2-char queries show filtered matches. When
  // onCreateNew is provided, the "+ Add new customer" row anchors the
  // bottom of the dropdown even for zero-customer detailers.
  const showDropdown = open && anchorRect && (loading || matches.length > 0 || q.length >= 2 || !!onCreateNew);
  const canPortal = typeof window !== 'undefined' && typeof document !== 'undefined';

  const dropdown = showDropdown ? (
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: anchorRect.top + 4,
        left: anchorRect.left,
        width: anchorRect.width,
        zIndex: 9999,
        // iOS Safari momentum scrolling on overflow:auto.
        WebkitOverflowScrolling: 'touch',
      }}
      className={`max-h-72 overflow-y-auto bg-v-surface border border-v-border rounded-md shadow-lg ${listClassName}`}
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.preventDefault()}
    >
      {matches.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => pickCustomer(c)}
          style={{ touchAction: 'manipulation' }}
          className="w-full text-left px-3 py-2 hover:bg-white/5 active:bg-white/10 border-b border-v-border/30 last:border-b-0"
        >
          <div className="text-sm font-semibold text-v-text-primary truncate">{primaryLine(c, sortMode)}</div>
          {secondaryLine(c, sortMode) && (
            <div className="text-[11px] text-v-text-secondary truncate">{secondaryLine(c, sortMode)}</div>
          )}
        </button>
      ))}
      {onCreateNew && (
        <button
          type="button"
          onClick={pickCreateNew}
          style={{ touchAction: 'manipulation' }}
          className="w-full text-left px-3 py-2 text-xs text-v-gold hover:bg-v-gold/10 active:bg-v-gold/20 border-t border-v-gold/20"
        >
          {q
            ? <>+ Add new customer: <span className="font-semibold">{q}</span></>
            : <>+ Add new customer</>}
        </button>
      )}
    </div>
  ) : null;

  // Sort menu — small popover rendered into the same portal so it doesn't
  // get clipped by any modal scroll container.
  const sortBtnRect = sortBtnRef.current ? sortBtnRef.current.getBoundingClientRect() : null;
  const sortMenu = sortMenuOpen && sortBtnRect && canPortal ? createPortal(
    <div
      ref={sortMenuRef}
      style={{
        position: 'fixed',
        top: sortBtnRect.bottom + 4,
        right: Math.max(8, window.innerWidth - sortBtnRect.right),
        zIndex: 10000,
        minWidth: '180px',
      }}
      className="bg-v-surface border border-v-border rounded-md shadow-lg py-1"
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.preventDefault()}
    >
      {SORT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => { setSortMode(opt.value); setSortMenuOpen(false); }}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-white/5 active:bg-white/10"
        >
          <span className={sortMode === opt.value ? 'text-v-gold' : 'text-v-text-primary'}>{opt.label}</span>
          {sortMode === opt.value && <span className="text-v-gold text-xs">&#10003;</span>}
        </button>
      ))}
    </div>,
    document.body,
  ) : null;

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value || ''}
          onChange={handleChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          autoComplete="off"
          className={`${className} pr-10`}
        />
        <button
          ref={sortBtnRef}
          type="button"
          aria-label={`Sort: ${SORT_OPTIONS.find((o) => o.value === sortMode)?.label || 'Company A-Z'}`}
          title="Change sort order"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setSortMenuOpen((v) => !v);
          }}
          className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-v-text-secondary hover:text-v-gold transition-colors"
        >
          <span aria-hidden className="text-base leading-none">&#x21F5;</span>
        </button>
      </div>
      {dropdown && canPortal && createPortal(dropdown, document.body)}
      {sortMenu}
    </div>
  );
}
