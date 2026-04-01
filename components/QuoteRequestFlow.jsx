"use client";
import { useState, useEffect } from 'react';

const TOTAL_STEPS = 7;

const AREAS = [
  { key: 'paint', label: 'Paint' },
  { key: 'brightwork', label: 'Brightwork' },
  { key: 'windows', label: 'Windows' },
  { key: 'seats', label: 'Seats' },
  { key: 'carpets', label: 'Carpets' },
  { key: 'deice_boots', label: 'De-ice Boots' },
];

// Condition questions per area — customer describes what they SEE
const CONDITION_QUESTIONS = {
  paint: {
    question: 'How does the paint look?',
    options: [
      { key: 'good', label: 'Looks good, just needs a wash', services: ['Exterior Wash'], tier: 'maintenance' },
      { key: 'dull', label: 'Some dullness or light scratches', services: ['One-Step Polish'], tier: 'restoration' },
      { key: 'heavy', label: 'Significant oxidation, heavy scratches or swirl marks', services: ['Compounding', 'Two-Step Polish', 'Paint Correction'], tier: 'restoration' },
      { key: 'unsure', label: 'Not sure \u2014 detailer should assess', services: ['Detailer Assessment'], tier: 'restoration' },
    ],
  },
  brightwork: {
    question: 'How does the brightwork look?',
    options: [
      { key: 'shiny', label: 'Shiny, just needs cleaning', services: ['Wipe Down & Bug Removal'], tier: 'maintenance' },
      { key: 'tarnish', label: 'Some tarnish or dullness', services: ['Brightwork Polish'], tier: 'restoration' },
      { key: 'heavy', label: 'Heavy tarnish or pitting', services: ['Brightwork Polish \u2014 multiple steps'], tier: 'restoration' },
      { key: 'unsure', label: 'Not sure', services: ['Detailer Assessment'], tier: 'restoration' },
    ],
  },
  windows: {
    question: 'How do the windows look?',
    options: [
      { key: 'clear', label: 'Clear, just needs cleaning', services: ['Window Cleaning (glass only)'], tier: 'maintenance' },
      { key: 'spots', label: 'Water spots or light haze', services: ['Window Polish (acrylic only)'], tier: 'restoration' },
      { key: 'scratches', label: 'Scratches or significant cloudiness', services: ['Compound / Wet Sand (acrylic only)'], tier: 'restoration' },
      { key: 'unsure', label: 'Not sure', services: ['Detailer Assessment'], tier: 'restoration' },
    ],
  },
  seats: {
    question: 'What condition are the seats in?',
    options: [
      { key: 'good', label: 'Good condition, just need cleaning', services: ['Wipe Down', 'Seatbelt Dressing'], tier: 'maintenance' },
      { key: 'stained', label: 'Some staining or light wear', services: [], tier: 'restoration', needsSeatType: true },
      { key: 'damaged', label: 'Significant staining, cracking or damage', services: [], tier: 'restoration', needsSeatType: true },
      { key: 'unsure', label: 'Not sure', services: ['Detailer Assessment'], tier: 'restoration' },
    ],
  },
  carpets: {
    question: 'How are the carpets?',
    options: [
      { key: 'fine', label: 'Fine, just need a vacuum', services: ['Vacuum'], tier: 'maintenance' },
      { key: 'stained', label: 'Some staining or odor', services: ['Carpet Extraction'], tier: 'restoration' },
      { key: 'heavy', label: 'Heavy staining or soiling', services: ['Carpet Extraction', 'Encapsulation', 'Carpet Shampoo'], tier: 'restoration' },
      { key: 'unsure', label: 'Not sure', services: ['Detailer Assessment'], tier: 'restoration' },
    ],
  },
  deice_boots: {
    question: 'What condition are the de-ice boots in?',
    options: [
      { key: 'good', label: 'Good condition, just need cleaning', services: ['Boot Cleaning', 'Boot Inspection'], tier: 'maintenance' },
      { key: 'cracking', label: 'Some cracking or wear', services: ['Boot Treatment', 'Boot Reconditioning'], tier: 'restoration' },
      { key: 'deteriorated', label: 'Significant deterioration', services: ['Boot Reconditioning'], tier: 'restoration' },
      { key: 'unsure', label: 'Not sure', services: ['Detailer Assessment'], tier: 'restoration' },
    ],
  },
};

// Seat-type-specific services for restoration tier
const SEAT_TYPE_SERVICES = {
  leather: { stained: ['Leather Clean & Condition'], damaged: ['Leather Restoration', 'Dye Treatment'] },
  fabric:  { stained: ['Fabric Extraction / Steam'], damaged: ['Fabric Extraction / Steam', 'Stain Treatment'] },
  mixed:   { stained: ['Leather Clean & Condition', 'Fabric Extraction / Steam'], damaged: ['Leather Restoration', 'Fabric Extraction / Steam'] },
};

// Protection options — only offered after restoration areas
const PROTECTION_OPTIONS = {
  paint:       [{ key: 'wax', label: 'Wax' }, { key: 'ceramic', label: 'Ceramic Coating' }, { key: 'sealant', label: 'Paint Sealant' }],
  brightwork:  [{ key: 'bw_sealant', label: 'Brightwork Sealant' }],
  windows:     [{ key: 'win_coat', label: 'Approved Window Coating (acrylic only)' }],
  seats:       [{ key: 'leather_cond', label: 'Leather Conditioning' }],
  deice_boots: [{ key: 'boot_prot', label: 'Boot Protectant' }],
};

const DISCLAIMERS = {
  windows_restoration: 'Window restoration on pressurized aircraft requires coordination with a licensed A&P mechanic. Service scope determined after inspection.',
  windows_protection: 'Window coatings are for acrylic windows only. Glass windshields require manufacturer-approved products.',
};

export default function QuoteRequestFlow({ detailerId, detailerName, detailerLogo, detailerPlan = 'free', embedded = false }) {
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
  const [areaConditions, setAreaConditions] = useState({}); // { paint: { key, label, services, tier }, ... }
  const [currentAreaIdx, setCurrentAreaIdx] = useState(0);
  const [showRecommendation, setShowRecommendation] = useState(false);
  const [showProtectionOffer, setShowProtectionOffer] = useState(false);
  const [protectionSelections, setProtectionSelections] = useState({});
  const [areasConfirmed, setAreasConfirmed] = useState(false);
  const [quickSelect, setQuickSelect] = useState(null);
  const [washAddons, setWashAddons] = useState([]);
  const [seatType, setSeatType] = useState(null);
  const [askingSeatType, setAskingSeatType] = useState(false);

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
      if (showRecommendation) { setShowRecommendation(false); if (hasRestorationAreas()) setShowProtectionOffer(true); else setShowProtectionOffer(false); return; }
      if (showProtectionOffer) { setShowProtectionOffer(false); return; }
      if (askingSeatType) { setAskingSeatType(false); return; }
      if (areasConfirmed && Object.keys(areaConditions).length > 0) { setAreaConditions({}); return; }
      if (areasConfirmed) { setAreasConfirmed(false); setAreaConditions({}); return; }
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

  // Build recommended services from condition selections
  const getRecommendedServices = () => {
    const services = [];
    for (const area of selectedAreas) {
      const cond = areaConditions[area];
      if (!cond) continue;
      services.push(...(cond.services || []));
      // Seat-type-specific services
      if (area === 'seats' && cond.needsSeatType && seatType && SEAT_TYPE_SERVICES[seatType]) {
        services.push(...(SEAT_TYPE_SERVICES[seatType][cond.key] || []));
      }
    }
    // Add protection selections
    for (const [area, opts] of Object.entries(protectionSelections)) {
      for (const opt of opts) {
        const pOpt = PROTECTION_OPTIONS[area]?.find(p => p.key === opt);
        if (pOpt) services.push(pOpt.label);
      }
    }
    return [...new Set(services)];
  };

  // Check if any area has restoration tier (for protection offer)
  const hasRestorationAreas = () => {
    return selectedAreas.some(a => areaConditions[a]?.tier === 'restoration');
  };

  // Areas eligible for protection
  const protectionEligibleAreas = () => {
    return selectedAreas.filter(a => areaConditions[a]?.tier === 'restoration' && PROTECTION_OPTIONS[a]?.length > 0);
  };

  // Get applicable disclaimers
  const getDisclaimers = () => {
    const disclaimers = [];
    const winCond = areaConditions.windows;
    if (winCond && winCond.tier === 'restoration') disclaimers.push(DISCLAIMERS.windows_restoration);
    if (protectionSelections.windows?.length > 0) disclaimers.push(DISCLAIMERS.windows_protection);
    return disclaimers;
  };

  const handleSubmitWithContact = async (name, email, phone) => {
    setSubmitting(true);
    setError('');
    const recommended = getRecommendedServices();
    try {
      const res = await fetch('/api/lead-intake/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detailer_id: detailerId,
          name, email, phone,
          aircraft_model: data.model_full || `${data.manufacturer} ${data.model}`,
          tail_number: data.tail_number,
          airport: data.airport,
          services_requested: data.service_text || recommended.join(', '),
          notes: selectedAreas.length > 0
            ? `Areas: ${selectedAreas.map(a => `${a} (${areaConditions[a]?.label || 'unset'})`).join(', ')}`
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
      setStep(6);
    } finally {
      setSubmitting(false);
    }
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

  const isEnterprise = detailerPlan === 'enterprise';

  const Header = () => (
    <div className="px-4 pt-4">
      <div className="flex items-center justify-between">
        {step > 1 && !submitted ? (
          <button onClick={goBack} className="w-10 h-10 flex items-center justify-center text-white/60 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>
        ) : <div className="w-10" />}
        <div className="text-center">
          {detailerLogo ? (
            <img src={detailerLogo} alt={detailerName} className="h-8 object-contain mx-auto" />
          ) : (
            <span className="text-white/80 text-sm font-medium">{detailerName || 'Get a Quote'}</span>
          )}
        </div>
        <div className="w-10" />
      </div>
      {!isEnterprise && (
        <p className="text-center text-white/20 text-[9px] mt-1">Powered by Shiny Jets CRM</p>
      )}
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
                set('service_text', 'Quick Turn — Exterior rinse, Interior vacuum, Window wipe, Trash removal');
                setStep(5);
              }}
                className="w-full p-5 rounded-lg border border-white/15 bg-white/5 text-left hover:border-[#007CB1] transition-all active:bg-[#007CB1]/10">
                <p className="text-white font-medium">Quick Turn</p>
                <p className="text-white/40 text-xs mt-1">Exterior rinse, interior vacuum, window wipe, trash removal</p>
              </button>
              <button onClick={() => { setQuickSelect('maint_wash'); }}
                className="w-full p-5 rounded-lg border border-white/15 bg-white/5 text-left hover:border-[#007CB1] transition-all active:bg-[#007CB1]/10">
                <p className="text-white font-medium">Maintenance Wash</p>
                <p className="text-white/40 text-xs mt-1">Full exterior wash and interior vacuum</p>
              </button>
              <button onClick={() => { setQuickSelect('detail'); }}
                className="w-full p-5 rounded-lg border border-white/15 bg-white/5 text-left hover:border-[#007CB1] transition-all active:bg-[#007CB1]/10">
                <p className="text-white font-medium">Detailing</p>
                <p className="text-white/40 text-xs mt-1">Let me choose what I need</p>
              </button>
            </div>
          </div>
        )}

        {/* Maintenance Wash add-ons */}
        {step === 4 && serviceMode === 'options' && quickSelect === 'maint_wash' && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">Maintenance Wash</h2>
            <div className="bg-white/5 border border-white/10 rounded-lg p-3 mb-4">
              <p className="text-white/50 text-xs">Includes: Exterior wash and interior vacuum</p>
            </div>
            <p className="text-white/40 text-xs mb-4">Want to add anything else?</p>
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
            <div className="mt-auto pt-6">
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

        {/* "Detailing" → area selection */}
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

        {/* Combined condition screen — all areas on one page */}
        {step === 4 && serviceMode === 'options' && quickSelect === 'detail' && areasConfirmed && !askingSeatType && !showProtectionOffer && !showRecommendation && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-1">How does each area look?</h2>
            <p className="text-white/40 text-xs mb-5">This helps us recommend the right services</p>
            <div className="flex-1 overflow-y-auto space-y-4 -mx-1 px-1">
              {selectedAreas.map(area => {
                const q = CONDITION_QUESTIONS[area];
                if (!q) return null;
                const selected = areaConditions[area]?.key;
                const areaInfo = AREAS.find(a => a.key === area);
                const simplified = [
                  { label: 'Good', matchKey: q.options[0]?.key },
                  { label: 'Some issues', matchKey: q.options[1]?.key },
                  { label: 'Needs work', matchKey: q.options[2]?.key },
                  { label: 'Not sure', matchKey: q.options[3]?.key },
                ];
                return (
                  <div key={area} className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
                    <p className="text-white text-sm font-medium mb-2">{areaInfo?.label}</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {simplified.map((btn, idx) => {
                        const opt = q.options[idx];
                        if (!opt) return null;
                        const isSelected = selected === opt.key;
                        return (
                          <button key={btn.matchKey} onClick={() => setAreaConditions(prev => ({ ...prev, [area]: opt }))}
                            className={`py-2.5 px-1 rounded text-[11px] font-medium text-center transition-all leading-tight ${
                              isSelected ? 'bg-[#007CB1] text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
                            }`}>
                            {btn.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="pt-5">
              <Btn onClick={() => {
                // Check if seats needs follow-up
                const seatCond = areaConditions.seats;
                if (selectedAreas.includes('seats') && seatCond?.needsSeatType && !seatType) {
                  setAskingSeatType(true);
                  return;
                }
                // Check for protection offer
                if (hasRestorationAreas()) setShowProtectionOffer(true);
                else setShowRecommendation(true);
              }} disabled={selectedAreas.some(a => !areaConditions[a])}>
                Next
              </Btn>
            </div>
          </div>
        )}

        {/* Seat type question (conditional follow-up) */}
        {step === 4 && askingSeatType && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">Are your seats leather or fabric?</h2>
            <p className="text-white/40 text-xs mb-6">This determines the right cleaning method</p>
            <div className="space-y-3">
              {['leather', 'fabric', 'mixed'].map(type => (
                <button key={type} onClick={() => {
                  setSeatType(type);
                  setAskingSeatType(false);
                  if (hasRestorationAreas()) setShowProtectionOffer(true);
                  else setShowRecommendation(true);
                }}
                  className="w-full p-5 rounded-lg border border-white/15 bg-white/5 text-left hover:border-white/30 transition-all active:bg-white/10">
                  <p className="text-white font-medium text-sm capitalize">{type === 'mixed' ? 'Mix of both' : type}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Protection offer — only after restoration areas */}
        {step === 4 && showProtectionOffer && !showRecommendation && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">Would you like to add protection?</h2>
            <p className="text-white/40 text-xs mb-6">Recommended after restoration work</p>
            <div className="space-y-3 flex-1 overflow-y-auto">
              {protectionEligibleAreas().map(area => {
                const areaInfo = AREAS.find(a => a.key === area);
                const opts = PROTECTION_OPTIONS[area] || [];
                if (opts.length === 0) return null;
                return (
                  <div key={area} className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <p className="text-white text-sm font-medium mb-2">{areaInfo?.label}</p>
                    <div className="space-y-2">
                      {opts.map(opt => {
                        const selected = protectionSelections[area]?.includes(opt.key);
                        return (
                          <button key={opt.key} onClick={() => {
                            setProtectionSelections(prev => {
                              const current = prev[area] || [];
                              return { ...prev, [area]: selected ? current.filter(k => k !== opt.key) : [...current, opt.key] };
                            });
                          }}
                            className={`w-full p-3 rounded border text-left text-sm transition-all ${
                              selected ? 'border-[#22C55E] bg-[#22C55E]/10 text-white' : 'border-white/15 bg-white/5 text-white/70'
                            }`}>
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="pt-6 space-y-3">
              <Btn onClick={() => setShowRecommendation(true)}>
                {Object.values(protectionSelections).flat().length > 0 ? 'Continue with protection' : 'Skip protection'}
              </Btn>
            </div>
          </div>
        )}

        {/* Recommendation screen */}
        {step === 4 && showRecommendation && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">
              Based on your {data.model_full || data.model}, here&apos;s what we recommend
            </h2>
            <div className="space-y-3 mt-4 flex-1 overflow-y-auto">
              {selectedAreas.map(area => {
                const cond = areaConditions[area];
                if (!cond) return null;
                let services = [...(cond.services || [])];
                if (area === 'seats' && cond.needsSeatType && seatType && SEAT_TYPE_SERVICES[seatType]) {
                  services.push(...(SEAT_TYPE_SERVICES[seatType][cond.key] || []));
                }
                // Add protection services
                const protOpts = protectionSelections[area] || [];
                for (const pk of protOpts) {
                  const po = PROTECTION_OPTIONS[area]?.find(p => p.key === pk);
                  if (po) services.push(po.label);
                }
                const areaInfo = AREAS.find(a => a.key === area);
                return (
                  <div key={area} className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <p className="text-white text-sm font-medium mb-1">{areaInfo?.label}</p>
                    <p className="text-white/40 text-xs mb-2">{cond.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {services.map(s => (
                        <span key={s} className="text-xs bg-[#007CB1]/20 text-[#007CB1] px-2 py-1 rounded">{s}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
              {getDisclaimers().length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  {getDisclaimers().map((d, i) => (
                    <p key={i} className="text-yellow-300/80 text-[11px] leading-relaxed">{i > 0 && <br />}{d}</p>
                  ))}
                </div>
              )}
              <p className="text-white/30 text-[10px] text-center pt-2">Final scope determined by detailer after inspection and photo documentation</p>
            </div>
            <div className="pt-6 space-y-3">
              <Btn onClick={() => {
                set('recommended_services', getRecommendedServices());
                setStep(5);
              }}>This looks right</Btn>
              <Btn onClick={() => { setShowRecommendation(false); setShowProtectionOffer(false); setAreasConfirmed(false); setAreaConditions({}); setProtectionSelections({}); setCurrentAreaIdx(0); setSeatType(null); }} secondary>
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
            <p className="text-white/30 text-[10px] text-center mt-3">Final scope determined by detailer after inspection and photo documentation</p>
            <div className="mt-auto pt-6">
              <Btn onClick={goNext}>Looks good — continue</Btn>
            </div>
          </div>
        )}

        {/* STEP 6: Contact Info */}
        {step === 6 && (
          <ContactStep
            onSubmit={(name, email, phone) => {
              set('name', name);
              set('email', email);
              set('phone', phone);
              setStep(7);
              // Submit with the values directly since state may not be updated yet
              handleSubmitWithContact(name, email, phone);
            }}
          />
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

// Separate component to prevent parent re-renders from stealing focus
function ContactStep({ onSubmit }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  return (
    <div className="flex-1 flex flex-col">
      <h2 className="text-xl font-light text-white mb-2">Last step — how do we reach you?</h2>
      <p className="text-white/40 text-xs mb-6">We&apos;ll send your quote to this email</p>
      <div className="space-y-4">
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="Full Name" autoComplete="name"
          className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-4 text-base placeholder-white/40 outline-none focus:border-[#007CB1] transition-colors" />
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="Email" autoComplete="email"
          className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-4 text-base placeholder-white/40 outline-none focus:border-[#007CB1] transition-colors" />
        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="Phone (optional)" autoComplete="tel"
          className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-4 text-base placeholder-white/40 outline-none focus:border-[#007CB1] transition-colors" />
      </div>
      <div className="mt-auto pt-6">
        <button onClick={() => onSubmit(name, email, phone)}
          disabled={!name.trim() || !email.trim()}
          className="w-full py-4 rounded-lg text-sm font-semibold uppercase tracking-wider bg-[#007CB1] text-white hover:bg-[#006a9e] min-h-[48px] disabled:opacity-40 transition-all">
          Submit Request
        </button>
      </div>
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
