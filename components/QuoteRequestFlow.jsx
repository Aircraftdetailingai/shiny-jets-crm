"use client";
import { useState, useEffect, useRef } from 'react';

// Default question IDs already handled by hardcoded steps
const DEFAULT_Q_IDS = ['q_tail', 'q_services', 'q_paint_goal', 'q_notes', 'q_photos'];

// Service picker options for Detailing path
const SERVICE_OPTIONS = [
  { key: 'ext_wash', label: 'Exterior Wash & Detail', group: 'exterior' },
  { key: 'polish', label: 'Paint Polish / One-Step', group: 'exterior' },
  { key: 'ceramic', label: 'Ceramic Coating', group: 'exterior' },
  { key: 'spray_ceramic', label: 'Spray Ceramic', group: 'exterior' },
  { key: 'wax', label: 'Wax', group: 'exterior' },
  { key: 'decon', label: 'Decon Wash', group: 'exterior' },
  { key: 'brightwork', label: 'Brightwork / Chrome Polish', group: 'exterior' },
  { key: 'interior', label: 'Interior Detail', group: 'interior' },
  { key: 'leather', label: 'Leather Clean & Condition', group: 'interior' },
  { key: 'carpet', label: 'Carpet Extraction', group: 'interior' },
  { key: 'windows', label: 'Windows', group: 'exterior' },
];

const PAINT_GOALS = [
  { key: 'max_gloss', label: 'Maximum gloss & protection' },
  { key: 'clean_protect', label: 'Clean and protected' },
  { key: 'just_clean', label: 'Just clean' },
];


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

  // Intake flow (from detailer's settings)
  const [intakeQuestions, setIntakeQuestions] = useState(null);
  const [intakeResponses, setIntakeResponses] = useState({});

  // Custom questions = intake questions minus the ones already hardcoded in the UI
  const customQuestions = (intakeQuestions || []).filter(q => !DEFAULT_Q_IDS.includes(q.id));
  const hasCustomQ = customQuestions.length > 0;
  // Steps: 1-4 hardcoded, 5=photos, then optionally intake, then contact, then submit
  // When no custom Qs: 5→6(contact)→7(submit)
  // When custom Qs:    5→6(intake)→7(contact)→8(submit)
  const INTAKE_STEP = hasCustomQ ? 6 : -1;       // -1 = doesn't exist
  const CONTACT_STEP = hasCustomQ ? 7 : 6;
  const SUBMIT_STEP = CONTACT_STEP + 1;
  const TOTAL_STEPS = CONTACT_STEP;              // progress dots count

  // Service selection
  const [quickSelect, setQuickSelect] = useState(null);
  const [selectedServices, setSelectedServices] = useState([]);
  const [paintGoal, setPaintGoal] = useState(null);
  const [freeTextNote, setFreeTextNote] = useState('');
  const [washAddons, setWashAddons] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);

  const [data, setData] = useState({
    manufacturer: '', model: '', model_full: '',
    tail_number: '', airport: '',
    service_text: '', company: '',
    name: '', email: '', phone: '',
  });

  const set = (field, value) => setData(prev => ({ ...prev, [field]: value }));

  const goNext = () => setStep(s => Math.min(s + 1, SUBMIT_STEP));
  const goBack = () => {
    if (step === CONTACT_STEP) {
      setStep(hasCustomQ ? INTAKE_STEP : 5);
      return;
    }
    if (hasCustomQ && step === INTAKE_STEP) { setStep(5); return; }
    if (step === 4) {
      if (paintGoal !== null && selectedServices.length > 0) { setPaintGoal(null); return; }
      if (quickSelect === 'maint_wash') { setQuickSelect(null); setWashAddons([]); setFreeTextNote(''); return; }
      if (quickSelect === 'detail' && selectedServices.length > 0) { setSelectedServices([]); setPaintGoal(null); return; }
      if (quickSelect === 'detail') { setQuickSelect(null); return; }
      if (quickSelect === 'quick_turn') { setQuickSelect(null); setFreeTextNote(''); return; }
      if (quickSelect) { setQuickSelect(null); return; }
      if (serviceMode) { setServiceMode(null); return; }
    }
    setStep(s => Math.max(s - 1, 1));
  };

  // Fetch detailer's intake flow
  useEffect(() => {
    if (!detailerId) return;
    fetch(`/api/intake-flow?detailer_id=${detailerId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.questions) setIntakeQuestions(d.questions); })
      .catch(() => {});
  }, [detailerId]);

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


  const handleSubmitWithContact = async (name, email, phone) => {
    setSubmitting(true);
    setError('');
    try {
      // Upload photos if any
      let photoUrls = [];
      if (photos.length > 0) {
        setUploading(true);
        const formData = new FormData();
        formData.append('detailer_id', detailerId);
        photos.forEach((p, i) => {
          formData.append(`photo_${i}`, p.file);
          formData.append(`caption_${i}`, p.caption || '');
        });
        formData.append('photo_count', String(photos.length));
        try {
          const uploadRes = await fetch('/api/lead-intake/upload-photos', { method: 'POST', body: formData });
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            photoUrls = uploadData.urls || [];
          }
        } catch {}
        setUploading(false);
      }

      // Build submission data
      const serviceType = quickSelect === 'quick_turn' ? 'Quick Turn' : quickSelect === 'maint_wash' ? 'Maintenance Wash' : 'Detailing';
      const serviceLabels = selectedServices.map(k => SERVICE_OPTIONS.find(s => s.key === k)?.label).filter(Boolean);
      const paintGoalLabel = paintGoal ? PAINT_GOALS.find(p => p.key === paintGoal)?.label : '';
      const areaNotes = [
        serviceLabels.length > 0 ? `Services: ${serviceLabels.join(', ')}` : '',
        paintGoalLabel ? `Paint goal: ${paintGoalLabel}` : '',
        freeTextNote ? `Note: ${freeTextNote}` : '',
      ].filter(Boolean).join('\n');

      const payload = {
        detailer_id: detailerId,
        name, email, phone,
        company: data.company || null,
        aircraft_model: data.model_full || `${data.manufacturer} ${data.model}`,
        tail_number: data.tail_number,
        airport: data.airport,
        services_requested: data.service_text || serviceType,
        notes: areaNotes || '',
        photo_urls: photoUrls,
        intake_responses: Object.keys(intakeResponses).length > 0 ? intakeResponses : null,
        source: embedded ? 'embed_widget' : 'quote_request_page',
      };
      const res = await fetch('/api/lead-intake/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        console.error('Quote request submission failed:', res.status, d);
        throw new Error(d.error || 'Failed to submit');
      }
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
      setStep(CONTACT_STEP);
    } finally {
      setSubmitting(false);
      setUploading(false);
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

        {/* STEP 2: Tail Number with FAA Lookup */}
        {step === 2 && (
          <TailNumberStep
            value={data.tail_number}
            onChange={v => set('tail_number', v)}
            onAircraftFound={(mfr, mdl) => { set('manufacturer', mfr); set('model', mdl); set('model_full', `${mfr} ${mdl}`); }}
            onNext={goNext}
          />
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

        {/* Quick Select */}
        {step === 4 && serviceMode === 'options' && !quickSelect && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-6">What brings you in today?</h2>
            <div className="space-y-4">
              <button onClick={() => { setQuickSelect('quick_turn'); }}
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
                <p className="text-white/40 text-xs mt-1">Choose specific services</p>
              </button>
            </div>
          </div>
        )}

        {/* Quick Turn — optional note */}
        {step === 4 && quickSelect === 'quick_turn' && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">Quick Turn</h2>
            <div className="bg-white/5 border border-white/10 rounded-lg p-3 mb-4">
              <p className="text-white/50 text-xs">Includes: Exterior rinse, interior vacuum, window wipe, trash removal</p>
            </div>
            <p className="text-white/40 text-xs mb-3">Anything we should know?</p>
            <textarea value={freeTextNote} onChange={e => setFreeTextNote(e.target.value)}
              placeholder="Optional — special instructions, access details, timing..."
              rows={3}
              className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-3 text-base placeholder-white/30 outline-none focus:border-[#007CB1] resize-none" />
            <div className="mt-auto pt-6">
              <Btn onClick={() => { set('service_text', 'Quick Turn'); setStep(5); }}>Next</Btn>
            </div>
          </div>
        )}

        {/* Maintenance Wash — optional note */}
        {step === 4 && quickSelect === 'maint_wash' && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">Maintenance Wash</h2>
            <div className="bg-white/5 border border-white/10 rounded-lg p-3 mb-4">
              <p className="text-white/50 text-xs">Includes: Exterior wash and interior vacuum</p>
            </div>
            <p className="text-white/40 text-xs mb-3">Anything we should know?</p>
            <textarea value={freeTextNote} onChange={e => setFreeTextNote(e.target.value)}
              placeholder="Optional — special instructions, access details, timing..."
              rows={3}
              className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-3 text-base placeholder-white/30 outline-none focus:border-[#007CB1] resize-none" />
            <div className="mt-auto pt-6">
              <Btn onClick={() => { set('service_text', 'Maintenance Wash'); setStep(5); }}>Next</Btn>
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

        {/* Detailing — service picker grid */}
        {step === 4 && quickSelect === 'detail' && paintGoal === null && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">What services do you need?</h2>
            <p className="text-white/40 text-xs mb-5">Select all that apply</p>
            <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2 content-start">
              {SERVICE_OPTIONS.map(svc => {
                const sel = selectedServices.includes(svc.key);
                return (
                  <button key={svc.key} onClick={() => setSelectedServices(prev => sel ? prev.filter(k => k !== svc.key) : [...prev, svc.key])}
                    className={`p-3 rounded-lg border text-left text-xs transition-all ${
                      sel ? 'border-[#007CB1] bg-[#007CB1]/15 text-white' : 'border-white/15 bg-white/5 text-white/60 hover:border-white/30'
                    }`}>
                    {svc.label}
                  </button>
                );
              })}
            </div>
            <div className="pt-5">
              <Btn onClick={() => {
                // If any exterior/paint service selected, ask paint goal
                const hasExterior = selectedServices.some(k => ['ext_wash', 'polish', 'ceramic', 'spray_ceramic', 'wax', 'decon'].includes(k));
                if (hasExterior) {
                  // Show paint goal screen (stays on step 4 with paintGoal state)
                  setPaintGoal('pending');
                } else {
                  const labels = selectedServices.map(k => SERVICE_OPTIONS.find(s => s.key === k)?.label).filter(Boolean);
                  set('service_text', labels.join(', '));
                  setStep(5);
                }
              }} disabled={selectedServices.length === 0}>
                Next ({selectedServices.length} selected)
              </Btn>
            </div>
          </div>
        )}

        {/* Detailing — paint goal (only if exterior services selected) */}
        {step === 4 && quickSelect === 'detail' && selectedServices.length > 0 && paintGoal === 'pending' && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">What&apos;s your goal for the paint?</h2>
            <p className="text-white/40 text-xs mb-6">This helps us recommend the right approach</p>
            <div className="space-y-3">
              {PAINT_GOALS.map(goal => (
                <button key={goal.key} onClick={() => {
                  setPaintGoal(goal.key);
                  const labels = selectedServices.map(k => SERVICE_OPTIONS.find(s => s.key === k)?.label).filter(Boolean);
                  set('service_text', [...labels, `Paint goal: ${goal.label}`].join(', '));
                  setStep(5);
                }}
                  className="w-full p-5 rounded-lg border border-white/15 bg-white/5 text-left hover:border-[#007CB1] transition-all active:bg-[#007CB1]/10">
                  <p className="text-white font-medium text-sm">{goal.label}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 5: Photo Upload */}
        {step === 5 && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">Would you like to add photos?</h2>
            <p className="text-white/40 text-xs mb-6">Photos help us give you a more accurate quote</p>

            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                {photos.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p.preview} alt="" className="w-full h-24 object-cover rounded-lg border border-white/10" />
                    <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">x</button>
                    <input type="text" value={p.caption} placeholder="Caption..."
                      onChange={e => setPhotos(prev => prev.map((ph, j) => j === i ? { ...ph, caption: e.target.value } : ph))}
                      className="w-full mt-1 bg-white/5 border border-white/10 text-white text-[10px] px-2 py-1 rounded outline-none placeholder-white/30" />
                  </div>
                ))}
              </div>
            )}

            <label className="w-full p-8 rounded-lg border-2 border-dashed border-white/20 text-center cursor-pointer hover:border-[#007CB1]/50 transition-colors mb-4">
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files || []);
                  const newPhotos = files.map(f => ({ file: f, preview: URL.createObjectURL(f), caption: '' }));
                  setPhotos(prev => [...prev, ...newPhotos].slice(0, 10));
                  e.target.value = '';
                }} />
              <p className="text-white/60 text-sm">{photos.length > 0 ? 'Add more photos' : 'Tap to upload photos'}</p>
              <p className="text-white/30 text-[10px] mt-1">Up to 10 photos</p>
            </label>

            {photos.length > 0 && (
              <p className="text-white/20 text-[10px] leading-relaxed mt-4">
                Photos are used for documentation and anonymous surface condition research only. Never shared publicly or linked to your identity.
              </p>
            )}

            <div className="mt-auto pt-4 space-y-3">
              {photos.length > 0 && (
                <Btn onClick={goNext}>Continue with {photos.length} photo{photos.length !== 1 ? 's' : ''}</Btn>
              )}
              <Btn onClick={goNext} secondary>{photos.length > 0 ? 'Skip photos' : 'Skip for now'}</Btn>
            </div>
          </div>
        )}

        {/* STEP 6: Custom Intake Questions (only if detailer added custom questions) */}
        {step === INTAKE_STEP && hasCustomQ && (
          <IntakeQuestionsStep
            questions={customQuestions}
            responses={intakeResponses}
            onChange={setIntakeResponses}
            onNext={goNext}
          />
        )}

        {/* Contact Info */}
        {step === CONTACT_STEP && (
          <ContactStep
            onSubmit={(name, email, phone, company) => {
              set('name', name);
              set('email', email);
              set('phone', phone);
              if (company) set('company', company);
              setStep(SUBMIT_STEP);
              handleSubmitWithContact(name, email, phone);
            }}
          />
        )}

        {/* Submitting */}
        {step === SUBMIT_STEP && !submitted && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-2 border-[#007CB1] border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-white/60 text-sm">{uploading ? 'Uploading photos...' : 'Submitting your request...'}</p>
          </div>
        )}
      </div>
    </div>
  );
}


// Renders custom intake questions from the detailer's intake flow builder
function IntakeQuestionsStep({ questions, responses, onChange, onNext }) {
  const update = (id, value) => onChange(prev => ({ ...prev, [id]: value }));

  // Check conditional visibility
  const visible = questions.filter(q => {
    if (!q.showIf) return true;
    const dep = responses[q.showIf.questionId];
    if (q.showIf.hasAny && Array.isArray(dep)) return q.showIf.hasAny.some(v => dep.includes(v));
    if (q.showIf.equals) return dep === q.showIf.equals;
    return !!dep;
  });

  const allRequiredAnswered = visible.filter(q => q.required).every(q => {
    const v = responses[q.id];
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== '';
  });

  const inputClass = 'w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-4 text-base placeholder-white/40 outline-none focus:border-[#007CB1] transition-colors';

  return (
    <div className="flex-1 flex flex-col">
      <h2 className="text-xl font-light text-white mb-2">A few more questions</h2>
      <p className="text-white/40 text-xs mb-6">Help us prepare the best quote for you</p>

      <div className="flex-1 overflow-y-auto space-y-5">
        {visible.map(q => (
          <div key={q.id}>
            <label className="text-white/80 text-sm mb-2 block">
              {q.text}{q.required && <span className="text-red-400 ml-1">*</span>}
            </label>

            {q.type === 'text' && (
              <input type="text" value={responses[q.id] || ''} onChange={e => update(q.id, e.target.value)}
                placeholder={q.placeholder || ''} style={{ fontSize: '16px' }} className={inputClass} />
            )}

            {q.type === 'long_text' && (
              <textarea value={responses[q.id] || ''} onChange={e => update(q.id, e.target.value)}
                placeholder={q.placeholder || ''} rows={3}
                className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-3 text-base placeholder-white/40 outline-none focus:border-[#007CB1] resize-none" />
            )}

            {q.type === 'number' && (
              <input type="number" value={responses[q.id] || ''} onChange={e => update(q.id, e.target.value)}
                placeholder={q.placeholder || ''} style={{ fontSize: '16px' }} className={inputClass} />
            )}

            {q.type === 'date' && (
              <input type="date" value={responses[q.id] || ''} onChange={e => update(q.id, e.target.value)}
                style={{ fontSize: '16px' }} className={inputClass} />
            )}

            {q.type === 'yes_no' && (
              <div className="flex gap-3">
                {['Yes', 'No'].map(opt => (
                  <button key={opt} onClick={() => update(q.id, opt)}
                    className={`flex-1 py-3 rounded-lg border text-sm transition-all ${
                      responses[q.id] === opt ? 'border-[#007CB1] bg-[#007CB1]/15 text-white' : 'border-white/15 bg-white/5 text-white/60 hover:border-white/30'
                    }`}>{opt}</button>
                ))}
              </div>
            )}

            {q.type === 'single_select' && (
              <div className="space-y-2">
                {(q.options || []).map(opt => (
                  <button key={opt} onClick={() => update(q.id, opt)}
                    className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all ${
                      responses[q.id] === opt ? 'border-[#007CB1] bg-[#007CB1]/15 text-white' : 'border-white/15 bg-white/5 text-white/60 hover:border-white/30'
                    }`}>{opt}</button>
                ))}
              </div>
            )}

            {q.type === 'multi_select' && (
              <div className="grid grid-cols-2 gap-2">
                {(q.options || []).map(opt => {
                  const sel = (responses[q.id] || []).includes(opt);
                  return (
                    <button key={opt} onClick={() => {
                      const cur = responses[q.id] || [];
                      update(q.id, sel ? cur.filter(v => v !== opt) : [...cur, opt]);
                    }}
                      className={`p-3 rounded-lg border text-left text-xs transition-all ${
                        sel ? 'border-[#007CB1] bg-[#007CB1]/15 text-white' : 'border-white/15 bg-white/5 text-white/60 hover:border-white/30'
                      }`}>{opt}</button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-auto pt-6">
        <button onClick={onNext} disabled={!allRequiredAnswered}
          className="w-full py-4 rounded-lg text-sm font-semibold uppercase tracking-wider bg-[#007CB1] text-white hover:bg-[#006a9e] min-h-[48px] disabled:opacity-40 transition-all">
          Next
        </button>
      </div>
    </div>
  );
}

// Separate component to prevent parent re-renders from stealing focus
// Uncontrolled inputs — bypasses React re-render focus issues on iOS Safari
function ContactStep({ onSubmit }) {
  const nameRef = useRef(null);
  const companyRef = useRef(null);
  const emailRef = useRef(null);
  const phoneRef = useRef(null);
  const termsRef = useRef(null);
  const [canSubmit, setCanSubmit] = useState(false);

  const checkValid = () => {
    const n = nameRef.current?.value?.trim();
    const e = emailRef.current?.value?.trim();
    const t = termsRef.current?.checked;
    setCanSubmit(!!(n && e && t));
  };

  const handleSubmit = () => {
    const name = nameRef.current?.value?.trim() || '';
    const company = companyRef.current?.value?.trim() || '';
    const email = emailRef.current?.value?.trim() || '';
    const phone = phoneRef.current?.value?.trim() || '';
    if (name && email && termsRef.current?.checked) onSubmit(name, email, phone, company);
  };

  const inputClass = 'w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-4 placeholder-white/40 outline-none focus:border-[#007CB1] transition-colors';

  return (
    <div className="flex-1 flex flex-col">
      <h2 className="text-xl font-light text-white mb-2">Last step — how do we reach you?</h2>
      <p className="text-white/40 text-xs mb-6">We&apos;ll send your quote to this email</p>
      <div className="space-y-4">
        <input ref={nameRef} type="text" defaultValue="" autoComplete="name" placeholder="Full Name"
          onInput={checkValid} onBlur={checkValid}
          style={{ fontSize: '16px' }} className={inputClass} />
        <input ref={companyRef} type="text" defaultValue="" autoComplete="organization" placeholder="Company Name (optional)"
          style={{ fontSize: '16px' }} className={inputClass} />
        <input ref={emailRef} type="email" defaultValue="" autoComplete="email" placeholder="Email Address"
          onInput={checkValid} onBlur={checkValid}
          style={{ fontSize: '16px' }} className={inputClass} />
        <input ref={phoneRef} type="tel" defaultValue="" autoComplete="tel" placeholder="Phone Number (optional)"
          style={{ fontSize: '16px' }} className={inputClass} />
      </div>

      <label className="flex items-start gap-3 mt-5 cursor-pointer">
        <input ref={termsRef} type="checkbox" defaultChecked={false}
          onChange={checkValid}
          className="mt-0.5 w-4 h-4 rounded accent-[#007CB1] flex-shrink-0" />
        <span className="text-white/50 text-xs">
          I have read and agree to the{' '}
          <a href="/legal/quote-terms" target="_blank" rel="noreferrer"
            className="text-[#007CB1] underline" onClick={e => e.stopPropagation()}>
            Terms of Service
          </a>
        </span>
      </label>

      <div className="mt-4">
        <button onClick={handleSubmit} disabled={!canSubmit}
          className="w-full py-4 rounded-lg text-sm font-semibold uppercase tracking-wider bg-[#007CB1] text-white hover:bg-[#006a9e] min-h-[48px] disabled:opacity-40 transition-all">
          Submit Request
        </button>
      </div>
    </div>
  );
}

// Tail number step with FAA registry autofill
function TailNumberStep({ value, onChange, onAircraftFound, onNext }) {
  const [tail, setTail] = useState(value || '');
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const timerRef = useRef(null);

  const handleChange = (v) => {
    const upper = v.toUpperCase();
    setTail(upper);
    onChange(upper);
    setFound(null);
    setLookupError('');
    clearTimeout(timerRef.current);
    const nNum = upper.replace(/^N/, '');
    if (nNum.length >= 2) {
      timerRef.current = setTimeout(() => lookupTail(upper), 800);
    }
  };

  const lookupTail = async (t) => {
    setLooking(true);
    setFound(null);
    setLookupError('');
    try {
      const res = await fetch(`/api/aircraft/registry/${encodeURIComponent(t)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.found) {
          const badModel = !data.model || data.model === 'Serial Number' || data.model.length < 2;
          if (data.manufacturer && !badModel) {
            setFound(data);
          }
        } else if (data.filtered) {
          setLookupError(data.message || 'This aircraft type is not supported.');
        } else {
          setLookupError(data.message || 'Aircraft not found. Please check your tail number and try again.');
        }
      }
    } catch {
      // Network error: silently continue
    }
    setLooking(false);
  };

  const applyFound = () => {
    if (found?.manufacturer && found?.model) onAircraftFound(found.manufacturer, found.model);
    onNext();
  };

  return (
    <div className="flex-1 flex flex-col">
      <h2 className="text-xl font-light text-white mb-2">What&apos;s your tail number?</h2>
      <p className="text-white/40 text-xs mb-6">Optional — we&apos;ll look up your aircraft automatically</p>
      <input type="text" value={tail} onChange={e => handleChange(e.target.value)}
        placeholder="N12345" autoCapitalize="characters" autoFocus
        className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-4 text-base placeholder-white/40 outline-none focus:border-[#007CB1] transition-colors" />

      <p className="text-white/20 text-[10px] leading-relaxed mt-3">
        Your tail number is used only to look up aircraft specifications for your quote. We do not track flight activity, share location data, or store flight information. All data is used exclusively for detailing service purposes.
      </p>

      {looking && (
        <div className="flex items-center gap-2 mt-3">
          <div className="w-4 h-4 border-2 border-[#007CB1] border-t-transparent rounded-full animate-spin" />
          <p className="text-white/40 text-xs">Looking up registration...</p>
        </div>
      )}

      {lookupError && (
        <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-300 text-xs">{lookupError}</p>
        </div>
      )}

      {found && (
        <div className="mt-3 bg-[#007CB1]/10 border border-[#007CB1]/30 rounded-lg p-4">
          <p className="text-white text-sm font-medium">{found.manufacturer} {found.model}</p>
          {found.year && <p className="text-white/50 text-xs mt-0.5">{found.year}{found.registrant_name ? ` \u2014 ${found.registrant_name}` : ''}</p>}
          <button onClick={applyFound}
            className="mt-3 w-full py-3 rounded-lg bg-[#007CB1] text-white text-sm font-semibold hover:bg-[#006a9e] transition-colors">
            Yes, this is my aircraft
          </button>
        </div>
      )}

      <div className="mt-auto pt-6 space-y-3">
        {!found && <button onClick={onNext}
          className="w-full py-4 rounded-lg text-sm font-semibold uppercase tracking-wider bg-[#007CB1] text-white hover:bg-[#006a9e] min-h-[48px] transition-all">
          Next
        </button>}
        {!tail && <button onClick={onNext}
          className="w-full py-4 rounded-lg text-sm font-semibold uppercase tracking-wider bg-white/10 text-white border border-white/20 hover:bg-white/15 min-h-[48px] transition-all">
          Skip
        </button>}
      </div>
    </div>
  );
}

