"use client";
import { useState } from 'react';

// Wraps export buttons — shows upgrade prompt for free users
export default function ExportGate({ plan, children, className = '' }) {
  const [showPrompt, setShowPrompt] = useState(false);
  const canExport = plan && plan !== 'free';

  if (canExport) return children;

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        onClick={() => setShowPrompt(!showPrompt)}
        className="bg-white/10 hover:bg-white/20 text-white/60 border border-white/20 rounded px-3 py-1 cursor-pointer flex items-center gap-1 text-sm"
      >
        <span>&#128274;</span> Export
      </button>
      {showPrompt && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-xl border p-4 z-50">
          <p className="text-gray-900 font-semibold text-sm mb-1">Export requires Pro</p>
          <p className="text-gray-500 text-xs mb-3">Upgrade to Pro to export your data as CSV.</p>
          <a
            href="/settings"
            className="block w-full text-center px-3 py-2 bg-gradient-to-r from-v-gold to-v-gold-dim text-white text-sm font-medium rounded hover:opacity-90"
          >
            Upgrade to Pro - $79/mo
          </a>
          <button
            onClick={() => setShowPrompt(false)}
            className="block w-full text-center mt-2 text-xs text-gray-400 hover:text-gray-600"
          >
            Maybe later
          </button>
        </div>
      )}
    </div>
  );
}
