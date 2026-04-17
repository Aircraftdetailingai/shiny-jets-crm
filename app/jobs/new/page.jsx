"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';

const CATEGORY_ORDER = ['exterior', 'interior', 'paint_correction', 'coating', 'brightwork', 'other'];
const CATEGORY_LABELS = {
  exterior: 'Exterior', interior: 'Interior', paint_correction: 'Paint Correction',
  coating: 'Coatings & Protection', brightwork: 'Brightwork', other: 'Other',
};

export default function NewJobPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Data
  const [customLines, setCustomLines] = useState([]); // one-off custom services
  const [customers, setCustomers] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [models, setModels] = useState([]);
  const [selectedAircraft, setSelectedAircraft] = useState(null);
  const [services, setServices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);

  // Form
  const [customerMode, setCustomerMode] = useState('existing');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [newCustomer, setNewCustomer] = useState({ name: '', company_name: '', email: '', phone: '' });
  const [aircraftMode, setAircraftMode] = useState('standard');
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
  const [serviceTab, setServiceTab] = useState('services'); // 'services' | 'packages'

  const token = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : null;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    Promise.all([
      fetch('/api/customers', { headers }).then(r => r.ok ? r.json() : { customers: [] }),
      fetch('/api/aircraft/manufacturers', { headers }).then(r => r.ok ? r.json() : { manufacturers: [] }),
      fetch('/api/services', { headers }).then(r => r.ok ? r.json() : { services: [] }),
      fetch('/api/team', { headers }).then(r => r.ok ? r.json() : { members: [] }),
      fetch('/api/packages', { headers }).then(r => r.ok ? r.json() : { packages: [] }),
    ]).then(([custData, mfrData, svcData, teamData, pkgData]) => {
      setCustomers(custData.customers || []);
      setManufacturers(mfrData.manufacturers || []);
      setServices(svcData.services || svcData || []);
      setTeamMembers((teamData.members || []).filter(m => m.status === 'active'));
      setPackages(pkgData.packages || []);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!manufacturer) { setModels([]); setSelectedAircraft(null); return; }
    fetch(`/api/aircraft/models?make=${encodeURIComponent(manufacturer)}`, { headers })
      .then(r => r.ok ? r.json() : { models: [] })
      .then(d => setModels(d.models || []));
  }, [manufacturer]);

  useEffect(() => {
    if (!model || !models.length) { setSelectedAircraft(null); return; }
    const match = models.find(m => m.model === model);
    if (match?.id) {
      fetch(`/api/aircraft/${match.id}`, { headers })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setSelectedAircraft(d); });
    }
  }, [model, models]);

  const getDefaultHours = (svc) => {
    if (!selectedAircraft) return svc.default_hours || 0;
    const field = svc.hours_field;
    return (field && selectedAircraft[field]) ? parseFloat(selectedAircraft[field]) : (svc.default_hours || 0);
  };

  const getHours = (svc) => hourOverrides[svc.id] !== undefined ? hourOverrides[svc.id] : getDefaultHours(svc);
  const getRate = (svc) => parseFloat(svc.hourly_rate) || 0;
  const getServiceTotal = (svc) => {
    const hrs = getHours(svc);
    const rate = getRate(svc);
    return hrs * rate;
  };

  const svcTotal = selectedServices.reduce((sum, svcId) => {
    const svc = services.find(s => s.id === svcId);
    return sum + (svc ? getServiceTotal(svc) : 0);
  }, 0);
  const customTotal = customLines.reduce((s, cl) => s + (parseFloat(cl.hours) || 0) * (parseFloat(cl.rate) || 0), 0);
  const computedTotal = svcTotal + customTotal;

  const displayTotal = totalOverride !== '' ? parseFloat(totalOverride) || 0 : computedTotal;

  const selectPackage = (pkg) => {
    const svcIds = pkg.service_ids || [];
    setSelectedServices(prev => {
      const combined = new Set([...prev, ...svcIds]);
      return [...combined];
    });
    setServiceTab('services');
  };

  const handleSave = async () => {
    const custName = customerMode === 'existing' ? selectedCustomer?.name : newCustomer.name;
    const custEmail = customerMode === 'existing' ? selectedCustomer?.email : newCustomer.email;
    const make = aircraftMode === 'custom' ? customMake : manufacturer;
    const mdl = aircraftMode === 'custom' ? customModel : model;

    if (!custName) { setError('Customer name is required'); return; }
    if (!make || !mdl) { setError('Aircraft make and model are required'); return; }
    if (selectedServices.length === 0) { setError('Select at least one service'); return; }

    setSaving(true);
    setError('');
    try {
      const svcDetails = [
        ...selectedServices.map(id => {
          const svc = services.find(s => s.id === id);
          if (!svc) return null;
          return { id: svc.id, name: svc.name, hours: getHours(svc), rate: getRate(svc), price: getServiceTotal(svc) };
        }).filter(Boolean),
        ...customLines.filter(cl => cl.name?.trim()).map(cl => ({
          name: cl.name, hours: parseFloat(cl.hours) || 0, rate: parseFloat(cl.rate) || 0,
          price: (parseFloat(cl.hours) || 0) * (parseFloat(cl.rate) || 0), custom: true,
        })),
      ];

      const res = await fetch('/api/jobs/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customer_id: customerMode === 'existing' ? selectedCustomer?.id : null,
          customer_name: custName,
          customer_email: custEmail,
          customer_phone: customerMode === 'new' ? newCustomer.phone : selectedCustomer?.phone,
          aircraft_make: make,
          aircraft_model: mdl,
          tail_number: tailNumber,
          airport,
          services: svcDetails,
          scheduled_date: scheduledDate || null,
          scheduled_time: scheduledTime || null,
          assigned_crew: assignedCrew,
          payment_method: paymentMethod,
          total_price: displayTotal,
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create job');

      if (saveHoursForAircraft && selectedAircraft?.id) {
        const calibrations = {};
        selectedServices.forEach(id => {
          const svc = services.find(s => s.id === id);
          if (svc?.hours_field && hourOverrides[id] !== undefined) {
            calibrations[svc.hours_field] = hourOverrides[id];
          }
        });
        if (Object.keys(calibrations).length > 0) {
          await fetch(`/api/aircraft/${selectedAircraft.id}`, {
            method: 'PATCH', headers,
            body: JSON.stringify(calibrations),
          }).catch(() => {});
        }
      }

      router.push('/jobs');
    } catch (err) {
      setError(err.message);
    } finally { setSaving(false); }
  };

  const cls = 'w-full bg-v-surface border border-v-border text-v-text-primary rounded-sm px-3 py-2 text-sm outline-none focus:border-v-gold/50';

  // Group services by category
  const groupedServices = {};
  services.forEach(svc => {
    const cat = svc.category || 'other';
    if (!groupedServices[cat]) groupedServices[cat] = [];
    groupedServices[cat].push(svc);
  });
  const sortedCategories = CATEGORY_ORDER.filter(c => groupedServices[c]?.length);
  // Add any unlisted categories
  Object.keys(groupedServices).forEach(c => { if (!sortedCategories.includes(c)) sortedCategories.push(c); });

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
                <input value={newCustomer.company_name} onChange={e => setNewCustomer(p => ({ ...p, company_name: e.target.value }))} placeholder="Company (optional)" className={cls} />
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
              <div className="grid grid-cols-2 gap-2 mb-3">
                <select value={manufacturer} onChange={e => { setManufacturer(e.target.value); setModel(''); setSelectedAircraft(null); }} className={cls}>
                  <option value="">Manufacturer...</option>
                  {manufacturers.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value={model} onChange={e => setModel(e.target.value)} className={cls} disabled={!manufacturer}>
                  <option value="">Model...</option>
                  {models.map(m => <option key={m.model} value={m.model}>{m.model}</option>)}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 mb-3">
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
            <div className="flex gap-2 mb-3">
              <button onClick={() => setServiceTab('services')} className={`px-3 py-1 text-xs rounded ${serviceTab === 'services' ? 'bg-v-gold text-v-charcoal' : 'border border-v-border text-v-text-secondary'}`}>
                Individual Services
              </button>
              {packages.length > 0 && (
                <button onClick={() => setServiceTab('packages')} className={`px-3 py-1 text-xs rounded ${serviceTab === 'packages' ? 'bg-v-gold text-v-charcoal' : 'border border-v-border text-v-text-secondary'}`}>
                  Packages ({packages.length})
                </button>
              )}
            </div>

            {serviceTab === 'packages' && (
              <div className="space-y-2 mb-4">
                {packages.map(pkg => {
                  const svcCount = (pkg.service_ids || []).length;
                  const svcNames = (pkg.service_ids || []).map(id => services.find(s => s.id === id)?.name).filter(Boolean);
                  return (
                    <button key={pkg.id} onClick={() => selectPackage(pkg)}
                      className="w-full flex items-center justify-between p-3 rounded border border-v-border bg-v-surface hover:border-v-gold/30 transition-colors text-left">
                      <div>
                        <span className="text-sm font-medium text-v-text-primary">{pkg.name}</span>
                        {pkg.description && <p className="text-[10px] text-v-text-secondary mt-0.5">{pkg.description}</p>}
                        <p className="text-[10px] text-v-text-secondary/60">{svcCount} services{svcNames.length > 0 ? `: ${svcNames.slice(0, 3).join(', ')}${svcNames.length > 3 ? '...' : ''}` : ''}</p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        {parseFloat(pkg.price) > 0 ? (
                          <span className="text-sm font-bold text-v-text-primary">${parseFloat(pkg.price).toFixed(0)}</span>
                        ) : (
                          <span className="text-[10px] text-v-text-secondary italic">Price varies by aircraft</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {serviceTab === 'services' && (
              <div className="space-y-4">
                {sortedCategories.map(cat => (
                  <div key={cat}>
                    <p className="text-[10px] uppercase tracking-wider text-v-gold/60 mb-1.5">{CATEGORY_LABELS[cat] || cat}</p>
                    <div className="space-y-1">
                      {groupedServices[cat].map(svc => {
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
                ))}
              </div>
            )}

            {selectedServices.length > 0 && (
              <p className="text-xs text-v-text-secondary mt-2">{selectedServices.length} service{selectedServices.length === 1 ? '' : 's'} selected</p>
            )}

            {/* Custom one-off services */}
            {customLines.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-v-gold/60">Custom Line Items</p>
                {customLines.map((cl, i) => (
                  <div key={i} className="flex gap-2 items-center p-2 rounded border border-v-gold/20 bg-v-gold/5">
                    <input value={cl.name} onChange={e => { const c = [...customLines]; c[i] = { ...c[i], name: e.target.value }; setCustomLines(c); }}
                      placeholder="Service name" className="flex-1 bg-v-charcoal border border-v-border rounded px-2 py-1.5 text-xs text-white outline-none" />
                    <input type="number" step="0.5" value={cl.hours} onChange={e => { const c = [...customLines]; c[i] = { ...c[i], hours: e.target.value }; setCustomLines(c); }}
                      placeholder="Hrs" className="w-14 bg-v-charcoal border border-v-border rounded px-2 py-1.5 text-xs text-white outline-none text-center" />
                    <input type="number" step="1" value={cl.rate} onChange={e => { const c = [...customLines]; c[i] = { ...c[i], rate: e.target.value }; setCustomLines(c); }}
                      placeholder="$/hr" className="w-16 bg-v-charcoal border border-v-border rounded px-2 py-1.5 text-xs text-white outline-none text-right" />
                    <span className="text-xs text-v-text-secondary w-14 text-right">${((parseFloat(cl.hours) || 0) * (parseFloat(cl.rate) || 0)).toFixed(0)}</span>
                    <button onClick={() => setCustomLines(customLines.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 text-xs">&times;</button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setCustomLines([...customLines, { name: '', hours: '', rate: '' }])}
              className="text-v-gold text-xs hover:underline mt-2">+ Add custom service</button>
          </div>

          {/* Save hours */}
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
              <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className={cls} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Time</label>
              <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className={cls} />
            </div>
          </div>

          {/* Crew */}
          {teamMembers.length > 0 && (
            <div>
              <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Assign Crew</label>
              <div className="flex flex-wrap gap-2">
                {teamMembers.map(m => {
                  const sel = assignedCrew.includes(m.id);
                  return (
                    <button key={m.id} onClick={() => setAssignedCrew(prev => sel ? prev.filter(id => id !== m.id) : [...prev, m.id])}
                      className={`px-3 py-1.5 text-xs rounded transition-colors ${sel ? 'bg-v-gold text-v-charcoal' : 'border border-v-border text-v-text-secondary hover:border-v-gold/30'}`}>
                      {m.name}{m.title ? ` (${m.title})` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Payment + notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Payment</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={cls}>
                <option value="unpaid">Unpaid — invoice later</option>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="card">Card</option>
                <option value="venmo">Venmo/Zelle</option>
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Total Override</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-v-text-secondary text-sm">$</span>
                <input type="number" step="0.01" min="0"
                  value={totalOverride}
                  onChange={e => setTotalOverride(e.target.value)}
                  placeholder={computedTotal.toFixed(2)}
                  className={`${cls} pl-7`} />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-2">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes..." rows={2} className={cls + ' resize-none'} />
          </div>

          {/* Total + Submit */}
          <div className="border-t border-v-border pt-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-v-text-secondary uppercase tracking-wider">Total</p>
              <p className="text-2xl font-bold text-v-text-primary">${displayTotal.toFixed(2)}</p>
            </div>
            <button onClick={handleSave} disabled={saving}
              className="px-8 py-3 bg-v-gold text-v-charcoal text-sm font-semibold rounded hover:bg-v-gold-dim disabled:opacity-50 transition-colors">
              {saving ? 'Creating...' : 'Create Job'}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
