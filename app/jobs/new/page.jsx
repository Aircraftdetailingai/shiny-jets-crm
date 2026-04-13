"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';

export default function NewJobPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Data lists
  const [customers, setCustomers] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [models, setModels] = useState([]);
  const [selectedAircraft, setSelectedAircraft] = useState(null); // full aircraft record with hours
  const [services, setServices] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);

  // Form state
  const [customerMode, setCustomerMode] = useState('existing'); // existing | new
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [newCustomer, setNewCustomer] = useState({ name: '', company_name: '', email: '', phone: '' });
  const [aircraftMode, setAircraftMode] = useState('standard'); // 'standard' | 'custom'
  const [customMake, setCustomMake] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [tailNumber, setTailNumber] = useState('');
  const [airport, setAirport] = useState('');
  const [selectedServices, setSelectedServices] = useState([]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('08:00');
  const [assignedCrew, setAssignedCrew] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('unpaid');
  const [notes, setNotes] = useState('');
  const [totalOverride, setTotalOverride] = useState('');
  const [hourOverrides, setHourOverrides] = useState({});
  const [saveHoursForAircraft, setSaveHoursForAircraft] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : null;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    Promise.all([
      fetch('/api/customers', { headers }).then(r => r.ok ? r.json() : { customers: [] }),
      fetch('/api/aircraft/manufacturers', { headers }).then(r => r.ok ? r.json() : { manufacturers: [] }),
      fetch('/api/services', { headers }).then(r => r.ok ? r.json() : { services: [] }),
      fetch('/api/team', { headers }).then(r => r.ok ? r.json() : { members: [] }),
    ]).then(([custData, mfrData, svcData, teamData]) => {
      setCustomers(custData.customers || []);
      setManufacturers(mfrData.manufacturers || []);
      setServices(svcData.services || svcData || []);
      setTeamMembers((teamData.members || []).filter(m => m.status === 'active'));
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!manufacturer) { setModels([]); setSelectedAircraft(null); return; }
    fetch(`/api/aircraft/models?make=${encodeURIComponent(manufacturer)}`, { headers })
      .then(r => r.ok ? r.json() : { models: [] })
      .then(d => setModels(d.models || []));
  }, [manufacturer]);

  // Fetch aircraft hours when model selected
  useEffect(() => {
    if (!model || !models.length) { setSelectedAircraft(null); return; }
    const match = models.find(m => m.model === model);
    if (match?.id) {
      fetch(`/api/aircraft/${match.id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.aircraft) setSelectedAircraft(d.aircraft); })
        .catch(() => {});
    }
  }, [model, models]);

  const getDefaultHours = (svc) => {
    if (!svc) return 0;
    if (selectedAircraft && svc.hours_field && selectedAircraft[svc.hours_field] !== undefined) {
      return parseFloat(selectedAircraft[svc.hours_field]) || 0;
    }
    return parseFloat(svc.default_hours) || 0;
  };

  const getHours = (svc) => {
    if (!svc) return 0;
    if (hourOverrides[svc.id] !== undefined) return hourOverrides[svc.id];
    return getDefaultHours(svc);
  };

  const getRate = (svc) => parseFloat(svc?.hourly_rate) || 0;

  const getServiceTotal = (svc) => {
    const hours = getHours(svc);
    const rate = getRate(svc);
    return hours > 0 && rate > 0 ? hours * rate : (parseFloat(svc?.price) || rate);
  };

  const calculatedTotal = selectedServices.reduce((sum, id) => {
    const svc = services.find(s => s.id === id);
    return sum + getServiceTotal(svc);
  }, 0);
  const total = totalOverride ? parseFloat(totalOverride) : calculatedTotal;

  const handleSave = async () => {
    const customerName = selectedCustomer?.name || newCustomer.name;
    const customerEmail = selectedCustomer?.email || newCustomer.email;
    if (!customerName) { setError('Customer name required'); return; }
    const effectiveMake = aircraftMode === 'custom' ? customMake : manufacturer;
    const effectiveModel = aircraftMode === 'custom' ? customModel : model;
    if (!effectiveMake && !effectiveModel) { setError('Aircraft make or model required'); return; }

    setSaving(true); setError('');
    try {
      // Create/get customer
      let customerId = selectedCustomer?.id;
      if (!customerId && newCustomer.email) {
        const custRes = await fetch('/api/customers', {
          method: 'POST', headers,
          body: JSON.stringify({ name: newCustomer.name, email: newCustomer.email, phone: newCustomer.phone, company_name: newCustomer.company_name || null }),
        });
        if (custRes.ok) { const d = await custRes.json(); customerId = d.customer?.id; }
      }

      // Create job
      const res = await fetch('/api/jobs/create', {
        method: 'POST', headers,
        body: JSON.stringify({
          customer_id: customerId,
          customer_name: customerName,
          customer_email: customerEmail,
          aircraft_make: effectiveMake,
          aircraft_model: effectiveModel,
          tail_number: tailNumber,
          airport,
          services: selectedServices.map(id => {
            const svc = services.find(s => s.id === id);
            const h = getHours(svc);
            const r = getRate(svc);
            return { id, name: svc?.name, hours: h, rate: r, price: getServiceTotal(svc) };
          }),
          scheduled_date: scheduledDate || null,
          scheduled_time: scheduledTime || null,
          assigned_crew: assignedCrew,
          payment_method: paymentMethod,
          total_price: total,
          notes,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }

      // Save hour overrides per aircraft if checked
      if (saveHoursForAircraft && selectedAircraft && Object.keys(hourOverrides).length > 0) {
        for (const [svcId, hours] of Object.entries(hourOverrides)) {
          const svc = services.find(s => s.id === svcId);
          try {
            await fetch('/api/custom-aircraft/overrides', {
              method: 'POST', headers,
              body: JSON.stringify({
                aircraft_id: selectedAircraft.custom ? null : selectedAircraft.id,
                custom_aircraft_id: selectedAircraft.custom ? selectedAircraft.id : null,
                service_id: svcId,
                service_name: svc?.name || '',
                hours,
              }),
            });
          } catch {}
        }
      }

      router.push('/jobs');
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  };

  const cls = 'w-full bg-v-surface border border-v-border text-v-text-primary rounded-sm px-3 py-2 text-sm outline-none focus:border-v-gold/50';

  if (loading) return <AppShell title="Create Job"><div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-v-gold border-t-transparent rounded-full animate-spin" /></div></AppShell>;

  return (
    <AppShell title="Create Job">
      <div className="px-6 md:px-10 py-8 max-w-3xl">
        <div className="flex items-center gap-3 mb-8">
          <a href="/jobs" className="text-v-text-secondary hover:text-white text-lg">&larr;</a>
          <div>
            <h1 className="font-heading text-2xl font-light text-v-text-primary tracking-wider">CREATE JOB</h1>
            <p className="text-[10px] text-v-text-secondary tracking-wider uppercase mt-0.5">For work already agreed or paid &middot; <a href="/quotes/new" className="text-v-gold/60 hover:text-v-gold">Send a quote for approval &rarr;</a></p>
          </div>
        </div>

        {error && <div className="bg-red-500/20 border border-red-500/40 text-red-300 px-4 py-2 rounded mb-4 text-sm">{error}</div>}

        <div className="space-y-6">
          {/* Customer */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Customer</label>
            <div className="flex gap-2 mb-2">
              <button onClick={() => setCustomerMode('existing')} className={`px-3 py-1 text-xs rounded ${customerMode === 'existing' ? 'bg-v-gold text-v-charcoal' : 'border border-v-border text-v-text-secondary'}`}>Existing</button>
              <button onClick={() => setCustomerMode('new')} className={`px-3 py-1 text-xs rounded ${customerMode === 'new' ? 'bg-v-gold text-v-charcoal' : 'border border-v-border text-v-text-secondary'}`}>New</button>
            </div>
            {customerMode === 'existing' ? (
              <select value={selectedCustomer?.id || ''} onChange={e => setSelectedCustomer(customers.find(c => c.id === e.target.value) || null)} className={cls}>
                <option value="">Select customer...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} {c.email ? `(${c.email})` : ''}</option>)}
              </select>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input value={newCustomer.name} onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))} placeholder="Name *" className={cls} />
                <input value={newCustomer.company_name} onChange={e => setNewCustomer(p => ({ ...p, company_name: e.target.value }))} placeholder="Company Name (optional)" className={cls} />
                <input value={newCustomer.email} onChange={e => setNewCustomer(p => ({ ...p, email: e.target.value }))} placeholder="Email" className={cls} />
                <input value={newCustomer.phone} onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className={cls} />
              </div>
            )}
          </div>

          {/* Aircraft */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Aircraft</label>
            <div className="flex gap-2 mb-3">
              <button onClick={() => { setAircraftMode('standard'); setCustomMake(''); setCustomModel(''); }}
                className={`px-3 py-1 text-xs rounded ${aircraftMode === 'standard' ? 'bg-v-gold text-v-charcoal' : 'border border-v-border text-v-text-secondary'}`}>
                Standard Aircraft
              </button>
              <button onClick={() => { setAircraftMode('custom'); setManufacturer(''); setModel(''); setSelectedAircraft(null); }}
                className={`px-3 py-1 text-xs rounded ${aircraftMode === 'custom' ? 'bg-v-gold text-v-charcoal' : 'border border-v-border text-v-text-secondary'}`}>
                Custom / Not Listed
              </button>
            </div>
            {aircraftMode === 'standard' ? (
              <div className="grid grid-cols-2 gap-3 mb-2">
                <select value={manufacturer} onChange={e => { setManufacturer(e.target.value); setModel(''); }} className={cls}>
                  <option value="">Manufacturer...</option>
                  {manufacturers.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value={model} onChange={e => setModel(e.target.value)} className={cls} disabled={!manufacturer}>
                  <option value="">Model...</option>
                  {models.map(m => <option key={m.id} value={m.model}>{m.model}</option>)}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 mb-2">
                <input value={customMake} onChange={e => setCustomMake(e.target.value)} placeholder="Make (e.g. Lockheed)" className={cls} />
                <input value={customModel} onChange={e => setCustomModel(e.target.value)} placeholder="Model (e.g. 12 Electra Junior)" className={cls} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <input value={tailNumber} onChange={e => setTailNumber(e.target.value.toUpperCase())} placeholder="Tail Number (N12345)" className={cls} />
              <input value={airport} onChange={e => setAirport(e.target.value.toUpperCase())} placeholder="Airport (KTEB)" className={cls} />
            </div>
          </div>

          {/* Services */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Services</label>
            <div className="space-y-1">
              {services.map(svc => {
                const sel = selectedServices.includes(svc.id);
                const hours = getHours(svc);
                const rate = getRate(svc);
                const svcTotal = getServiceTotal(svc);
                return (
                  <div key={svc.id} className={`flex items-center gap-3 p-3 rounded border transition-colors ${sel ? 'border-v-gold/50 bg-v-gold/5' : 'border-v-border bg-v-surface'}`}>
                    <input type="checkbox" checked={sel}
                      onChange={() => setSelectedServices(prev => sel ? prev.filter(id => id !== svc.id) : [...prev, svc.id])}
                      className="w-4 h-4 rounded accent-v-gold cursor-pointer" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-v-text-primary">{svc.name}</span>
                      {!selectedAircraft && aircraftMode === 'standard' && <span className="text-[10px] text-v-text-secondary/50 ml-2 italic">Select aircraft for hours</span>}
                      {aircraftMode === 'custom' && <span className="text-[10px] text-v-text-secondary/50 ml-2 italic">Enter hours manually</span>}
                    </div>
                    {sel && (
                      <div className="flex items-center gap-2 shrink-0">
                        <input type="number" step="0.5" min="0"
                          value={hourOverrides[svc.id] !== undefined ? hourOverrides[svc.id] : (getDefaultHours(svc) || '')}
                          onChange={e => setHourOverrides(prev => ({ ...prev, [svc.id]: parseFloat(e.target.value) || 0 }))}
                          className="w-16 bg-v-charcoal border border-v-border text-v-text-primary rounded px-2 py-1 text-xs text-center outline-none focus:border-v-gold/50" />
                        <span className="text-[10px] text-v-text-secondary">hrs</span>
                      </div>
                    )}
                    <div className="text-right shrink-0 w-20">
                      {svcTotal > 0 && <span className="text-sm text-v-text-primary font-medium">${svcTotal.toFixed(0)}</span>}
                      {rate > 0 && hours > 0 && <span className="text-[10px] text-v-text-secondary block">@ ${rate}/hr</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Save hours for this aircraft */}
          {selectedAircraft && Object.keys(hourOverrides).length > 0 && (
            <label className="flex items-center gap-2 cursor-pointer mt-1 mb-2">
              <input type="checkbox" checked={saveHoursForAircraft} onChange={e => setSaveHoursForAircraft(e.target.checked)} className="w-4 h-4 rounded accent-[var(--v-gold)]" />
              <span className="text-xs text-v-text-secondary">Save these hours for {model} for future quotes</span>
            </label>
          )}

          {/* Schedule + Crew */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Date</label>
              <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} min={new Date().toISOString().split('T')[0]} className={cls} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Time</label>
              <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className={cls} />
            </div>
          </div>

          {/* Assign Crew */}
          {teamMembers.length > 0 && (
            <div>
              <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Assign Crew</label>
              <div className="flex flex-wrap gap-2">
                {teamMembers.map(tm => {
                  const sel = assignedCrew.includes(tm.id);
                  return (
                    <button key={tm.id} onClick={() => setAssignedCrew(prev => sel ? prev.filter(id => id !== tm.id) : [...prev, tm.id])}
                      className={`px-3 py-1.5 rounded text-xs transition-colors ${sel ? 'bg-v-gold text-v-charcoal font-medium' : 'border border-v-border text-v-text-secondary hover:border-v-gold/30'}`}>
                      {tm.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Payment + Total */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Payment</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={cls}>
                <option value="unpaid">Unpaid</option>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="card_external">Card (External)</option>
                <option value="zelle">Zelle</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Total</label>
              <input
                type="text"
                inputMode="decimal"
                value={totalOverride !== '' ? totalOverride : calculatedTotal > 0 ? calculatedTotal.toFixed(2) : ''}
                onChange={e => setTotalOverride(e.target.value.replace(/[^0-9.]/g, ''))}
                onBlur={e => {
                  const num = parseFloat(e.target.value);
                  if (isNaN(num) || num === 0) { setTotalOverride(''); return; }
                  setTotalOverride(num.toFixed(2));
                }}
                placeholder={calculatedTotal > 0 ? calculatedTotal.toFixed(2) : '0.00'}
                className={cls}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Optional notes..." className={cls + ' resize-none'} />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-v-border">
            <a href="/jobs" className="px-5 py-2.5 text-sm text-v-text-secondary hover:text-white border border-v-border rounded transition-colors">Cancel</a>
            <button onClick={handleSave} disabled={saving}
              className="px-6 py-2.5 text-xs uppercase tracking-widest bg-v-gold text-v-charcoal font-semibold hover:bg-v-gold-dim disabled:opacity-50 transition-colors">
              {saving ? 'Creating...' : 'Create Job'}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
