"use client";
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { DEFAULT_PRODUCT_RATIOS, SERVICE_TYPE_LABELS } from '../../lib/product-calculator';
import { setUserCurrency } from '@/lib/currency';
import { currencySymbol } from '@/lib/formatPrice';
import { restartTour } from '@/components/DashboardTour';
import { useTranslation, LANGUAGES } from '@/lib/i18n';

const DEFAULT_ADDON_FEES = [
  { name: 'Hazmat Fee', description: 'Hazardous material handling surcharge', fee_type: 'flat', amount: 250 },
  { name: 'After Hours', description: 'Work performed outside business hours', fee_type: 'flat', amount: 150 },
  { name: 'Weekend', description: 'Weekend service surcharge', fee_type: 'flat', amount: 100 },
  { name: 'Rush / Emergency', description: 'Expedited service premium', fee_type: 'percent', amount: 25 },
  { name: 'Travel Fee', description: 'Per-job travel surcharge', fee_type: 'flat', amount: 50 },
];

function SettingsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { lang: uiLang, setLang: setUiLang } = useTranslation();
  const [user, setUser] = useState(null);
  const [laborRate, setLaborRate] = useState(25);
  const [emailNotifs, setEmailNotifs] = useState({
    quoteCreated: false,
    quoteSent: false,
    weeklySummary: false,
    priceReview: false,
  });
  const [smsAlerts, setSmsAlerts] = useState({
    quoteViewed: false,
    quoteExpiring: false,
  });
  const [smsClient, setSmsClient] = useState({
    quoteDelivery: false,
    followup3: false,
    followup7: false,
    expiration: false,
    jobReminderSms: false,
    paymentConfirmSms: false,
  });
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [priceReminder, setPriceReminder] = useState(6);
  const [quoteDisplayPref, setQuoteDisplayPref] = useState('package');
  const [efficiencyFactor, setEfficiencyFactor] = useState(1.0);
  const [stripeStatus, setStripeStatus] = useState({ connected: false, status: 'UNKNOWN' });
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeMode, setStripeMode] = useState('test');
  const [stripeModeLoading, setStripeModeLoading] = useState(false);
  const [stripeModeError, setStripeModeError] = useState(null);
  const [currency, setCurrency] = useState('USD');
  const [currencies, setCurrencies] = useState([]);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [language, setLanguage] = useState('en');
  const [languages, setLanguages] = useState([]);
  const [minimumFee, setMinimumFee] = useState(0);
  const [minimumFeeLocations, setMinimumFeeLocations] = useState([]);
  const [newLocation, setNewLocation] = useState('');
  const [homeAirport, setHomeAirport] = useState('');

  // Quote viewed notification opt-in
  const [notifyQuoteViewed, setNotifyQuoteViewed] = useState(false);

  // Smart follow-up settings
  const [autoDiscountEnabled, setAutoDiscountEnabled] = useState(false);
  const [followupDiscountPercent, setFollowupDiscountPercent] = useState(10);

  // Platform fee pass-through
  const [passFeeToCustomer, setPassFeeToCustomer] = useState(false);

  // CC fee mode
  const [ccFeeMode, setCcFeeMode] = useState('absorb');

  // Add-on Fees state
  const [addonFees, setAddonFees] = useState([]);
  const [addonLoading, setAddonLoading] = useState(false);
  const [showAddonModal, setShowAddonModal] = useState(false);
  const [editingAddon, setEditingAddon] = useState(null);
  const [newAddon, setNewAddon] = useState({ name: '', description: '', fee_type: 'flat', amount: '' });
  const [addonError, setAddonError] = useState('');

  // Product ratios state
  const [productRatios, setProductRatios] = useState(null);

  // Referral state
  const [referralCode, setReferralCode] = useState('');
  const [referralStats, setReferralStats] = useState({ total: 0, completed: 0, pending: 0, months_earned: 0 });
  const [referralList, setReferralList] = useState([]);
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralCopied, setReferralCopied] = useState(false);

  // Upgrade billing toggle
  const [upgradeBilling, setUpgradeBilling] = useState('monthly');

  // Promo code state
  const [showPromo, setShowPromo] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoValidating, setPromoValidating] = useState(false);
  const [promoResult, setPromoResult] = useState(null); // { valid, description, min_months, ... }
  const [promoError, setPromoError] = useState('');

  // Terms & Conditions state
  const [termsText, setTermsText] = useState('');
  const [termsPdfUrl, setTermsPdfUrl] = useState(null);
  const [termsUpdatedAt, setTermsUpdatedAt] = useState(null);
  const [termsSaving, setTermsSaving] = useState(false);
  const [termsUploading, setTermsUploading] = useState(false);
  const [termsSuccess, setTermsSuccess] = useState('');

  // Branding state
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [themePresets, setThemePresets] = useState([]);
  const [selectedTheme, setSelectedTheme] = useState({ primary: '#C9A84C', accent: '#0D1B2A', bg: '#0A0E17', surface: '#111827', logo_url: null });
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeSuccess, setThemeSuccess] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [fontExtracting, setFontExtracting] = useState(false);
  const [extractedFonts, setExtractedFonts] = useState(null);

  // Profile state
  const [profileName, setProfileName] = useState('');
  const [profileCompany, setProfileCompany] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Sticky save button state
  const [pendingChanges, setPendingChanges] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const markDirty = (field) => {
    setPendingChanges(prev => new Set(prev).add(field));
    setSaveSuccess(false);
  };

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    const stored = localStorage.getItem('vector_user');
    if (!token || !stored) {
      router.push('/login');
      return;
    }
    let u;
    try { u = JSON.parse(stored); } catch { localStorage.removeItem('vector_user'); router.push('/login'); return; }
    setUser(u);
    setProfileName(u.name || '');
    setProfileCompany(u.company || '');
    setProfilePhone(u.phone || '');
    // Refresh user data from server to get latest plan/permissions
    fetch('/api/user/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.user) {
          setUser(data.user);
          setProfileName(data.user.name || '');
          setProfileCompany(data.user.company || '');
          setProfilePhone(data.user.phone || '');
          localStorage.setItem('vector_user', JSON.stringify(data.user));
        }
      })
      .catch(() => {});
    setPriceReminder(u.price_reminder_months || 6);
    setQuoteDisplayPref(u.quote_display_preference || 'package');
    setEfficiencyFactor(u.efficiency_factor || 1.0);
    setLaborRate(u.default_labor_rate || 25);
    setHomeAirport(u.home_airport || '');
      setNotifyQuoteViewed(u.notify_quote_viewed || false);
      setAutoDiscountEnabled(u.notification_settings?.autoDiscountEnabled || false);
      setFollowupDiscountPercent(u.followup_discount_percent || 10);
      setEmailNotifs({
        quoteCreated: u.notification_settings?.quoteCreated || false,
        quoteSent: u.notification_settings?.quoteSent || false,
        weeklySummary: u.notification_settings?.weeklySummary || false,
        priceReview: u.notification_settings?.priceReview || false,
      });
      setSmsAlerts({
        quoteViewed: u.notification_settings?.quoteViewed || false,
        quoteExpiring: u.notification_settings?.quoteExpiring || false,
      });
      setSmsClient({
        quoteDelivery: u.notification_settings?.quoteDelivery || false,
        followup3: u.notification_settings?.followup3 || false,
        followup7: u.notification_settings?.followup7 || false,
        expiration: u.notification_settings?.expiration || false,
        jobReminderSms: u.notification_settings?.jobReminderSms || false,
        paymentConfirmSms: u.notification_settings?.paymentConfirmSms || false,
      });
      // Fetch SMS settings for business/enterprise/admin users
      if (u.plan === 'business' || u.plan === 'enterprise' || u.is_admin) {
        fetch('/api/sms/settings', {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.json()).then(data => {
          setSmsEnabled(data.sms_enabled || false);
        }).catch(() => {});
      }
      // Fetch terms & conditions
      fetch('/api/settings/terms', {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()).then(data => {
        if (data.terms_text) setTermsText(data.terms_text);
        if (data.terms_pdf_url) setTermsPdfUrl(data.terms_pdf_url);
        if (data.terms_updated_at) setTermsUpdatedAt(data.terms_updated_at);
      }).catch(() => {});
  }, [router]);

  const [stripeError, setStripeError] = useState(null);

  useEffect(() => {
    const upgrade = params.get('upgrade');
    if (upgrade === 'business') {
      const el = document.getElementById('smsClients');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }

    // Check for Stripe callback
    const stripeParam = params.get('stripe');
    if (stripeParam === 'success') {
      // Refresh Stripe status
      checkStripeStatus();
    } else if (stripeParam === 'refresh') {
      // User needs to restart onboarding - trigger connect again
      handleConnectStripe();
    } else if (stripeParam === 'error') {
      const message = params.get('message');
      setStripeError(message || 'Failed to connect Stripe');
    }
  }, [params]);

  const checkStripeStatus = async () => {
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/stripe/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStripeStatus(data);
      }
    } catch (err) {
      console.log('Failed to check Stripe status:', err);
    }
  };

  const fetchPassFee = async () => {
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/user/pass-fee', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPassFeeToCustomer(data.pass_fee_to_customer || false);
      }
    } catch (err) {
      console.log('Failed to fetch pass fee setting:', err);
    }
  };

  const savePassFee = async (val) => {
    setPassFeeToCustomer(val);
    try {
      const token = localStorage.getItem('vector_token');
      await fetch('/api/user/pass-fee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pass_fee_to_customer: val }),
      });
      const stored = localStorage.getItem('vector_user');
      if (stored) {
        try { const u = JSON.parse(stored); u.pass_fee_to_customer = val; localStorage.setItem('vector_user', JSON.stringify(u)); } catch {}
      }
    } catch (err) {
      console.error('Failed to save pass fee setting:', err);
    }
  };

  const fetchCcFee = async () => {
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/user/cc-fee', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCcFeeMode(data.cc_fee_mode || 'absorb');
      }
    } catch (err) {
      console.log('Failed to fetch cc fee setting:', err);
    }
  };

  const saveCcFee = async (mode) => {
    setCcFeeMode(mode);
    try {
      const token = localStorage.getItem('vector_token');
      await fetch('/api/user/cc-fee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cc_fee_mode: mode }),
      });
      const stored = localStorage.getItem('vector_user');
      if (stored) {
        try { const u = JSON.parse(stored); u.cc_fee_mode = mode; localStorage.setItem('vector_user', JSON.stringify(u)); } catch {}
      }
    } catch (err) {
      console.error('Failed to save cc fee setting:', err);
    }
  };

  const fetchBranding = async () => {
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/user/branding', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLogoUrl(data.logo_url || null);
        setSelectedTheme({
          primary: data.theme_primary || '#C9A84C',
          accent: data.theme_accent || '#0D1B2A',
          bg: data.theme_bg || '#0A0E17',
          surface: data.theme_surface || '#111827',
          logo_url: data.theme_logo_url || null,
        });
        setWebsiteUrl(data.website_url || '');
        if (data.font_heading || data.font_body) {
          setExtractedFonts({
            heading: data.font_heading || null,
            subheading: data.font_subheading || null,
            body: data.font_body || null,
            embed_url: data.font_embed_url || null,
          });
        }
      }
    } catch {}
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const token = localStorage.getItem('vector_token');
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/user/branding/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLogoUrl(data.logo_url);
      // Auto-extract colors
      const colRes = await fetch('/api/user/extract-colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ logo_url: data.logo_url }),
      });
      if (colRes.ok) {
        const colData = await colRes.json();
        setThemePresets(colData.presets || []);
      }
    } catch (err) {
      console.error('Logo upload failed:', err);
    } finally {
      setLogoUploading(false);
    }
  };

  const saveTheme = async (theme) => {
    setThemeSaving(true);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/user/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          theme_primary: theme.primary,
          theme_accent: theme.accent,
          theme_bg: theme.bg,
          theme_surface: theme.surface,
          theme_logo_url: theme.logo_url || null,
        }),
      });
      if (res.ok) {
        setSelectedTheme(theme);
        setThemeSuccess('Theme saved');
        setTimeout(() => setThemeSuccess(''), 3000);
        // Update localStorage for sidebar
        const stored = localStorage.getItem('vector_user');
        if (stored) {
          try {
            const u = JSON.parse(stored);
            u.theme_primary = theme.primary;
            u.theme_logo_url = theme.logo_url;
            localStorage.setItem('vector_user', JSON.stringify(u));
            document.documentElement.style.setProperty('--v-gold', theme.primary);
          } catch {}
        }
      }
    } catch (err) {
      console.error('Failed to save theme:', err);
    } finally {
      setThemeSaving(false);
    }
  };

  const fetchProductRatios = async () => {
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/user/product-ratios', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ratios) setProductRatios(data.ratios);
      }
    } catch (err) {
      console.log('Failed to fetch product ratios:', err);
    }
  };

  const saveProductRatios = async (ratios) => {
    try {
      const token = localStorage.getItem('vector_token');
      await fetch('/api/user/product-ratios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ratios }),
      });
    } catch (err) {
      console.error('Failed to save product ratios:', err);
    }
  };

  const fetchReferralData = async () => {
    setReferralLoading(true);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/referrals', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setReferralCode(data.referral_code || '');
        setReferralStats(data.stats || { total: 0, completed: 0, pending: 0, months_earned: 0 });
        setReferralList(data.referrals || []);
      }
    } catch (err) {
      console.log('Failed to fetch referral data:', err);
    } finally {
      setReferralLoading(false);
    }
  };

  const fetchStripeMode = async () => {
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/user/stripe-mode', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStripeMode(data.stripe_mode || 'test');
      }
    } catch (err) {
      console.log('Failed to fetch stripe mode:', err);
    }
  };

  const saveStripeMode = async (mode) => {
    setStripeModeLoading(true);
    setStripeModeError(null);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/user/stripe-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stripe_mode: mode }),
      });
      if (res.ok) {
        setStripeMode(mode);
        // Re-check stripe status with new mode
        checkStripeStatus();
      } else {
        const data = await res.json();
        setStripeModeError(data.error || 'Failed to update mode');
      }
    } catch (err) {
      setStripeModeError('Network error');
    } finally {
      setStripeModeLoading(false);
    }
  };

  useEffect(() => {
    checkStripeStatus();
    fetchStripeMode();
    fetchCurrency();
    fetchLanguage();
    fetchMinimumFee();
    fetchAddonFees();
    fetchPassFee();
    fetchCcFee();
    fetchBranding();
    fetchProductRatios();
    fetchReferralData();
  }, []);

  const fetchMinimumFee = async () => {
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/user/minimum-fee', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMinimumFee(parseFloat(data.minimum_callout_fee) || 0);
        setMinimumFeeLocations(data.minimum_fee_locations || []);
      }
    } catch (err) {
      console.log('Failed to fetch minimum fee:', err);
    }
  };

  const saveMinimumFee = async (fee, locations) => {
    try {
      const token = localStorage.getItem('vector_token');
      await fetch('/api/user/minimum-fee', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          minimum_callout_fee: fee,
          minimum_fee_locations: locations,
        }),
      });
    } catch (err) {
      console.error('Failed to save minimum fee:', err);
    }
  };

  const addLocation = () => {
    if (newLocation.trim() && !minimumFeeLocations.includes(newLocation.trim())) {
      const updated = [...minimumFeeLocations, newLocation.trim()];
      setMinimumFeeLocations(updated);
      markDirty('minimumFee');
      setNewLocation('');
    }
  };

  const removeLocation = (loc) => {
    const updated = minimumFeeLocations.filter(l => l !== loc);
    setMinimumFeeLocations(updated);
    markDirty('minimumFee');
  };

  const fetchCurrency = async () => {
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/user/currency', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCurrency(data.currency || 'USD');
        setUserCurrency(data.currency || 'USD');
        setCurrencies(data.currencies || []);
      }
    } catch (err) {
      console.log('Failed to fetch currency:', err);
    }
  };

  const saveCurrency = async (code) => {
    setCurrencyLoading(true);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/user/currency', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currency: code }),
      });
      if (res.ok) {
        setCurrency(code);
        setUserCurrency(code);
        // Update local storage
        const stored = localStorage.getItem('vector_user');
        if (stored) {
          try { const u = JSON.parse(stored); u.currency = code; localStorage.setItem('vector_user', JSON.stringify(u)); } catch {}
        }
      }
    } catch (err) {
      console.error('Failed to save currency:', err);
    } finally {
      setCurrencyLoading(false);
    }
  };

  const fetchLanguage = async () => {
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/user/language', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLanguage(data.language || 'en');
        setLanguages(data.languages || []);
      }
    } catch (err) {
      console.log('Failed to fetch language:', err);
    }
  };

  const saveLanguage = async (code) => {
    try {
      const token = localStorage.getItem('vector_token');
      await fetch('/api/user/language', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ language: code }),
      });
      const stored = localStorage.getItem('vector_user');
      if (stored) {
        try { const u = JSON.parse(stored); u.language = code; localStorage.setItem('vector_user', JSON.stringify(u)); } catch {}
      }
    } catch (err) {
      console.error('Failed to save language:', err);
    }
  };

  const handleConnectStripe = async () => {
    console.log('handleConnectStripe called');
    setStripeLoading(true);
    setStripeError(null);
    try {
      const token = localStorage.getItem('vector_token');
      console.log('Token exists:', !!token);
      if (!token) {
        setStripeError('Not logged in - please refresh and try again');
        return;
      }
      console.log('Calling /api/stripe/connect...');
      const res = await fetch('/api/stripe/connect', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      console.log('Response status:', res.status);
      const data = await res.json();
      console.log('Stripe connect response:', data);
      if (data.url) {
        console.log('Redirecting to:', data.url);
        window.location.href = data.url;
      } else if (data.error) {
        const errorMsg = data.details ? `${data.error}: ${data.details}` : data.error;
        console.error('Stripe error:', errorMsg);
        setStripeError(errorMsg);
      } else {
        console.error('No URL in response:', data);
        setStripeError('No redirect URL received - check console for details');
      }
    } catch (err) {
      console.error('Failed to connect Stripe:', err);
      setStripeError(`Network error: ${err.message}`);
    } finally {
      setStripeLoading(false);
    }
  };

  const saveQuoteDisplayPref = async (pref) => {
    await fetch('/api/user/quote-display', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('vector_token')}`,
      },
      body: JSON.stringify({ quote_display_preference: pref }),
    });
    const newUser = { ...user, quote_display_preference: pref };
    localStorage.setItem('vector_user', JSON.stringify(newUser));
    setUser(newUser);
  };

  const saveEfficiencyFactor = async (factor) => {
    await fetch('/api/user/efficiency-factor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('vector_token')}`,
      },
      body: JSON.stringify({ efficiency_factor: factor }),
    });
    const newUser = { ...user, efficiency_factor: factor };
    localStorage.setItem('vector_user', JSON.stringify(newUser));
    setUser(newUser);
  };

  const saveProfile = async () => {
    await fetch('/api/user/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('vector_token')}`,
      },
      body: JSON.stringify({ name: profileName, company: profileCompany, phone: profilePhone }),
    });
    const newUser = { ...user, name: profileName, company: profileCompany, phone: profilePhone };
    localStorage.setItem('vector_user', JSON.stringify(newUser));
    setUser(newUser);
  };

  const saveLaborRate = async (rate) => {
    await fetch('/api/user/labor-rate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('vector_token')}`,
      },
      body: JSON.stringify({ default_labor_rate: rate }),
    });
    const newUser = { ...user, default_labor_rate: rate };
    localStorage.setItem('vector_user', JSON.stringify(newUser));
    setUser(newUser);
  };

  const handleTermsUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTermsUploading(true);
    setTermsSuccess('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/settings/terms', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('vector_token')}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setTermsPdfUrl(data.terms_pdf_url);
      setTermsText('');
      setTermsUpdatedAt(data.terms_updated_at);
      setTermsSuccess('PDF uploaded successfully');
      setTimeout(() => setTermsSuccess(''), 3000);
    } catch (err) {
      alert(err.message);
    } finally {
      setTermsUploading(false);
      e.target.value = '';
    }
  };

  const saveTermsText = async () => {
    if (!termsText.trim()) return;
    setTermsSaving(true);
    setTermsSuccess('');
    try {
      const res = await fetch('/api/settings/terms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('vector_token')}`,
        },
        body: JSON.stringify({ terms_text: termsText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setTermsPdfUrl(null);
      setTermsUpdatedAt(data.terms_updated_at);
      setTermsSuccess('Terms saved successfully');
      setTimeout(() => setTermsSuccess(''), 3000);
    } catch (err) {
      alert(err.message);
    } finally {
      setTermsSaving(false);
    }
  };

  const deleteTerms = async () => {
    if (!confirm('Remove your terms and conditions?')) return;
    try {
      const res = await fetch('/api/settings/terms', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('vector_token')}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      setTermsText('');
      setTermsPdfUrl(null);
      setTermsUpdatedAt(null);
      setTermsSuccess('Terms removed');
      setTimeout(() => setTermsSuccess(''), 3000);
    } catch (err) {
      alert(err.message);
    }
  };

  const saveHomeAirport = async (code) => {
    await fetch('/api/user/home-airport', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('vector_token')}`,
      },
      body: JSON.stringify({ home_airport: code }),
    });
    const newUser = { ...user, home_airport: code };
    localStorage.setItem('vector_user', JSON.stringify(newUser));
    setUser(newUser);
  };

  const saveFollowupDiscount = async (pct) => {
    await fetch('/api/user/followup-discount', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('vector_token')}`,
      },
      body: JSON.stringify({ followup_discount_percent: pct }),
    });
    const newUser = { ...user, followup_discount_percent: pct };
    localStorage.setItem('vector_user', JSON.stringify(newUser));
    setUser(newUser);
  };

  const saveNotifications = async (settings) => {
    await fetch('/api/user/notification-settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('vector_token')}`,
      },
      body: JSON.stringify(settings),
    });
    const newUser = { ...user, notification_settings: settings, price_reminder_months: priceReminder };
    localStorage.setItem('vector_user', JSON.stringify(newUser));
    setUser(newUser);
  };

  const saveSmsSettings = async (updates) => {
    try {
      await fetch('/api/sms/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('vector_token')}`,
        },
        body: JSON.stringify(updates),
      });
    } catch (err) {
      console.error('Failed to save SMS settings:', err);
    }
  };

  // ---- Add-on Fees CRUD ----
  const getToken = () => localStorage.getItem('vector_token');

  const fetchAddonFees = async () => {
    try {
      const res = await fetch('/api/addon-fees', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAddonFees(data.fees || []);
      }
    } catch (err) {
      console.log('Failed to fetch addon fees:', err);
    }
  };

  const addAddonFee = async () => {
    if (!newAddon.name.trim()) return;
    setAddonLoading(true);
    setAddonError('');
    try {
      const res = await fetch('/api/addon-fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          name: newAddon.name,
          description: newAddon.description,
          fee_type: newAddon.fee_type,
          amount: parseFloat(newAddon.amount) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAddonError(data.error || 'Failed to add fee'); return; }
      setAddonFees([...addonFees, data.fee]);
      setNewAddon({ name: '', description: '', fee_type: 'flat', amount: '' });
      setShowAddonModal(false);
      setAddonError('');
    } catch (err) {
      setAddonError('Network error. Please try again.');
    } finally { setAddonLoading(false); }
  };

  const updateAddonFee = async () => {
    if (!editingAddon) return;
    setAddonLoading(true);
    setAddonError('');
    try {
      const res = await fetch(`/api/addon-fees/${editingAddon.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          name: editingAddon.name,
          description: editingAddon.description,
          fee_type: editingAddon.fee_type,
          amount: parseFloat(editingAddon.amount) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAddonError(data.error || 'Failed to update fee'); return; }
      setAddonFees(addonFees.map(f => f.id === data.fee.id ? data.fee : f));
      setEditingAddon(null);
      setAddonError('');
    } catch (err) {
      setAddonError('Network error. Please try again.');
    } finally { setAddonLoading(false); }
  };

  const deleteAddonFee = async (fee) => {
    if (!confirm(`Delete "${fee.name}"?`)) return;
    try {
      await fetch(`/api/addon-fees/${fee.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
      setAddonFees(addonFees.filter(f => f.id !== fee.id));
    } catch (err) { console.error('Failed to delete:', err); }
  };

  const importDefaultAddons = async () => {
    setAddonLoading(true);
    try {
      for (const fee of DEFAULT_ADDON_FEES) {
        const res = await fetch('/api/addon-fees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify(fee),
        });
        if (res.ok) {
          const data = await res.json();
          setAddonFees(prev => [...prev, data.fee]);
        }
      }
    } catch (err) { console.error('Failed to import:', err); }
    finally { setAddonLoading(false); }
  };

  const validatePromo = async (code) => {
    if (!code.trim()) {
      setPromoResult(null);
      setPromoError('');
      return;
    }
    setPromoValidating(true);
    setPromoError('');
    setPromoResult(null);
    try {
      const res = await fetch('/api/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setPromoResult(data);
      } else {
        setPromoError(data.error || 'Invalid promo code');
      }
    } catch (err) {
      setPromoError('Failed to validate code');
    } finally {
      setPromoValidating(false);
    }
  };

  const saveAllChanges = async () => {
    setSaving(true);
    try {
      const promises = [];
      if (pendingChanges.has('profile')) promises.push(saveProfile());
      if (pendingChanges.has('laborRate')) promises.push(saveLaborRate(parseFloat(laborRate) || 0));
      if (pendingChanges.has('efficiencyFactor')) promises.push(saveEfficiencyFactor(efficiencyFactor));
      if (pendingChanges.has('minimumFee')) promises.push(saveMinimumFee(parseFloat(minimumFee) || 0, []));
      if (pendingChanges.has('currency')) promises.push(saveCurrency(currency));
      if (pendingChanges.has('language')) promises.push(saveLanguage(language));
      // homeAirport removed
      if (pendingChanges.has('passFee')) promises.push(savePassFee(passFeeToCustomer));
      if (pendingChanges.has('ccFee')) promises.push(saveCcFee(ccFeeMode));
      if (pendingChanges.has('quoteDisplay')) promises.push(saveQuoteDisplayPref(quoteDisplayPref));
      if (pendingChanges.has('notifications')) {
        const allNotifs = { ...emailNotifs, ...smsAlerts, ...smsClient, priceReviewMonths: priceReminder, autoDiscountEnabled, notifyQuoteViewed };
        promises.push(saveNotifications(allNotifs));
      }
      if (pendingChanges.has('followupDiscount')) {
        promises.push(saveFollowupDiscount(followupDiscountPercent));
      }
      if (pendingChanges.has('smsEnabled')) promises.push(saveSmsSettings({ sms_enabled: smsEnabled }));
      if (pendingChanges.has('productRatios')) promises.push(saveProductRatios(productRatios || {}));
      await Promise.all(promises);
      setPendingChanges(new Set());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  const hasAllFeatures = user?.is_admin || user?.plan === 'enterprise' || user?.plan === 'business';
  const planPrice = user?.plan === 'enterprise' ? '299' : user?.plan === 'business' ? '149' : user?.plan === 'pro' ? '79' : '0';

  return (
    <div className="space-y-4">
        {/* Fixed Save Bar — always at top when changes pending */}
        {(pendingChanges.size > 0 || saveSuccess) && (
          <>
            {/* Spacer to prevent content from hiding behind fixed bar */}
            <div className="h-14" />
            <div className={`fixed top-0 left-0 right-0 z-50 px-4 py-3 border-b border-v-border animate-[slideDown_0.3s_ease] ${
              saveSuccess ? 'bg-green-900/30 border-green-600/30 text-green-400' : 'bg-v-surface border-v-border text-amber-400'
            }`}>
              <div className="max-w-3xl mx-auto w-full flex items-center justify-between">
                {saveSuccess ? (
                  <div className="flex items-center gap-2 w-full justify-center">
                    <span className="text-lg">&#10003;</span>
                    <span className="font-medium">{'Settings saved'}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-amber-500 text-lg">&#9888;</span>
                      <span className="text-sm font-medium">
                        {pendingChanges.size} unsaved change{pendingChanges.size !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-1.5 text-sm border border-v-border rounded text-v-text-secondary hover:bg-white/5 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveAllChanges}
                        disabled={saving}
                        className="px-6 py-1.5 text-xs uppercase tracking-widest bg-v-gold text-v-charcoal font-semibold hover:bg-v-gold-dim disabled:opacity-50 transition-colors"
                      >
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}


        {/* Profile */}
        <div id="profile" className="pb-6 mb-2">
          <h2 className="text-xs font-medium uppercase tracking-widest text-v-gold mb-4 pb-2 border-b border-v-gold/20">Profile</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">Your Name</label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => { setProfileName(e.target.value); markDirty('profile'); }}
                placeholder="Full name"
                className="w-full bg-transparent border-0 border-b border-v-border text-v-text-primary placeholder:text-v-text-secondary px-0 py-2 text-sm focus:border-v-gold focus:ring-0 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">Company Name</label>
              <input
                type="text"
                value={profileCompany}
                onChange={(e) => { setProfileCompany(e.target.value); markDirty('profile'); }}
                placeholder="Your business name"
                className="w-full bg-transparent border-0 border-b border-v-border text-v-text-primary placeholder:text-v-text-secondary px-0 py-2 text-sm focus:border-v-gold focus:ring-0 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">Phone</label>
              <input
                type="tel"
                value={profilePhone}
                onChange={(e) => { setProfilePhone(e.target.value); markDirty('profile'); }}
                placeholder="(555) 123-4567"
                className="w-full bg-transparent border-0 border-b border-v-border text-v-text-primary placeholder:text-v-text-secondary px-0 py-2 text-sm focus:border-v-gold focus:ring-0 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">Email</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full bg-transparent border-0 border-b border-v-border/50 text-v-text-secondary px-0 py-2 text-sm cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Branding */}
        <div id="branding" className="pb-6 mb-2">
          <h2 className="text-xs font-medium uppercase tracking-widest text-v-gold mb-4 pb-2 border-b border-v-gold/20">Branding</h2>
          <p className="text-v-text-secondary text-sm mb-4">Customize how your quotes and portal look to customers.</p>

          {/* Logo Upload */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-v-text-secondary mb-2">Company Logo</label>
            <div className="flex items-center gap-4">
              {logoUrl ? (
                <div className="w-16 h-16 bg-v-surface border border-v-border rounded flex items-center justify-center overflow-hidden">
                  <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                </div>
              ) : (
                <div className="w-16 h-16 bg-v-surface border border-v-border border-dashed rounded flex items-center justify-center text-v-text-secondary text-xs">
                  No logo
                </div>
              )}
              <label className="cursor-pointer px-4 py-2 border border-v-border text-v-text-secondary text-sm hover:border-v-gold hover:text-v-gold transition-colors">
                {logoUploading ? 'Uploading...' : logoUrl ? 'Change Logo' : 'Upload Logo'}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} className="hidden" disabled={logoUploading} />
              </label>
            </div>
            <p className="text-v-text-secondary/50 text-xs mt-2">PNG, JPG, or WebP. Max 2MB.</p>
          </div>

          {/* Website Fonts */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-v-text-secondary mb-2">Website Fonts</label>
            <p className="text-v-text-secondary/60 text-xs mb-3">Enter your website URL to auto-extract heading and body fonts.</p>
            <div className="flex gap-2">
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://yourwebsite.com"
                className="flex-1 bg-v-surface border border-v-border text-v-text-primary px-3 py-2 text-sm focus:border-v-gold focus:outline-none"
              />
              <button
                onClick={async () => {
                  if (!websiteUrl) return;
                  setFontExtracting(true);
                  try {
                    const token = localStorage.getItem('vector_token');
                    const res = await fetch('/api/user/extract-fonts', {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ website_url: websiteUrl }),
                    });
                    const data = await res.json();
                    if (res.ok && data.fonts) {
                      setExtractedFonts(data.fonts);
                    }
                  } catch (err) {
                    console.error('Font extraction failed:', err);
                  } finally {
                    setFontExtracting(false);
                  }
                }}
                disabled={fontExtracting || !websiteUrl}
                className="px-4 py-2 bg-v-gold text-white text-sm font-medium hover:bg-v-gold/90 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {fontExtracting ? 'Extracting...' : 'Extract Fonts'}
              </button>
            </div>

            {/* Font Preview Card */}
            {extractedFonts && (
              <div className="mt-4 bg-v-surface border border-v-border p-4">
                {extractedFonts.embed_url && (
                  // eslint-disable-next-line @next/next/no-before-interactive-script-outside-document
                  <link rel="stylesheet" href={extractedFonts.embed_url} />
                )}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium uppercase tracking-widest text-v-gold">Extracted Fonts</span>
                  <button
                    onClick={() => {
                      setExtractedFonts(null);
                      setWebsiteUrl('');
                      const token = localStorage.getItem('vector_token');
                      fetch('/api/user/branding', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ website_url: '' }),
                      });
                    }}
                    className="text-xs text-v-text-secondary hover:text-red-400 transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-2">
                  {extractedFonts.heading && (
                    <div>
                      <span className="text-[10px] uppercase tracking-widest text-v-text-secondary/50">Heading</span>
                      <p className="text-lg text-v-text-primary" style={{ fontFamily: `"${extractedFonts.heading}", serif` }}>
                        {extractedFonts.heading}
                      </p>
                    </div>
                  )}
                  {extractedFonts.subheading && extractedFonts.subheading !== extractedFonts.heading && (
                    <div>
                      <span className="text-[10px] uppercase tracking-widest text-v-text-secondary/50">Subheading</span>
                      <p className="text-base text-v-text-primary" style={{ fontFamily: `"${extractedFonts.subheading}", sans-serif` }}>
                        {extractedFonts.subheading}
                      </p>
                    </div>
                  )}
                  {extractedFonts.body && (
                    <div>
                      <span className="text-[10px] uppercase tracking-widest text-v-text-secondary/50">Body</span>
                      <p className="text-sm text-v-text-secondary" style={{ fontFamily: `"${extractedFonts.body}", sans-serif` }}>
                        The quick brown fox jumps over the lazy dog. Your customers will see this font on quotes, invoices, and your portal.
                      </p>
                    </div>
                  )}
                  {!extractedFonts.heading && !extractedFonts.body && (
                    <p className="text-xs text-v-text-secondary/50">No fonts detected. Try a different URL.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Theme Picker */}
          <div>
            <label className="block text-sm font-medium text-v-text-secondary mb-3">Theme</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Vector Default */}
              <button
                onClick={() => saveTheme({ primary: '#C9A84C', accent: '#0D1B2A', bg: '#0A0E17', surface: '#111827', logo_url: null })}
                disabled={themeSaving}
                className={`border p-3 text-left transition-colors ${
                  selectedTheme.primary === '#C9A84C' && !selectedTheme.logo_url
                    ? 'border-v-gold'
                    : 'border-v-border hover:border-v-gold/50'
                }`}
              >
                <div className="flex gap-0.5 mb-2">
                  <div className="w-full h-6 rounded-sm" style={{ background: '#0A0E17' }} />
                  <div className="w-full h-6 rounded-sm" style={{ background: '#111827' }} />
                  <div className="w-3 h-6 rounded-sm flex-shrink-0" style={{ background: '#C9A84C' }} />
                </div>
                <p className="text-xs text-v-text-primary">Vector Default</p>
                <p className="text-[10px] text-v-text-secondary">Gold & Charcoal</p>
              </button>

              {/* Generated presets */}
              {themePresets.map((preset, i) => {
                const isSelected = selectedTheme.primary === preset.primary && selectedTheme.logo_url === logoUrl;
                return (
                  <button
                    key={i}
                    onClick={() => saveTheme({ ...preset, logo_url: logoUrl })}
                    disabled={themeSaving}
                    className={`border p-3 text-left transition-colors ${
                      isSelected ? 'border-v-gold' : 'border-v-border hover:border-v-gold/50'
                    }`}
                  >
                    <div className="flex gap-0.5 mb-2">
                      <div className="w-full h-6 rounded-sm" style={{ background: preset.bg }} />
                      <div className="w-full h-6 rounded-sm" style={{ background: preset.surface }} />
                      <div className="w-3 h-6 rounded-sm flex-shrink-0" style={{ background: preset.primary }} />
                    </div>
                    <p className="text-xs text-v-text-primary">{preset.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <div className="w-3 h-3 rounded-full border border-v-border" style={{ background: preset.primary }} />
                      <p className="text-[10px] text-v-text-secondary">{preset.primary}</p>
                    </div>
                  </button>
                );
              })}

              {/* Placeholder cards if no presets */}
              {themePresets.length === 0 && [1, 2, 3].map(i => (
                <div key={i} className="border border-v-border/30 border-dashed p-3">
                  <div className="h-6 mb-2 bg-v-surface/50 rounded-sm" />
                  <p className="text-xs text-v-text-secondary/40">Upload logo to generate</p>
                </div>
              ))}
            </div>

            {themeSuccess && (
              <p className="text-v-gold text-xs mt-2">{themeSuccess}</p>
            )}
          </div>
        </div>

        {/* Plan & Billing */}
        <div id="billing" className="pb-6 mb-2">
          <h2 className="text-xs font-medium uppercase tracking-widest text-v-gold mb-4 pb-2 border-b border-v-gold/20">{'Billing'}</h2>
          {user?.is_admin ? (
            <div>
              <p className="mb-1 capitalize text-v-text-primary">{user?.plan || 'enterprise'} Plan</p>
              <span className="inline-block px-3 py-1 rounded bg-v-gold text-white text-sm font-medium">{'Admin Access - All Features'}</span>
            </div>
          ) : (
            <div>
              <p className="capitalize mb-3 text-v-text-primary">{user?.plan} - ${planPrice}/mo</p>
              {!hasAllFeatures && (
                <>
                  {/* Annual/Monthly Toggle */}
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => setUpgradeBilling('monthly')}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        upgradeBilling === 'monthly' ? 'bg-amber-500 text-white' : 'text-v-text-secondary hover:text-v-text-primary border border-v-border'
                      }`}
                    >
                      {'Monthly'}
                    </button>
                    <button
                      onClick={() => setUpgradeBilling('annual')}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        upgradeBilling === 'annual' ? 'bg-amber-500 text-white' : 'text-v-text-secondary hover:text-v-text-primary border border-v-border'
                      }`}
                    >
                      {'Annual'} <span className="text-green-500 font-bold">-25%</span>
                    </button>
                  </div>
                  {/* Promo Code Section */}
                  <div className="mb-3">
                    <button
                      onClick={() => setShowPromo(!showPromo)}
                      className="text-sm text-v-text-secondary hover:text-v-text-primary transition-colors"
                    >
                      {showPromo ? 'Hide promo code' : 'Have a promo code?'}
                    </button>
                    {showPromo && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={promoCode}
                          onChange={(e) => {
                            setPromoCode(e.target.value.toUpperCase());
                            setPromoResult(null);
                            setPromoError('');
                          }}
                          onBlur={() => validatePromo(promoCode)}
                          onKeyDown={(e) => e.key === 'Enter' && validatePromo(promoCode)}
                          placeholder="Enter code"
                          className="px-3 py-1.5 rounded bg-v-charcoal border border-v-border text-v-text-primary placeholder:text-v-text-secondary text-sm w-40"
                        />
                        {promoValidating && (
                          <span className="text-xs text-v-text-secondary">{'Checking...'}</span>
                        )}
                        {promoResult && (
                          <span className="text-xs text-green-400 font-medium">
                            {promoResult.code}: {promoResult.description}
                          </span>
                        )}
                        {promoError && (
                          <span className="text-xs text-red-400">{promoError}</span>
                        )}
                      </div>
                    )}
                    {promoResult?.min_months > 0 && (
                      <p className="text-xs text-v-text-secondary mt-1 ml-1">
                        {promoResult.min_months} month minimum commitment required
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {user?.plan !== 'pro' && user?.plan !== 'business' && (
                      <button
                        onClick={async () => {
                          try {
                            const token = localStorage.getItem('vector_token');
                            const body = { tier: 'pro', billing: upgradeBilling };
                            if (promoResult?.code) body.promo_code = promoResult.code;
                            const res = await fetch('/api/upgrade', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                              body: JSON.stringify(body),
                            });
                            const data = await res.json();
                            if (data.url) window.location.href = data.url;
                            else if (data.error) alert(data.error);
                          } catch (e) { alert('Upgrade failed'); }
                        }}
                        className="px-4 py-2 bg-v-gold text-v-charcoal text-xs uppercase tracking-widest font-semibold hover:bg-v-gold-dim transition-colors"
                      >
                        Pro - ${upgradeBilling === 'annual' ? '59' : '79'}/mo
                        {upgradeBilling === 'annual' && <span className="ml-1 text-xs opacity-75">($708/yr)</span>}
                      </button>
                    )}
                    {user?.plan !== 'business' && user?.plan !== 'enterprise' && (
                      <button
                        onClick={async () => {
                          try {
                            const token = localStorage.getItem('vector_token');
                            const body = { tier: 'business', billing: upgradeBilling };
                            if (promoResult?.code) body.promo_code = promoResult.code;
                            const res = await fetch('/api/upgrade', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                              body: JSON.stringify(body),
                            });
                            const data = await res.json();
                            if (data.url) window.location.href = data.url;
                            else if (data.error) alert(data.error);
                          } catch (e) { alert('Upgrade failed'); }
                        }}
                        className="px-4 py-2 rounded bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm"
                      >
                        Business - ${upgradeBilling === 'annual' ? '112' : '149'}/mo
                        {upgradeBilling === 'annual' && <span className="ml-1 text-xs opacity-75">($1,344/yr)</span>}
                      </button>
                    )}
                    {user?.plan !== 'enterprise' && (
                      <button
                        onClick={async () => {
                          try {
                            const token = localStorage.getItem('vector_token');
                            const body = { tier: 'enterprise', billing: upgradeBilling };
                            if (promoResult?.code) body.promo_code = promoResult.code;
                            const res = await fetch('/api/upgrade', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                              body: JSON.stringify(body),
                            });
                            const data = await res.json();
                            if (data.url) window.location.href = data.url;
                            else if (data.error) alert(data.error);
                          } catch (e) { alert('Upgrade failed'); }
                        }}
                        className="px-4 py-2 border border-v-gold text-v-gold text-xs uppercase tracking-widest font-semibold hover:bg-v-gold/10 transition-colors"
                      >
                        Enterprise - ${upgradeBilling === 'annual' ? '224' : '299'}/mo
                        {upgradeBilling === 'annual' && <span className="ml-1 text-xs opacity-75">($2,688/yr)</span>}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Stripe Connect */}
        <div className="pb-6 mb-2">
          <h3 className="text-xs font-medium uppercase tracking-widest text-v-gold mb-4 pb-2 border-b border-v-gold/20">{'Stripe Payments'}</h3>
          {stripeError && (
            <div className="mb-3 p-3 bg-red-900/30 border border-red-600/30 rounded text-red-400 text-sm">
              {stripeError}
              <button onClick={() => setStripeError(null)} className="ml-2 text-red-400 hover:text-red-300">&times;</button>
            </div>
          )}
          {stripeStatus.connected && stripeStatus.status === 'ACTIVE' ? (
            <div>
              <div className="flex items-center mb-2">
                <span className="text-green-500 mr-2">&#10003;</span>
                <span className="text-green-400 font-medium">{'Active'}</span>
              </div>
              {stripeStatus.bankAccount && (
                <p className="text-sm text-v-text-secondary mb-2">Account: {stripeStatus.bankAccount}</p>
              )}
              <p className="text-sm text-v-text-secondary mb-3">{'Active - You can receive payments'}</p>
              <a
                href="https://dashboard.stripe.com"
                target="_blank"
                rel="noreferrer"
                className="text-v-gold text-sm underline"
              >
                {'Manage in Stripe Dashboard'}
              </a>
            </div>
          ) : stripeStatus.connected && stripeStatus.status === 'PENDING' ? (
            <div>
              <div className="flex items-center mb-2">
                <span className="text-amber-500 mr-2">&#9888;</span>
                <span className="text-amber-400 font-medium">{'Pending Verification'}</span>
              </div>
              <p className="text-sm text-v-text-secondary mb-3">{'Your Stripe account is being reviewed. This usually takes 1-2 business days.'}</p>
              <button
                onClick={handleConnectStripe}
                disabled={stripeLoading}
                className="px-4 py-2 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {stripeLoading ? 'Loading...' : 'Complete Setup'}
              </button>
            </div>
          ) : stripeStatus.status === 'INCOMPLETE' ? (
            <div>
              <div className="bg-red-900/30 border border-red-600/30 rounded-sm p-3 mb-3">
                <div className="flex items-center mb-1">
                  <span className="text-red-400 mr-2">&#9888;</span>
                  <span className="text-red-400 font-medium">{'Stripe disconnected - payments disabled'}</span>
                </div>
                <p className="text-sm text-red-400">{'Your Stripe account needs attention. Online payments are currently disabled on your quotes.'}</p>
              </div>
              <button
                onClick={handleConnectStripe}
                disabled={stripeLoading}
                className="w-full px-4 py-2 rounded bg-red-600/20 text-red-400 border border-red-600/30 hover:bg-red-600/30 disabled:opacity-50 font-medium"
              >
                {stripeLoading ? 'Connecting...' : 'Reconnect Stripe'}
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center mb-2">
                <span className="text-red-400 mr-2">&#10007;</span>
                <span className="text-red-400 font-medium">{'Stripe not connected'}</span>
              </div>
              <p className="text-sm text-v-text-secondary mb-3">{'Connect Stripe to receive payments for your quotes.'}</p>
              <button
                onClick={handleConnectStripe}
                disabled={stripeLoading}
                className="px-4 py-2 rounded bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:opacity-90 disabled:opacity-50"
              >
                {stripeLoading ? 'Connecting...' : 'Connect Stripe'}
              </button>
            </div>
          )}
        </div>

        {/* Payment Settings - Test/Live Mode */}
        <div className="pb-6 mb-2">
          <h3 className="text-xs font-medium uppercase tracking-widest text-v-gold mb-4 pb-2 border-b border-v-gold/20">{'Payment Settings'}</h3>
          <p className="text-sm text-v-text-secondary mb-4">
            {'Switch between test and live mode for processing payments.'}
          </p>

          {stripeModeError && (
            <div className="mb-3 p-3 bg-red-900/30 border border-red-600/30 rounded text-red-400 text-sm">
              {stripeModeError}
              <button onClick={() => setStripeModeError(null)} className="ml-2 text-red-400 hover:text-red-300">&times;</button>
            </div>
          )}

          <div className="space-y-3">
            <label
              className={`flex items-start p-3 border rounded-sm cursor-pointer transition-colors ${
                stripeMode === 'test' ? 'border-v-gold bg-v-gold/10' : 'border-v-border hover:bg-white/5'
              }`}
            >
              <input
                type="radio"
                name="stripeMode"
                checked={stripeMode === 'test'}
                onChange={() => saveStripeMode('test')}
                disabled={stripeModeLoading}
                className="mt-1 mr-3"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-v-text-primary">{'Test Mode'}</span>
                  <span className="text-xs bg-v-gold/10 text-v-gold px-2 py-0.5 rounded-full">{'Recommended for setup'}</span>
                </div>
                <p className="text-sm text-v-text-secondary mt-1">
                  {'No real payments are processed. Use Stripe test cards to verify your setup.'}
                </p>
              </div>
            </label>

            <label
              className={`flex items-start p-3 border rounded-sm cursor-pointer transition-colors ${
                stripeMode === 'live' ? 'border-green-500 bg-green-900/20' : 'border-v-border hover:bg-white/5'
              }`}
            >
              <input
                type="radio"
                name="stripeMode"
                checked={stripeMode === 'live'}
                onChange={() => saveStripeMode('live')}
                disabled={stripeModeLoading}
                className="mt-1 mr-3"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-v-text-primary">{'Live Mode'}</span>
                  {stripeMode === 'live' && (
                    <span className="text-xs bg-green-900/30 text-green-400 px-2 py-0.5 rounded-full">Active</span>
                  )}
                </div>
                <p className="text-sm text-v-text-secondary mt-1">
                  {'Real payments will be processed through your connected Stripe account.'}
                </p>
              </div>
            </label>
          </div>

          {stripeMode === 'live' && (
            <div className="mt-3 p-3 bg-amber-900/30 border border-amber-600/30 rounded-sm">
              <div className="flex items-start gap-2">
                <span className="text-amber-400">&#9888;</span>
                <div>
                  <p className="text-sm font-medium text-amber-400">{'Live mode processes real payments'}</p>
                  <p className="text-xs text-amber-400/80 mt-1">
                    {'Customers will be charged real money. Make sure your Stripe account is fully verified and your services/pricing are correct before enabling live mode.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {stripeModeLoading && (
            <p className="text-xs text-v-text-secondary mt-2 flex items-center gap-1">
              <span className="inline-block w-3 h-3 border-2 border-v-text-secondary border-t-transparent rounded-full animate-spin"></span>
              {'Switching mode...'}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${stripeMode === 'live' ? 'bg-v-gold' : 'bg-v-gold'}`}></span>
            <span className="text-xs text-v-text-secondary">
              {'Currently in {mode} mode'.replace('{mode}', stripeMode === 'live' ? 'Live' : 'Test')}
            </span>
          </div>
        </div>

        {/* Platform Fee */}
        <div className="pb-6 mb-2">
          <h3 className="text-xs font-medium uppercase tracking-widest text-v-gold mb-4 pb-2 border-b border-v-gold/20">{'Platform fee'}</h3>
          <p className="text-sm text-v-text-secondary mb-3">
            {'Vector charges a {rate} platform fee on each job. Choose who pays it.'.replace('{fee}', user?.plan === 'enterprise' ? '0' : hasAllFeatures ? '1' : user?.plan === 'pro' ? '2' : '5')}
          </p>
          <div className="space-y-3">
            <label
              className={`flex items-start p-3 border rounded-sm cursor-pointer transition-colors ${
                !passFeeToCustomer ? 'border-amber-500 bg-amber-900/20' : 'border-v-border hover:bg-white/5'
              }`}
            >
              <input
                type="radio"
                name="passFee"
                checked={!passFeeToCustomer}
                onChange={() => { setPassFeeToCustomer(false); markDirty('passFee'); }}
                className="mt-1 mr-3"
              />
              <div>
                <p className="font-medium text-v-text-primary">{'I absorb the fee'}</p>
                <p className="text-sm text-v-text-secondary">{'Fee is deducted from your payout. Customer sees only the quote price.'}</p>
              </div>
            </label>
            <label
              className={`flex items-start p-3 border rounded-sm cursor-pointer transition-colors ${
                passFeeToCustomer ? 'border-amber-500 bg-amber-900/20' : 'border-v-border hover:bg-white/5'
              }`}
            >
              <input
                type="radio"
                name="passFee"
                checked={passFeeToCustomer}
                onChange={() => { setPassFeeToCustomer(true); markDirty('passFee'); }}
                className="mt-1 mr-3"
              />
              <div>
                <p className="font-medium text-v-text-primary">{'Pass platform fee to customer'}</p>
                <p className="text-sm text-v-text-secondary">{'A "Service Fee" line item is added to the customer\'s quote. You receive the full quote amount.'}</p>
              </div>
            </label>
          </div>
        </div>

        {/* Credit Card Processing Fee */}
        <div className="pb-6 mb-2">
          <h3 className="text-xs font-medium uppercase tracking-widest text-v-gold mb-4 pb-2 border-b border-v-gold/20">Credit Card Processing Fee</h3>
          <p className="text-sm text-v-text-secondary mb-3">
            Stripe charges 2.9% + $0.30 per transaction. Choose how this fee is handled.
          </p>
          <div className="space-y-3">
            <label
              className={`flex items-start p-3 border rounded-sm cursor-pointer transition-colors ${
                ccFeeMode === 'absorb' ? 'border-amber-500 bg-amber-900/20' : 'border-v-border hover:bg-white/5'
              }`}
            >
              <input
                type="radio"
                name="ccFeeMode"
                checked={ccFeeMode === 'absorb'}
                onChange={() => { setCcFeeMode('absorb'); markDirty('ccFee'); }}
                className="mt-1 mr-3"
              />
              <div>
                <p className="font-medium text-v-text-primary">Absorb fees</p>
                <p className="text-sm text-v-text-secondary">You pay the processing fee. Customer sees a clean price with no extra charges.</p>
              </div>
            </label>
            <label
              className={`flex items-start p-3 border rounded-sm cursor-pointer transition-colors ${
                ccFeeMode === 'pass' ? 'border-amber-500 bg-amber-900/20' : 'border-v-border hover:bg-white/5'
              }`}
            >
              <input
                type="radio"
                name="ccFeeMode"
                checked={ccFeeMode === 'pass'}
                onChange={() => { setCcFeeMode('pass'); markDirty('ccFee'); }}
                className="mt-1 mr-3"
              />
              <div>
                <p className="font-medium text-v-text-primary">Pass to customer</p>
                <p className="text-sm text-v-text-secondary">A &quot;Processing Fee&quot; line item (2.9% + $0.30) is added to the customer&apos;s invoice.</p>
              </div>
            </label>
            <label
              className={`flex items-start p-3 border rounded-sm cursor-pointer transition-colors ${
                ccFeeMode === 'customer_choice' ? 'border-amber-500 bg-amber-900/20' : 'border-v-border hover:bg-white/5'
              }`}
            >
              <input
                type="radio"
                name="ccFeeMode"
                checked={ccFeeMode === 'customer_choice'}
                onChange={() => { setCcFeeMode('customer_choice'); markDirty('ccFee'); }}
                className="mt-1 mr-3"
              />
              <div>
                <p className="font-medium text-v-text-primary">Customer choice</p>
                <p className="text-sm text-v-text-secondary">Customer can pay by card (fee included) or request an invoice to pay by check/ACH (no fee).</p>
              </div>
            </label>
          </div>
        </div>

        {/* Language & Currency */}
        <div className="pb-6 mb-2">
          <h3 className="text-xs font-medium uppercase tracking-widest text-v-gold mb-4 pb-2 border-b border-v-gold/20">{'Language'} & {'Currency'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">{'App Language'}</label>
              <select
                value={uiLang}
                onChange={(e) => {
                  setUiLang(e.target.value);
                  setLanguage(e.target.value);
                  markDirty('language');
                }}
                className="w-full bg-v-charcoal border border-v-border text-v-text-primary rounded px-3 py-2"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-v-text-secondary mt-1">
                Used for the app and customer-facing emails/quotes
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Currency'}</label>
              <select
                value={currency}
                onChange={(e) => { setCurrency(e.target.value); markDirty('currency'); }}
                disabled={currencyLoading}
                className="w-full bg-v-charcoal border border-v-border text-v-text-primary rounded px-3 py-2 disabled:opacity-50"
              >
                {currencies.length > 0 ? (
                  currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.symbol} {c.code} - {c.name}
                    </option>
                  ))
                ) : (
                  <option value="USD">$ USD - US Dollar</option>
                )}
              </select>
              <p className="text-xs text-v-text-secondary mt-1">
                {'All prices displayed in this currency. Stripe handles conversion.'}
              </p>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="pb-6 mb-2">
          <h3 className="text-xs font-medium uppercase tracking-widest text-v-gold mb-4 pb-2 border-b border-v-gold/20">Notifications</h3>
          <label className="flex items-center justify-between cursor-pointer py-2">
            <div>
              <p className="text-sm font-medium text-v-text-primary">Quote viewed notifications</p>
              <p className="text-xs text-v-text-secondary">Get notified when a customer opens your quote</p>
            </div>
            <div
              onClick={() => { setNotifyQuoteViewed(!notifyQuoteViewed); markDirty('notifications'); }}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${notifyQuoteViewed ? 'bg-amber-500' : 'bg-gray-600'}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${notifyQuoteViewed ? 'translate-x-5' : ''}`} />
            </div>
          </label>
        </div>

        {/* Services & Tools */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <a href="/settings/services" className="bg-v-surface border border-v-border p-4 rounded-sm hover:bg-white/5 transition-colors text-center">
            <div className="text-2xl mb-1">&#9881;</div>
            <div className="font-medium text-sm text-v-text-primary">{'Services'}</div>
            <div className="text-xs text-v-text-secondary">{'Configure rates'}</div>
          </a>
          <a href="/settings/embed" className="bg-v-surface border border-v-border p-4 rounded-sm hover:bg-white/5 transition-colors text-center">
            <div className="text-2xl mb-1">&#128279;</div>
            <div className="font-medium text-sm text-v-text-primary">{'Embed & QR'}</div>
            <div className="text-xs text-v-text-secondary">{'Website widget'}</div>
          </a>
          <a href="/settings/lead-intake" className="bg-v-surface border border-v-border p-4 rounded-sm hover:bg-white/5 transition-colors text-center">
            <div className="text-2xl mb-1">&#129302;</div>
            <div className="font-medium text-sm text-v-text-primary">{'AI Lead Intake'}</div>
            <div className="text-xs text-v-text-secondary">{'Custom questions'}</div>
          </a>
          <a href="/admin/aircraft" className="bg-v-surface border border-v-border p-4 rounded-sm hover:bg-white/5 transition-colors text-center">
            <div className="text-2xl mb-1">&#9992;</div>
            <div className="font-medium text-sm text-v-text-primary">{'Aircraft DB'}</div>
            <div className="text-xs text-v-text-secondary">{'Add/edit models'}</div>
          </a>
        </div>



        {/* Minimum Call Out Fee */}
        <div className="pb-6 mb-2">
          <h3 className="text-xs font-medium uppercase tracking-widest text-v-gold mb-4 pb-2 border-b border-v-gold/20">{'Minimum Fee'}</h3>
          <p className="text-sm text-v-text-secondary mb-3">
            {'Set a minimum charge for jobs. If the quote total is less than this amount, the minimum fee will be applied instead.'}
          </p>
          <div className="flex items-center space-x-2">
            <span className="text-v-text-secondary">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={minimumFee}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                  setMinimumFee(val);
                  markDirty('minimumFee');
                }
              }}
              onBlur={(e) => {
                const num = parseFloat(e.target.value) || 0;
                setMinimumFee(num);
              }}
              className="w-28 bg-v-charcoal border border-v-border text-v-text-primary placeholder:text-v-text-secondary rounded px-3 py-2"
              placeholder="0.00"
            />
            <span className="text-v-text-secondary">{'minimum'}</span>
          </div>
          <p className="text-xs text-v-text-secondary mt-2">Applies to all jobs. Quotes below this amount will be bumped up.</p>
        </div>

        {/* Terms & Conditions */}
        <div className="pb-6 mb-2">
          <h3 className="text-xs font-medium uppercase tracking-widest text-v-gold mb-4 pb-2 border-b border-v-gold/20">Terms & Conditions</h3>
          <p className="text-sm text-v-text-secondary mb-4">
            Upload your business terms and conditions. Customers must agree before accepting a quote.
          </p>

          {termsSuccess && (
            <div className="mb-4 p-3 bg-green-900/30 border border-green-600/30 rounded-sm text-green-400 text-sm">
              {termsSuccess}
            </div>
          )}

          {(termsPdfUrl || termsUpdatedAt) && (
            <div className="mb-4 p-3 bg-amber-900/30 border border-amber-600/30 rounded-sm flex items-center justify-between">
              <div>
                <span className="text-sm text-amber-400 font-medium">
                  {termsPdfUrl ? 'PDF uploaded' : 'Text terms saved'}
                </span>
                {termsUpdatedAt && (
                  <span className="text-xs text-amber-400/70 ml-2">
                    Updated {new Date(termsUpdatedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {termsPdfUrl && (
                  <a href={termsPdfUrl} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-v-gold underline hover:opacity-80">
                    View PDF
                  </a>
                )}
                <button onClick={deleteTerms} className="text-sm text-red-400 hover:text-red-300">
                  Remove
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-2">Upload PDF</label>
              <input
                type="file"
                accept=".pdf"
                onChange={handleTermsUpload}
                disabled={termsUploading}
                className="block w-full text-sm text-v-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-amber-900/30 file:text-amber-400 hover:file:bg-amber-900/50 disabled:opacity-50"
              />
              {termsUploading && <p className="text-xs text-amber-400 mt-1">Uploading...</p>}
              <p className="text-xs text-v-text-secondary mt-1">PDF only, max 5MB</p>
            </div>

            <div className="text-center text-sm text-v-text-secondary">- or -</div>

            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-2">Paste Terms Text</label>
              <textarea
                value={termsText}
                onChange={(e) => setTermsText(e.target.value)}
                rows={8}
                placeholder="Enter your terms and conditions here..."
                className="w-full bg-v-charcoal border border-v-border text-v-text-primary placeholder:text-v-text-secondary rounded-sm p-3 text-sm"
              />
            </div>

            <button
              onClick={saveTermsText}
              disabled={termsSaving || !termsText.trim()}
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-sm text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {termsSaving ? 'Saving...' : 'Save Terms Text'}
            </button>
          </div>
        </div>



      </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="page-transition text-v-text-secondary p-4">Loading...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
