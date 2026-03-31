"use client";
import { useState, useEffect } from 'react';

const TOTAL_STEPS = 7;

const AREAS = [
  { key: 'paint', label: 'Paint', icon: '\u{1F3A8}' },
  { key: 'brightwork', label: 'Brightwork', icon: '\u2728' },
  { key: 'windows', label: 'Windows', icon: '\u{1FA9F}' },
  { key: 'seats', label: 'Seats', icon: '\u{1FA91}' },
  { key: 'carpets', label: 'Carpets', icon: '\u{1F9F9}' },
  { key: 'deice_boots', label: 'De-ice Boots', icon: '\u2744' },
];

const LEVELS_BY_AREA = {
  paint:       ['maintenance', 'restoration', 'protection'],
  brightwork:  ['maintenance', 'restoration', 'protection'],
  windows:     ['maintenance', 'restoration', 'protection'],
  seats:       ['maintenance', 'restoration', 'protection'],
  carpets:     ['maintenance', 'restoration'], // no protection for carpets
  deice_boots: ['maintenance', 'restoration', 'protection'],
};

const LEVEL_INFO = {
  maintenance: { label: 'Maintenance', desc: 'Regular upkeep, good condition', color: '#007CB1' },
  restoration: { label: 'Restoration', desc: 'Needs work, visible wear', color: '#EAB308' },
  protection:  { label: 'Protection', desc: 'Seal and protect after cleaning', color: '#22C55E' },
};

const SERVICE_MAP = {
  paint:       { maintenance: ['Exterior Wash'], restoration: ['Compounding', 'Polishing', 'Orange Peel Removal'], protection: ['Wax', 'Ceramic Coating', 'Paint Sealant'] },
  brightwork:  { maintenance: ['Brightwork Cleaning', 'Bug Removal', 'Wipe Down'], restoration: ['Brightwork Polish'], protection: ['Brightwork Sealant'] },
  windows:     { maintenance: ['Window Cleaning (Glass Only)'], restoration: ['Window Polish', 'Window Compound', 'Wet Sand (Acrylic Only)'], protection: ['Approved Window Coating (Acrylic Only)'] },
  seats:       { maintenance: ['Vacuum', 'Wipe Down', 'Seatbelt Dressing'], restoration: [], protection: ['Leather Conditioning'] }, // restoration filled dynamically based on seat type
  carpets:     { maintenance: ['Vacuum'], restoration: ['Carpet Extraction', 'Encapsulation', 'Carpet Shampoo'], protection: [] },
  deice_boots: { maintenance: ['De-ice Boot Cleaning', 'Boot Inspection'], restoration: ['Boot Treatment', 'Boot Reconditioning'], protection: ['Boot Protectant'] },
};

const SEATS_RESTORATION = {
  leather: ['Leather Clean & Condition'],
  fabric: ['Fabric Extraction/Steam'],
};

const DISCLAIMERS = {
  windows_restoration: 'Window restoration on pressurized aircraft requires coordination with a licensed A&P mechanic. Detailer will advise upon inspection.',
  windows_protection: 'Window coatings are for acrylic windows only. Glass windshields require manufacturer-approved products.',
};

export default function QuoteRequestFlow({ detailerId, detailerName, detailerLogo, embedded = false }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [serviceMode, setServiceMode] = useState(null);

  // Aircraft
  const [manufacturers, setManufacturers] = useState([]);
  const [models, setModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Smart service selection
  const [selectedAreas, setSelectedAreas] = useState([]);
  const [areaLevels, setAreaLevels] = useState({});
  const [currentAreaIdx, setCurrentAreaIdx] = useState(0);
  const [showRecommendation, setShowRecommendation] = useState(false);
  const [areasConfirmed, setAreasConfirmed] = useState(false);
  const [quickSelect, setQuickSelect] = useState(null);
  const [washAddons, setWashAddons] = useState([]);
  const [seatType, setSeatType] = useState(null); // 'leather' | 'fabric'

  const [data, setData] = useState({
    manufacturer: '', model: '', model_full: '',
    tail_number: '', airport: '',
    service_text: '', recommended_services: [],
    name: '', email: '', phone: '',
  });

  const set = (field, value) => setData(prev => ({ ...prev, [field]: value }));

  const goNext = () => setStep(s => Math.min(s + 1, TOTAL_STEPS));
  const goBack = () => {
    if (step === 4) {
      if (showRecommendation) { setShowRecommendation(false); setCurrentAreaIdx(selectedAreas.length - 1); setAreaLevels(prev => { const n = { ...prev }; delete n[selectedAreas[selectedAreas.length - 1]]; return n; }); return; }
      if (areasConfirmed && currentAreaIdx > 0) { setCurrentAreaIdx(i => i - 1); setAreaLevels(prev => { const n = { ...prev }; delete n[selectedAreas[currentAreaIdx - 1]]; return n; }); return; }
      if (areasConfirmed) { setAreasConfirmed(false); setAreaLevels({}); setCurrentAreaIdx(0); return; }
      if (quickSelect === 'maint_wash') { setQuickSelect(null); setWashAddons([]); return; }
      if (quickSelect === 'detail') { setQuickSelect(null); setSelectedAreas([]); return; }
      if (quickSelect) { setQuickSelect(null); return; }
      if (serviceMode) { setServiceMode(null); return; }
    }
    setStep(s => Math.max(s - 1, 1));
  };

  useEffect(() => {
    fetch('/api/aircraft/manufacturers')
      .then(r => r.ok ? r.json() : { manufacturers: [] })
      .then(d => setManufacturers(d.manufacturers || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!data.manufacturer) { setModels([]); return; }
    setLoadingModels(true);
    fetch(`/api/aircraft/models?manufacturer=${encodeURIComponent(data.manufacturer)}`)
      .then(r => r.ok ? r.json() : { models: [] })
      .then(d => setModels(d.models || []))
      .catch(() => {})
      .finally(() => setLoadingModels(false));
  }, [data.manufacturer]);

  // Build recommended services from area+level selections
  const getRecommendedServices = () => {
    const services = [];
    for (const area of selectedAreas) {
      const level = areaLevels[area];
      if (!level || !SERVICE_MAP[area]) continue;
      const mapped = SERVICE_MAP[area][level] || [];
      services.push(...mapped);
      // Seats: add type-specific restoration services
      if (area === 'seats' && (level === 'restoration' || level === 'protection') && seatType) {
        services.push(...(SEATS_RESTORATION[seatType] || []));
      }
      // Protection auto-includes restoration prep
      if (level === 'protection' && SERVICE_MAP[area].restoration) {
        const restorationServices = SERVICE_MAP[area].restoration;
        for (const s of restorationServices) {
          if (!services.includes(s)) services.push(s);
        }
      }
    }
    return [...new Set(services)];
  };

  // Get applicable disclaimers
  const getDisclaimers = () => {
    const disclaimers = [];
    if (areaLevels.windows === 'restoration') disclaimers.push(DISCLAIMERS.windows_restoration);
    if (areaLevels.windows === 'protection') disclaimers.push(DISCLAIMERS.windows_protection);
    return disclaimers;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    const recommended = getRecommendedServices();
    try {
      const res = await fetch('/api/lead-intake/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detailer_id: detailerId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          aircraft_model: data.model_full || `${data.manufacturer} ${data.model}`,
          tail_number: data.tail_number,
          airport: data.airport,
          services_requested: data.service_text || recommended.join(', '),
          notes: selectedAreas.length > 0
            ? `Areas: ${selectedAreas.map(a => `${a} (${areaLevels[a] || 'unset'})`).join(', ')}`
            : '',
          source: embedded ? 'embed_widget' : 'quote_request_page',
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to submit');
      }
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const ProgressDots = () => (
    <div className="flex justify-center gap-1.5 py-4">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i + 1 <= step ? 'bg-[#007CB1]' : 'bg-white/20'}`} />
      ))}
    </div>
  );

  const Header = () => (
    <div className="flex items-center justify-between px-4 pt-4">
      {step > 1 && !submitted ? (
        <button onClick={goBack} className="w-10 h-10 flex items-center justify-center text-white/60 hover:text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
      ) : <div className="w-10" />}
      {detailerLogo ? (
        <img src={detailerLogo} alt={detailerName} className="h-8 object-contain" />
      ) : (
        <span className="text-white/80 text-sm font-medium">{detailerName || 'Get a Quote'}</span>
      )}
      <div className="w-10" />
    </div>
  );

  const Btn = ({ children, onClick, disabled, secondary }) => (
    <button onClick={onClick} disabled={disabled}
      className={`w-full py-4 rounded-lg text-sm font-semibold uppercase tracking-wider transition-all min-h-[48px] disabled:opacity-40 ${
        secondary ? 'bg-white/10 text-white border border-white/20 hover:bg-white/15' : 'bg-[#007CB1] text-white hover:bg-[#006a9e]'
      }`}>
      {children}
    </button>
  );

  const Input = ({ value, onChange, placeholder, type = 'text', autoComplete, autoCapitalize, autoFocus }) => (
    <input type={type} value={value}
      onChange={e => onChange(e.target.value)}
      onInput={e => onChange(e.target.value)}
      placeholder={placeholder} autoComplete={autoComplete} autoCapitalize={autoCapitalize} autoFocus={autoFocus}
      className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-4 text-base placeholder-white/40 outline-none focus:border-[#007CB1] transition-colors" />
  );

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0D1B2A] flex flex-col">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
          </div>
          <h2 className="text-2xl font-light text-white mb-3">Request Submitted!</h2>
          <p className="text-white/60 text-sm mb-8">We&apos;ll have your quote ready shortly.</p>
          {detailerName && <p className="text-white/40 text-xs">{detailerName}</p>}
        </div>
      </div>
    );
  }

  // Current area for the level selection sub-flow
  const currentArea = selectedAreas[currentAreaIdx];
  const currentAreaLabel = AREAS.find(a => a.key === currentArea)?.label || currentArea;

  return (
    <div className="min-h-screen bg-[#0D1B2A] flex flex-col">
      <Header />
      <ProgressDots />

      <div className="flex-1 flex flex-col px-6 pb-8">
        {error && (
          <div className="bg-red-500/20 border border-red-500/40 text-red-300 px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>
        )}

        {/* STEP 1: Manufacturer + Model */}
        {step === 1 && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-6">What aircraft do you fly?</h2>
            <p className="text-white/50 text-xs uppercase tracking-wider mb-2">Manufacturer</p>
            {!data.manufacturer ? (
              <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-white/10 mb-4">
                {manufacturers.map(m => (
                  <button key={m} onClick={() => set('manufacturer', m)}
                    className="w-full text-left px-4 py-3.5 text-sm text-white/80 hover:bg-[#007CB1]/20 border-b border-white/5 last:border-0 active:bg-[#007CB1]/30 transition-colors">
                    {m}
                  </button>
                ))}
                {manufacturers.length === 0 && <p className="text-white/30 text-sm text-center py-8">Loading manufacturers...</p>}
              </div>
            ) : (
              <button onClick={() => { set('manufacturer', ''); set('model', ''); set('model_full', ''); }}
                className="w-full flex items-center justify-between px-4 py-3.5 rounded-lg border border-[#007CB1] bg-[#007CB1]/10 text-white text-sm mb-4">
                <span>{data.manufacturer}</span>
                <span className="text-white/40 text-xs">Change</span>
              </button>
            )}
            {data.manufacturer && (
              <>
                <p className="text-white/50 text-xs uppercase tracking-wider mb-2">Model</p>
                {loadingModels ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-[#007CB1] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="max-h-[35vh] overflow-y-auto rounded-lg border border-white/10">
                    {models.map(m => (
                      <button key={m.id} onClick={() => { set('model', m.model); set('model_full', `${data.manufacturer} ${m.model}`); setTimeout(goNext, 150); }}
                        className={`w-full text-left px-4 py-3.5 text-sm border-b border-white/5 last:border-0 active:bg-[#007CB1]/30 transition-colors ${
                          data.model === m.model ? 'bg-[#007CB1]/20 text-white' : 'text-white/80 hover:bg-[#007CB1]/10'
                        }`}>
                        {m.model}
                        {m.category && <span className="text-white/30 text-xs ml-2">{m.category}</span>}
                      </button>
                    ))}
                    {models.length === 0 && <p className="text-white/30 text-sm text-center py-6">No models found</p>}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* STEP 2: Tail Number */}
        {step === 2 && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">What&apos;s your tail number?</h2>
            <p className="text-white/40 text-xs mb-6">Optional — helps us look up your aircraft</p>
            <Input value={data.tail_number} onChange={v => set('tail_number', v.toUpperCase())} placeholder="N12345" autoCapitalize="characters" autoFocus />
            <div className="mt-auto pt-6 space-y-3">
              <Btn onClick={goNext}>Next</Btn>
              {!data.tail_number && <Btn onClick={goNext} secondary>Skip</Btn>}
            </div>
          </div>
        )}

        {/* STEP 3: Airport */}
        {step === 3 && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">Which airport are you based at?</h2>
            <p className="text-white/40 text-xs mb-6">ICAO code or airport name</p>
            <Input value={data.airport} onChange={v => set('airport', v.toUpperCase())} placeholder="KTEB or Teterboro" autoCapitalize="characters" autoFocus />
            <div className="mt-auto pt-6">
              <Btn onClick={goNext} disabled={!data.airport.trim()}>Next</Btn>
            </div>
          </div>
        )}

        {/* STEP 4: Service Selection — initial choice */}
        {step === 4 && !serviceMode && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-6">What are you looking for?</h2>
            <div className="space-y-4 mt-4">
              <button onClick={() => setServiceMode('know')}
                className="w-full p-5 rounded-lg border border-white/15 bg-white/5 text-left hover:border-[#007CB1] transition-all">
                <p className="text-white font-medium text-sm">I know what I need</p>
                <p className="text-white/40 text-xs mt-1">Describe the work you want done</p>
              </button>
              <button onClick={() => setServiceMode('options')}
                className="w-full p-5 rounded-lg border border-white/15 bg-white/5 text-left hover:border-[#007CB1] transition-all">
                <p className="text-white font-medium text-sm">Show me options</p>
                <p className="text-white/40 text-xs mt-1">Quick shortcuts or full service selection</p>
              </button>
            </div>
          </div>
        )}

        {/* Quick Select screen — shown right after "Show me options" */}
        {step === 4 && serviceMode === 'options' && !quickSelect && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-6">What brings you in today?</h2>
            <div className="space-y-4">
              <button onClick={() => {
                setQuickSelect('quick_turn');
                set('service_text', 'Quick Turn — between flights, fast turnaround');
                setStep(5);
              }}
                className="w-full p-5 rounded-lg border border-white/15 bg-white/5 text-left hover:border-[#007CB1] transition-all active:bg-[#007CB1]/10">
                <p className="text-white font-medium"><span className="mr-2">&#9889;</span>Quick Turn</p>
                <p className="text-white/40 text-xs mt-1">Between flights, fast turnaround</p>
              </button>
              <button onClick={() => { setQuickSelect('maint_wash'); }}
                className="w-full p-5 rounded-lg border border-white/15 bg-white/5 text-left hover:border-[#007CB1] transition-all active:bg-[#007CB1]/10">
                <p className="text-white font-medium"><span className="mr-2 text-[#007CB1]">&#9679;</span>Maintenance Wash</p>
                <p className="text-white/40 text-xs mt-1">Regular scheduled wash</p>
              </button>
              <button onClick={() => { setQuickSelect('detail'); }}
                className="w-full p-5 rounded-lg border border-white/15 bg-white/5 text-left hover:border-[#007CB1] transition-all active:bg-[#007CB1]/10">
                <p className="text-white font-medium"><span className="mr-2">&#10022;</span>Detailing</p>
                <p className="text-white/40 text-xs mt-1">Let me choose what I need</p>
              </button>
            </div>
          </div>
        )}

        {/* Maintenance Wash add-ons */}
        {step === 4 && serviceMode === 'options' && quickSelect === 'maint_wash' && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">Maintenance Wash</h2>
            <p className="text-white/40 text-xs mb-6">Want to add anything else?</p>
            <div className="space-y-3">
              {[
                { key: 'brightwork', label: 'Brightwork Polish' },
                { key: 'windows', label: 'Window Cleaning' },
                { key: 'interior', label: 'Interior Wipe Down' },
                { key: 'wheels', label: 'Wheel & Tire Clean' },
              ].map(addon => (
                <button key={addon.key} onClick={() => setWashAddons(prev => prev.includes(addon.key) ? prev.filter(k => k !== addon.key) : [...prev, addon.key])}
                  className={`w-full p-4 rounded-lg border text-left transition-all ${
                    washAddons.includes(addon.key) ? 'border-[#007CB1] bg-[#007CB1]/15 text-white' : 'border-white/15 bg-white/5 text-white/70'
                  }`}>
                  <span className="text-sm">{addon.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-auto pt-6 space-y-3">
              <Btn onClick={() => {
                const addons = washAddons.map(k => ({ brightwork: 'Brightwork Polish', windows: 'Window Cleaning', interior: 'Interior Wipe Down', wheels: 'Wheel & Tire Clean' })[k]).filter(Boolean);
                set('service_text', ['Maintenance Wash', ...addons].join(', '));
                setStep(5);
              }}>
                {washAddons.length > 0 ? `Continue with ${washAddons.length + 1} services` : 'Just the wash'}
              </Btn>
            </div>
          </div>
        )}

        {/* "Detailing" → area selection (existing flow) */}
        {step === 4 && serviceMode === 'options' && quickSelect === 'detail' && !areasConfirmed && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">Which areas need attention?</h2>
            <p className="text-white/40 text-xs mb-6">Select all that apply</p>
            <AreaSelector selectedAreas={selectedAreas} onToggle={(key) => {
              setSelectedAreas(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
            }} onSelectAll={() => setSelectedAreas(AREAS.map(a => a.key))}
            onContinue={() => { setAreasConfirmed(true); setCurrentAreaIdx(0); }} />
          </div>
        )}

        {/* "I know what I need" - free text */}
        {step === 4 && serviceMode === 'know' && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">Describe what you need</h2>
            <p className="text-white/40 text-xs mb-6">Tell us about the work you&apos;re looking for</p>
            <textarea value={data.service_text} onChange={e => set('service_text', e.target.value)}
              placeholder="e.g. Full exterior wash and interior detail, ceramic coating on paint..."
              rows={4}
              className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-4 text-base placeholder-white/40 outline-none focus:border-[#007CB1] resize-none" />
            <div className="mt-auto pt-6">
              <Btn onClick={() => setStep(5)} disabled={!data.service_text.trim()}>Next</Btn>
            </div>
          </div>
        )}

        {/* SCREEN B: Seat type question (if seats selected and restoration/protection chosen) */}
        {step === 4 && serviceMode === 'options' && quickSelect === 'detail' && areasConfirmed && !showRecommendation && currentArea === 'seats' && !seatType && areaLevels[currentArea] && (areaLevels[currentArea] === 'restoration' || areaLevels[currentArea] === 'protection') && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">Are your seats leather or fabric?</h2>
            <p className="text-white/40 text-xs mb-6">This determines the right cleaning method</p>
            <div className="space-y-3">
              <button onClick={() => { setSeatType('leather'); if (currentAreaIdx < selectedAreas.length - 1) setCurrentAreaIdx(i => i + 1); else setShowRecommendation(true); }}
                className="w-full p-5 rounded-lg border border-white/15 bg-white/5 text-left hover:border-white/30 transition-all active:bg-white/10">
                <p className="text-white font-medium text-sm">Leather</p>
              </button>
              <button onClick={() => { setSeatType('fabric'); if (currentAreaIdx < selectedAreas.length - 1) setCurrentAreaIdx(i => i + 1); else setShowRecommendation(true); }}
                className="w-full p-5 rounded-lg border border-white/15 bg-white/5 text-left hover:border-white/30 transition-all active:bg-white/10">
                <p className="text-white font-medium text-sm">Fabric</p>
              </button>
            </div>
          </div>
        )}

        {/* SCREEN B: Level for each area, one at a time */}
        {step === 4 && serviceMode === 'options' && quickSelect === 'detail' && areasConfirmed && !showRecommendation && currentArea && !areaLevels[currentArea] && !(currentArea === 'seats' && !seatType && areaLevels[currentArea]) && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">What does <span className="text-[#007CB1]">{currentAreaLabel}</span> need?</h2>
            <p className="text-white/40 text-xs mb-6">Area {currentAreaIdx + 1} of {selectedAreas.length}</p>
            <div className="space-y-3">
              {(LEVELS_BY_AREA[currentArea] || ['maintenance', 'restoration', 'protection']).map(levelKey => {
                const level = LEVEL_INFO[levelKey];
                const isProtectionLocked = levelKey === 'protection' && !areaLevels[currentArea];
                return (
                  <button key={levelKey} onClick={() => {
                    let updated = { ...areaLevels, [currentArea]: levelKey };
                    // Protection requires restoration — auto-add restoration
                    if (levelKey === 'protection') {
                      updated[currentArea] = 'protection';
                      // We'll note this in the recommendation
                    }
                    setAreaLevels(updated);
                    // If seats and restoration/protection, ask seat type
                    if (currentArea === 'seats' && (levelKey === 'restoration' || levelKey === 'protection') && !seatType) {
                      return; // Stay on this step — seat type question will show
                    }
                    if (currentAreaIdx < selectedAreas.length - 1) {
                      setCurrentAreaIdx(i => i + 1);
                    } else {
                      setShowRecommendation(true);
                    }
                  }}
                    className="w-full p-5 rounded-lg border border-white/15 bg-white/5 text-left hover:border-white/30 transition-all active:bg-white/10">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: level.color }} />
                      <div>
                        <p className="text-white font-medium text-sm">{level.label}</p>
                        <p className="text-white/40 text-xs mt-0.5">{level.desc}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Already answered current area — advance */}
        {step === 4 && serviceMode === 'options' && quickSelect === 'detail' && areasConfirmed && currentArea && areaLevels[currentArea] && !showRecommendation && (() => {
          // Auto-advance if we land back on an already-answered area
          const nextUnanswered = selectedAreas.findIndex((a, i) => i > currentAreaIdx && !areaLevels[a]);
          if (nextUnanswered !== -1) { setTimeout(() => setCurrentAreaIdx(nextUnanswered), 0); }
          else { setTimeout(() => setShowRecommendation(true), 0); }
          return null;
        })()}

        {/* SCREEN C: Recommendation */}
        {step === 4 && serviceMode === 'options' && quickSelect === 'detail' && areasConfirmed && showRecommendation && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">
              Based on your {data.model_full || data.model}, here&apos;s what we recommend
            </h2>
            <div className="space-y-3 mt-4 flex-1 overflow-y-auto">
              {selectedAreas.map(area => {
                const level = areaLevels[area];
                let services = [...(SERVICE_MAP[area]?.[level] || [])];
                // Add seat-type-specific services
                if (area === 'seats' && (level === 'restoration' || level === 'protection') && seatType) {
                  services.push(...(SEATS_RESTORATION[seatType] || []));
                }
                // Protection includes restoration prep
                if (level === 'protection' && SERVICE_MAP[area]?.restoration) {
                  for (const s of SERVICE_MAP[area].restoration) { if (!services.includes(s)) services.push(s); }
                }
                const areaInfo = AREAS.find(a => a.key === area);
                const levelInfo = LEVEL_INFO[level];
                return (
                  <div key={area} className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span>{areaInfo?.icon}</span>
                      <span className="text-white text-sm font-medium">{areaInfo?.label}</span>
                      <div className="w-2 h-2 rounded-full ml-auto" style={{ backgroundColor: levelInfo?.color }} />
                      <span className="text-white/40 text-xs">{levelInfo?.label}</span>
                      {level === 'protection' && <span className="text-white/30 text-[10px]">+ prep</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {services.map(s => (
                        <span key={s} className="text-xs bg-[#007CB1]/20 text-[#007CB1] px-2 py-1 rounded">{s}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
              {getDisclaimers().length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mt-2">
                  {getDisclaimers().map((d, i) => (
                    <p key={i} className="text-yellow-300/80 text-[11px] leading-relaxed">{i > 0 && <br />}{d}</p>
                  ))}
                </div>
              )}
              <p className="text-white/30 text-[10px] text-center pt-2">Final service steps determined after inspection and photo documentation</p>
            </div>
            <div className="pt-6 space-y-3">
              <Btn onClick={() => {
                set('recommended_services', getRecommendedServices());
                setStep(5);
              }}>This looks right</Btn>
              <Btn onClick={() => { setShowRecommendation(false); setAreasConfirmed(false); setAreaLevels({}); setCurrentAreaIdx(0); setSeatType(null); }} secondary>
                I want to change something
              </Btn>
            </div>
          </div>
        )}

        {/* STEP 5: Summary */}
        {step === 5 && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-6">Here&apos;s what you&apos;ve requested</h2>
            <div className="space-y-4 bg-white/5 rounded-lg p-5 border border-white/10">
              <SummaryRow label="Aircraft" value={data.model_full || `${data.manufacturer} ${data.model}`} />
              {data.tail_number && <SummaryRow label="Tail Number" value={data.tail_number} />}
              <SummaryRow label="Airport" value={data.airport} />
              <SummaryRow label="Services" value={
                data.service_text || getRecommendedServices().join(', ') || 'To be discussed'
              } />
            </div>
            {getDisclaimers().length > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mt-4">
                {getDisclaimers().map((d, i) => (
                  <p key={i} className="text-yellow-300/80 text-[11px] leading-relaxed">{i > 0 && <br />}{d}</p>
                ))}
              </div>
            )}
            <div className="mt-auto pt-6">
              <Btn onClick={goNext}>Looks good — continue</Btn>
            </div>
          </div>
        )}

        {/* STEP 6: Contact Info */}
        {step === 6 && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">Last step — how do we reach you?</h2>
            <p className="text-white/40 text-xs mb-6">We&apos;ll send your quote to this email</p>
            <div className="space-y-4">
              <Input value={data.name} onChange={v => set('name', v)} placeholder="Full Name" autoComplete="name" autoFocus />
              <Input value={data.email} onChange={v => set('email', v)} placeholder="Email" type="email" autoComplete="email" />
              <Input value={data.phone} onChange={v => set('phone', v)} placeholder="Phone (optional)" type="tel" autoComplete="tel" />
            </div>
            <div className="mt-auto pt-6">
              <Btn onClick={() => { setStep(7); handleSubmit(); }} disabled={!data.name.trim() || !data.email.trim()}>
                Submit Request
              </Btn>
            </div>
          </div>
        )}

        {/* STEP 7: Submitting */}
        {step === 7 && !submitted && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-2 border-[#007CB1] border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-white/60 text-sm">Submitting your request...</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AreaSelector({ selectedAreas, onToggle, onSelectAll, onContinue }) {
  const allSelected = AREAS.every(a => selectedAreas.includes(a.key));
  return (
    <div className="space-y-3">
      {AREAS.map(area => (
        <button key={area.key} onClick={() => onToggle(area.key)}
          className={`w-full p-4 rounded-lg border text-left transition-all active:scale-[0.98] ${
            selectedAreas.includes(area.key)
              ? 'border-[#007CB1] bg-[#007CB1]/15 text-white'
              : 'border-white/15 bg-white/5 text-white/70 hover:border-white/30'
          }`}>
          <span className="text-lg mr-3">{area.icon}</span>
          <span className="text-sm font-medium">{area.label}</span>
        </button>
      ))}
      <button onClick={onSelectAll}
        className={`w-full p-4 rounded-lg border text-sm font-medium transition-all ${
          allSelected
            ? 'border-[#007CB1] bg-[#007CB1]/15 text-white'
            : 'border-white/15 bg-white/5 text-[#007CB1] hover:border-[#007CB1]/50'
        }`}>
        All of the above
      </button>
      {selectedAreas.length > 0 && (
        <div className="pt-4">
          <button onClick={onContinue}
            className="w-full py-4 rounded-lg text-sm font-semibold uppercase tracking-wider bg-[#007CB1] text-white hover:bg-[#006a9e] min-h-[48px] transition-all">
            Continue with {selectedAreas.length} area{selectedAreas.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div>
      <p className="text-white/40 text-[10px] uppercase tracking-wider">{label}</p>
      <p className="text-white text-sm mt-0.5">{value}</p>
    </div>
  );
}
