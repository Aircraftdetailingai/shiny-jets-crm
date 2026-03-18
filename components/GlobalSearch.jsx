"use client";
import { useState, useEffect, useRef, useCallback } from 'react';

const TYPE_CONFIG = {
  quote: { icon: '📄', labelKey: 'search.quote', color: 'text-v-gold' },
  customer: { icon: '👤', labelKey: 'common.customer', color: 'text-green-400' },
  aircraft: { icon: '✈️', labelKey: 'common.aircraft', color: 'text-v-gold' },
};

const STATUS_BADGES = {
  draft: 'bg-gray-500/20 text-gray-300',
  sent: 'bg-v-gold/20 text-v-gold',
  viewed: 'bg-v-gold/20 text-v-gold',
  paid: 'bg-green-500/20 text-green-300',
  completed: 'bg-purple-500/20 text-purple-300',
};

const RECENT_KEY = 'vector_recent_searches';
const MAX_RECENT = 5;

function getRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch { return []; }
}

function saveRecent(term) {
  const recent = getRecent().filter(r => r !== term);
  recent.unshift(term);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [recentSearches, setRecentSearches] = useState([]);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setRecentSearches(getRecent());
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
      setSelectedIdx(-1);
    }
  }, [open]);

  // Debounced search
  const search = useCallback(async (q) => {
    if (!q || q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length >= 2) {
      setLoading(true);
      debounceRef.current = setTimeout(() => search(query), 250);
    } else {
      setResults([]);
      setLoading(false);
    }
    setSelectedIdx(-1);
  }, [query, search]);

  // Keyboard nav
  const handleKeyDown = (e) => {
    const items = results.length > 0 ? results : (query.length < 2 ? recentSearches.map(r => ({ _recent: r })) : []);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(prev => Math.min(prev + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && selectedIdx >= 0) {
      e.preventDefault();
      const item = items[selectedIdx];
      if (item?._recent) {
        setQuery(item._recent);
      } else if (item?.link) {
        navigate(item);
      }
    }
  };

  const navigate = (result) => {
    saveRecent(query);
    setOpen(false);
    window.location.href = result.link;
  };

  const handleRecentClick = (term) => {
    setQuery(term);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded bg-v-surface-light/50 border border-v-border hover:bg-v-surface-light transition-colors text-v-text-secondary text-sm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="hidden sm:inline">{'Search'}</span>
        <kbd className="hidden sm:inline text-[10px] bg-v-surface-light px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
      </button>
    );
  }

  const showRecent = query.length < 2 && recentSearches.length > 0;

  return (
    <div className="modal-overlay fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm">
      <div ref={containerRef} className="modal-content w-full max-w-lg mx-4">
        {/* Search input */}
        <div className="bg-v-surface rounded border border-v-border shadow-2xl overflow-hidden">
          <div className="flex items-center px-4 gap-3 border-b border-v-border">
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={'Search quotes, customers, aircraft...'}
              className="flex-1 bg-transparent text-white placeholder-gray-400 py-4 text-sm outline-none"
            />
            {loading && (
              <div className="w-4 h-4 border-2 border-v-gold border-t-transparent rounded-full animate-spin" />
            )}
            <button onClick={() => setOpen(false)} className="text-v-text-secondary hover:text-v-text-primary text-xs font-mono bg-v-surface-light px-2 py-1 rounded">
              ESC
            </button>
          </div>

          {/* Results */}
          <div className="max-h-[50vh] overflow-y-auto">
            {/* Recent searches */}
            {showRecent && (
              <div className="px-3 py-2">
                <p className="text-xs text-gray-500 px-1 mb-1">{'Recent'}</p>
                {recentSearches.map((term, i) => (
                  <button
                    key={term}
                    onClick={() => handleRecentClick(term)}
                    className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                      selectedIdx === i ? 'bg-v-surface-light text-v-text-primary' : 'text-v-text-secondary hover:bg-v-surface-light/50'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {term}
                  </button>
                ))}
              </div>
            )}

            {/* Search results */}
            {query.length >= 2 && !loading && results.length === 0 && (
              <div className="py-8 text-center text-gray-400 text-sm">
                {'No results for'} &ldquo;{query}&rdquo;
              </div>
            )}

            {results.length > 0 && (
              <div className="px-3 py-2">
                {/* Group by type */}
                {['quote', 'customer', 'aircraft'].map(type => {
                  const typed = results.filter(r => r.type === type);
                  if (typed.length === 0) return null;
                  const config = TYPE_CONFIG[type];
                  return (
                    <div key={type} className="mb-2">
                      <p className="text-xs text-gray-500 px-1 mb-1 uppercase tracking-wider">{type}s</p>
                      {typed.map((result) => {
                        const globalIdx = results.indexOf(result);
                        return (
                          <button
                            key={`${result.type}-${result.id}`}
                            onClick={() => navigate(result)}
                            className={`w-full text-left px-3 py-2.5 rounded flex items-center gap-3 transition-colors ${
                              selectedIdx === globalIdx ? 'bg-v-surface-light' : 'hover:bg-v-surface-light/50'
                            }`}
                          >
                            <span className="text-base flex-shrink-0">{config.icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">{result.title}</p>
                              <p className="text-xs text-gray-400 truncate">{result.subtitle}</p>
                            </div>
                            {result.status && (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_BADGES[result.status] || ''}`}>
                                {result.status}
                              </span>
                            )}
                            <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer hint */}
          {(results.length > 0 || showRecent) && (
            <div className="flex items-center gap-4 px-4 py-2 border-t border-v-border text-[10px] text-v-text-secondary/50">
              <span><kbd className="bg-v-surface-light px-1 rounded">↑↓</kbd> {'navigate'}</span>
              <span><kbd className="bg-v-surface-light px-1 rounded">↵</kbd> {'select'}</span>
              <span><kbd className="bg-v-surface-light px-1 rounded">esc</kbd> {'close'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
