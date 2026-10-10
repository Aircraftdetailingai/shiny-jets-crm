"use client";

import { OFFER_CATEGORIES } from '@/lib/applicability';

export default function ApplicabilityFields({ value, onChange }) {
  const v = value || {};
  const cats = Array.isArray(v.allowed_categories) ? v.allowed_categories : [];
  const set = (patch) => onChange({ ...v, ...patch });
  const toggleCat = (id) => {
    const next = cats.includes(id) ? cats.filter((c) => c !== id) : [...cats, id];
    set({ allowed_categories: next });
  };
  return (
    <div className="border border-v-border rounded-lg p-3 space-y-2">
      <p className="text-sm font-medium text-v-text-secondary">Applies to</p>
      <p className="text-xs text-v-text-secondary">Leave categories empty to allow every aircraft. A model page can still turn this on or off for one model.</p>
      <label className="flex items-center gap-2 text-sm text-v-text-primary">
        <input type="checkbox" checked={!!v.requires_brightwork} onChange={(e) => set({ requires_brightwork: e.target.checked })} />
        Requires polished brightwork
      </label>
      <label className="flex items-center gap-2 text-sm text-v-text-primary">
        <input type="checkbox" checked={!!v.requires_deice_boots} onChange={(e) => set({ requires_deice_boots: e.target.checked })} />
        Requires de-ice boots
      </label>
      <div className="flex flex-wrap gap-2 pt-1">
        {OFFER_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => toggleCat(c.id)}
            className={`px-2 py-1 text-xs rounded border ${cats.includes(c.id) ? 'border-v-gold text-v-gold' : 'border-v-border text-v-text-secondary'}`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
