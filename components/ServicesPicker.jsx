"use client";

import { useMemo } from 'react';

const DEFAULT_CATEGORY_ORDER = ['exterior', 'interior', 'paint_correction', 'coating', 'brightwork', 'other'];
const DEFAULT_CATEGORY_LABELS = {
  exterior: 'Exterior',
  interior: 'Interior',
  paint_correction: 'Paint Correction',
  coating: 'Coatings & Protection',
  brightwork: 'Brightwork',
  other: 'Other',
};

// Grouped services picker used by the invoice create + edit modals so they
// render the same grid without duplicating JSX. The parent owns selection and
// per-service hour overrides; this component is purely presentational.
export default function ServicesPicker({
  services,
  selectedIds,
  hoursOverrides,
  onToggle,
  onHoursChange,
  getDefaultHours,
  sym = '$',
  emptyLabel = 'Loading services…',
  hint = null,
  categoryOrder = DEFAULT_CATEGORY_ORDER,
  categoryLabels = DEFAULT_CATEGORY_LABELS,
}) {
  const grouped = useMemo(() => {
    const g = {};
    (services || []).forEach(svc => {
      const cat = svc.category || 'other';
      if (!g[cat]) g[cat] = [];
      g[cat].push(svc);
    });
    return g;
  }, [services]);

  const cats = useMemo(() => {
    const ordered = categoryOrder.filter(c => grouped[c]?.length);
    Object.keys(grouped).forEach(c => { if (!ordered.includes(c)) ordered.push(c); });
    return ordered;
  }, [grouped, categoryOrder]);

  if (!services || services.length === 0) {
    return <p className="text-xs text-v-text-secondary/60 italic mb-3">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-4 mb-4">
      {cats.map(cat => (
        <div key={cat}>
          <p className="text-[10px] uppercase tracking-wider text-v-gold/60 mb-1.5">{categoryLabels[cat] || cat}</p>
          <div className="space-y-1">
            {grouped[cat].map(svc => {
              const sel = (selectedIds || []).includes(svc.id);
              const defaultHrs = getDefaultHours ? getDefaultHours(svc) : (parseFloat(svc.default_hours) || 0);
              const overrideHrs = hoursOverrides && hoursOverrides[svc.id] !== undefined ? hoursOverrides[svc.id] : undefined;
              const effectiveHrs = overrideHrs !== undefined ? overrideHrs : defaultHrs;
              const rate = parseFloat(svc.hourly_rate) || 0;
              const svcTotal = (parseFloat(effectiveHrs) || 0) * rate;
              return (
                <div key={svc.id} className={`flex items-center gap-3 p-3 rounded border transition-colors ${sel ? 'border-v-gold/50 bg-v-gold/5' : 'border-v-border bg-v-charcoal'}`}>
                  <input type="checkbox" checked={sel}
                    onChange={() => onToggle && onToggle(svc.id)}
                    className="w-4 h-4 rounded accent-v-gold cursor-pointer" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-v-text-primary">{svc.name}</span>
                    {hint && <span className="text-[10px] text-v-text-secondary/50 ml-2 italic">{hint}</span>}
                  </div>
                  {sel && (
                    <div className="flex items-center gap-2 shrink-0">
                      <input type="number" step="0.01" min="0"
                        value={overrideHrs !== undefined ? overrideHrs : (defaultHrs || '')}
                        onChange={e => {
                          const raw = e.target.value;
                          const next = raw === '' ? 0 : (parseFloat(raw) || 0);
                          if (onHoursChange) onHoursChange(svc.id, next);
                        }}
                        className="w-16 bg-v-surface border border-v-border text-v-text-primary rounded px-2 py-1 text-xs text-center outline-none focus:border-v-gold/50" />
                      <span className="text-[10px] text-v-text-secondary">hrs</span>
                    </div>
                  )}
                  <div className="text-right shrink-0 w-24">
                    {svcTotal > 0 && <span className="text-sm text-v-text-primary font-medium">{sym}{svcTotal.toFixed(2)}</span>}
                    {rate > 0 && parseFloat(effectiveHrs) > 0 && <span className="text-[10px] text-v-text-secondary block">@ {sym}{rate}/hr</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
