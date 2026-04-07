"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';

export default function FlowRequestPage() {
  const { slug } = useParams();

  // Detailer + flow state
  const [detailer, setDetailer] = useState(null);
  const [flowNodes, setFlowNodes] = useState([]);
  const [flowEdges, setFlowEdges] = useState([]);
  const [services, setServices] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  // Navigation
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const [history, setHistory] = useState([]);          // stack of previous nodeIds
  const [answers, setAnswers] = useState({});           // nodeId → answer
  const [phase, setPhase] = useState('manufacturer');   // manufacturer | model | tailAirport | flow | contact | submitting | done
  const [error, setError] = useState('');

  // Aircraft info — steps 1-3
  const [manufacturers, setManufacturers] = useState([]);
  const [selectedMfr, setSelectedMfr] = useState('');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [tailNumber, setTailNumber] = useState('');
  const [airport, setAirport] = useState('');
  const [faaResult, setFaaResult] = useState(null);
  const [faaError, setFaaError] = useState('');
  const [faaLooking, setFaaLooking] = useState(false);
  const [aircraftDisplay, setAircraftDisplay] = useState('');
  const faaTimer = useRef(null);

  // Photos collected from photo_upload nodes
  const [photos, setPhotos] = useState([]);

  // Submit state
  const [submitting, setSubmitting] = useState(false);

  // ─── Load detailer + flow + services + manufacturers ───
  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const detRes = await fetch(`/api/detailers/resolve?slug=${encodeURIComponent(slug)}`);
        const detData = await detRes.json();
        if (!detRes.ok || !detData.detailer) { setPageError('Detailer not found'); return; }
        setDetailer(detData.detailer);
        const detailerId = detData.detailer.id;

        const [flowRes, svcRes, mfrRes] = await Promise.all([
          fetch(`/api/intake-flow?detailer_id=${detailerId}`),
          fetch(`/api/services?detailer_id=${detailerId}`),
          fetch('/api/aircraft/manufacturers'),
        ]);
        const flowData = flowRes.ok ? await flowRes.json() : {};
        const svcData = svcRes.ok ? await svcRes.json() : {};
        const mfrData = mfrRes.ok ? await mfrRes.json() : {};

        setServices(svcData.services || []);
        setManufacturers(mfrData.manufacturers || []);

        if (flowData.flow_nodes?.length > 0 && flowData.flow_edges?.length > 0) {
          setFlowNodes(flowData.flow_nodes);
          setFlowEdges(flowData.flow_edges);
        } else {
          setPageError('No intake flow configured');
        }
      } catch {
        setPageError('Failed to load');
      } finally {
        setPageLoading(false);
      }
    })();
  }, [slug]);

  // ─── Fetch models when manufacturer selected ───
  useEffect(() => {
    if (!selectedMfr) { setModels([]); return; }
    setLoadingModels(true);
    fetch(`/api/aircraft/models?manufacturer=${encodeURIComponent(selectedMfr)}`)
      .then(r => r.ok ? r.json() : { models: [] })
      .then(d => setModels(d.models || []))
      .catch(() => {})
      .finally(() => setLoadingModels(false));
  }, [selectedMfr]);

  // ─── Find the first real flow node (after start + aircraftInfo) ───
  const getFirstFlowNode = useCallback(() => {
    const startNode = flowNodes.find(n => n.type === 'start');
    if (!startNode) return null;
    // Walk edges from start, skip aircraftInfo
    let current = startNode.id;
    for (let i = 0; i < 5; i++) {
      const edge = flowEdges.find(e => e.source === current);
      if (!edge) return null;
      const next = flowNodes.find(n => n.id === edge.target);
      if (!next) return null;
      if (next.type === 'aircraftInfo') { current = next.id; continue; }
      return next.id;
    }
    return null;
  }, [flowNodes, flowEdges]);

  // ─── Navigate to next node based on current answer ───
  const getNextNodeId = useCallback((fromId, answer) => {
    const node = flowNodes.find(n => n.id === fromId);
    if (!node) return null;

    // Branching question (single_select with allowBranching)
    if (node.type === 'question' && node.data?.allowBranching && node.data?.answerType === 'single_select') {
      const optIdx = (node.data.options || []).indexOf(answer);
      if (optIdx >= 0) {
        const branchEdge = flowEdges.find(e => e.source === fromId && e.sourceHandle === `opt-${optIdx}`);
        if (branchEdge) return branchEdge.target;
      }
    }

    // Yes/No question
    if (node.type === 'question' && node.data?.answerType === 'yes_no') {
      const handle = answer === 'Yes' ? 'yes' : 'no';
      const edge = flowEdges.find(e => e.source === fromId && e.sourceHandle === handle);
      if (edge) return edge.target;
    }

    // Condition node — evaluate
    if (node.type === 'condition') {
      const sourceAnswer = answers[node.data?.sourceNodeId] || '';
      const checkValue = (node.data?.value || '').toLowerCase();
      const match = Array.isArray(sourceAnswer)
        ? sourceAnswer.some(v => v.toLowerCase().includes(checkValue))
        : String(sourceAnswer).toLowerCase().includes(checkValue);
      const handle = match ? 'yes' : 'no';
      const edge = flowEdges.find(e => e.source === fromId && e.sourceHandle === handle);
      if (edge) return edge.target;
    }

    // Default: follow the single outgoing edge
    const edge = flowEdges.find(e => e.source === fromId && (!e.sourceHandle || e.sourceHandle === 'default'));
    // Fallback: any edge from this source
    const fallback = flowEdges.find(e => e.source === fromId);
    return edge?.target || fallback?.target || null;
  }, [flowNodes, flowEdges, answers]);

  // ─── Advance to next step ───
  const advance = useCallback((fromId, answer) => {
    let nextId = getNextNodeId(fromId, answer);
    if (!nextId) { setPhase('contact'); return; }

    // Auto-skip condition nodes
    const nextNode = flowNodes.find(n => n.id === nextId);
    if (nextNode?.type === 'condition') {
      // Evaluate condition immediately and skip
      const nextAfterCond = getNextNodeId(nextId, null);
      if (nextAfterCond) {
        const afterNode = flowNodes.find(n => n.id === nextAfterCond);
        if (afterNode?.type === 'end') { setPhase('contact'); return; }
        setHistory(h => [...h, fromId]);
        setCurrentNodeId(nextAfterCond);
        return;
      }
    }

    if (nextNode?.type === 'end') { setPhase('contact'); return; }

    setHistory(h => [...h, fromId]);
    setCurrentNodeId(nextId);
  }, [getNextNodeId, flowNodes]);

  // ─── Go back ───
  const goBack = () => {
    if (phase === 'contact') { setPhase('flow'); return; }
    if (phase === 'flow' && history.length > 0) {
      const prev = history[history.length - 1];
      setHistory(h => h.slice(0, -1));
      setCurrentNodeId(prev);
      return;
    }
    if (phase === 'flow') { setPhase('tailAirport'); return; }
    if (phase === 'tailAirport') { setPhase('model'); return; }
    if (phase === 'model') { setSelectedMfr(''); setPhase('manufacturer'); return; }
  };

  // Start the flow after aircraft steps
  const startFlow = () => {
    const firstId = getFirstFlowNode();
    if (firstId) {
      setCurrentNodeId(firstId);
      setPhase('flow');
    } else {
      setPhase('contact');
    }
  };

  // ─── FAA lookup (silent — no UI feedback to customer) ───
  const handleTailChange = (v) => {
    const upper = v.toUpperCase();
    setTailNumber(upper);
    clearTimeout(faaTimer.current);
    const nNum = upper.replace(/^N/, '');
    if (nNum.length >= 2) {
      faaTimer.current = setTimeout(() => lookupTail(upper), 800);
    }
  };

  const lookupTail = async (t) => {
    try {
      const res = await fetch(`/api/aircraft/registry/${encodeURIComponent(t)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.found) {
          const badModel = !data.model || data.model === 'Serial Number' || data.model.length < 2;
          if (data.manufacturer && !badModel) {
            // Store silently for detailer — never shown to customer
            setFaaResult(data);
            if (!selectedMfr) setSelectedMfr(data.manufacturer);
            if (!selectedModel) setSelectedModel(data.model);
            setAircraftDisplay(`${data.manufacturer} ${data.model}`);
          }
        }
      }
    } catch {}
  };

  // ─── Submit ───
  const handleSubmit = async (firstName, lastName, email, phone, company) => {
    setSubmitting(true);
    setPhase('submitting');
    setError('');
    try {
      // Upload photos
      let photoUrls = [];
      if (photos.length > 0) {
        const formData = new FormData();
        formData.append('detailer_id', detailer.id);
        photos.forEach((p, i) => { formData.append(`photo_${i}`, p.file); formData.append(`caption_${i}`, ''); });
        formData.append('photo_count', String(photos.length));
        try {
          const uploadRes = await fetch('/api/lead-intake/upload-photos', { method: 'POST', body: formData });
          if (uploadRes.ok) photoUrls = (await uploadRes.json()).urls || [];
        } catch {}
      }

      // Build readable answers
      const serviceAnswers = [];
      const noteAnswers = [];
      for (const [nodeId, value] of Object.entries(answers)) {
        const node = flowNodes.find(n => n.id === nodeId);
        if (!node) continue;
        if (node.type === 'serviceSelect') {
          serviceAnswers.push(Array.isArray(value) ? value.join(', ') : value);
        } else if (node.type === 'question' && node.data?.answerType !== 'photo_upload') {
          noteAnswers.push(`${node.data?.label || 'Question'}: ${Array.isArray(value) ? value.join(', ') : value}`);
        }
      }

      const res = await fetch('/api/lead-intake/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detailer_id: detailer.id,
          name: `${firstName} ${lastName}`.trim(),
          email, phone,
          company: company || null,
          aircraft_model: aircraftDisplay || null,
          tail_number: tailNumber || null,
          airport: airport || null,
          services_requested: serviceAnswers.join(', ') || null,
          notes: noteAnswers.join('\n') || null,
          photo_urls: photoUrls.length > 0 ? photoUrls : null,
          intake_responses: answers,
          source: 'flow_request_page',
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to submit');
      setPhase('done');
    } catch (err) {
      setError(err.message);
      setPhase('contact');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── UI helpers ───
  const isEnterprise = detailer?.plan === 'enterprise';
  const currentNode = flowNodes.find(n => n.id === currentNodeId);

  const Header = () => (
    <div className="px-4 pt-4">
      <div className="flex items-center justify-between">
        {(phase !== 'manufacturer' && phase !== 'done' && phase !== 'submitting') ? (
          <button onClick={goBack} className="w-10 h-10 flex items-center justify-center text-white/60 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </button>
        ) : <div className="w-10" />}
        <div className="text-center">
          {detailer?.logo_url ? (
            <img src={detailer.logo_url} alt={detailer.company} className="h-8 object-contain mx-auto" />
          ) : (
            <span className="text-white/80 text-sm font-medium">{detailer?.company || 'Get a Quote'}</span>
          )}
        </div>
        <div className="w-10" />
      </div>
      {!isEnterprise && <p className="text-center text-white/20 text-[9px] mt-1">Powered by Shiny Jets CRM</p>}
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

  const inputCls = 'w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-4 text-base placeholder-white/40 outline-none focus:border-[#007CB1] transition-colors';

  // ─── Loading / Error ───
  if (pageLoading) return <div className="min-h-screen bg-[#0D1B2A] flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#007CB1] border-t-transparent rounded-full animate-spin" /></div>;
  if (pageError) return <div className="min-h-screen bg-[#0D1B2A] flex items-center justify-center text-white/60 text-sm">{pageError}</div>;

  // ─── Done ───
  if (phase === 'done') return (
    <div className="min-h-screen bg-[#0D1B2A] flex flex-col">
      <Header />
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
        </div>
        <h2 className="text-2xl font-light text-white mb-3">Request Submitted!</h2>
        <p className="text-white/60 text-sm mb-8">We&apos;ll have your quote ready shortly.</p>
      </div>
    </div>
  );

  // ─── Submitting ───
  if (phase === 'submitting') return (
    <div className="min-h-screen bg-[#0D1B2A] flex flex-col">
      <Header />
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-2 border-[#007CB1] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-white/60 text-sm">Submitting your request...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0D1B2A] flex flex-col">
      <Header />
      <div className="flex-1 flex flex-col px-6 pb-8 pt-4">
        {error && <div className="bg-red-500/20 border border-red-500/40 text-red-300 px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>}

        {/* ━━━ STEP 1: Manufacturer ━━━ */}
        {phase === 'manufacturer' && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-6">What aircraft do you fly?</h2>
            <p className="text-white/50 text-xs uppercase tracking-wider mb-2">Manufacturer</p>
            <div className="flex-1 max-h-[65vh] overflow-y-auto rounded-lg border border-white/10">
              {manufacturers.length > 0 ? manufacturers.map(m => (
                <button key={m} onClick={() => { setSelectedMfr(m); setPhase('model'); }}
                  className="w-full text-left px-4 py-3.5 text-sm text-white/80 hover:bg-[#007CB1]/20 border-b border-white/5 last:border-0 active:bg-[#007CB1]/30 transition-colors">
                  {m}
                </button>
              )) : (
                <p className="text-white/30 text-sm text-center py-8">Loading manufacturers...</p>
              )}
            </div>
          </div>
        )}

        {/* ━━━ STEP 2: Model ━━━ */}
        {phase === 'model' && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-6">What aircraft do you fly?</h2>
            <p className="text-white/50 text-xs uppercase tracking-wider mb-2">Manufacturer</p>
            <button onClick={() => { setSelectedMfr(''); setSelectedModel(''); setPhase('manufacturer'); }}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-lg border border-[#007CB1] bg-[#007CB1]/10 text-white text-sm mb-4">
              <span>{selectedMfr}</span>
              <span className="text-white/40 text-xs">Change</span>
            </button>
            <p className="text-white/50 text-xs uppercase tracking-wider mb-2">Model</p>
            {loadingModels ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-[#007CB1] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="flex-1 max-h-[45vh] overflow-y-auto rounded-lg border border-white/10">
                {models.map(m => (
                  <button key={m.id} onClick={() => {
                    setSelectedModel(m.model);
                    setAircraftDisplay(`${selectedMfr} ${m.model}`);
                    setPhase('tailAirport');
                  }}
                    className={`w-full text-left px-4 py-3.5 text-sm border-b border-white/5 last:border-0 active:bg-[#007CB1]/30 transition-colors ${
                      selectedModel === m.model ? 'bg-[#007CB1]/20 text-white' : 'text-white/80 hover:bg-[#007CB1]/10'
                    }`}>
                    {m.model}
                    {m.category && <span className="text-white/30 text-xs ml-2">{m.category}</span>}
                  </button>
                ))}
                {models.length === 0 && <p className="text-white/30 text-sm text-center py-6">No models found</p>}
              </div>
            )}
          </div>
        )}

        {/* ━━━ STEP 3: Tail Number + Airport ━━━ */}
        {phase === 'tailAirport' && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-light text-white mb-2">Tail number &amp; home base</h2>
            <p className="text-white/40 text-xs mb-5">Optional — helps us prepare your quote</p>

            <div className="space-y-4">
              <div>
                <label className="text-white/50 text-xs uppercase tracking-wider mb-1.5 block">Tail Number</label>
                <input type="text" value={tailNumber} onChange={e => handleTailChange(e.target.value)}
                  placeholder="N12345" autoCapitalize="characters" style={{ fontSize: '16px' }} className={inputCls} />
              </div>
              <div>
                <label className="text-white/50 text-xs uppercase tracking-wider mb-1.5 block">Airport / Home Base</label>
                <input type="text" value={airport} onChange={e => setAirport(e.target.value.toUpperCase())}
                  placeholder="KTEB or Teterboro" autoCapitalize="characters" style={{ fontSize: '16px' }} className={inputCls} />
              </div>
            </div>

            <div className="mt-auto pt-6">
              <Btn onClick={startFlow}>Next</Btn>
            </div>
          </div>
        )}

        {/* ━━━ FLOW NODES ━━━ */}
        {phase === 'flow' && currentNode && (
          <>
            {/* SERVICE SELECT NODE */}
            {currentNode.type === 'serviceSelect' && (
              <ServiceSelectStep
                node={currentNode}
                services={services}
                value={answers[currentNode.id] || []}
                onChange={val => setAnswers(a => ({ ...a, [currentNode.id]: val }))}
                onNext={() => advance(currentNode.id, answers[currentNode.id])}
              />
            )}

            {/* QUESTION NODE */}
            {currentNode.type === 'question' && (
              <QuestionStep
                node={currentNode}
                value={answers[currentNode.id]}
                photos={photos}
                onPhotosChange={setPhotos}
                onChange={val => setAnswers(a => ({ ...a, [currentNode.id]: val }))}
                onNext={(val) => {
                  const v = val !== undefined ? val : answers[currentNode.id];
                  if (val !== undefined) setAnswers(a => ({ ...a, [currentNode.id]: v }));
                  advance(currentNode.id, v);
                }}
                Btn={Btn}
                inputCls={inputCls}
              />
            )}
          </>
        )}

        {/* ━━━ CONTACT INFO (always last) ━━━ */}
        {phase === 'contact' && (
          <ContactStep onSubmit={(fn, ln, em, ph, co) => handleSubmit(fn, ln, em, ph, co)} />
        )}
      </div>
    </div>
  );
}

// ─── Service Select Step ───
function ServiceSelectStep({ node, services, value, onChange, onNext }) {
  const selected = value || [];
  const toggle = (name) => {
    onChange(selected.includes(name) ? selected.filter(n => n !== name) : [...selected, name]);
  };

  return (
    <div className="flex-1 flex flex-col">
      <h2 className="text-xl font-light text-white mb-2">{node.data?.label || 'What services do you need?'}</h2>
      <p className="text-white/40 text-xs mb-5">Select all that apply</p>
      {services.length > 0 ? (
        <div className="flex-1 overflow-y-auto space-y-2 content-start">
          {services.map(svc => {
            const sel = selected.includes(svc.name);
            return (
              <button key={svc.id || svc.name} onClick={() => toggle(svc.name)}
                className={`w-full p-4 rounded-lg border text-left text-sm transition-all ${
                  sel ? 'border-[#007CB1] bg-[#007CB1]/15 text-white' : 'border-white/15 bg-white/5 text-white/60 hover:border-white/30'
                }`}>
                <span className="font-medium">{svc.name}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-white/50 text-sm">No services available — contact us to discuss your needs</p>
      )}
      <div className="pt-5">
        <button onClick={onNext} disabled={selected.length === 0}
          className="w-full py-4 rounded-lg text-sm font-semibold uppercase tracking-wider bg-[#007CB1] text-white hover:bg-[#006a9e] min-h-[48px] disabled:opacity-40 transition-all">
          {selected.length > 0 ? `Next (${selected.length} selected)` : 'Next'}
        </button>
      </div>
    </div>
  );
}

// ─── Question Step ───
function QuestionStep({ node, value, photos, onPhotosChange, onChange, onNext, Btn, inputCls }) {
  const d = node.data || {};
  const type = d.answerType || 'text';
  const isRequired = d.required;
  const options = d.options || [];

  const canAdvance = !isRequired || (
    type === 'photo_upload' ? true :
    Array.isArray(value) ? value.length > 0 :
    value !== undefined && value !== ''
  );

  return (
    <div className="flex-1 flex flex-col">
      <h2 className="text-xl font-light text-white mb-2">{d.label || 'Question'}</h2>
      {!isRequired && <p className="text-white/40 text-xs mb-4">Optional</p>}
      {isRequired && <div className="mb-4" />}

      {/* Single Select */}
      {type === 'single_select' && (
        <div className="space-y-2">
          {options.map(opt => (
            <button key={opt} onClick={() => {
              onChange(opt);
              if (d.allowBranching) onNext(opt);
            }}
              className={`w-full text-left px-4 py-4 rounded-lg border text-sm transition-all ${
                value === opt ? 'border-[#007CB1] bg-[#007CB1]/15 text-white' : 'border-white/15 bg-white/5 text-white/60 hover:border-white/30'
              }`}>{opt}</button>
          ))}
        </div>
      )}

      {/* Multi Select */}
      {type === 'multi_select' && (
        <div className="flex-1 overflow-y-auto space-y-2">
          {options.map(opt => {
            const sel = (value || []).includes(opt);
            return (
              <button key={opt} onClick={() => onChange(sel ? (value || []).filter(v => v !== opt) : [...(value || []), opt])}
                className={`w-full text-left px-4 py-4 rounded-lg border text-sm transition-all ${
                  sel ? 'border-[#007CB1] bg-[#007CB1]/15 text-white' : 'border-white/15 bg-white/5 text-white/60 hover:border-white/30'
                }`}>{opt}</button>
            );
          })}
        </div>
      )}

      {/* Yes/No */}
      {type === 'yes_no' && (
        <div className="flex gap-3">
          {['Yes', 'No'].map(opt => (
            <button key={opt} onClick={() => { onChange(opt); onNext(opt); }}
              className={`flex-1 py-4 rounded-lg border text-sm transition-all ${
                value === opt ? 'border-[#007CB1] bg-[#007CB1]/15 text-white' : 'border-white/15 bg-white/5 text-white/60 hover:border-white/30'
              }`}>{opt}</button>
          ))}
        </div>
      )}

      {/* Short Text */}
      {type === 'text' && (
        <input type="text" value={value || ''} onChange={e => onChange(e.target.value)}
          placeholder={d.placeholder || ''} autoFocus style={{ fontSize: '16px' }} className={inputCls} />
      )}

      {/* Long Text */}
      {type === 'long_text' && (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)}
          placeholder={d.placeholder || ''} rows={4}
          className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-4 text-base placeholder-white/40 outline-none focus:border-[#007CB1] resize-none" />
      )}

      {/* Photo Upload */}
      {type === 'photo_upload' && (
        <div>
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              {photos.map((p, i) => (
                <div key={i} className="relative">
                  <img src={p.preview} alt="" className="w-full h-24 object-cover rounded-lg border border-white/10" />
                  <button onClick={() => onPhotosChange(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">x</button>
                </div>
              ))}
            </div>
          )}
          <label className="w-full p-8 rounded-lg border-2 border-dashed border-white/20 text-center cursor-pointer hover:border-[#007CB1]/50 transition-colors block">
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files || []);
                onPhotosChange(prev => [...prev, ...files.map(f => ({ file: f, preview: URL.createObjectURL(f) }))].slice(0, 10));
                e.target.value = '';
              }} />
            <p className="text-white/60 text-sm">{photos.length > 0 ? 'Add more photos' : 'Tap to upload photos'}</p>
            <p className="text-white/30 text-[10px] mt-1">Up to 10 photos</p>
          </label>
        </div>
      )}

      {/* Number */}
      {type === 'number' && (
        <input type="number" value={value || ''} onChange={e => onChange(e.target.value)}
          placeholder={d.placeholder || ''} style={{ fontSize: '16px' }} className={inputCls} />
      )}

      {/* Date */}
      {type === 'date' && (
        <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
          style={{ fontSize: '16px' }} className={inputCls} />
      )}

      {/* Next button (skip for auto-advancing types) */}
      {!['yes_no'].includes(type) && !(type === 'single_select' && d.allowBranching) && (
        <div className="mt-auto pt-6 space-y-3">
          <Btn onClick={() => onNext()} disabled={!canAdvance}>
            {canAdvance ? 'Next' : 'Next'}
          </Btn>
          {!isRequired && !value && type !== 'photo_upload' && (
            <Btn onClick={() => onNext()} secondary>Skip</Btn>
          )}
          {type === 'photo_upload' && (
            <Btn onClick={() => onNext()} secondary>{photos.length > 0 ? 'Continue' : 'Skip for now'}</Btn>
          )}
        </div>
      )}

      {/* Non-branching single select needs a Next button */}
      {type === 'single_select' && !d.allowBranching && (
        <div className="mt-auto pt-6">
          <Btn onClick={() => onNext()} disabled={!value}>Next</Btn>
        </div>
      )}
    </div>
  );
}

// ─── Contact Step ───
function ContactStep({ onSubmit }) {
  const firstNameRef = useRef(null);
  const lastNameRef = useRef(null);
  const emailRef = useRef(null);
  const phoneRef = useRef(null);
  const companyRef = useRef(null);
  const termsRef = useRef(null);
  const [canSubmit, setCanSubmit] = useState(false);

  const checkValid = () => {
    const fn = firstNameRef.current?.value?.trim();
    const ln = lastNameRef.current?.value?.trim();
    const e = emailRef.current?.value?.trim();
    const p = phoneRef.current?.value?.trim();
    const t = termsRef.current?.checked;
    setCanSubmit(!!(fn && ln && e && p && t));
  };

  const handleSubmit = () => {
    const fn = firstNameRef.current?.value?.trim() || '';
    const ln = lastNameRef.current?.value?.trim() || '';
    const e = emailRef.current?.value?.trim() || '';
    const p = phoneRef.current?.value?.trim() || '';
    const c = companyRef.current?.value?.trim() || '';
    if (fn && ln && e && p && termsRef.current?.checked) onSubmit(fn, ln, e, p, c);
  };

  const cls = 'w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-4 placeholder-white/40 outline-none focus:border-[#007CB1] transition-colors';

  return (
    <div className="flex-1 flex flex-col">
      <h2 className="text-xl font-light text-white mb-2">Your contact info</h2>
      <p className="text-white/40 text-xs mb-6">We&apos;ll send your quote to this email</p>
      <div className="space-y-4">
        <div className="flex gap-3">
          <input ref={firstNameRef} type="text" autoComplete="given-name" placeholder="First Name *" onInput={checkValid} onBlur={checkValid} style={{ fontSize: '16px' }} className={cls} />
          <input ref={lastNameRef} type="text" autoComplete="family-name" placeholder="Last Name *" onInput={checkValid} onBlur={checkValid} style={{ fontSize: '16px' }} className={cls} />
        </div>
        <input ref={emailRef} type="email" autoComplete="email" placeholder="Email Address *" onInput={checkValid} onBlur={checkValid} style={{ fontSize: '16px' }} className={cls} />
        <input ref={phoneRef} type="tel" autoComplete="tel" placeholder="Phone Number *" onInput={checkValid} onBlur={checkValid} style={{ fontSize: '16px' }} className={cls} />
        <input ref={companyRef} type="text" autoComplete="organization" placeholder="Company Name (optional)" style={{ fontSize: '16px' }} className={cls} />
      </div>
      <label className="flex items-start gap-3 mt-5 cursor-pointer">
        <input ref={termsRef} type="checkbox" onChange={checkValid} className="mt-0.5 w-4 h-4 rounded accent-[#007CB1] flex-shrink-0" />
        <span className="text-white/50 text-xs">
          I have read and agree to the{' '}
          <a href="/legal/quote-terms" target="_blank" rel="noreferrer" className="text-[#007CB1] underline" onClick={e => e.stopPropagation()}>Terms of Service</a>
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
