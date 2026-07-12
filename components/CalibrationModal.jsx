"use client";
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  familyOfService,
  familyOfReferenceType,
  isCrossFamily,
  FAMILY_PAINT,
  FAMILY_INTERIOR,
  FAMILY_LEADING_EDGE,
} from '@/lib/calibration-reference';

// Built-in reference types, tagged with their measurement family. A service can
// only be calibrated against references in its OWN family (see filtering below).
const STANDARD_REFERENCES = [
  // Paint surface
  { value: 'wash', label: 'Wash (Maintenance Wash)', family: FAMILY_PAINT },
  { value: 'polish', label: 'Polish', family: FAMILY_PAINT },
  { value: 'compound', label: 'Compound', family: FAMILY_PAINT },
  { value: 'ceramic', label: 'Ceramic Coating', family: FAMILY_PAINT },
  { value: 'wax', label: 'Wax', family: FAMILY_PAINT },
  { value: 'decon', label: 'Decon', family: FAMILY_PAINT },
  { value: 'spray_ceramic', label: 'Spray Ceramic', family: FAMILY_PAINT },
  // Interior
  { value: 'detail_interior', label: 'Interior Detail', family: FAMILY_INTERIOR },
  { value: 'leather', label: 'Leather Conditioning', family: FAMILY_INTERIOR },
  { value: 'carpet', label: 'Carpet Extraction', family: FAMILY_INTERIOR },
  // Leading edge
  { value: 'brightwork', label: 'Brightwork', family: FAMILY_LEADING_EDGE },
];

const STANDARD_LABELS = Object.fromEntries(STANDARD_REFERENCES.map((r) => [r.value, r.label]));

// Map reference_type → the key in the GET endpoint's per-aircraft `hours`
// dict (server normalizes aircraft_hours columns to these names). Keep in
// sync with lib/calibrate-hours.js + the GET route's mapping above.
const REF_TO_HOURS_KEY = {
  wash: 'maintenance_wash',
  polish: 'one_step_polish',
  compound: 'one_step_polish',
  wax: 'wax',
  ceramic: 'ceramic_coating',
  detail_interior: 'carpet',
  carpet: 'carpet',
  leather: 'leather',
  decon: 'decon_paint',
  spray_ceramic: 'spray_ceramic',
  brightwork: 'brightwork',
};

const INPUT_CLASS =
  'w-full bg-v-surface border border-v-border text-v-text-primary rounded-sm px-3 py-2 text-sm outline-none focus:border-v-gold/50';
const PAGE_SIZE = 15;

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
  const [manualAdjustmentPct, setManualAdjustmentPct] = useState(0);
  const [preview, setPreview] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');
  const debounceRef = useRef(null);

  // ── Per-aircraft override editor state ──
  // aircraftList: rows from GET /api/services/[id]/aircraft-overrides.
  //   { aircraft_id, make, model, category, hours: {...}, override: { id, hours } | null }
  // overrideDrafts: aircraft_id → string (the typed value). null/'' means
  // the user wants to clear that aircraft's override. undefined means no
  // pending change for that row.
  const [aircraftList, setAircraftList] = useState([]);
  const [aircraftLoading, setAircraftLoading] = useState(false);
  const [overrideDrafts, setOverrideDrafts] = useState({});
  const [acSearch, setAcSearch] = useState('');
  const [acCategory, setAcCategory] = useState('all');
  const [page, setPage] = useState(0);
  const [savingOverrides, setSavingOverrides] = useState(false);
  const [overridesSavedMsg, setOverridesSavedMsg] = useState('');

  // Slider is the sole adjustment input; ratio is always "ready" because the
  // slider always carries a value. Anchor props are still received so the
  // Live Preview fetch can render rows for the detailer's chosen aircraft.
  // Symmetric -300..+300 range so 0% sits in the geometric middle of the
  // track while still giving Brett headroom for fixed-minimum and 3x-of-
  // reference services. Existing rows saved against the old -50..+200 or
  // -100..+100 ranges get clamped in on read so the slider thumb still
  // snaps to a valid position; the saved DB value is left alone (the
  // next save will overwrite with a clamped value).
  const adjustmentPct = Math.max(-300, Math.min(300, manualAdjustmentPct));
  const computedReady = true;

  // Load saved calibration (or reset to defaults) when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setSuccessMessage('');
    setError('');
    setOverridesSavedMsg('');
    setOverrideDrafts({});
    setAcSearch('');
    setAcCategory('all');
    setPage(0);
    // Default an uncalibrated service to an in-family reference so a fresh
    // leading-edge / interior service doesn't open on a paint type (which would
    // trip the cross-family warning immediately).
    const famDefault = { [FAMILY_PAINT]: 'polish', [FAMILY_INTERIOR]: 'detail_interior', [FAMILY_LEADING_EDGE]: 'brightwork' };
    const defaultRef = famDefault[familyOfService(service?.hours_field)] || 'polish';
    const existing = (calibrations || []).find(c => c.service_id === service?.id);
    if (existing) {
      setReferenceType(existing.reference_service_type || defaultRef);
      const saved = Number.isFinite(existing.adjustment_pct) ? existing.adjustment_pct : 0;
      setManualAdjustmentPct(Math.max(-300, Math.min(300, saved)));
    } else {
      setReferenceType(defaultRef);
      setManualAdjustmentPct(0);
    }
  }, [isOpen, service?.id, calibrations]);

  // Load the per-aircraft override list when the modal opens. Single fetch
  // per open — the slider/reference dropdown drives the Calibrated column
  // off this local data without refetching.
  useEffect(() => {
    if (!isOpen || !service?.id) return;
    let cancelled = false;
    setAircraftLoading(true);
    (async () => {
      try {
        const token = localStorage.getItem('vector_token');
        const res = await fetch(`/api/services/${service.id}/aircraft-overrides`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!res.ok) {
          console.error('[overrides GET] failed', res.status);
          if (!cancelled) setAircraftList([]);
          return;
        }
        const data = await res.json();
        if (!cancelled) setAircraftList(Array.isArray(data?.aircraft) ? data.aircraft : []);
      } catch (e) {
        console.error('[overrides GET] threw', e?.message || e);
        if (!cancelled) setAircraftList([]);
      } finally {
        if (!cancelled) setAircraftLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, service?.id]);

  // Old debounced /api/services/calibration-preview fetch removed — the
  // per-aircraft override editor now renders the full catalog inline with
  // live calibrated values, so the 4-row sample preview is redundant.
  // preview / previewLoading state kept (but no longer populated) so any
  // future references don't crash if they survive a partial revert.


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

  // Derive filtered list + page slice. The Calibrated column re-renders
  // automatically when adjustmentPct / referenceType change because both
  // are in the render closure.
  const refKey = REF_TO_HOURS_KEY[referenceType] || 'maintenance_wash';
  const categories = useMemo(() => {
    const set = new Set();
    aircraftList.forEach((a) => { if (a.category) set.add(a.category); });
    return ['all', ...Array.from(set).sort()];
  }, [aircraftList]);

  const filteredAircraft = useMemo(() => {
    const q = acSearch.trim().toLowerCase();
    return aircraftList.filter((a) => {
      if (acCategory !== 'all' && a.category !== acCategory) return false;
      if (!q) return true;
      const label = `${a.make || ''} ${a.model || ''}`.toLowerCase();
      return label.includes(q);
    });
  }, [aircraftList, acSearch, acCategory]);

  const pageCount = Math.max(1, Math.ceil(filteredAircraft.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filteredAircraft.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // How many drafts are pending (changed from the persisted state)?
  const pendingChangeCount = useMemo(() => {
    let n = 0;
    for (const [aid, draft] of Object.entries(overrideDrafts)) {
      const row = aircraftList.find((a) => a.aircraft_id === aid);
      if (!row) continue;
      const current = row.override?.hours ?? null;
      const next = draft === '' || draft == null ? null : parseFloat(draft);
      const currentNum = current == null ? null : parseFloat(current);
      const isSame = (next == null && currentNum == null)
        || (next != null && currentNum != null && Math.abs(next - currentNum) < 1e-9);
      if (!isSame) n++;
    }
    return n;
  }, [overrideDrafts, aircraftList]);

  const saveOverrides = async () => {
    if (!service?.id) return;
    if (pendingChangeCount === 0) return;
    setSavingOverrides(true);
    setError('');
    try {
      const changes = Object.entries(overrideDrafts).map(([aircraft_id, val]) => ({
        aircraft_id,
        hours: val === '' || val == null ? null : parseFloat(val),
      }));
      const token = localStorage.getItem('vector_token');
      const res = await fetch(`/api/services/${service.id}/aircraft-overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ changes }),
      });
      const data = await res.json();
      if (!res.ok && !data.ok) {
        setError(data.error || 'Failed to save overrides');
        return;
      }
      // Reflect saved drafts into the local aircraftList so the table
      // updates without a refetch.
      setAircraftList((prev) => prev.map((a) => {
        if (!(a.aircraft_id in overrideDrafts)) return a;
        const draft = overrideDrafts[a.aircraft_id];
        if (draft === '' || draft == null) return { ...a, override: null };
        const num = parseFloat(draft);
        if (!Number.isFinite(num)) return a;
        return { ...a, override: { id: a.override?.id || 'pending', hours: num } };
      }));
      setOverrideDrafts({});
      setOverridesSavedMsg(`Saved ${data.upserted || 0} change${data.upserted === 1 ? '' : 's'}${data.deleted ? `, cleared ${data.deleted}` : ''}`);
      setTimeout(() => setOverridesSavedMsg(''), 2500);
    } catch (e) {
      console.error('[overrides POST] threw', e?.message || e);
      setError('Failed to save overrides');
    } finally {
      setSavingOverrides(false);
    }
  };

  if (!isOpen || !service) return null;

  const multiplier = (1 + adjustmentPct / 100).toFixed(2).replace(/\.?0+$/, '');
  const calibratedIds = new Set((calibrations || []).map(c => c.service_id));

  // A service can only be calibrated against references in its OWN measurement
  // family. Filter both the built-in types and the detailer's own services to
  // the family of the service being calibrated. When the service's family is
  // unknown (no hours_field), fall back to showing everything.
  const serviceFamily = familyOfService(service?.hours_field);

  const standardReferences = serviceFamily
    ? STANDARD_REFERENCES.filter(o => o.family === serviceFamily)
    : STANDARD_REFERENCES;

  // Build grouped reference options: detailer's own services first, then standard
  const ownServices = (detailerServices || [])
    .filter(s => s.id !== service.id)
    .filter(s => !serviceFamily || familyOfService(s.hours_field) === serviceFamily)
    .map(s => ({
      value: `svc:${s.id}`,
      label: s.name,
      calibrated: calibratedIds.has(s.id),
    }));

  // Existing bad data: if the currently-selected reference is outside this
  // service's family it was filtered out above. Keep it visible (marked) so the
  // owner can see and re-point it — never silently hide or change it.
  const currentIsOwn = (referenceType || '').startsWith('svc:');
  const currentInList = currentIsOwn
    ? ownServices.some(o => o.value === referenceType)
    : standardReferences.some(o => o.value === referenceType);
  const crossFamily = isCrossFamily(service?.hours_field, referenceType, detailerServices);
  let strayOption = null;
  if (referenceType && !currentInList) {
    const label = currentIsOwn
      ? ((detailerServices || []).find(s => `svc:${s.id}` === referenceType)?.name || 'Removed service')
      : (STANDARD_LABELS[referenceType] || referenceType);
    strayOption = { value: referenceType, label: `⚠ ${label} — outside this family` };
  }

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
      <div className="bg-v-surface border border-v-border w-full sm:max-w-3xl sm:rounded-lg sm:my-8 flex flex-col h-full sm:h-auto sm:max-h-[90vh] overflow-hidden">
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
            Pick a reference service and adjust how much more or less time this service takes.
          </p>

          {(calibrations || []).some(c => c.service_id === service?.id) && (
            <div className="flex items-center gap-2 px-3 py-2 bg-v-gold/10 border border-v-gold/30 rounded-sm text-xs text-v-gold">
              <span>&#10003;</span>
              <span>Previously calibrated — re-enter hours below to update</span>
            </div>
          )}

          {/* Reference dropdown — own services + standard types, filtered to family */}
          <div>
            <label className="block text-xs font-medium text-v-text-secondary mb-1.5 uppercase tracking-wide">
              This service is most similar to:
            </label>
            {crossFamily && (
              <div className="flex items-start gap-2 mb-2 px-3 py-2 bg-amber-500/10 border border-amber-500/40 rounded-sm text-xs text-amber-300">
                <span className="mt-0.5">&#9888;</span>
                <span>Reference is outside this service&apos;s bucket — pick one from the same family below to fix it.</span>
              </div>
            )}
            <select
              value={referenceType}
              onChange={(e) => setReferenceType(e.target.value)}
              className={INPUT_CLASS}
            >
              {strayOption && (
                <optgroup label="⚠ OUTSIDE THIS FAMILY">
                  <option value={strayOption.value}>{strayOption.label}</option>
                </optgroup>
              )}
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
                {standardReferences.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Manual adjustment slider — sole adjustment input */}
          <div>
            <label className="block text-xs font-medium text-v-text-secondary mb-2 uppercase tracking-wide">
              Time Adjustment
            </label>
            <input
              type="range"
              min="-300"
              max="300"
              step="5"
              value={manualAdjustmentPct}
              onChange={(e) => setManualAdjustmentPct(parseInt(e.target.value, 10) || 0)}
              className="w-full accent-v-gold"
            />
            <div className="flex justify-between text-[10px] text-v-text-secondary mt-1">
              <span>-300%</span>
              <span>0%</span>
              <span>+300%</span>
            </div>
          </div>

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
                {`${multiplier}x reference time`}
              </div>
            </div>
          </div>

          {/* Per-aircraft override editor */}
          <div>
            <label className="block text-xs font-medium text-v-text-secondary mb-1 uppercase tracking-wide">
              Per-aircraft hours
            </label>
            <p className="text-[11px] text-v-text-secondary/70 mb-2 leading-relaxed">
              The slider above applies to all aircraft. Override individual airframes here when your real-world experience differs. Leave blank to use the calibrated value.
            </p>

            {/* Search + category filter */}
            <div className="flex flex-col sm:flex-row gap-2 mb-2">
              <input
                type="text"
                value={acSearch}
                onChange={(e) => { setAcSearch(e.target.value); setPage(0); }}
                placeholder="Search by manufacturer or model"
                className="flex-1 bg-v-charcoal border border-v-border text-v-text-primary rounded-sm px-3 py-1.5 text-xs outline-none focus:border-v-gold/50"
              />
              <select
                value={acCategory}
                onChange={(e) => { setAcCategory(e.target.value); setPage(0); }}
                className="bg-v-charcoal border border-v-border text-v-text-primary rounded-sm px-2 py-1.5 text-xs outline-none focus:border-v-gold/50"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>
                ))}
              </select>
            </div>

            {/* Table */}
            <div className="border border-v-border rounded-sm overflow-hidden">
              <div className="grid grid-cols-[1fr_90px_120px_110px_28px] bg-v-charcoal/60 text-[10px] uppercase tracking-wider text-v-text-secondary px-3 py-2">
                <div>Aircraft</div>
                <div className="text-right">Default</div>
                <div className="text-right">Calibrated</div>
                <div className="text-right">Your override</div>
                <div></div>
              </div>

              {aircraftLoading ? (
                <div className="p-4 text-center text-xs text-v-text-secondary">Loading aircraft…</div>
              ) : filteredAircraft.length === 0 ? (
                <div className="p-4 text-center text-xs text-v-text-secondary">No aircraft match this filter.</div>
              ) : (
                pageRows.map((row) => {
                  const base = row.hours?.[refKey];
                  const baseNum = base == null ? null : parseFloat(base);
                  const calibrated = baseNum == null ? null : Math.max(0, baseNum * (1 + adjustmentPct / 100));
                  const draft = overrideDrafts[row.aircraft_id];
                  const persisted = row.override?.hours;
                  // What's in the input box: pending draft if present, else
                  // the persisted override value, else blank.
                  const inputVal =
                    draft !== undefined
                      ? draft
                      : (persisted == null ? '' : String(persisted));
                  const hasOverride = inputVal !== '' && inputVal != null;
                  return (
                    <div
                      key={row.aircraft_id}
                      className="grid grid-cols-[1fr_90px_120px_110px_28px] items-center px-3 py-2 border-t border-v-border text-sm"
                    >
                      <div className="truncate pr-2">
                        <span className="text-v-text-primary">{[row.make, row.model].filter(Boolean).join(' ') || '—'}</span>
                        {row.category && <span className="text-v-text-secondary/60 text-[10px] ml-2">{row.category}</span>}
                      </div>
                      <div className="text-right text-xs text-v-text-secondary">
                        {baseNum == null ? '—' : `${baseNum.toFixed(1)}h`}
                      </div>
                      <div className={`text-right text-xs ${adjustmentPct === 0 ? 'text-v-text-secondary' : adjustmentPct < 0 ? 'text-red-400' : 'text-blue-400'}`}>
                        {calibrated == null ? '—' : `${calibrated.toFixed(1)}h`}
                      </div>
                      <div className="flex justify-end">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          min="0"
                          value={inputVal}
                          onChange={(e) => {
                            const v = e.target.value;
                            setOverrideDrafts((prev) => ({ ...prev, [row.aircraft_id]: v }));
                          }}
                          placeholder={calibrated == null ? '' : calibrated.toFixed(1)}
                          className={`w-20 bg-v-charcoal border ${hasOverride ? 'border-v-gold/50' : 'border-v-border'} text-v-text-primary rounded-sm px-2 py-1 text-xs text-right outline-none focus:border-v-gold/70`}
                        />
                      </div>
                      <div className="flex justify-center">
                        {hasOverride && (
                          <button
                            type="button"
                            onClick={() => setOverrideDrafts((prev) => ({ ...prev, [row.aircraft_id]: '' }))}
                            title="Clear override"
                            className="w-5 h-5 flex items-center justify-center text-v-text-secondary hover:text-red-400 text-base leading-none"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination + Save-all */}
            {filteredAircraft.length > 0 && (
              <div className="flex items-center justify-between mt-2 text-[11px] text-v-text-secondary">
                <div>
                  {filteredAircraft.length} aircraft{filteredAircraft.length === 1 ? '' : 's'}
                  {pendingChangeCount > 0 && (
                    <span className="text-v-gold ml-2">· {pendingChangeCount} unsaved change{pendingChangeCount === 1 ? '' : 's'}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {pageCount > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={safePage === 0}
                        className="px-2 py-0.5 border border-v-border rounded hover:text-white disabled:opacity-40"
                      >&larr;</button>
                      <span>Page {safePage + 1} / {pageCount}</span>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                        disabled={safePage >= pageCount - 1}
                        className="px-2 py-0.5 border border-v-border rounded hover:text-white disabled:opacity-40"
                      >&rarr;</button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={saveOverrides}
                    disabled={savingOverrides || pendingChangeCount === 0}
                    className="px-3 py-1 text-[11px] uppercase tracking-wider bg-v-gold text-v-charcoal rounded disabled:opacity-40 hover:bg-v-gold/90"
                  >
                    {savingOverrides ? 'Saving…' : `Save all${pendingChangeCount ? ` (${pendingChangeCount})` : ''}`}
                  </button>
                </div>
              </div>
            )}
            {overridesSavedMsg && (
              <p className="mt-1 text-[11px] text-emerald-400">{overridesSavedMsg}</p>
            )}
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
