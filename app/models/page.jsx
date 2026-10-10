"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
import { filterOffers, resolveAircraftAttributes } from '@/lib/applicability';

const CATALOG_COL = {
  ext_wash_hours: 'maintenance_wash_hrs',
  decon_hours: 'decon_paint_hrs',
  polish_hours: 'one_step_polish_hrs',
  wax_hours: 'wax_hrs',
  ceramic_hours: 'ceramic_coating_hrs',
  spray_ceramic_hours: 'spray_ceramic_hrs',
  carpet_hours: 'carpet_hrs',
  leather_hours: 'leather_hrs',
  brightwork_hours: 'brightwork_hrs',
};

function token() {
  return typeof window === 'undefined' ? '' : localStorage.getItem('vector_token') || '';
}

function authHeaders() {
  return { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' };
}

export default function MakesModelsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [manufacturers, setManufacturers] = useState([]);
  const [query, setQuery] = useState('');
  const [make, setMake] = useState('');
  const [models, setModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [model, setModel] = useState(null);
  const [services, setServices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [products, setProducts] = useState([]);
  const [overrides, setOverrides] = useState({ byServiceId: {}, byPackageId: {} });
  const [usage, setUsage] = useState([]);
  const [catalogHours, setCatalogHours] = useState(null);
  const [savingKey, setSavingKey] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!token()) { router.push('/login'); return; }
    setReady(true);
    fetch('/api/aircraft/manufacturers', { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : { manufacturers: [] })
      .then((d) => setManufacturers(d.manufacturers || []))
      .catch(() => {});
    Promise.all([
      fetch('/api/services', { headers: authHeaders() }).then((r) => r.ok ? r.json() : { services: [] }),
      fetch('/api/packages', { headers: authHeaders() }).then((r) => r.ok ? r.json() : { packages: [] }),
      fetch('/api/products', { headers: authHeaders() }).then((r) => r.ok ? r.json() : { products: [] }),
    ]).then(([s, p, pr]) => {
      setServices(s.services || []);
      setPackages(p.packages || []);
      setProducts(pr.products || []);
    }).catch(() => {});
  }, [router]);

  useEffect(() => {
    if (!make) { setModels([]); return; }
    setLoadingModels(true);
    fetch(`/api/aircraft/models?manufacturer=${encodeURIComponent(make)}`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : { models: [] })
      .then((d) => setModels(d.models || []))
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false));
  }, [make]);

  useEffect(() => {
    if (!model) return;
    const q = model.custom ? `custom_aircraft_id=${model.id}` : `aircraft_id=${model.id}`;
    fetch(`/api/model-offers?${q}`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : { indexed: { byServiceId: {}, byPackageId: {} }, usage: [] })
      .then((d) => {
        setOverrides(d.indexed || { byServiceId: {}, byPackageId: {} });
        setUsage(d.usage || []);
        if (d.pending_migration) setNotice('Run the aircraft applicability migration to save pins and toggles.');
      })
      .catch(() => {});
    if (model.manufacturer && model.model) {
      fetch(`/api/aircraft-hours?make=${encodeURIComponent(model.manufacturer)}&model=${encodeURIComponent(model.model)}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => setCatalogHours(d?.hours || null))
        .catch(() => setCatalogHours(null));
    }
  }, [model]);

  const filteredMakes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return manufacturers;
    return manufacturers.filter((m) => m.toLowerCase().includes(q));
  }, [manufacturers, query]);

  const filteredModels = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => `${m.manufacturer} ${m.model}`.toLowerCase().includes(q));
  }, [models, query]);

  const attrs = model ? (model.attributes || resolveAircraftAttributes(model)) : null;
  const view = filterOffers({ services, packages, aircraft: model, overrides });
  const hiddenServices = services.filter((s) => !view.services.some((v) => v.id === s.id));
  const hiddenPackages = packages.filter((p) => !view.packages.some((v) => v.id === p.id));

  async function saveOffer(target, patch) {
    if (!model) return;
    const key = target.service_id || target.package_id;
    setSavingKey(key);
    setNotice('');
    try {
      const res = await fetch('/api/model-offers', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          aircraft_id: model.custom ? null : model.id,
          custom_aircraft_id: model.custom ? model.id : null,
          make: model.manufacturer,
          model: model.model,
          ...target,
          ...patch,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setNotice(data.error || 'Could not save'); return; }
      setOverrides((prev) => {
        const next = { byServiceId: { ...prev.byServiceId }, byPackageId: { ...prev.byPackageId } };
        if (data.override?.service_id) next.byServiceId[data.override.service_id] = data.override;
        if (data.override?.package_id) next.byPackageId[data.override.package_id] = data.override;
        return next;
      });
    } catch {
      setNotice('Could not save');
    } finally {
      setSavingKey('');
    }
  }

  async function addUsage(serviceId, product) {
    if (!model || !product) return;
    const res = await fetch('/api/model-offers/usage', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        aircraft_id: model.custom ? null : model.id,
        custom_aircraft_id: model.custom ? model.id : null,
        service_id: serviceId,
        product_id: product.id || null,
        product_name: product.name,
        quantity: product.quantity,
        unit: product.unit || null,
      }),
    });
    const data = await res.json();
    if (res.ok && data.usage) setUsage((prev) => [...prev, data.usage]);
    else setNotice(data.error || 'Could not save chemical usage');
  }

  async function removeUsage(id) {
    const res = await fetch(`/api/model-offers/usage?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) setUsage((prev) => prev.filter((u) => u.id !== id));
  }

  if (!ready) return null;

  return (
    <AppShell title="Makes & Models">
      <div className="p-4 md:p-8 max-w-6xl">
        <p className="text-sm text-v-text-secondary mb-4">
          Pick a manufacturer and model. Services that do not fit the aircraft are hidden. Pin a price or hours, turn a service on or off, or record the chemicals that service uses on this model. Logged jobs still adjust other aircraft. A pin here wins.
        </p>
        {notice && <p className="mb-4 text-sm text-amber-300">{notice}</p>}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search manufacturer or model"
          className="w-full mb-4 bg-v-surface border border-v-border rounded px-3 py-2 text-v-text-primary"
        />
        <div className="grid md:grid-cols-[240px_minmax(0,1fr)] gap-6 min-w-0">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-v-text-secondary mb-2">Manufacturer</p>
            <div className="max-h-64 overflow-y-auto border border-v-border/40 divide-y divide-v-border/30 mb-4">
              {filteredMakes.map((m) => (
                <button key={m} type="button" onClick={() => { setMake(m); setModel(null); }}
                  className={`block w-full text-left px-3 py-2 text-sm ${make === m ? 'text-v-gold bg-v-gold/10' : 'text-v-text-primary'}`}>
                  {m}
                </button>
              ))}
              {filteredMakes.length === 0 && <p className="px-3 py-4 text-sm text-v-text-secondary">No manufacturers</p>}
            </div>
            {make && (
              <>
                <p className="text-[10px] uppercase tracking-wider text-v-text-secondary mb-2">Model</p>
                <div className="max-h-80 overflow-y-auto border border-v-border/40 divide-y divide-v-border/30">
                  {loadingModels && <div className="p-4"><LoadingSpinner /></div>}
                  {filteredModels.map((m) => (
                    <button key={m.id} type="button" onClick={() => setModel(m)}
                      className={`block w-full text-left px-3 py-2 text-sm ${model?.id === m.id ? 'text-v-gold bg-v-gold/10' : 'text-v-text-primary'}`}>
                      {m.model}{m.custom ? ' (custom)' : ''}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="min-w-0">
            {!model && <p className="text-v-text-secondary text-sm">Select a model to see the services that apply.</p>}
            {model && attrs && (
              <>
                <h2 className="text-xl text-v-text-primary font-light mb-1">{model.manufacturer} {model.model}</h2>
                <p className="text-xs text-v-text-secondary mb-4">
                  {attrs.category || 'uncategorized'}
                  {' · '}{attrs.has_polished_brightwork ? 'polished brightwork' : 'no polished brightwork'}
                  {' · '}{attrs.has_deice_boots ? 'de-ice boots' : 'no de-ice boots'}
                </p>
                <OfferList
                  title="Services"
                  rows={view.services}
                  hidden={hiddenServices}
                  kind="service"
                  overrides={overrides.byServiceId}
                  usage={usage}
                  products={products}
                  catalogHours={catalogHours}
                  savingKey={savingKey}
                  onSave={saveOffer}
                  onAddUsage={addUsage}
                  onRemoveUsage={removeUsage}
                />
                <OfferList
                  title="Packages"
                  rows={view.packages}
                  hidden={hiddenPackages}
                  kind="package"
                  overrides={overrides.byPackageId}
                  savingKey={savingKey}
                  onSave={saveOffer}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function OfferList({ title, rows, hidden, kind, overrides, usage, products, catalogHours, savingKey, onSave, onAddUsage, onRemoveUsage }) {
  return (
    <section className="mb-8 min-w-0">
      <h3 className="text-xs uppercase tracking-wider text-v-gold mb-2">{title}</h3>
      <div className="divide-y divide-v-border/30 border border-v-border/40 min-w-0">
        {rows.map((row) => (
          <OfferRow
            key={row.id}
            row={row}
            kind={kind}
            override={overrides?.[row.id]}
            usage={(usage || []).filter((u) => u.service_id === row.id)}
            products={products}
            catalogHours={catalogHours}
            saving={savingKey === row.id}
            onSave={onSave}
            onAddUsage={onAddUsage}
            onRemoveUsage={onRemoveUsage}
          />
        ))}
        {rows.length === 0 && <p className="px-3 py-4 text-sm text-v-text-secondary">Nothing in the catalog applies.</p>}
      </div>
      {hidden?.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-v-text-secondary cursor-pointer">Not applicable ({hidden.length})</summary>
          <div className="mt-2 divide-y divide-v-border/30 border border-v-border/40">
            {hidden.map((row) => (
              <div key={row.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-v-text-secondary">{row.name}</span>
                <button type="button" className="text-v-gold text-xs" onClick={() => onSave(targetOf(kind, row), { enabled: true, service_name: row.name })}>
                  Show for this model
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function targetOf(kind, row) {
  return kind === 'package' ? { package_id: row.id } : { service_id: row.id, service_name: row.name };
}

function OfferRow({ row, kind, override, usage, products, catalogHours, saving, onSave, onAddUsage, onRemoveUsage }) {
  const [hours, setHours] = useState(override?.pinned_hours ?? '');
  const [price, setPrice] = useState(override?.pinned_price ?? '');
  const [productId, setProductId] = useState('');
  const [customName, setCustomName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  useEffect(() => {
    setHours(override?.pinned_hours ?? '');
    setPrice(override?.pinned_price ?? '');
  }, [override?.pinned_hours, override?.pinned_price, row.id]);

  const catalogCol = CATALOG_COL[row.hours_field];
  const catalogHint = kind === 'service' && catalogCol && catalogHours ? catalogHours[catalogCol] : null;

  return (
    <div className="px-3 py-3 min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
        <p className="text-sm text-v-text-primary basis-full sm:basis-auto sm:flex-1 min-w-0 break-words">{row.name}</p>
        {kind === 'service' && (
          <>
            <label className="text-xs text-v-text-secondary inline-flex items-center gap-1">
              Hours
              <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="decimal" placeholder={catalogHint ? String(catalogHint) : 'pin'}
                className="w-20 max-w-full bg-v-charcoal border border-v-border rounded px-2 py-1 text-v-text-primary" />
            </label>
            <label className="text-xs text-v-text-secondary inline-flex items-center gap-1">
              Price
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="pin"
                className="w-24 max-w-full bg-v-charcoal border border-v-border rounded px-2 py-1 text-v-text-primary" />
            </label>
          </>
        )}
        {kind === 'package' && (
          <label className="text-xs text-v-text-secondary inline-flex items-center gap-1">
            Price
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="pin"
              className="w-24 max-w-full bg-v-charcoal border border-v-border rounded px-2 py-1 text-v-text-primary" />
          </label>
        )}
        <button type="button" disabled={saving} className="text-xs text-v-gold disabled:opacity-50 shrink-0"
          onClick={() => onSave(targetOf(kind, row), {
            pinned_hours: kind === 'service' ? (hours === '' ? null : hours) : undefined,
            pinned_price: price === '' ? null : price,
            service_name: row.name,
          })}>
          {saving ? 'Saving…' : 'Save pin'}
        </button>
        <button type="button" className="text-xs text-v-text-secondary" onClick={() => onSave(targetOf(kind, row), { enabled: false, service_name: row.name })}>
          Hide
        </button>
      </div>
      {kind === 'service' && (
        <div className="mt-2">
          {(usage || []).map((u) => (
            <div key={u.id} className="flex items-center gap-2 text-xs text-v-text-secondary">
              <span>{u.product_name}{u.quantity != null ? ` · ${u.quantity}${u.unit ? ` ${u.unit}` : ''}` : ''}</span>
              <button type="button" className="text-red-400" onClick={() => onRemoveUsage(u.id)}>Remove</button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 mt-1">
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="bg-v-charcoal border border-v-border rounded px-2 py-1 text-xs text-v-text-primary">
              <option value="">Catalog product</option>
              {(products || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Or type a chemical" className="w-36 bg-v-charcoal border border-v-border rounded px-2 py-1 text-xs text-v-text-primary" />
            <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" className="w-16 bg-v-charcoal border border-v-border rounded px-2 py-1 text-xs text-v-text-primary" />
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit" className="w-16 bg-v-charcoal border border-v-border rounded px-2 py-1 text-xs text-v-text-primary" />
            <button type="button" className="text-xs text-v-gold" onClick={() => {
              const product = (products || []).find((p) => p.id === productId);
              const name = product?.name || customName.trim();
              if (!name) return;
              onAddUsage(row.id, { id: product?.id || null, name, quantity: qty, unit: unit || product?.unit });
              setQty('');
              setCustomName('');
            }}>Add</button>
          </div>
        </div>
      )}
    </div>
  );
}
