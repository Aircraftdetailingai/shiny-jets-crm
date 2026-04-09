"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { STRIPE_COUNTRIES } from '@/lib/currency';
import PhoneInput from '@/components/PhoneInput';
import { TERMS_VERSION } from '@/lib/terms';
import { generateThemeFromPrimary, applyThemeToCss, applyFullTheme } from '@/lib/theme';
import { generatePalettes } from '@/lib/color-utils';
import LoadingSpinner from '@/components/LoadingSpinner';

const ONBOARDING_SERVICES = [
  { name: 'Maintenance Wash', description: 'Routine aircraft exterior wash', hours_field: 'ext_wash_hours', defaultRate: 85 },
  { name: 'Decon Wash', description: 'Iron removal and clay bar decontamination', hours_field: 'ext_wash_hours', defaultRate: 95 },
  { name: 'One-Step Polish', description: 'Single-stage paint correction polish', hours_field: 'polish_hours', defaultRate: 100 },
  { name: 'Wax', description: 'Full exterior wax protection', hours_field: 'wax_hours', defaultRate: 90 },
  { name: 'Spray Ceramic', description: 'Spray-on ceramic maintenance coating', hours_field: 'spray_ceramic_hours', defaultRate: 95 },
  { name: 'Ceramic Coating', description: 'Professional ceramic paint protection', hours_field: 'ceramic_hours', defaultRate: 120 },
  { name: 'Vacuum', description: 'Full interior vacuum', hours_field: 'int_detail_hours', defaultRate: 75 },
  { name: 'Carpet Extraction', description: 'Deep carpet extraction cleaning', hours_field: 'carpet_hours', defaultRate: 85 },
  { name: 'Leather Clean', description: 'Leather cleaning and conditioning', hours_field: 'leather_hours', defaultRate: 90 },
];

const STEP_LABELS = ['Business', 'Services', 'Branding', 'Invite'];

function ProgressBar({ current }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        {STEP_LABELS.map((label, i) => {
          const stepNum = i + 1;
          const done = current > stepNum;
          const active = current === stepNum;
          return (
            <div key={label} className="flex flex-col items-center" style={{ width: `${100 / STEP_LABELS.length}%` }}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                done ? 'bg-v-gold text-white'
                : active ? 'bg-v-gold/20 text-v-gold border border-v-gold'
                : 'bg-v-charcoal text-v-text-secondary border border-v-border'
              }`}>
                {done ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : stepNum}
              </div>
              <span className={`text-[10px] mt-1.5 uppercase tracking-wider ${active ? 'text-v-gold' : 'text-v-text-secondary/60'}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="w-full bg-v-border/50 rounded-full h-1">
        <div
          className="bg-v-gold h-1 rounded-full transition-all duration-500"
          style={{ width: `${((current - 1) / STEP_LABELS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [screen, setScreen] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');

  // Screen 0: Welcome
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Screen 1: Business Profile
  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [homeAirport, setHomeAirport] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);

  // Screen 2: Services
  const [selectedServices, setSelectedServices] = useState({});
  const [serviceRates, setServiceRates] = useState({});
  const [customServices, setCustomServices] = useState([]);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customRate, setCustomRate] = useState('');

  // Screen 3: Branding
  const [extractedColors, setExtractedColors] = useState([]);
  const [extractedPalettes, setExtractedPalettes] = useState([]);
  const [selectedColor, setSelectedColor] = useState('#007CB1');
  const [portalTheme, setPortalTheme] = useState('dark');

  // Screen 4: Invite a Fellow Detailer
  const [referralCode, setReferralCode] = useState('');
  const [referralEmail, setReferralEmail] = useState('');
  const [referralSent, setReferralSent] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Resume support
  const [savedServiceCount, setSavedServiceCount] = useState(0);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  useEffect(() => {
    const t = localStorage.getItem('vector_token');
    const stored = localStorage.getItem('vector_user');
    if (!t || !stored) { router.push('/login'); return; }
    setToken(t);

    fetch('/api/onboarding', { headers: { Authorization: `Bearer ${t}` } })
      .then(res => res.json())
      .then(data => {
        if (data.onboarding_complete) { router.push('/dashboard'); return; }
        if (data.onboarding_step > 0 && data.onboarding_step <= 5) setScreen(data.onboarding_step);
        if (data.company) setCompany(data.company);
        if (data.name) setName(data.name);
        if (data.phone) setPhone(data.phone);
        if (data.country) setCountry(data.country);
        if (data.home_airport) setHomeAirport(data.home_airport);
        if (data.logo_url) setLogoUrl(data.logo_url);
        if (data.theme_primary && data.theme_primary !== '#007CB1') setSelectedColor(data.theme_primary);
        if (data.theme_colors?.length > 0) {
          setExtractedColors(data.theme_colors);
          setExtractedPalettes(generatePalettes(data.theme_colors[0], data.theme_colors));
        }
        if (data.portal_theme) setPortalTheme(data.portal_theme);
        if (data.service_count) setSavedServiceCount(data.service_count);
        // Pre-fetch referral code if resuming at step 4+
        if (data.onboarding_step >= 4) {
          fetch('/api/referrals', { headers: { Authorization: `Bearer ${t}` } })
            .then(r => r.json())
            .then(d => { if (d.referral_code) setReferralCode(d.referral_code); })
            .catch(() => {});
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  const goNext = () => { setError(''); setScreen(s => s + 1); };
  const goBack = () => { setError(''); setScreen(s => Math.max(0, s - 1)); };

  const handleSkip = async () => {
    setSaving(true);
    try {
      await fetch('/api/onboarding', { method: 'POST', headers, body: JSON.stringify({ action: 'skip' }) });
    } catch {}
    router.push('/dashboard');
  };

  // Screen 1: Save profile
  const saveProfile = async () => {
    if (!company.trim()) { setError('Company name is required'); return; }
    if (!name.trim()) { setError('Your name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST', headers,
        body: JSON.stringify({
          action: 'save_profile', company, name, phone, country, home_airport: homeAirport,
          agreed_to_terms_at: new Date().toISOString(), terms_accepted_version: TERMS_VERSION,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save profile'); return; }
      if (data.user) localStorage.setItem('vector_user', JSON.stringify(data.user));
      goNext();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  // Logo upload handler
  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError('Logo must be under 2MB'); return; }
    setLogoUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const t = token || localStorage.getItem('vector_token');
      const res = await fetch('/api/user/branding/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.logo_url) {
        setLogoUrl(data.logo_url);
        // Auto-extract colors
        try {
          const colRes = await fetch('/api/user/extract-colors', {
            method: 'POST',
            headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ logo_url: data.logo_url }),
          });
          if (colRes.ok) {
            const colData = await colRes.json();
            if (colData.rawColors?.length > 0) setExtractedColors(colData.rawColors);
            if (colData.palettes?.length > 0) setExtractedPalettes(colData.palettes);
            if (colData.rawColors?.[0]) setSelectedColor(colData.rawColors[0]);
          }
        } catch {}
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (err) { setError('Upload failed'); }
    finally { setLogoUploading(false); }
  };

  // Screen 2: Save services
  const saveServices = async () => {
    const chosen = ONBOARDING_SERVICES.filter((_, i) => selectedServices[i]);
    const allServices = [
      ...chosen.map(svc => ({
        name: svc.name,
        description: svc.description,
        hourly_rate: parseFloat(serviceRates[svc.name]) || svc.defaultRate,
        hours_field: svc.hours_field,
      })),
      ...customServices.map(cs => ({
        name: cs.name,
        description: '',
        hourly_rate: parseFloat(cs.rate) || 85,
        hours_field: 'ext_wash_hours',
      })),
    ];
    if (allServices.length === 0) { setError('Select at least one service'); return; }
    setSaving(true);
    setError('');
    try {
      const importRes = await fetch('/api/services/import', { method: 'POST', headers, body: JSON.stringify({ services: allServices }) });
      if (!importRes.ok) { const d = await importRes.json(); setError(d.error || 'Failed to save services'); return; }
      await fetch('/api/onboarding', { method: 'POST', headers, body: JSON.stringify({ action: 'save_services' }) });
      goNext();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  // Screen 3: Save branding
  const saveBranding = async () => {
    setSaving(true);
    setError('');
    try {
      const theme = generateThemeFromPrimary(selectedColor);
      const brandRes = await fetch('/api/user/branding', {
        method: 'POST', headers,
        body: JSON.stringify({
          theme_primary: theme.primary,
          theme_accent: theme.accent,
          theme_bg: theme.bg,
          theme_surface: theme.surface,
          portal_theme: portalTheme,
          theme_logo_url: logoUrl || null,
        }),
      });
      if (!brandRes.ok) { const d = await brandRes.json(); setError(d.error || 'Failed to save branding'); return; }
      // Update localStorage so sidebar picks up the color and mode
      try {
        const stored = JSON.parse(localStorage.getItem('vector_user') || '{}');
        stored.theme_primary = selectedColor;
        stored.portal_theme = portalTheme;
        stored.theme_logo_url = logoUrl || null;
        localStorage.setItem('vector_user', JSON.stringify(stored));
      } catch {}
      applyFullTheme(portalTheme, selectedColor);
      await fetch('/api/onboarding', { method: 'POST', headers, body: JSON.stringify({ action: 'save_step', step: 3 }) });
      fetchReferralCode();
      goNext();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  // Screen 4: Fetch referral code
  const fetchReferralCode = async () => {
    try {
      const res = await fetch('/api/referrals', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.referral_code) setReferralCode(data.referral_code);
      }
    } catch {}
  };

  const referralLink = referralCode ? `https://crm.shinyjets.com/signup?ref=${referralCode}` : '';

  const copyReferralLink = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const sendReferralInvite = async () => {
    if (!referralEmail.trim()) { setError('Email is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/referrals/invite', {
        method: 'POST', headers,
        body: JSON.stringify({ email: referralEmail }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to send invite'); return; }
      await fetch('/api/onboarding', { method: 'POST', headers, body: JSON.stringify({ action: 'save_step', step: 4 }) });
      setReferralSent(true);
      setTimeout(() => goNext(), 1500);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  // Screen 5: Complete
  const completeOnboarding = async () => {
    setSaving(true);
    try {
      await fetch('/api/onboarding', { method: 'POST', headers, body: JSON.stringify({ action: 'complete' }) });
    } catch {}
    router.push('/dashboard');
  };

  if (loading) return <LoadingSpinner message="Loading..." />;

  const chosenCount = Object.values(selectedServices).filter(Boolean).length + customServices.length || savedServiceCount;
  const previewTheme = generateThemeFromPrimary(selectedColor);

  // ─── Screen 0: Welcome ─────────────────────────────────────────
  if (screen === 0) {
    return (
      <div className="page-transition min-h-screen bg-v-charcoal flex flex-col items-center justify-center p-6 relative">
        <div className="text-center max-w-md">
          <h1 className="font-heading text-3xl sm:text-4xl tracking-wider text-v-gold mb-4">
            Welcome to Shiny Jets CRM
          </h1>
          <p className="text-v-text-secondary text-lg mb-10">
            Let&apos;s get your business set up
          </p>

          <div className="space-y-3 text-left max-w-xs mx-auto mb-10">
            {['Set up your business profile', 'Choose your services & rates', 'Customize your branding', 'Invite a detailer — earn 1 month free'].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full border border-v-gold/40 text-v-gold flex items-center justify-center text-xs font-semibold">
                  {i + 1}
                </div>
                <span className="text-v-text-secondary text-sm">{item}</span>
              </div>
            ))}
          </div>

          <label className="flex items-start gap-3 text-sm text-v-text-secondary mb-6 cursor-pointer text-left">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-v-gold"
            />
            <span>
              I agree to the{' '}
              <a href="/terms" target="_blank" rel="noreferrer" className="text-v-gold hover:text-v-gold-dim underline underline-offset-2">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/privacy" target="_blank" rel="noreferrer" className="text-v-gold hover:text-v-gold-dim underline underline-offset-2">
                Privacy Policy
              </a>
            </span>
          </label>

          <button
            onClick={goNext}
            disabled={!agreedToTerms}
            className="w-full py-3 bg-v-gold text-white font-semibold text-lg hover:bg-v-gold-dim transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Get Started
          </button>
        </div>

        <button
          onClick={handleSkip}
          disabled={saving || !agreedToTerms}
          className="absolute bottom-8 right-8 text-sm text-v-text-secondary/60 hover:text-v-text-primary transition-colors disabled:opacity-30"
        >
          {saving ? 'Skipping...' : 'Skip for now'}
        </button>
      </div>
    );
  }

  // ─── Screens 1–4: Card Layout ──────────────────────────────────
  return (
    <div className="page-transition min-h-screen bg-v-charcoal flex items-center justify-center p-4">
      <div className="bg-v-surface border border-v-border rounded-sm shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="p-6 sm:p-8">
          {screen >= 1 && screen <= 4 && <ProgressBar current={screen} />}

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded">
              {error}
            </div>
          )}

          {/* ─── Screen 1: Business Profile ─── */}
          {screen === 1 && (
            <div>
              <h2 className="font-heading text-2xl text-v-gold uppercase tracking-wider mb-1">Business Profile</h2>
              <p className="text-v-text-secondary text-sm mb-6">Tell us about your detailing business</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1.5">
                    Company Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text" value={company} onChange={(e) => setCompany(e.target.value)}
                    placeholder="e.g., Elite Aviation Detail"
                    className="w-full bg-v-charcoal border border-v-border text-v-text-primary px-4 py-2.5 text-sm focus:border-v-gold focus:outline-none placeholder:text-v-text-secondary/40"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1.5">
                    Your Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="First and last name"
                    className="w-full bg-v-charcoal border border-v-border text-v-text-primary px-4 py-2.5 text-sm focus:border-v-gold focus:outline-none placeholder:text-v-text-secondary/40"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1.5">Phone Number</label>
                  <PhoneInput
                    value={phone}
                    onChange={(val) => setPhone(val)}
                    className="w-full bg-v-charcoal border border-v-border text-v-text-primary px-4 py-2.5 text-sm focus-within:border-v-gold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-v-text-secondary mb-1.5">Country</label>
                    <select
                      value={country} onChange={(e) => setCountry(e.target.value)}
                      className="w-full bg-v-charcoal border border-v-border text-v-text-primary px-3 py-2.5 text-sm focus:border-v-gold focus:outline-none"
                    >
                      <option value="">Select...</option>
                      {STRIPE_COUNTRIES.map(c => (
                        <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-v-text-secondary mb-1.5">Home Airport</label>
                    <input
                      type="text" value={homeAirport}
                      onChange={(e) => setHomeAirport(e.target.value.toUpperCase().slice(0, 4))}
                      placeholder="ICAO e.g. KFLL"
                      className="w-full bg-v-charcoal border border-v-border text-v-text-primary px-4 py-2.5 text-sm focus:border-v-gold focus:outline-none placeholder:text-v-text-secondary/40 uppercase"
                    />
                  </div>
                </div>

                {/* Logo Upload */}
                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1.5">Company Logo <span className="text-v-text-secondary/50">(optional)</span></label>
                  <div className="flex items-center gap-4">
                    {logoUrl ? (
                      <div className="w-14 h-14 bg-v-charcoal border border-v-border rounded flex items-center justify-center overflow-hidden">
                        <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-14 h-14 bg-v-charcoal border border-v-border border-dashed rounded flex items-center justify-center">
                        <svg className="w-5 h-5 text-v-text-secondary/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                        </svg>
                      </div>
                    )}
                    <label className="cursor-pointer px-4 py-2 border border-v-border text-v-text-secondary text-sm hover:border-v-gold hover:text-v-gold transition-colors">
                      {logoUploading ? 'Uploading...' : logoUrl ? 'Change' : 'Upload'}
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} className="hidden" disabled={logoUploading} />
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-between items-center">
                <button onClick={goBack} className="text-v-text-secondary text-sm hover:text-v-text-primary transition-colors">Back</button>
                <button onClick={saveProfile} disabled={saving}
                  className="px-8 py-2.5 bg-v-gold text-white font-semibold text-sm hover:bg-v-gold-dim transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Next'}
                </button>
              </div>
            </div>
          )}

          {/* ─── Screen 2: Services ─── */}
          {screen === 2 && (
            <div>
              <h2 className="font-heading text-2xl text-v-gold uppercase tracking-wider mb-1">Your Services</h2>
              <p className="text-v-text-secondary text-sm mb-6">Select services you offer and set your hourly rates</p>

              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {ONBOARDING_SERVICES.map((svc, i) => {
                  const checked = selectedServices[i] || false;
                  return (
                    <div key={svc.name}
                      onClick={() => setSelectedServices(prev => ({ ...prev, [i]: !prev[i] }))}
                      className={`flex items-center p-3 border rounded cursor-pointer transition-colors ${
                        checked ? 'bg-v-gold/5 border-v-gold/40' : 'border-v-border hover:border-v-border/80'
                      }`}>
                      <input
                        type="checkbox" checked={checked} readOnly
                        className="w-4 h-4 rounded accent-v-gold mr-3 pointer-events-none"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-v-text-primary">{svc.name}</span>
                        <span className="text-xs text-v-text-secondary/60 block">{svc.description}</span>
                      </div>
                      {checked ? (
                        <div className="flex items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                          <span className="text-v-text-secondary text-xs">$</span>
                          <input
                            type="number"
                            value={serviceRates[svc.name] ?? ''}
                            onChange={(e) => setServiceRates(prev => ({ ...prev, [svc.name]: e.target.value }))}
                            placeholder={String(svc.defaultRate)}
                            className="w-16 bg-v-charcoal border border-v-border text-v-text-primary px-2 py-1 text-sm text-right focus:border-v-gold focus:outline-none"
                          />
                          <span className="text-v-text-secondary text-xs">/hr</span>
                        </div>
                      ) : (
                        <span className="text-xs text-v-text-secondary/50 ml-2">${svc.defaultRate}/hr</span>
                      )}
                    </div>
                  );
                })}

                {/* Custom services */}
                {customServices.map((cs, i) => (
                  <div key={`custom-${i}`} className="flex items-center p-3 border border-v-gold/40 bg-v-gold/5 rounded">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-v-text-primary">{cs.name}</span>
                      <span className="text-xs text-v-text-secondary/60 block">Custom service</span>
                    </div>
                    <span className="text-xs text-v-text-secondary mr-2">${cs.rate}/hr</span>
                    <button onClick={() => setCustomServices(prev => prev.filter((_, j) => j !== i))}
                      className="text-red-400/60 hover:text-red-400 text-xs">&times;</button>
                  </div>
                ))}
              </div>

              {/* Add custom service */}
              {showAddCustom ? (
                <div className="mt-3 flex gap-2 items-end">
                  <div className="flex-1">
                    <input type="text" value={customName} onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Service name"
                      className="w-full bg-v-charcoal border border-v-border text-v-text-primary px-3 py-2 text-sm focus:border-v-gold focus:outline-none placeholder:text-v-text-secondary/40" />
                  </div>
                  <div className="w-20">
                    <input type="number" value={customRate} onChange={(e) => setCustomRate(e.target.value)}
                      placeholder="$/hr"
                      className="w-full bg-v-charcoal border border-v-border text-v-text-primary px-2 py-2 text-sm text-right focus:border-v-gold focus:outline-none placeholder:text-v-text-secondary/40" />
                  </div>
                  <button onClick={() => {
                    if (customName.trim()) {
                      setCustomServices(prev => [...prev, { name: customName.trim(), rate: customRate || '85' }]);
                      setCustomName(''); setCustomRate(''); setShowAddCustom(false);
                    }
                  }} className="px-3 py-2 bg-v-gold text-white text-sm hover:bg-v-gold-dim">Add</button>
                  <button onClick={() => { setShowAddCustom(false); setCustomName(''); setCustomRate(''); }}
                    className="px-2 py-2 text-v-text-secondary text-sm hover:text-v-text-primary">&times;</button>
                </div>
              ) : (
                <button onClick={() => setShowAddCustom(true)}
                  className="mt-3 text-v-gold text-sm hover:text-v-gold-dim transition-colors">
                  + Add Custom Service
                </button>
              )}

              <div className="mt-3 text-right">
                <span className="text-xs text-v-text-secondary/60">{chosenCount} selected</span>
              </div>

              <div className="mt-6 flex justify-between items-center">
                <button onClick={goBack} className="text-v-text-secondary text-sm hover:text-v-text-primary transition-colors">Back</button>
                <button onClick={saveServices} disabled={saving}
                  className="px-8 py-2.5 bg-v-gold text-white font-semibold text-sm hover:bg-v-gold-dim transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Next'}
                </button>
              </div>
            </div>
          )}

          {/* ─── Screen 3: Branding ─── */}
          {screen === 3 && (
            <div>
              <h2 className="font-heading text-2xl text-v-gold uppercase tracking-wider mb-1">Branding</h2>
              <p className="text-v-text-secondary text-sm mb-6">Customize how your quotes and portal look to customers</p>

              {/* Logo section */}
              {!logoUrl ? (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-v-text-secondary mb-2">Company Logo</label>
                  <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-v-border rounded cursor-pointer hover:border-v-gold/50 transition-colors">
                    <svg className="w-6 h-6 text-v-text-secondary/40 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <span className="text-xs text-v-text-secondary/50">{logoUploading ? 'Uploading...' : 'Click to upload logo'}</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} className="hidden" disabled={logoUploading} />
                  </label>
                </div>
              ) : (
                <div className="mb-6 flex items-center gap-3">
                  <div className="w-12 h-12 bg-v-charcoal border border-v-border rounded flex items-center justify-center overflow-hidden">
                    <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                  </div>
                  <div>
                    <p className="text-sm text-v-text-primary">Logo uploaded</p>
                    <label className="text-xs text-v-gold cursor-pointer hover:text-v-gold-dim">
                      Change
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} className="hidden" disabled={logoUploading} />
                    </label>
                  </div>
                </div>
              )}

              {/* Extracted colors from logo */}
              {extractedColors.length > 0 && (
                <div className="mb-5">
                  <label className="block text-xs font-medium text-v-text-secondary/60 uppercase tracking-wider mb-2">Colors from your logo</label>
                  <div className="flex items-center gap-2">
                    {extractedColors.map((hex, i) => (
                      <button key={hex + i} onClick={() => setSelectedColor(hex)} title={hex}
                        className="group relative">
                        <div className={`w-7 h-7 rounded-full border-2 transition-all ${
                          selectedColor?.toLowerCase() === hex.toLowerCase()
                            ? 'border-white scale-110 shadow-[0_0_6px_rgba(255,255,255,0.3)]'
                            : 'border-v-border/50 hover:border-v-text-secondary/50 hover:scale-105'
                        }`} style={{ background: hex }} />
                      </button>
                    ))}
                    <button onClick={() => setSelectedColor('#007CB1')} title="Default gold"
                      className="group relative ml-1">
                      <div className={`w-7 h-7 rounded-full border-2 transition-all ${
                        selectedColor === '#007CB1'
                          ? 'border-white scale-110 shadow-[0_0_6px_rgba(201,168,76,0.4)]'
                          : 'border-v-border/50 hover:border-v-text-secondary/50 hover:scale-105'
                      }`} style={{ background: '#007CB1' }} />
                    </button>
                  </div>
                </div>
              )}

              {/* Palette combos */}
              {extractedPalettes.length > 0 ? (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-v-text-secondary mb-2">Choose a palette</label>
                  <div className="space-y-2">
                    {extractedPalettes.map((pal, i) => {
                      const isSelected = selectedColor?.toLowerCase() === pal.primary.toLowerCase();
                      return (
                        <button key={i} onClick={() => setSelectedColor(pal.primary)}
                          className={`w-full text-left p-3 border rounded transition-colors ${
                            isSelected ? 'border-v-gold bg-v-gold/5' : 'border-v-border hover:border-v-border/80'
                          }`}>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1 shrink-0">
                              <div className="w-8 h-8 rounded" style={{ background: pal.primary }} />
                              <div className="w-5 h-8 rounded" style={{ background: pal.secondary }} />
                              <div className="w-4 h-8 rounded" style={{ background: pal.neutral }} />
                            </div>
                            <div className="min-w-0">
                              <p className={`text-sm font-medium ${isSelected ? 'text-v-gold' : 'text-v-text-primary'}`}>{pal.name}</p>
                              <p className="text-[11px] text-v-text-secondary/60 truncate">{pal.description}</p>
                            </div>
                            {isSelected && (
                              <svg className="w-4 h-4 text-v-gold ml-auto shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                <path d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-v-text-secondary mb-2">Accent Color</label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button onClick={() => setSelectedColor('#007CB1')} className="group flex flex-col items-center gap-1" title="Default">
                      <div className={`w-10 h-10 rounded-full border-2 transition-all ${
                        selectedColor === '#007CB1' ? 'border-white scale-110 shadow-[0_0_8px_rgba(201,168,76,0.5)]' : 'border-transparent hover:border-v-text-secondary/50 hover:scale-105'
                      }`} style={{ background: '#007CB1' }} />
                      <span className="text-[9px] text-v-text-secondary/60">Default</span>
                    </button>
                    <p className="text-xs text-v-text-secondary/40 italic">Upload a logo to generate brand palettes</p>
                  </div>
                </div>
              )}

              {/* Portal Theme Toggle */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-v-text-secondary mb-2">Customer Portal Theme</label>
                <div className="flex gap-2">
                  <button onClick={() => setPortalTheme('dark')}
                    className={`flex-1 py-2.5 text-sm font-medium border transition-colors ${
                      portalTheme === 'dark' ? 'border-v-gold bg-v-gold/10 text-v-gold' : 'border-v-border text-v-text-secondary hover:border-v-text-secondary/50'
                    }`}>
                    Dark
                  </button>
                  <button onClick={() => setPortalTheme('light')}
                    className={`flex-1 py-2.5 text-sm font-medium border transition-colors ${
                      portalTheme === 'light' ? 'border-v-gold bg-v-gold/10 text-v-gold' : 'border-v-border text-v-text-secondary hover:border-v-text-secondary/50'
                    }`}>
                    Light
                  </button>
                </div>
              </div>

              {/* Live Preview */}
              <div className="border border-v-border rounded overflow-hidden">
                <p className="text-[9px] uppercase tracking-widest text-v-text-secondary/40 px-4 pt-3">Preview</p>
                <div className="p-4" style={{
                  background: portalTheme === 'dark' ? (previewTheme.bg || '#0A0E17') : '#F5F5F5',
                  color: portalTheme === 'dark' ? '#F5F5F5' : '#1A1A1A',
                }}>
                  <div className="rounded p-3" style={{
                    background: portalTheme === 'dark' ? (previewTheme.surface || '#111827') : '#FFFFFF',
                    border: portalTheme === 'light' ? '1px solid #E5E7EB' : 'none',
                  }}>
                    <div className="flex items-center gap-2 mb-2">
                      {logoUrl && <img src={logoUrl} alt="" className="h-5 object-contain" />}
                      <div className="h-2 rounded w-16" style={{ background: previewTheme.primary }} />
                    </div>
                    <div className="space-y-1 mb-3">
                      <div className="h-1.5 rounded w-full" style={{ background: portalTheme === 'dark' ? 'rgba(255,255,255,0.06)' : '#F3F4F6' }} />
                      <div className="h-1.5 rounded w-3/4" style={{ background: portalTheme === 'dark' ? 'rgba(255,255,255,0.06)' : '#F3F4F6' }} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold" style={{ color: previewTheme.primary }}>$4,250</span>
                      <div className="flex gap-1.5">
                        <span className="px-2 py-1 rounded text-[9px] font-medium" style={{ background: previewTheme.primary, color: portalTheme === 'dark' ? previewTheme.bg : '#FFFFFF' }}>
                          Accept
                        </span>
                        <span className="px-2 py-1 rounded text-[9px] border" style={{ borderColor: previewTheme.primary, color: previewTheme.primary }}>
                          PDF
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-between items-center">
                <button onClick={goBack} className="text-v-text-secondary text-sm hover:text-v-text-primary transition-colors">Back</button>
                <button onClick={saveBranding} disabled={saving}
                  className="px-8 py-2.5 bg-v-gold text-white font-semibold text-sm hover:bg-v-gold-dim transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Next'}
                </button>
              </div>
            </div>
          )}

          {/* ─── Screen 4: Invite a Fellow Detailer ─── */}
          {screen === 4 && (
            <div>
              <h2 className="font-heading text-2xl text-v-gold uppercase tracking-wider mb-1">Invite a Fellow Detailer</h2>
              <p className="text-v-text-secondary text-sm mb-2">
                Know another aircraft detailer? Invite them and earn 1 month free Pro.
              </p>
              <p className="text-v-text-secondary/70 text-xs mb-6">
                When they sign up using your link, you&apos;ll receive 1 free month of Pro automatically.
              </p>

              {referralSent ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-full bg-v-gold/10 border border-v-gold/30 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-v-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-v-gold font-medium">Invite sent!</p>
                  <p className="text-v-text-secondary text-sm mt-1">You&apos;ll earn 1 month free Pro when they join</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Referral Link */}
                  {referralCode ? (
                    <div>
                      <label className="block text-sm font-medium text-v-text-secondary mb-2">Your referral link:</label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-v-charcoal border border-v-border rounded px-3 py-2.5 text-xs text-v-text-primary font-mono truncate select-all">
                          {referralLink}
                        </div>
                        <button onClick={copyReferralLink}
                          className={`shrink-0 px-4 py-2.5 text-sm font-medium rounded border transition-colors ${
                            linkCopied
                              ? 'bg-green-500/10 border-green-500/30 text-green-400'
                              : 'border-v-gold text-v-gold hover:bg-v-gold/10'
                          }`}>
                          {linkCopied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>

                      {/* QR Code */}
                      <div className="mt-4 flex justify-center">
                        <div className="bg-white rounded-lg p-3">
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(referralLink)}&bgcolor=FFFFFF&color=0F1117`}
                            alt="Referral QR code"
                            width={140}
                            height={140}
                            className="block"
                          />
                        </div>
                      </div>
                      <p className="text-center text-[10px] text-v-text-secondary/40 mt-1">Scan to sign up</p>
                    </div>
                  ) : (
                    <div className="flex justify-center py-4">
                      <div className="w-6 h-6 border-2 border-v-gold border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}

                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="flex-grow border-t border-v-border"></div>
                    <span className="text-v-text-secondary/50 text-[10px] uppercase tracking-widest">or send a personal invite</span>
                    <div className="flex-grow border-t border-v-border"></div>
                  </div>

                  {/* Email Invite */}
                  <div>
                    <label className="block text-sm font-medium text-v-text-secondary mb-1.5">
                      Their email address
                    </label>
                    <input type="email" value={referralEmail} onChange={(e) => setReferralEmail(e.target.value)}
                      placeholder="fellow.detailer@example.com"
                      className="w-full bg-v-charcoal border border-v-border text-v-text-primary px-4 py-2.5 text-sm focus:border-v-gold focus:outline-none placeholder:text-v-text-secondary/40" />
                  </div>

                  <button onClick={sendReferralInvite} disabled={saving || !referralEmail.trim()}
                    className="w-full py-3 bg-v-gold text-white font-semibold text-sm hover:bg-v-gold-dim transition-colors disabled:opacity-50">
                    {saving ? 'Sending...' : 'Send Invite'}
                  </button>
                </div>
              )}

              <div className="mt-6 flex justify-between items-center">
                <button onClick={goBack} className="text-v-text-secondary text-sm hover:text-v-text-primary transition-colors">Back</button>
                {!referralSent && (
                  <button onClick={() => { fetch('/api/onboarding', { method: 'POST', headers, body: JSON.stringify({ action: 'save_step', step: 4 }) }); goNext(); }}
                    className="text-v-text-secondary/60 text-sm hover:text-v-text-primary transition-colors">
                    Skip
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ─── Screen 5: Completion ─── */}
          {screen === 5 && (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-v-gold/10 border border-v-gold/30 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-v-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="font-heading text-3xl text-v-gold uppercase tracking-wider mb-2">You&apos;re All Set!</h2>
              <p className="text-v-text-secondary mb-6">Your Shiny Jets CRM account is ready to go</p>

              <div className="text-left space-y-3 max-w-xs mx-auto mb-6">
                {[
                  { label: 'Business profile', done: !!company },
                  { label: `${chosenCount} service${chosenCount !== 1 ? 's' : ''} configured`, done: chosenCount > 0 },
                  { label: 'Branding customized', done: selectedColor !== '#007CB1' || !!logoUrl },
                  { label: referralSent ? 'Detailer invited' : 'Referral skipped', done: referralSent },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      item.done ? 'bg-v-gold/20 text-v-gold' : 'bg-v-charcoal text-v-text-secondary/50'
                    }`}>
                      {item.done ? (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M5 13l4 4L19 7" /></svg>
                      ) : (
                        <span className="text-xs">—</span>
                      )}
                    </div>
                    <span className={`text-sm ${item.done ? 'text-v-text-primary' : 'text-v-text-secondary/60'}`}>{item.label}</span>
                  </div>
                ))}
              </div>

              <div className="bg-v-gold/10 border border-v-gold/20 rounded p-3 mb-6">
                <p className="text-v-gold text-sm font-medium">+50 points earned for completing onboarding!</p>
              </div>

              <button onClick={completeOnboarding} disabled={saving}
                className="w-full py-3 bg-v-gold text-white font-semibold text-lg hover:bg-v-gold-dim transition-colors disabled:opacity-50">
                {saving ? 'Finishing...' : 'Go to Dashboard'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
