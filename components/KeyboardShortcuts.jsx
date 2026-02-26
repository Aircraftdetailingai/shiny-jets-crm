"use client";
import { useState, useEffect, useCallback } from 'react';

const SHORTCUTS = [
  { keys: ['⌘/Ctrl', 'N'], description: 'New Quote', scope: 'Global' },
  { keys: ['⌘/Ctrl', 'K'], description: 'Search', scope: 'Global' },
  { keys: ['⌘/Ctrl', '⇧', 'A'], description: 'Quick Actions', scope: 'Global' },
  { keys: ['⌘/Ctrl', 'S'], description: 'Save form', scope: 'Forms' },
  { keys: ['Esc'], description: 'Close modal', scope: 'Global' },
  { keys: ['?'], description: 'Show shortcuts', scope: 'Global' },
  { keys: ['G', 'D'], description: 'Go to Dashboard', scope: 'Navigation' },
  { keys: ['G', 'Q'], description: 'Go to Quotes', scope: 'Navigation' },
  { keys: ['G', 'C'], description: 'Go to Calendar', scope: 'Navigation' },
  { keys: ['G', 'S'], description: 'Go to Settings', scope: 'Navigation' },
  { keys: ['G', 'H'], description: 'Go to Help', scope: 'Navigation' },
];

function ShortcutsModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const grouped = {};
  for (const s of SHORTCUTS) {
    if (!grouped[s.scope]) grouped[s.scope] = [];
    grouped[s.scope].push(s);
  }

  return (
    <div className="modal-overlay fixed inset-0 bg-black/60 flex items-center justify-center z-[200] p-4" onClick={onClose}>
      <div
        className="modal-content bg-[#1e293b] border border-white/10 rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-5">
          {Object.entries(grouped).map(([scope, items]) => (
            <div key={scope}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{scope}</h3>
              <div className="space-y-2">
                {items.map((s, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">{s.description}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((key, j) => (
                        <span key={j} className="flex items-center gap-1">
                          <kbd className="px-2 py-0.5 bg-white/10 border border-white/20 rounded text-xs text-white font-mono min-w-[24px] text-center">
                            {key}
                          </kbd>
                          {j < s.keys.length - 1 && <span className="text-gray-600 text-xs">+</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-white/10 text-center">
          <p className="text-xs text-gray-500">Press <kbd className="px-1.5 py-0.5 bg-white/10 border border-white/20 rounded text-[10px] text-gray-400 font-mono">Esc</kbd> to close</p>
        </div>
      </div>
    </div>
  );
}

export default function KeyboardShortcuts() {
  const [showModal, setShowModal] = useState(false);
  const [gPressed, setGPressed] = useState(false);
  const [gTimer, setGTimer] = useState(null);

  const isInputFocused = useCallback(() => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const meta = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + N -> New Quote
      if (meta && e.key === 'n') {
        e.preventDefault();
        window.location.href = '/dashboard';
        return;
      }

      // Cmd/Ctrl + K -> Search (handled by GlobalSearch component)
      // Don't intercept here — let GlobalSearch handle it

      // Cmd/Ctrl + S -> Save (dispatch custom event for forms to listen to)
      if (meta && e.key === 's') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('vector:save'));
        return;
      }

      // Don't process single-key shortcuts when typing in an input
      if (isInputFocused()) return;

      // Esc -> Close modal / shortcuts
      if (e.key === 'Escape') {
        setShowModal(false);
        return;
      }

      // ? -> Show shortcuts
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowModal(prev => !prev);
        return;
      }

      // G + key navigation (vim-style)
      if (e.key === 'g' && !gPressed) {
        setGPressed(true);
        const timer = setTimeout(() => setGPressed(false), 800);
        setGTimer(timer);
        return;
      }

      if (gPressed) {
        setGPressed(false);
        if (gTimer) clearTimeout(gTimer);

        const routes = {
          d: '/dashboard',
          q: '/quotes',
          c: '/calendar',
          s: '/settings',
          h: '/help',
          t: '/team',
          a: '/admin/aircraft',
        };
        const route = routes[e.key];
        if (route) {
          e.preventDefault();
          window.location.href = route;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (gTimer) clearTimeout(gTimer);
    };
  }, [gPressed, gTimer, isInputFocused]);

  return (
    <>
      <ShortcutsModal isOpen={showModal} onClose={() => setShowModal(false)} />
      {/* Shortcut hint - only shown on non-mobile */}
      <div className="fixed bottom-3 left-3 z-40 hidden lg:block">
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-gray-500 text-xs hover:text-gray-300 hover:border-white/20 transition-colors"
        >
          <kbd className="px-1 py-0.5 bg-white/10 border border-white/15 rounded text-[10px] font-mono">?</kbd>
          <span>Shortcuts</span>
        </button>
      </div>
    </>
  );
}
