"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const ROLES = [
  { value: 'aircraft_owner', icon: '\u2708\uFE0F', label: 'Aircraft Owner', desc: 'I own the aircraft' },
  { value: 'pilot', icon: '\uD83D\uDC68\u200D\u2708\uFE0F', label: 'Pilot', desc: 'I fly it but don\'t own it' },
  { value: 'mechanic', icon: '\uD83D\uDD27', label: 'Mechanic / A&P', desc: 'I maintain it' },
  { value: 'director_of_maintenance', icon: '\uD83D\uDCCB', label: 'Director of Maintenance', desc: 'I manage maintenance operations' },
  { value: 'fleet_manager', icon: '\uD83D\uDC54', label: 'Fleet Manager', desc: 'I manage multiple aircraft' },
  { value: 'fbo_manager', icon: '\uD83C\uDFE2', label: 'FBO / Line Manager', desc: 'I manage an FBO or flight line' },
];

const CERT_TYPES = ['PPL', 'CPL', 'ATP', 'A&P', 'IA', 'Other'];
const CERT_ROLES = ['pilot', 'mechanic', 'director_of_maintenance'];

export default function PortalOnboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState(null);

  // Form state
  const [role, setRole] = useState('aircraft_owner');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [certNumber, setCertNumber] = useState('');
  const [certType, setCertType] = useState('');

  // Aircraft
  const [aircraft, setAircraft] = useState([{ tail_number: '', model: '', year: '', nickname: '', storage_type: '', home_airport: '' }]);

  // Notifications
  const [notifPrefs, setNotifPrefs] = useState({
    quote_ready: true, job_scheduled: true, job_completed: true,
    service_reminder: true, promotions: false,
  });
  const [smsEnabled, setSmsEnabled] = useState(false);

  useEffect(() => {
    // Get token from cookie (read via API)
    fetch('/api/portal/me').then(r => {
      if (!r.ok) router.push('/portal/login');
    }).catch(() => router.push('/portal/login'));
    // Pre-select role from UTM param
    const refRole = localStorage.getItem('portal_ref_role');
    if (refRole && ROLES.some(r => r.value === refRole)) {
      setRole(refRole);
    }
  }, [router]);

  const api = async (path, opts = {}) => {
    return fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...opts.headers } });
  };

  const saveProfile = async () => {
    setSaving(true);
    await api('/api/portal/me', {
      method: 'PATCH',
      body: JSON.stringify({
        role,
        first_name: firstName,
        last_name: lastName,
        name: [firstName, lastName].filter(Boolean).join(' '),
        phone,
        company_name: companyName || null,
        certificate_number: certNumber || null,
        certificate_type: certType || null,
      }),
    });
    setSaving(false);
  };

  const saveAircraft = async () => {
    setSaving(true);
    for (const ac of aircraft) {
      if (!ac.tail_number.trim()) continue;
      await api('/api/portal/aircraft', {
        method: 'POST',
        body: JSON.stringify(ac),
      });
    }
    setSaving(false);
  };

  const completeOnboarding = async () => {
    setSaving(true);
    await api('/api/portal/me', {
      method: 'PATCH',
      body: JSON.stringify({
        preferred_notification: smsEnabled ? 'sms' : 'email',
        notification_prefs: notifPrefs,
        onboarding_complete: true,
      }),
    });
    router.push('/portal');
  };

  const next = () => setStep(s => s + 1);
  const back = () => setStep(s => Math.max(0, s - 1));

  const addAircraft = () => setAircraft([...aircraft, { tail_number: '', model: '', year: '', nickname: '', storage_type: '', home_airport: '' }]);
  const updateAircraft = (i, field, val) => {
    const copy = [...aircraft];
    copy[i] = { ...copy[i], [field]: val };
    setAircraft(copy);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex gap-2 mb-6">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-[#007CB1]' : 'bg-[#ddd]'}`} />
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-[#e5e7eb] p-6">
          {/* Step 0: Role */}
          {step === 0 && (
            <div>
              <h2 className="text-xl font-bold text-[#0D1B2A] mb-1">Welcome to your portal</h2>
              <p className="text-[#666] text-sm mb-6">What best describes your role?</p>
              <div className="grid grid-cols-1 gap-2">
                {ROLES.map(r => (
                  <button key={r.value} onClick={() => { setRole(r.value); next(); }}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all hover:border-[#007CB1] ${role === r.value ? 'border-[#007CB1] bg-[#007CB1]/5' : 'border-[#e5e7eb]'}`}>
                    <span className="text-2xl">{r.icon}</span>
                    <div>
                      <p className="font-medium text-[#0D1B2A] text-sm">{r.label}</p>
                      <p className="text-[#999] text-xs">{r.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Details */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-[#0D1B2A] mb-1">Your details</h2>
              <p className="text-[#666] text-sm mb-6">Tell us about yourself</p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#555] mb-1">First name</label>
                    <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First"
                      className="w-full px-3 py-2.5 border border-[#ddd] rounded-lg text-sm outline-none focus:border-[#007CB1]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#555] mb-1">Last name</label>
                    <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last"
                      className="w-full px-3 py-2.5 border border-[#ddd] rounded-lg text-sm outline-none focus:border-[#007CB1]" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#555] mb-1">Phone</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" type="tel"
                    className="w-full px-3 py-2.5 border border-[#ddd] rounded-lg text-sm outline-none focus:border-[#007CB1]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#555] mb-1">Company <span className="text-[#aaa]">(optional)</span></label>
                  <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Company name"
                    className="w-full px-3 py-2.5 border border-[#ddd] rounded-lg text-sm outline-none focus:border-[#007CB1]" />
                </div>
                {CERT_ROLES.includes(role) && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-[#555] mb-1">Certificate type</label>
                      <select value={certType} onChange={e => setCertType(e.target.value)}
                        className="w-full px-3 py-2.5 border border-[#ddd] rounded-lg text-sm outline-none focus:border-[#007CB1]">
                        <option value="">Select...</option>
                        {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#555] mb-1">Certificate number <span className="text-[#aaa]">(optional)</span></label>
                      <input value={certNumber} onChange={e => setCertNumber(e.target.value)} placeholder="FAA certificate #"
                        className="w-full px-3 py-2.5 border border-[#ddd] rounded-lg text-sm outline-none focus:border-[#007CB1]" />
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={back} className="px-4 py-2.5 border border-[#ddd] rounded-lg text-sm text-[#666] hover:bg-[#f5f5f5]">Back</button>
                <button onClick={async () => { await saveProfile(); next(); }} disabled={!firstName.trim() || saving}
                  className="flex-1 py-2.5 bg-[#007CB1] text-white rounded-lg text-sm font-semibold hover:bg-[#006a9a] disabled:opacity-50">
                  {saving ? 'Saving...' : 'Continue'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Aircraft */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-[#0D1B2A] mb-1">Your aircraft</h2>
              <p className="text-[#666] text-sm mb-6">Add the aircraft you'd like to track</p>
              <div className="space-y-4">
                {aircraft.map((ac, i) => (
                  <div key={i} className="border border-[#e5e7eb] rounded-lg p-4 space-y-3">
                    {i > 0 && <p className="text-xs font-medium text-[#007CB1]">Aircraft {i + 1}</p>}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[#555] mb-1">Tail number</label>
                        <input value={ac.tail_number} onChange={e => updateAircraft(i, 'tail_number', e.target.value)}
                          placeholder="N12345" className="w-full px-3 py-2 border border-[#ddd] rounded-lg text-sm outline-none focus:border-[#007CB1] uppercase" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#555] mb-1">Year</label>
                        <input value={ac.year} onChange={e => updateAircraft(i, 'year', e.target.value)}
                          placeholder="2020" type="number" className="w-full px-3 py-2 border border-[#ddd] rounded-lg text-sm outline-none focus:border-[#007CB1]" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#555] mb-1">Nickname <span className="text-[#aaa]">(optional)</span></label>
                      <input value={ac.nickname} onChange={e => updateAircraft(i, 'nickname', e.target.value)}
                        placeholder='e.g. "The Blue Baron"' className="w-full px-3 py-2 border border-[#ddd] rounded-lg text-sm outline-none focus:border-[#007CB1]" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[#555] mb-1">Storage</label>
                        <select value={ac.storage_type} onChange={e => updateAircraft(i, 'storage_type', e.target.value)}
                          className="w-full px-3 py-2 border border-[#ddd] rounded-lg text-sm outline-none focus:border-[#007CB1]">
                          <option value="">Select...</option>
                          <option value="hangar">Hangar</option>
                          <option value="t_hangar">T-Hangar</option>
                          <option value="tie_down">Tie-down</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#555] mb-1">Home airport</label>
                        <input value={ac.home_airport} onChange={e => updateAircraft(i, 'home_airport', e.target.value)}
                          placeholder="KCNO" className="w-full px-3 py-2 border border-[#ddd] rounded-lg text-sm outline-none focus:border-[#007CB1] uppercase" />
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={addAircraft} className="text-[#007CB1] text-sm font-medium hover:underline">+ Add another aircraft</button>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={back} className="px-4 py-2.5 border border-[#ddd] rounded-lg text-sm text-[#666] hover:bg-[#f5f5f5]">Back</button>
                <button onClick={async () => { await saveAircraft(); next(); }} disabled={saving}
                  className="flex-1 py-2.5 bg-[#007CB1] text-white rounded-lg text-sm font-semibold hover:bg-[#006a9a] disabled:opacity-50">
                  {saving ? 'Saving...' : 'Continue'}
                </button>
              </div>
              <button onClick={next} className="w-full mt-2 text-[#999] text-xs hover:underline text-center">Skip for now</button>
            </div>
          )}

          {/* Step 3: Notifications */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold text-[#0D1B2A] mb-1">Notifications</h2>
              <p className="text-[#666] text-sm mb-6">What would you like to be notified about?</p>
              <div className="space-y-3">
                {[
                  { key: 'quote_ready', label: 'Quote ready for review' },
                  { key: 'job_scheduled', label: 'Job scheduled' },
                  { key: 'job_completed', label: 'Job completed with photos' },
                  { key: 'service_reminder', label: 'Service reminders' },
                  { key: 'promotions', label: 'Promotional offers' },
                ].map(n => (
                  <label key={n.key} className="flex items-center gap-3 p-3 border border-[#e5e7eb] rounded-lg cursor-pointer hover:bg-[#f9f9f9]">
                    <input type="checkbox" checked={notifPrefs[n.key] || false}
                      onChange={e => setNotifPrefs({ ...notifPrefs, [n.key]: e.target.checked })}
                      className="w-4 h-4 rounded accent-[#007CB1]" />
                    <span className="text-sm text-[#333]">{n.label}</span>
                  </label>
                ))}
              </div>
              <div className="border-t border-[#e5e7eb] mt-5 pt-5">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div onClick={() => setSmsEnabled(!smsEnabled)}
                    className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${smsEnabled ? 'bg-[#007CB1]' : 'bg-[#ddd]'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${smsEnabled ? 'translate-x-5' : ''}`} />
                  </div>
                  <span className="text-sm text-[#333]">Also notify me via SMS</span>
                </label>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={back} className="px-4 py-2.5 border border-[#ddd] rounded-lg text-sm text-[#666] hover:bg-[#f5f5f5]">Back</button>
                <button onClick={completeOnboarding} disabled={saving}
                  className="flex-1 py-2.5 bg-[#007CB1] text-white rounded-lg text-sm font-semibold hover:bg-[#006a9a] disabled:opacity-50">
                  {saving ? 'Finishing...' : 'Complete Setup'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
