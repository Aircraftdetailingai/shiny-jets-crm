"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice, formatPriceWhole, currencySymbol } from '@/lib/formatPrice';
import LoadingSpinner from '@/components/LoadingSpinner';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '\u{1F1FA}\u{1F1F8}' },
  { code: 'es', label: 'Spanish', flag: '\u{1F1EA}\u{1F1F8}' },
  { code: 'pt', label: 'Portuguese', flag: '\u{1F1E7}\u{1F1F7}' },
  { code: 'fr', label: 'French', flag: '\u{1F1EB}\u{1F1F7}' },
  { code: 'de', label: 'German', flag: '\u{1F1E9}\u{1F1EA}' },
  { code: 'it', label: 'Italian', flag: '\u{1F1EE}\u{1F1F9}' },
  { code: 'nl', label: 'Dutch', flag: '\u{1F1F3}\u{1F1F1}' },
  { code: 'ja', label: 'Japanese', flag: '\u{1F1EF}\u{1F1F5}' },
  { code: 'zh', label: 'Chinese (Simplified)', flag: '\u{1F1E8}\u{1F1F3}' },
];

const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'EUR', symbol: '\u20AC', label: 'Euro' },
  { code: 'GBP', symbol: '\u00A3', label: 'British Pound' },
  { code: 'CAD', symbol: 'C$', label: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar' },
  { code: 'JPY', symbol: '\u00A5', label: 'Japanese Yen' },
  { code: 'CHF', symbol: 'CHF', label: 'Swiss Franc' },
  { code: 'MXN', symbol: 'MX$', label: 'Mexican Peso' },
  { code: 'BRL', symbol: 'R$', label: 'Brazilian Real' },
];

const COMMON_SERVICES = [
  { name: 'Exterior Wash', description: 'Full exterior aircraft wash and dry', hours_field: 'ext_wash_hours', defaultRate: 85 },
  { name: 'Interior Detail', description: 'Full interior cleaning and detailing', hours_field: 'int_detail_hours', defaultRate: 85 },
  { name: 'Leather Treatment', description: 'Leather conditioning and protection', hours_field: 'leather_hours', defaultRate: 90 },
  { name: 'Carpet Cleaning', description: 'Deep carpet extraction and cleaning', hours_field: 'carpet_hours', defaultRate: 85 },
  { name: 'Brightwork Polish', description: 'Chrome and metal polishing', hours_field: 'brightwork_hours', defaultRate: 95 },
  { name: 'Wax Application', description: 'Full exterior wax protection', hours_field: 'wax_hours', defaultRate: 90 },
  { name: 'One-Step Polish', description: 'Single-stage paint correction polish', hours_field: 'polish_hours', defaultRate: 100 },
  { name: 'Ceramic Coating', description: 'Professional ceramic paint protection', hours_field: 'ceramic_hours', defaultRate: 120 },
  { name: 'Spray Ceramic Topcoat', description: 'Spray-on ceramic maintenance coating', hours_field: 'spray_ceramic_hours', defaultRate: 95 },
  { name: 'Decontamination Wash', description: 'Iron removal and clay bar treatment', hours_field: 'ext_wash_hours', defaultRate: 95 },
  { name: 'Quick Turn Exterior', description: 'Fast exterior clean between flights', hours_field: 'ext_wash_hours', defaultRate: 75 },
  { name: 'Quick Turn Interior', description: 'Fast interior tidy between flights', hours_field: 'int_detail_hours', defaultRate: 75 },
];

const STEPS = [
  { label: 'Welcome', icon: '&#9992;' },
  { label: 'Company', icon: '&#127970;' },
  { label: 'Services', icon: '&#128736;' },
  { label: 'Rates', icon: '&#128176;' },
  { label: 'Preferences', icon: '&#9881;' },
  { label: 'Test Quote', icon: '&#128196;' },
  { label: 'Complete', icon: '&#127881;' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');

  // Step 2: Company info
  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  // Step 3: Services
  const [selectedServices, setSelectedServices] = useState({});

  // Step 4: Rates (keyed by service name)
  const [rates, setRates] = useState({});

  // Step 5: Preferences
  const [minimumFee, setMinimumFee] = useState('');
  const [passFee, setPassFee] = useState(false);
  const [language, setLanguage] = useState('en');
  const [currency, setCurrency] = useState('USD');

  // Step 6: Test quote
  const [manufacturers, setManufacturers] = useState([]);
  const [models, setModels] = useState([]);
  const [selectedMfr, setSelectedMfr] = useState('');
  const [testAircraft, setTestAircraft] = useState(null);
  const [testServices, setTestServices] = useState({});

  useEffect(() => {
    const t = localStorage.getItem('vector_token');
    const stored = localStorage.getItem('vector_user');
    if (!t || !stored) {
      router.push('/login');
      return;
    }
    setToken(t);

    // Check onboarding status
    fetch('/api/onboarding', {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then(res => res.json())
      .then(data => {
        if (data.onboarding_complete) {
          router.push('/dashboard');
          return;
        }
        // Resume from saved step
        if (data.onboarding_step > 0 && data.onboarding_step < 7) {
          setStep(data.onboarding_step);
        }
        if (data.company) setCompany(data.company);
        if (data.name) setName(data.name);
        if (data.phone) setPhone(data.phone);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const saveStep = async (stepNum) => {
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'save_step', step: stepNum }),
      });
    } catch (e) {
      // non-fatal
    }
  };

  const goNext = () => {
    setError('');
    setStep(s => s + 1);
  };

  const goBack = () => {
    setError('');
    setStep(s => Math.max(0, s - 1));
  };

  const handleSkip = async () => {
    setSaving(true);
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'skip' }),
      });
      router.push('/dashboard');
    } catch {
      router.push('/dashboard');
    }
  };

  // Step 2: Save company info
  const saveCompany = async () => {
    if (!company.trim()) {
      setError('Company name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'save_company', company, name, phone }),
      });
      const data = await res.json();
      if (data.user) {
        localStorage.setItem('vector_user', JSON.stringify(data.user));
      }
      goNext();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Step 3: Save services
  const saveServices = async () => {
    const chosen = COMMON_SERVICES.filter((_, i) => selectedServices[i]);
    if (chosen.length === 0) {
      setError('Select at least one service');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Initialize rates with defaults for selected services
      const newRates = {};
      chosen.forEach(svc => {
        newRates[svc.name] = rates[svc.name] || String(svc.defaultRate);
      });
      setRates(newRates);
      await saveStep(3);
      goNext();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Step 4: Save rates & create services in DB
  const saveRates = async () => {
    const chosen = COMMON_SERVICES.filter((_, i) => selectedServices[i]);
    const servicesPayload = chosen.map(svc => ({
      name: svc.name,
      description: svc.description,
      hourly_rate: parseFloat(rates[svc.name]) || svc.defaultRate,
      hours_field: svc.hours_field,
    }));

    setSaving(true);
    setError('');
    try {
      // Import services via the existing API
      await fetch('/api/services/import', {
        method: 'POST',
        headers,
        body: JSON.stringify({ services: servicesPayload }),
      });

      // Also save via onboarding endpoint to update step
      await fetch('/api/onboarding', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'save_services', services: servicesPayload }),
      });

      goNext();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Step 5: Save preferences
  const savePreferences = async () => {
    setSaving(true);
    setError('');
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'save_preferences',
          minimum_fee: minimumFee,
          pass_fee_to_customer: passFee,
          preferred_language: language,
          preferred_currency: currency,
        }),
      });
      // Fetch manufacturers for test quote step
      try {
        const res = await fetch('/api/aircraft/manufacturers');
        if (res.ok) {
          const data = await res.json();
          setManufacturers(data.manufacturers || []);
        }
      } catch (e) {}
      goNext();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Step 6: Fetch models when manufacturer changes
  const fetchModels = async (mfr) => {
    setSelectedMfr(mfr);
    setTestAircraft(null);
    if (!mfr) { setModels([]); return; }
    try {
      const res = await fetch(`/api/aircraft/models?make=${encodeURIComponent(mfr)}`);
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
      }
    } catch (e) {}
  };

  const selectTestAircraft = async (aircraft) => {
    try {
      const res = await fetch(`/api/aircraft/${aircraft.id}`);
      if (res.ok) {
        const data = await res.json();
        setTestAircraft(data.aircraft);
        // Auto-select all services for the test quote
        const all = {};
        COMMON_SERVICES.forEach((_, i) => {
          if (selectedServices[i]) all[i] = true;
        });
        setTestServices(all);
      }
    } catch (e) {}
  };

  // Calculate test quote price
  const getTestHours = (svc) => {
    if (!testAircraft) return 0;
    return parseFloat(testAircraft[svc.hours_field]) || 0;
  };

  const getTestPrice = (svc) => {
    const hours = getTestHours(svc);
    const rate = parseFloat(rates[svc.name]) || svc.defaultRate;
    return hours * rate;
  };

  const testSelectedList = COMMON_SERVICES.filter((_, i) => selectedServices[i] && testServices[i]);
  const testTotal = testSelectedList.reduce((sum, svc) => sum + getTestPrice(svc), 0);
  const testTotalHours = testSelectedList.reduce((sum, svc) => sum + getTestHours(svc), 0);

  // Step 7: Complete onboarding
  const completeOnboarding = async () => {
    setSaving(true);
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'complete' }),
      });
      router.push('/dashboard');
    } catch {
      router.push('/dashboard');
    }
  };

  if (loading) {
    return <LoadingSpinner message={'Loading...'} />;
  }

  const chosenServices = COMMON_SERVICES.filter((_, i) => selectedServices[i]);

  return (
    <div className="page-transition min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Progress bar */}
        {step > 0 && step < 6 && (
          <div className="bg-gray-50 px-6 pt-4 pb-2">
            <div className="flex items-center justify-between mb-2">
              {STEPS.map((s, i) => (
                <div key={i} className="flex flex-col items-center" style={{ width: `${100 / STEPS.length}%` }}>
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                      i < step ? 'bg-green-500 text-white'
                      : i === step ? 'bg-amber-500 text-white'
                      : 'bg-gray-200 text-gray-400'
                    }`}
                  >
                    {i < step ? <span dangerouslySetInnerHTML={{ __html: '&#10003;' }} /> : i + 1}
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1">{s.label}</span>
                </div>
              ))}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center py-6">
              <div className="text-6xl mb-4" dangerouslySetInnerHTML={{ __html: '&#9992;' }} />
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to {'Vector'}</h1>
              <p className="text-gray-600 mb-6">
                Let's get your account set up in about 2 minutes. We'll configure your services, rates, and preferences so you can start quoting immediately.
              </p>
              <div className="space-y-3 text-left max-w-xs mx-auto mb-8">
                {[
                  'Set up your company profile',
                  'Choose your services',
                  'Configure hourly rates',
                  'Set pricing preferences',
                  'Build a test quote',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </div>
                    <span className="text-gray-700 text-sm">{item}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={goNext}
                className="w-full py-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold text-lg hover:opacity-90 transition-opacity"
              >
                Let's Go
              </button>
              <button
                onClick={handleSkip}
                disabled={saving}
                className="mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                {saving ? 'Skipping...' : 'Skip for now'}
              </button>
            </div>
          )}

          {/* Step 1: Company Info */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">{'Company Information'}</h2>
              <p className="text-sm text-gray-500 mb-6">Tell us about your business</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {'Company Name'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="e.g., Elite Aviation Detail"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{'Name'}</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="First and last name"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{'Phone'}</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">For SMS job notifications</p>
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <button onClick={goBack} className="px-4 py-2 text-gray-500 hover:text-gray-700">
                  {'Back'}
                </button>
                <button
                  onClick={saveCompany}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Next'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Services Setup */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">{'Services'}</h2>
              <p className="text-sm text-gray-500 mb-4">Select the services you offer. You can add more later in {'Settings'}.</p>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {COMMON_SERVICES.map((svc, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedServices(prev => ({ ...prev, [i]: !prev[i] }))}
                    className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedServices[i]
                        ? 'bg-amber-50 border-amber-300'
                        : 'hover:bg-gray-50 border-gray-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedServices[i] || false}
                      onChange={() => setSelectedServices(prev => ({ ...prev, [i]: !prev[i] }))}
                      className="w-5 h-5 rounded border-gray-300 text-amber-500 focus:ring-amber-500 mr-3"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1">
                      <span className="font-medium text-gray-900">{svc.name}</span>
                      <span className="text-xs text-gray-500 block">{svc.description}</span>
                    </div>
                    <span className="text-sm text-gray-400">${svc.defaultRate}/hr</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <button
                  onClick={() => {
                    const all = {};
                    COMMON_SERVICES.forEach((_, i) => { all[i] = true; });
                    setSelectedServices(all);
                  }}
                  className="text-sm text-amber-600 hover:underline"
                >
                  {'Select All'}
                </button>
                <span className="text-sm text-gray-400">
                  {Object.values(selectedServices).filter(Boolean).length} {'selected'}
                </span>
              </div>

              <div className="mt-4 flex justify-between">
                <button onClick={goBack} className="px-4 py-2 text-gray-500 hover:text-gray-700">
                  {'Back'}
                </button>
                <button
                  onClick={saveServices}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Next'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Hourly Rates */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Set Your Rates</h2>
              <p className="text-sm text-gray-500 mb-4">Set your hourly rate for each service. We've filled in industry averages as defaults.</p>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {chosenServices.map((svc) => (
                  <div key={svc.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <span className="font-medium text-gray-900 text-sm">{svc.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">$</span>
                      <input
                        type="number"
                        value={rates[svc.name] || ''}
                        onChange={(e) => setRates(prev => ({ ...prev, [svc.name]: e.target.value }))}
                        placeholder={String(svc.defaultRate)}
                        className="w-20 border border-gray-300 rounded px-2 py-1.5 text-right focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      />
                      <span className="text-gray-400 text-sm">{'/hr'}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pro Tip */}
              <div className="mt-4 p-3 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <span className="text-xl" dangerouslySetInnerHTML={{ __html: '&#128161;' }} />
                  <div>
                    <p className="font-semibold text-amber-800 text-sm">Pro Tip</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Bill every <strong>4 weeks</strong> instead of monthly for recurring customers.
                      That's 13 billing cycles vs 12 = <strong>8% more annual revenue</strong>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex justify-between">
                <button onClick={goBack} className="px-4 py-2 text-gray-500 hover:text-gray-700">
                  {'Back'}
                </button>
                <button
                  onClick={saveRates}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Next'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Preferences */}
          {step === 4 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Preferences</h2>
              <p className="text-sm text-gray-500 mb-6">Set your language, currency, and pricing preferences</p>

              <div className="space-y-5">
                {/* Language & Currency */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{'Language'}</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    >
                      {LANGUAGES.map(l => (
                        <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{'Currency'}</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    >
                      {CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Minimum fee */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{'Minimum Fee'}</label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">{CURRENCIES.find(c => c.code === currency)?.symbol || '$'}</span>
                    <input
                      type="number"
                      value={minimumFee}
                      onChange={(e) => setMinimumFee(e.target.value)}
                      placeholder="0"
                      className="w-32 border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    If a quote total is below this amount, the minimum fee is charged instead. Set to 0 to disable.
                  </p>
                </div>

                {/* Pass fee toggle */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{'Pass platform fee to customer'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        When enabled, the platform fee appears as a "Service Fee" line item on the customer's quote instead of being deducted from your earnings.
                      </p>
                    </div>
                    <button
                      onClick={() => setPassFee(!passFee)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        passFee ? 'bg-amber-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          passFee ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <button onClick={goBack} className="px-4 py-2 text-gray-500 hover:text-gray-700">
                  {'Back'}
                </button>
                <button
                  onClick={savePreferences}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Next'}
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Test Quote */}
          {step === 5 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Build a Test Quote</h2>
              <p className="text-sm text-gray-500 mb-4">
                Pick an aircraft and see how {'Vector'} calculates your quote using the rates you just set.
              </p>

              {!testAircraft ? (
                <div>
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">{'Manufacturer'}</label>
                    <select
                      value={selectedMfr}
                      onChange={(e) => fetchModels(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    >
                      <option value="">Choose a manufacturer...</option>
                      {manufacturers.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  {models.length > 0 && (
                    <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                      {models.map(a => (
                        <div
                          key={a.id}
                          onClick={() => selectTestAircraft(a)}
                          className="p-3 cursor-pointer hover:bg-amber-50 transition-colors"
                        >
                          <p className="font-medium text-gray-900">{a.manufacturer} {a.model}</p>
                          <p className="text-xs text-gray-500">{a.category} &bull; {a.seats} {'seats'}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedMfr && models.length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-4">{'Loading aircraft...'}</p>
                  )}
                </div>
              ) : (
                <div>
                  {/* Selected aircraft info */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-blue-900">{testAircraft.manufacturer} {testAircraft.model}</p>
                        <p className="text-xs text-blue-600">{testAircraft.surface_area_sqft?.toLocaleString()} {'sq ft'}</p>
                      </div>
                      <button
                        onClick={() => setTestAircraft(null)}
                        className="text-xs text-blue-500 hover:underline"
                      >
                        Change
                      </button>
                    </div>
                  </div>

                  {/* Service line items */}
                  <div className="space-y-1 mb-3">
                    {COMMON_SERVICES.filter((_, i) => selectedServices[i]).map((svc, idx) => {
                      const hours = getTestHours(svc);
                      const price = getTestPrice(svc);
                      const i = COMMON_SERVICES.indexOf(svc);
                      return (
                        <div
                          key={svc.name}
                          onClick={() => setTestServices(prev => ({ ...prev, [i]: !prev[i] }))}
                          className={`flex items-center justify-between p-2 rounded cursor-pointer text-sm transition-colors ${
                            testServices[i] ? 'bg-amber-50' : 'bg-gray-50 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={testServices[i] || false}
                              onChange={() => {}}
                              className="w-4 h-4 rounded text-amber-500"
                            />
                            <span className="text-gray-800">{svc.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-semibold">{currencySymbol()}{formatPriceWhole(price)}</span>
                            <span className="text-xs text-gray-400 ml-1">({hours.toFixed(1)}h)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Quote total */}
                  <div className="bg-[#0f172a] text-white rounded-lg p-4">
                    <div className="flex justify-between text-sm text-gray-400 mb-1">
                      <span>{'Est. Hours'}</span>
                      <span>{testTotalHours.toFixed(1)}h</span>
                    </div>
                    <div className="flex justify-between text-xl font-bold">
                      <span>{'Quote Summary'}</span>
                      <span>{currencySymbol()}{formatPrice(testTotal)}</span>
                    </div>
                    {parseFloat(minimumFee) > 0 && testTotal > 0 && testTotal < parseFloat(minimumFee) && (
                      <div className="mt-2 text-xs text-amber-400">
                        {'Minimum fee of'} ${formatPriceWhole(minimumFee)} would apply
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-gray-400 mt-3 text-center">
                    This is just a preview. You'll build real quotes from the dashboard.
                  </p>
                </div>
              )}

              <div className="mt-4 flex justify-between">
                <button onClick={goBack} className="px-4 py-2 text-gray-500 hover:text-gray-700">
                  {'Back'}
                </button>
                <button
                  onClick={goNext}
                  className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold hover:opacity-90"
                >
                  {testAircraft ? 'Looks Good!' : 'Skip Test Quote'}
                </button>
              </div>
            </div>
          )}

          {/* Step 6: Complete */}
          {step === 6 && (
            <div className="text-center py-4">
              <div className="text-6xl mb-3" dangerouslySetInnerHTML={{ __html: '&#127881;' }} />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">You're All Set!</h2>
              <p className="text-gray-600 mb-6">Your {'Vector'} account is configured and ready to go.</p>

              <div className="text-left space-y-3 max-w-xs mx-auto mb-6">
                {[
                  { label: 'Company profile', done: !!company },
                  { label: `${chosenServices.length} services configured`, done: chosenServices.length > 0 },
                  { label: 'Hourly rates set', done: Object.keys(rates).length > 0 },
                  { label: 'Pricing preferences saved', done: true },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                      item.done ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                    }`}>
                      <span dangerouslySetInnerHTML={{ __html: item.done ? '&#10003;' : '&#8226;' }} />
                    </div>
                    <span className={`text-sm ${item.done ? 'text-gray-900' : 'text-gray-400'}`}>{item.label}</span>
                  </div>
                ))}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
                <p className="text-amber-800 text-sm font-medium">+50 points earned for completing onboarding!</p>
              </div>

              <button
                onClick={completeOnboarding}
                disabled={saving}
                className="w-full py-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold text-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? 'Finishing...' : `Go to ${'Dashboard'}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
