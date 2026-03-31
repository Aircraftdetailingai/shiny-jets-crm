"use client";
import { useState, useEffect } from 'react';

const TOTAL_STEPS = 7;

const CONDITION_OPTIONS = [
  { value: 'never', label: 'Never detailed' },
  { value: '6_months', label: 'Within 6 months' },
  { value: '1_year', label: 'About a year ago' },
  { value: '2_plus', label: '2+ years ago' },
];

const CONCERNS = [
  'Oxidation', 'Scratches', 'Water spots', 'Interior stains',
  'Brightwork tarnish', 'Exhaust soot', 'Bug/debris removal', 'Other',
];

export default function QuoteRequestFlow({ detailerId, detailerName, detailerLogo, embedded = false }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [serviceMode, setServiceMode] = useState(null);

  // Aircraft selection state
  const [manufacturers, setManufacturers] = useState([]);
  const [models, setModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const [data, setData] = useState({
    manufacturer: '', model: '', model_full: '',
    tail_number: '', airport: '',
    service_text: '', selected_packages: [], concerns: [],
    last_detailed: '', paint_condition: '',
    name: '', email: '', phone: '',
  });

  const set = (field, value) => setData(prev => ({ ...prev, [field]: value }));
  const goNext = () => setStep(s => Math.min(s + 1, TOTAL_STEPS));
  const goBack = () => { if (step === 4 && serviceMode) { setServiceMode(null); return; } setStep(s => Math.max(s - 1, 1)); };

  // Fetch manufacturers on mount
  useEffect(() => {
    fetch('/api/aircraft/manufacturers')
      .then(r => r.ok ? r.json() : { manufacturers: [] })
      .then(d => setManufacturers(d.manufacturers || []))
      .catch(() => {});
  }, []);

  // Fetch models when manufacturer changes
  useEffect(() => {
    if (!data.manufacturer) { setModels([]); return; }
    setLoadingModels(true);
    fetch(`/api/aircraft/models?manufacturer=${encodeURIComponent(data.manufacturer)}`)
      .then(r => r.ok ? r.json() : { models: [] })
      .then(d => setModels(d.models || []))
      .catch(() => {})
      .finally(() => setLoadingModels(false));
  }, [data.manufacturer]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
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
          services_requested: data.service_text || data.selected_packages.join(', '),
          notes: [
            data.last_detailed ? `Last detailed: ${data.last_detailed}` : '',
            data.paint_condition ? `Paint condition: ${data.paint_condition}` : '',
            data.concerns.length ? `Concerns: ${data.concerns.join(', ')}` : '',
          ].filter(Boolean).join('. '),
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
    <input type={type} value={value} onChange={e => onChange(e.target.value)}
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

            {/* Manufacturer selector */}
            <p className="text-white/50 text-xs uppercase tracking-wider mb-2">Manufacturer</p>
            {!data.manufacturer ? (
              <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-white/10 mb-4">
                {manufacturers.map(m => (
                  <button key={m} onClick={() => set('manufacturer', m)}
                    className="w-full text-left px-4 py-3.5 text-sm text-white/80 hover:bg-[#007CB1]/20 border-b border-white/5 last:border-0 active:bg-[#007CB1]/30 transition-colors">
                    {m}
                  </button>
                ))}
                {manufacturers.length === 0 && (
                  <p className="text-white/30 text-sm text-center py-8">Loading manufacturers...</p>
                )}
              </div>
            ) : (
              <button onClick={() => { set('manufacturer', ''); set('model', ''); set('model_full', ''); }}
                className="w-full flex items-center justify-between px-4 py-3.5 rounded-lg border border-[#007CB1] bg-[#007CB1]/10 text-white text-sm mb-4">
                <span>{data.manufacturer}</span>
                <span className="text-white/40 text-xs">Change</span>
              </button>
            )}

            {/* Model selector */}
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
                      <button key={m.id} onClick={() => {
                        set('model', m.model);
                        set('model_full', `${data.manufacturer} ${m.model}`);
                        setTimeout(goNext, 150);
                      }}
                        className={`w-full text-left px-4 py-3.5 text-sm border-b border-white/5 last:border-0 active:bg-[#007CB1]/30 transition-colors ${
                          data.model === m.model ? 'bg-[#007CB1]/20 text-white' : 'text-white/80 hover:bg-[#007CB1]/10'
                        }`}>
                        {m.model}
                        {m.category && <span className="text-white/30 text-xs ml-2">{m.category}</span>}
                      </button>
                    ))}
                    {models.length === 0 && (
                      <p className="text-white/30 text-sm text-center py-6">No models found</p>
                    )}
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

        {/* STEP 4: Service Selection */}
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
                <p className="text-white/40 text-xs mt-1">Help me choose the right service</p>
              </button>
            </div>
          </div>
        )}

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

        {step === 4 && serviceMode === 'options' && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">Tell us about your aircraft</h2>
            {!data.last_detailed && (
              <div>
                <p className="text-white/60 text-sm mb-4">When was your aircraft last detailed?</p>
                <div className="space-y-2">
                  {CONDITION_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => set('last_detailed', opt.label)}
                      className="w-full p-4 rounded-lg border border-white/15 bg-white/5 text-left text-white/80 text-sm hover:border-[#007CB1] transition-all">
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {data.last_detailed && !data.paint_condition && (
              <div>
                <p className="text-white/60 text-sm mb-4">How would you describe the paint condition?</p>
                <div className="grid grid-cols-2 gap-2">
                  {['Excellent', 'Good', 'Fair', 'Poor'].map(c => (
                    <button key={c} onClick={() => set('paint_condition', c)}
                      className="p-4 rounded-lg border border-white/15 bg-white/5 text-white/80 text-sm hover:border-[#007CB1] transition-all">{c}</button>
                  ))}
                </div>
              </div>
            )}
            {data.last_detailed && data.paint_condition && (
              <div>
                <p className="text-white/60 text-sm mb-4">Any specific concerns? (select all that apply)</p>
                <div className="grid grid-cols-2 gap-2 mb-6">
                  {CONCERNS.map(c => (
                    <button key={c} onClick={() => set('concerns', data.concerns.includes(c) ? data.concerns.filter(x => x !== c) : [...data.concerns, c])}
                      className={`p-3 rounded-lg border text-sm text-left transition-all ${
                        data.concerns.includes(c) ? 'border-[#007CB1] bg-[#007CB1]/20 text-white' : 'border-white/15 bg-white/5 text-white/60 hover:border-white/30'
                      }`}>{c}</button>
                  ))}
                </div>
                <Btn onClick={() => setStep(5)}>Next</Btn>
              </div>
            )}
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
              <SummaryRow label="Service" value={
                data.service_text || [
                  data.last_detailed ? `Last detailed: ${data.last_detailed}` : '',
                  data.paint_condition ? `Paint: ${data.paint_condition}` : '',
                  data.concerns.length ? data.concerns.join(', ') : '',
                ].filter(Boolean).join(' \u00B7 ') || 'To be discussed'
              } />
            </div>
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

function SummaryRow({ label, value }) {
  return (
    <div>
      <p className="text-white/40 text-[10px] uppercase tracking-wider">{label}</p>
      <p className="text-white text-sm mt-0.5">{value}</p>
    </div>
  );
}
