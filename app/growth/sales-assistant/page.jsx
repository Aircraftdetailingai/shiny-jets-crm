"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const CUSTOMER_TYPES = [
  { value: 'fbo', label: 'FBO (Fixed Base Operator)' },
  { value: 'part135', label: 'Part 135 Charter Operator' },
  { value: 'fractional', label: 'Fractional Ownership (NetJets, Flexjet, etc.)' },
  { value: 'corporate', label: 'Corporate Flight Department' },
  { value: 'private_owner', label: 'Private Aircraft Owner' },
  { value: 'management', label: 'Aircraft Management Company' },
  { value: 'mro', label: 'MRO / Maintenance Facility' },
  { value: 'broker', label: 'Aircraft Broker / Sales' },
];

const CONTACT_TYPES = [
  { value: 'cold_walkin', label: 'Cold Walk-In', description: 'No appointment, showing up at FBO/hangar' },
  { value: 'cold_call', label: 'Cold Call', description: 'Phone call, no prior contact' },
  { value: 'warm_lead', label: 'Warm Lead', description: 'They reached out or were referred' },
  { value: 'follow_up', label: 'Follow-Up', description: 'Continuing a previous conversation' },
  { value: 'trade_show', label: 'Trade Show / Event', description: 'Met at NBAA, MRO Americas, etc.' },
];

const SCRIPT_TYPE_LABELS = {
  cold_call: 'Cold Call',
  cold_walkin: 'Walk-In',
  email: 'Email',
  linkedin: 'LinkedIn',
  follow_up: 'Follow-Up',
  objection_handler: 'Objection Handler',
  voicemail: 'Voicemail',
  gatekeeper: 'Gatekeeper',
  leave_behind: 'Leave-Behind',
  discovery: 'Discovery',
  proposal: 'Proposal',
  general: 'General',
};

const SCRIPT_TYPE_COLORS = {
  cold_call: 'bg-blue-100 text-blue-700',
  cold_walkin: 'bg-orange-100 text-orange-700',
  email: 'bg-purple-100 text-purple-700',
  linkedin: 'bg-sky-100 text-sky-700',
  follow_up: 'bg-amber-100 text-amber-700',
  objection_handler: 'bg-red-100 text-red-700',
  voicemail: 'bg-indigo-100 text-indigo-700',
  gatekeeper: 'bg-teal-100 text-teal-700',
  leave_behind: 'bg-emerald-100 text-emerald-700',
  discovery: 'bg-cyan-100 text-cyan-700',
  proposal: 'bg-violet-100 text-violet-700',
  general: 'bg-gray-100 text-gray-700',
};

const PROGRESS_STEPS = [
  'Searching company info...',
  'Finding recent news...',
  'Analyzing fleet data...',
  'Researching airport & FBOs...',
  'Generating personalized scripts...',
];

const NOTES_PLACEHOLDER = `Add context to get better scripts:

For a potential job:
- What aircraft do they have?
- What services are they interested in?
- Any timeline or urgency?
- Budget concerns mentioned?

For a cold contact:
- How did you find them?
- What's your opening angle?
- Any mutual connections?
- What problem can you solve for them?`;

export default function SalesAssistantPage() {
  const router = useRouter();

  // Core fields (always visible)
  const [companyName, setCompanyName] = useState('');
  const [contactType, setContactType] = useState('');
  const [customerType, setCustomerType] = useState('');
  const [notes, setNotes] = useState('');

  // Prospect detail fields
  const [showDetails, setShowDetails] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactTitle, setContactTitle] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [location, setLocation] = useState('');

  // Results
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [companyIntel, setCompanyIntel] = useState(null);
  const [scripts, setScripts] = useState([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(null);

  // History
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/sales-assistant', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.scripts || []);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const generate = async () => {
    if (!contactType) {
      setError('Please select how you\'re reaching out');
      return;
    }
    if (!customerType) {
      setError('Please select a customer type');
      return;
    }

    setLoading(true);
    setError('');
    setCompanyIntel(null);
    setScripts([]);
    setProgressStep(0);

    const hasCompany = companyName.trim().length > 0;

    // Animate progress steps
    const interval = hasCompany ? setInterval(() => {
      setProgressStep(prev => prev < PROGRESS_STEPS.length - 1 ? prev + 1 : prev);
    }, 2500) : null;

    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/sales-assistant/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customer_type: CUSTOMER_TYPES.find(ct => ct.value === customerType)?.label || customerType,
          contact_type: contactType,
          notes: notes || null,
          company_name: hasCompany ? companyName : null,
          contact_name: contactName || null,
          contact_title: contactTitle || null,
          website_url: websiteUrl || null,
          linkedin_url: linkedinUrl || null,
          location: location || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create');
        return;
      }

      setCompanyIntel(data.company_intel || null);
      setScripts(data.scripts || []);
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      if (interval) clearInterval(interval);
      setLoading(false);
    }
  };

  const copyScript = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  };

  const loadFromHistory = (item) => {
    setCompanyIntel(item.research_summary ? { summary: item.research_summary } : null);
    setScripts(item.scripts || []);
    setShowHistory(false);
    if (item.company_name) {
      setCompanyName(item.company_name);
      setContactName(item.contact_name || '');
      setContactTitle(item.contact_title || '');
    }
  };

  const selectedContactType = CONTACT_TYPES.find(ct => ct.value === contactType);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      <header className="text-white flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <a href="/growth" className="text-2xl hover:text-amber-400">&#8592;</a>
          <div>
            <h1 className="text-2xl font-bold">{'AI Sales Assistant'}</h1>
            <p className="text-sm text-gray-400">{'Research prospects and generate personalized cold call, email, and LinkedIn scripts'}</p>
          </div>
        </div>
        <button
          onClick={() => { setShowHistory(!showHistory); if (!showHistory && history.length === 0) fetchHistory(); }}
          className="px-4 py-2 text-sm border border-white/30 rounded-lg text-white hover:bg-white/10"
        >
          {showHistory ? 'Back' : 'History'}
        </button>
      </header>

      <div className="max-w-4xl mx-auto">
        {/* History View */}
        {showHistory ? (
          <div className="space-y-4">
            <h2 className="text-white text-lg font-semibold">Past Generations</h2>
            {historyLoading ? (
              <div className="text-gray-400 text-center py-8">{'Loading...'}</div>
            ) : history.length === 0 ? (
              <div className="text-gray-400 text-center py-8">No saved scripts yet. Generate your first one!</div>
            ) : (
              history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => loadFromHistory(item)}
                  className="w-full text-left bg-white/10 rounded-lg p-4 hover:bg-white/20 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-white font-medium">
                        {item.company_name || item.customer_type}
                      </p>
                      {item.contact_name && (
                        <p className="text-gray-400 text-sm">{item.contact_name}{item.contact_title ? ` - ${item.contact_title}` : ''}</p>
                      )}
                      <p className="text-gray-500 text-xs mt-1">{item.customer_type}</p>
                    </div>
                    <span className="text-gray-500 text-xs">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          <>
            {/* Generator Form */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
              <div className="p-6 space-y-5">

                {/* Company Name - Prominent */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{'Company'}</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g., NetJets, Meridian Teterboro, Jet Aviation"
                    className="w-full border-2 border-indigo-200 rounded-lg px-4 py-3 text-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-colors"
                  />
                  <p className="text-xs text-gray-400 mt-1">AI will research the company, fleet, news, and decision makers</p>
                </div>

                {/* Contact Type Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">How are you reaching out? *</label>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {CONTACT_TYPES.map(ct => (
                      <button
                        key={ct.value}
                        onClick={() => setContactType(ct.value)}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          contactType === ct.value
                            ? 'border-amber-500 bg-amber-50'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <p className={`text-sm font-medium ${contactType === ct.value ? 'text-amber-700' : 'text-gray-900'}`}>{ct.label}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{ct.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Customer Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{'Type'} *</label>
                  <select
                    value={customerType}
                    onChange={(e) => setCustomerType(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Select customer type...</option>
                    {CUSTOMER_TYPES.map(ct => (
                      <option key={ct.value} value={ct.value}>{ct.label}</option>
                    ))}
                  </select>
                </div>

                {/* Notes with Smart Prompts */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{'Notes'} & Context</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={NOTES_PLACEHOLDER}
                    rows={6}
                    className="w-full border rounded-lg px-3 py-2 resize-y min-h-[100px] text-sm"
                  />
                </div>

                {/* Expandable Prospect Details */}
                <div className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-700">Contact & Location Details</span>
                    <span className="text-gray-400 text-sm">{showDetails ? '&#9650;' : '&#9660;'}</span>
                  </button>
                  {showDetails && (
                    <div className="p-4 space-y-4 border-t bg-gray-50/50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Location / {'Airport'}</label>
                          <input
                            type="text"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="e.g., KTEB or Teterboro, NJ"
                            className="w-full border rounded-lg px-3 py-2"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">{'Name'}</label>
                          <input
                            type="text"
                            value={contactName}
                            onChange={(e) => setContactName(e.target.value)}
                            placeholder="e.g., John Smith"
                            className="w-full border rounded-lg px-3 py-2"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Contact Title</label>
                          <input
                            type="text"
                            value={contactTitle}
                            onChange={(e) => setContactTitle(e.target.value)}
                            placeholder="e.g., Director of Maintenance"
                            className="w-full border rounded-lg px-3 py-2"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label>
                          <input
                            type="url"
                            value={websiteUrl}
                            onChange={(e) => setWebsiteUrl(e.target.value)}
                            placeholder="https://www.company.com"
                            className="w-full border rounded-lg px-3 py-2"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn URL</label>
                          <input
                            type="url"
                            value={linkedinUrl}
                            onChange={(e) => setLinkedinUrl(e.target.value)}
                            placeholder="https://linkedin.com/in/..."
                            className="w-full border rounded-lg px-3 py-2"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
                )}

                <button
                  onClick={generate}
                  disabled={loading}
                  className="w-full py-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading
                    ? (companyName.trim() ? 'Researching & Generating...' : 'Processing...')
                    : (companyName.trim()
                      ? `Research ${companyName.trim()} & Generate Scripts`
                      : selectedContactType
                        ? `Generate ${selectedContactType.label} Scripts`
                        : 'Generate Scripts'
                    )
                  }
                </button>
              </div>
            </div>

            {/* Loading Progress */}
            {loading && companyName.trim() && (
              <div className="bg-white/10 rounded-xl p-6 mb-6">
                <div className="space-y-3">
                  {PROGRESS_STEPS.map((step, i) => (
                    <div key={i} className="flex items-center gap-3">
                      {i < progressStep ? (
                        <span className="text-green-400 text-lg">&#10003;</span>
                      ) : i === progressStep ? (
                        <span className="text-amber-400 animate-pulse text-lg">&#9679;</span>
                      ) : (
                        <span className="text-gray-600 text-lg">&#9675;</span>
                      )}
                      <span className={`text-sm ${i <= progressStep ? 'text-white' : 'text-gray-500'}`}>
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Company Intel Display */}
            {companyIntel && (
              <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
                <div className="p-4 bg-gradient-to-r from-indigo-600 to-purple-600">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <span dangerouslySetInnerHTML={{ __html: '&#128202;' }} /> Company Intel
                  </h3>
                </div>
                <div className="p-5">
                  {/* Structured intel fields */}
                  {companyIntel.fleet && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fleet</p>
                      <p className="text-sm text-gray-900">{companyIntel.fleet}</p>
                    </div>
                  )}
                  {companyIntel.locations && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Based At</p>
                      <p className="text-sm text-gray-900">{companyIntel.locations}</p>
                    </div>
                  )}
                  {companyIntel.recent_news && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent News</p>
                      <p className="text-sm text-gray-900">{companyIntel.recent_news}</p>
                    </div>
                  )}
                  {companyIntel.decision_maker && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Likely Decision Maker</p>
                      <p className="text-sm text-gray-900">{companyIntel.decision_maker}</p>
                    </div>
                  )}
                  {companyIntel.opportunity_score && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Opportunity Score</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              companyIntel.opportunity_score >= 8 ? 'bg-green-500' :
                              companyIntel.opportunity_score >= 5 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${companyIntel.opportunity_score * 10}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold text-gray-900">{companyIntel.opportunity_score}/10</span>
                      </div>
                    </div>
                  )}
                  {companyIntel.airport_info && (
                    <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Airport Intel</p>
                      <p className="text-sm text-blue-900">{companyIntel.airport_info}</p>
                    </div>
                  )}
                  {/* Full summary */}
                  {companyIntel.summary && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Full Research Summary</p>
                      <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{companyIntel.summary}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Generated Scripts */}
            {scripts.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-white text-lg font-semibold">
                  {selectedContactType ? `${selectedContactType.label} Scripts` : 'Generated Scripts'}
                </h2>
                {scripts.map((script, idx) => (
                  <div key={idx} className="bg-white rounded-xl shadow-lg overflow-hidden">
                    <div className="p-4 border-b flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${SCRIPT_TYPE_COLORS[script.type] || SCRIPT_TYPE_COLORS.general}`}>
                          {SCRIPT_TYPE_LABELS[script.type] || script.type}
                        </span>
                        <h3 className="font-semibold text-gray-900">{script.title}</h3>
                      </div>
                      <button
                        onClick={() => copyScript(script.content, idx)}
                        className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        {copied === idx ? '&#10003; Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="p-4">
                      <div className="whitespace-pre-line text-gray-800 text-sm leading-relaxed">{script.content}</div>
                      {script.tips && (
                        <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                          <p className="text-xs font-medium text-amber-800 mb-1">Tips</p>
                          <p className="text-sm text-amber-700">{script.tips}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
