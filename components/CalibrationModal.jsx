"use client";
import { useState, useEffect, useRef, useMemo } from 'react';

const STANDARD_REFERENCES = [
  { value: 'wash', label: 'Wash (Maintenance Wash)' },
  { value: 'polish', label: 'Polish' },
  { value: 'compound', label: 'Compound' },
  { value: 'wax', label: 'Wax' },
  { value: 'ceramic', label: 'Ceramic Coating' },
  { value: 'detail_interior', label: 'Interior Detail' },
  { value: 'leather', label: 'Leather Conditioning' },
];

// Reference type → aircraft_hours column for ratio-based calibration. The
// downstream endpoint /api/services/calibrations applies the same adjustment_pct
// across every row in the `aircraft` table (using its own column map). Here we
// only need the anchor reference hours to compute the user's ratio; the column
// names below mirror aircraft_hours.
const ANCHOR_REF_COLUMN = {
  wash: 'maintenance_wash_hrs',
  polish: 'one_step_polish_hrs',
  compound: 'one_step_polish_hrs',
  wax: 'wax_hrs',
  ceramic: 'ceramic_coating_hrs',
  detail_interior: 'carpet_hrs',
  leather: 'leather_hrs',
};

const INPUT_CLASS =
  'w-full bg-v-surface border border-v-border text-v-text-primary rounded-sm px-3 py-2 text-sm outline-none focus:border-v-gold/50';

function anchorRefHours(anchor, refType) {
  if (!anchor) return null;
  const col = ANCHOR_REF_COLUMN[refType] || 'maintenance_wash_hrs';
  const raw = anchor[col];
  const num = typeof raw === 'number' ? raw : parseFloat(raw);
  return Number.isFinite(num) && num > 0 ? num : null;
}

export default function CalibrationModal({
  isOpen,
  onClose,
  service,
  detailerServices,
  calibrations,
  anchorA,
  anchorB,
}) {
  const [referenceType, setReferenceType] = useState('polish');
  const [hoursA, setHoursA] = useState('');
  const [hoursB, setHoursB] = useState('');
  const [manualAdjustmentPct, setManualAdjustmentPct] = useState(0);
  const [preview, setPreview] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');
  const debounceRef = useRef(null);

  // When the detailer has not picked anchors, fall back to direct slider entry
  // (the pre-anchor calibration UX). The anchor-based ratio path stays intact
  // and activates as soon as anchors are set on /settings/services.
  const noAnchors = !anchorA && !anchorB;

  const anchorALabel = anchorA ? `${anchorA.make || ''} ${anchorA.model || ''}`.trim() : 'Anchor A';
  const anchorBLabel = anchorB ? `${anchorB.make || ''} ${anchorB.model || ''}`.trim() : 'Anchor B';

  // Resolve the reference type used for both anchor lookup AND the existing
  // POST endpoint. svc:<id> reference still works — POST resolves it server
  // side via `services.hours_field`, but we need a "standard" type to anchor
  // against. We pick a sensible fallback ('wash') for svc-typed references so
  // the ratio still computes; users editing existing svc-typed rows see the
  // anchor reference hours computed from that fallback.
  const standardRefType = useMemo(() => {
    if (referenceType.startsWith('svc:')) return 'wash';
    return referenceType;
  }, [referenceType]);

  const refA = anchorRefHours(anchorA, standardRefType);
  const refB = anchorRefHours(anchorB, standardRefType);

  // Compute adjustment_pct from the ratio: (user avg) / (platform avg) - 1.
  // Only count anchors with both a user-entered value AND a non-null reference
  // hour for the chosen reference type — keeps the math resilient to
  // aircraft_hours rows that don't have that specific column populated.
  const userHoursA = parseFloat(hoursA);
  const userHoursB = parseFloat(hoursB);
  const validA = Number.isFinite(userHoursA) && userHoursA > 0 && refA != null;
  const validB = Number.isFinite(userHoursB) && userHoursB > 0 && refB != null;
  let computedPct = 0;
  let anchorComputedReady = false;
  if (validA && validB) {
    const userAvg = (userHoursA + userHoursB) / 2;
    const refAvg = (refA + refB) / 2;
    computedPct = Math.round(((userAvg / refAvg) - 1) * 100);
    anchorComputedReady = true;
  } else if (validA) {
    computedPct = Math.round(((userHoursA / refA) - 1) * 100);
    anchorComputedReady = true;
  } else if (validB) {
    computedPct = Math.round(((userHoursB / refB) - 1) * 100);
    anchorComputedReady = true;
  }
  const adjustmentPct = noAnchors
    ? Math.max(-50, Math.min(200, manualAdjustmentPct))
    : Math.max(-50, Math.min(200, computedPct));
  const computedReady = noAnchors ? true : anchorComputedReady;

  // Load saved calibration (or reset to defaults) when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setSuccessMessage('');
    setError('');
    setHoursA('');
    setHoursB('');
    const existing = (calibrations || []).find(c => c.service_id === service?.id);
    if (existing) {
      setReferenceType(existing.reference_service_type || 'polish');
      setManualAdjustmentPct(existing.adjustment_pct ?? 0);
    } else {
      setReferenceType('polish');
      setManualAdjustmentPct(0);
    }
  }, [isOpen, service?.id, calibrations]);

  // Debounced preview fetch — uses the computed adjustment_pct.
  // When anchors are picked, pass their uuids so the preview rows show the
  // detailer's actual anchor aircraft instead of generic category samples.
  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const token = localStorage.getItem('vector_token');
        const params = new URLSearchParams({
          reference_type: referenceType,
          adjustment_pct: String(adjustmentPct),
        });
        if (anchorA?.id) params.set('anchor_a', anchorA.id);
        if (anchorB?.id) params.set('anchor_b', anchorB.id);
        const res = await fetch(
          `/api/services/calibration-preview?${params.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setPreview(data.preview || data.samples || data.aircraft || []);
        }
      } catch (err) {
        console.error('Preview fetch failed:', err);
      } finally {
        setPreviewLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isOpen, referenceType, adjustmentPct, anchorA?.id, anchorB?.id]);

  const handleSave = async () => {
    if (!service) return;
    if (!computedReady) {
      setError('Enter your actual hours for at least one anchor aircraft.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/services/calibrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          service_id: service.id,
          service_name: service.name,
          reference_service_type: referenceType,
          adjustment_pct: adjustmentPct,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save calibration');
        setSaving(false);
        return;
      }
      const count = data.applied_count ?? data.aircraft_count ?? data.count ?? 0;
      setSuccessMessage(`Applied to ${count} aircraft`);
      setTimeout(() => {
        setSaving(false);
        onClose?.();
      }, 1500);
    } catch (err) {
      console.error('Save calibration failed:', err);
      setError('Failed to save calibration');
      setSaving(false);
    }
  };

  if (!isOpen || !service) return null;

  const multiplier = (1 + adjustmentPct / 100).toFixed(2).replace(/\.?0+$/, '');
  const calibratedIds = new Set((calibrations || []).map(c => c.service_id));

  // Build grouped reference options: detailer's own services first, then standard
  const ownServices = (detailerServices || [])
    .filter(s => s.id !== service.id)
    .map(s => ({
      value: `svc:${s.id}`,
      label: s.name,
      calibrated: calibratedIds.has(s.id),
    }));

  const adjustmentLabel = !computedReady
    ? '—'
    : adjustmentPct === 0
      ? 'SAME'
      : adjustmentPct > 0
        ? `+${adjustmentPct}% MORE TIME`
        : `${adjustmentPct}% LESS TIME`;

  const adjustmentColor = !computedReady
    ? 'text-v-text-secondary'
    : adjustmentPct === 0
      ? 'text-white'
      : adjustmentPct > 0
        ? 'text-blue-400'
        : 'text-red-400';

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-v-surface border border-v-border w-full sm:max-w-lg sm:rounded-lg sm:my-8 flex flex-col h-full sm:h-auto sm:max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-v-border shrink-0">
          <h2 className="text-base sm:text-lg font-semibold text-v-text-primary">
            Calibrate: <span className="text-v-gold">{service.name}</span>
          </h2>
          <button
            onClick={onClose}
            className="text-v-text-secondary hover:text-v-text-primary text-2xl leading-none px-2"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <p className="text-sm text-v-text-secondary">
            {noAnchors
              ? 'Pick a reference service and adjust how much more or less time this service takes.'
              : 'Enter your actual hours for this service on the two aircraft you know best. We\u2019ll calibrate every other aircraft against that ratio.'}
          </p>

          {(calibrations || []).some(c => c.service_id === service?.id) && (
            <div className="flex items-center gap-2 px-3 py-2 bg-v-gold/10 border border-v-gold/30 rounded-sm text-xs text-v-gold">
              <span>&#10003;</span>
              <span>Previously calibrated — re-enter hours below to update</span>
            </div>
          )}

          {/* Reference dropdown — own services + standard types */}
          <div>
            <label className="block text-xs font-medium text-v-text-secondary mb-1.5 uppercase tracking-wide">
              This service is most similar to:
            </label>
            <select
              value={referenceType}
              onChange={(e) => setReferenceType(e.target.value)}
              className={INPUT_CLASS}
            >
              {ownServices.length > 0 && (
                <optgroup label="YOUR SERVICES">
                  {ownServices.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.calibrated ? '✓ ' : ''}{opt.label}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="STANDARD REFERENCES">
                {STANDARD_REFERENCES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Anchor hour inputs (only when anchors picked) */}
          {!noAnchors && (
            <div>
              <label className="block text-xs font-medium text-v-text-secondary mb-2 uppercase tracking-wide">
                Your actual hours
              </label>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-v-text-primary truncate">{service.name} on <span className="text-v-gold">{anchorALabel}</span></p>
                    {refA != null && (
                      <p className="text-[10px] text-v-text-secondary">Platform reference: {refA.toFixed(1)}h</p>
                    )}
                    {refA == null && anchorA && (
                      <p className="text-[10px] text-amber-400">No reference hours for this service type on {anchorALabel}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.5"
                      value={hoursA}
                      onChange={(e) => setHoursA(e.target.value)}
                      placeholder="0"
                      className="w-20 bg-v-charcoal border border-v-border text-v-text-primary rounded-sm px-2 py-2 text-sm text-right outline-none focus:border-v-gold/50"
                    />
                    <span className="text-xs text-v-text-secondary">hrs</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-v-text-primary truncate">{service.name} on <span className="text-v-gold">{anchorBLabel}</span></p>
                    {refB != null && (
                      <p className="text-[10px] text-v-text-secondary">Platform reference: {refB.toFixed(1)}h</p>
                    )}
                    {refB == null && anchorB && (
                      <p className="text-[10px] text-amber-400">No reference hours for this service type on {anchorBLabel}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.5"
                      value={hoursB}
                      onChange={(e) => setHoursB(e.target.value)}
                      placeholder="0"
                      className="w-20 bg-v-charcoal border border-v-border text-v-text-primary rounded-sm px-2 py-2 text-sm text-right outline-none focus:border-v-gold/50"
                    />
                    <span className="text-xs text-v-text-secondary">hrs</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Manual adjustment slider (when no anchors picked) */}
          {noAnchors && (
            <div>
              <label className="block text-xs font-medium text-v-text-secondary mb-2 uppercase tracking-wide">
                Time Adjustment
              </label>
              <input
                type="range"
                min="-50"
                max="200"
                step="5"
                value={manualAdjustmentPct}
                onChange={(e) => setManualAdjustmentPct(parseInt(e.target.value, 10) || 0)}
                className="w-full accent-v-gold"
              />
              <div className="flex justify-between text-[10px] text-v-text-secondary mt-1">
                <span>-50%</span>
                <span>0%</span>
                <span>+200%</span>
              </div>
            </div>
          )}

          {/* Computed adjustment */}
          <div>
            <label className="block text-xs font-medium text-v-text-secondary mb-2 uppercase tracking-wide">
              Calibration ratio
            </label>
            <div className="text-center">
              <div className={`text-3xl sm:text-4xl font-bold ${adjustmentColor}`}>
                {adjustmentLabel}
              </div>
              <div className="text-xs text-v-text-secondary mt-1">
                {computedReady ? `${multiplier}x reference time` : 'Enter your hours above to compute'}
                {noAnchors && (
                  <span className="ml-2 text-[10px] text-v-text-secondary">(pick anchors on Settings &rarr; Services to use ratio mode)</span>
                )}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className="block text-xs font-medium text-v-text-secondary mb-2 uppercase tracking-wide">
              Live Preview
            </label>
            <div className="border border-v-border rounded-sm divide-y divide-v-border bg-v-charcoal/40">
              {previewLoading && preview.length === 0 ? (
                <div className="p-4 text-center text-xs text-v-text-secondary">Loading preview...</div>
              ) : preview.length === 0 ? (
                <div className="p-4 text-center text-xs text-v-text-secondary">No preview available</div>
              ) : (
                preview.slice(0, 4).map((row, i) => {
                  const model = row.model || row.aircraft_model || row.name || `Aircraft ${i + 1}`;
                  const ref = row.reference_hours ?? row.reference ?? row.base_hours ?? 0;
                  const cal = Number(ref) * (1 + adjustmentPct / 100);
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between px-3 py-2.5 text-sm"
                    >
                      <span className="text-v-text-primary font-medium truncate mr-2">{model}</span>
                      <span className="text-xs whitespace-nowrap">
                        <span className="text-v-text-secondary">{Number(ref).toFixed(1)}h</span>
                        <span className="text-v-text-secondary"> &rarr; </span>
                        <span className={`font-semibold ${adjustmentPct < 0 ? 'text-red-400' : adjustmentPct > 0 ? 'text-blue-400' : 'text-white'}`}>
                          {cal.toFixed(1)}h
                        </span>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-900/40 rounded-sm px-3 py-2">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="text-sm text-v-gold bg-v-gold/10 border border-v-gold/30 rounded-sm px-3 py-2">
              {successMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-v-border shrink-0 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm border border-v-border text-v-text-secondary rounded-sm hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !computedReady}
            className="px-4 py-2 text-sm bg-v-gold text-v-charcoal font-medium rounded-sm hover:bg-v-gold/90 disabled:opacity-50"
          >
            {saving
              ? successMessage
                ? successMessage
                : 'Saving...'
              : 'Save Calibration'}
          </button>
        </div>
      </div>
    </div>
  );
}
