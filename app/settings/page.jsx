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

  // Smart follow-up settings
  const [autoDiscountEnabled, setAutoDiscountEnabled] = useState(false);
  const [followupDiscountPercent, setFollowupDiscountPercent] = useState(10);

  // Platform fee pass-through
  const [passFeeToCustomer, setPassFeeToCustomer] = useState(false);

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
    let u = JSON.parse(stored);
    setUser(u);
    // Refresh user data from server to get latest plan/permissions
    fetch('/api/user/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.user) {
          setUser(data.user);
          localStorage.setItem('vector_user', JSON.stringify(data.user));
        }
      })
      .catch(() => {});
    setPriceReminder(u.price_reminder_months || 6);
    setQuoteDisplayPref(u.quote_display_preference || 'package');
    setEfficiencyFactor(u.efficiency_factor || 1.0);
    setLaborRate(u.default_labor_rate || 25);
    setHomeAirport(u.home_airport || '');
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
        const u = JSON.parse(stored);
        u.pass_fee_to_customer = val;
        localStorage.setItem('vector_user', JSON.stringify(u));
      }
    } catch (err) {
      console.error('Failed to save pass fee setting:', err);
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
          const u = JSON.parse(stored);
          u.currency = code;
          localStorage.setItem('vector_user', JSON.stringify(u));
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
        const u = JSON.parse(stored);
        u.language = code;
        localStorage.setItem('vector_user', JSON.stringify(u));
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
      if (pendingChanges.has('laborRate')) promises.push(saveLaborRate(parseFloat(laborRate) || 0));
      if (pendingChanges.has('efficiencyFactor')) promises.push(saveEfficiencyFactor(efficiencyFactor));
      if (pendingChanges.has('minimumFee')) promises.push(saveMinimumFee(parseFloat(minimumFee) || 0, []));
      if (pendingChanges.has('currency')) promises.push(saveCurrency(currency));
      if (pendingChanges.has('language')) promises.push(saveLanguage(language));
      // homeAirport removed
      if (pendingChanges.has('passFee')) promises.push(savePassFee(passFeeToCustomer));
      if (pendingChanges.has('quoteDisplay')) promises.push(saveQuoteDisplayPref(quoteDisplayPref));
      if (pendingChanges.has('notifications')) {
        const allNotifs = { ...emailNotifs, ...smsAlerts, ...smsClient, priceReviewMonths: priceReminder, autoDiscountEnabled };
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
            <div className={`fixed top-0 left-0 right-0 z-50 px-4 py-3 shadow-lg border-b animate-[slideDown_0.3s_ease] ${
              saveSuccess ? 'bg-green-100 border-green-400 text-green-800' : 'bg-amber-50 border-amber-400 text-amber-900'
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
                      <span className="text-amber-600 text-lg">&#9888;</span>
                      <span className="text-sm font-medium">
                        {pendingChanges.size} unsaved change{pendingChanges.size !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-1.5 text-sm border border-amber-400 rounded text-amber-700 hover:bg-amber-100 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveAllChanges}
                        disabled={saving}
                        className="px-6 py-1.5 text-sm bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
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


        {/* Plan & Billing */}
        <div className="bg-[#0f172a] text-white p-4 rounded">
          <h2 className="text-lg font-semibold mb-1">{'Billing'}</h2>
          {user?.is_admin ? (
            <div>
              <p className="mb-1 capitalize">{user?.plan || 'enterprise'} Plan</p>
              <span className="inline-block px-3 py-1 rounded bg-green-600 text-white text-sm font-medium">{'Admin Access - All Features'}</span>
            </div>
          ) : (
            <div>
              <p className="capitalize mb-3">{user?.plan} - ${planPrice}/mo</p>
              {!hasAllFeatures && (
                <>
                  {/* Annual/Monthly Toggle */}
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => setUpgradeBilling('monthly')}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        upgradeBilling === 'monthly' ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white border border-white/20'
                      }`}
                    >
                      {'Monthly'}
                    </button>
                    <button
                      onClick={() => setUpgradeBilling('annual')}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        upgradeBilling === 'annual' ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white border border-white/20'
                      }`}
                    >
                      {'Annual'} <span className="text-green-500 font-bold">-25%</span>
                    </button>
                  </div>
                  {/* Promo Code Section */}
                  <div className="mb-3">
                    <button
                      onClick={() => setShowPromo(!showPromo)}
                      className="text-sm text-gray-400 hover:text-white transition-colors"
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
                          className="px-3 py-1.5 rounded bg-white/10 border border-white/20 text-white placeholder-gray-500 text-sm w-40"
                        />
                        {promoValidating && (
                          <span className="text-xs text-gray-400">{'Checking...'}</span>
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
                      <p className="text-xs text-gray-400 mt-1 ml-1">
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
                        className="px-4 py-2 rounded bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm"
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
                        className="px-4 py-2 rounded bg-gradient-to-r from-purple-500 to-purple-600 text-white text-sm"
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
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">{'Stripe Payments'}</h3>
          {stripeError && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {stripeError}
              <button onClick={() => setStripeError(null)} className="ml-2 text-red-500 hover:text-red-700">&times;</button>
            </div>
          )}
          {stripeStatus.connected && stripeStatus.status === 'ACTIVE' ? (
            <div>
              <div className="flex items-center mb-2">
                <span className="text-green-500 mr-2">&#10003;</span>
                <span className="text-green-700 font-medium">{'Active'}</span>
              </div>
              {stripeStatus.bankAccount && (
                <p className="text-sm text-gray-600 mb-2">Account: {stripeStatus.bankAccount}</p>
              )}
              <p className="text-sm text-gray-500 mb-3">{'Active - You can receive payments'}</p>
              <a
                href="https://dashboard.stripe.com"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 text-sm underline"
              >
                {'Manage in Stripe Dashboard'}
              </a>
            </div>
          ) : stripeStatus.connected && stripeStatus.status === 'PENDING' ? (
            <div>
              <div className="flex items-center mb-2">
                <span className="text-amber-500 mr-2">&#9888;</span>
                <span className="text-amber-700 font-medium">{'Pending Verification'}</span>
              </div>
              <p className="text-sm text-gray-600 mb-3">{'Your Stripe account is being reviewed. This usually takes 1-2 business days.'}</p>
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
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                <div className="flex items-center mb-1">
                  <span className="text-red-500 mr-2">&#9888;</span>
                  <span className="text-red-700 font-medium">{'Stripe disconnected - payments disabled'}</span>
                </div>
                <p className="text-sm text-red-600">{'Your Stripe account needs attention. Online payments are currently disabled on your quotes.'}</p>
              </div>
              <button
                onClick={handleConnectStripe}
                disabled={stripeLoading}
                className="w-full px-4 py-2 rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 font-medium"
              >
                {stripeLoading ? 'Connecting...' : 'Reconnect Stripe'}
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center mb-2">
                <span className="text-red-500 mr-2">&#10007;</span>
                <span className="text-red-700 font-medium">{'Stripe not connected'}</span>
              </div>
              <p className="text-sm text-gray-600 mb-3">{'Connect Stripe to receive payments for your quotes.'}</p>
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
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">{'Payment Settings'}</h3>
          <p className="text-sm text-gray-600 mb-4">
            {'Switch between test and live mode for processing payments.'}
          </p>

          {stripeModeError && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {stripeModeError}
              <button onClick={() => setStripeModeError(null)} className="ml-2 text-red-500 hover:text-red-700">&times;</button>
            </div>
          )}

          <div className="space-y-3">
            <label
              className={`flex items-start p-3 border rounded-lg cursor-pointer transition-colors ${
                stripeMode === 'test' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
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
                  <span className="font-medium">{'Test Mode'}</span>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{'Recommended for setup'}</span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {'No real payments are processed. Use Stripe test cards to verify your setup.'}
                </p>
              </div>
            </label>

            <label
              className={`flex items-start p-3 border rounded-lg cursor-pointer transition-colors ${
                stripeMode === 'live' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
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
                  <span className="font-medium">{'Live Mode'}</span>
                  {stripeMode === 'live' && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {'Real payments will be processed through your connected Stripe account.'}
                </p>
              </div>
            </label>
          </div>

          {stripeMode === 'live' && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <span className="text-amber-500">&#9888;</span>
                <div>
                  <p className="text-sm font-medium text-amber-800">{'Live mode processes real payments'}</p>
                  <p className="text-xs text-amber-700 mt-1">
                    {'Customers will be charged real money. Make sure your Stripe account is fully verified and your services/pricing are correct before enabling live mode.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {stripeModeLoading && (
            <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
              <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></span>
              {'Switching mode...'}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${stripeMode === 'live' ? 'bg-green-500' : 'bg-blue-500'}`}></span>
            <span className="text-xs text-gray-500">
              {'Currently in {mode} mode'.replace('{mode}', stripeMode === 'live' ? 'Live' : 'Test')}
            </span>
          </div>
        </div>

        {/* Platform Fee */}
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">{'Platform fee'}</h3>
          <p className="text-sm text-gray-600 mb-3">
            {'Vector charges a {rate} platform fee on each job. Choose who pays it.'.replace('{fee}', user?.plan === 'enterprise' ? '0' : hasAllFeatures ? '1' : user?.plan === 'pro' ? '2' : '5')}
          </p>
          <div className="space-y-3">
            <label
              className={`flex items-start p-3 border rounded-lg cursor-pointer transition-colors ${
                !passFeeToCustomer ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-gray-300'
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
                <p className="font-medium">{'I absorb the fee'}</p>
                <p className="text-sm text-gray-500">{'Fee is deducted from your payout. Customer sees only the quote price.'}</p>
              </div>
            </label>
            <label
              className={`flex items-start p-3 border rounded-lg cursor-pointer transition-colors ${
                passFeeToCustomer ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-gray-300'
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
                <p className="font-medium">{'Pass platform fee to customer'}</p>
                <p className="text-sm text-gray-500">{'A "Service Fee" line item is added to the customer\'s quote. You receive the full quote amount.'}</p>
              </div>
            </label>
          </div>
        </div>

        {/* Language & Currency */}
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">{'Language'} & {'Currency'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{'App Language'}</label>
              <select
                value={uiLang}
                onChange={(e) => {
                  setUiLang(e.target.value);
                  setLanguage(e.target.value);
                  markDirty('language');
                }}
                className="w-full border rounded px-3 py-2"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Used for the app and customer-facing emails/quotes
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{'Currency'}</label>
              <select
                value={currency}
                onChange={(e) => { setCurrency(e.target.value); markDirty('currency'); }}
                disabled={currencyLoading}
                className="w-full border rounded px-3 py-2 disabled:opacity-50"
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
              <p className="text-xs text-gray-400 mt-1">
                {'All prices displayed in this currency. Stripe handles conversion.'}
              </p>
            </div>
          </div>
        </div>

        {/* Services & Tools */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <a href="/settings/services" className="bg-white p-4 rounded shadow hover:shadow-md transition-shadow text-center">
            <div className="text-2xl mb-1">&#9881;</div>
            <div className="font-medium text-sm">{'Services'}</div>
            <div className="text-xs text-gray-500">{'Configure rates'}</div>
          </a>
          <a href="/settings/embed" className="bg-white p-4 rounded shadow hover:shadow-md transition-shadow text-center">
            <div className="text-2xl mb-1">&#128279;</div>
            <div className="font-medium text-sm">{'Embed & QR'}</div>
            <div className="text-xs text-gray-500">{'Website widget'}</div>
          </a>
          <a href="/settings/lead-intake" className="bg-white p-4 rounded shadow hover:shadow-md transition-shadow text-center">
            <div className="text-2xl mb-1">&#129302;</div>
            <div className="font-medium text-sm">{'AI Lead Intake'}</div>
            <div className="text-xs text-gray-500">{'Custom questions'}</div>
          </a>
          <a href="/admin/aircraft" className="bg-white p-4 rounded shadow hover:shadow-md transition-shadow text-center">
            <div className="text-2xl mb-1">&#9992;</div>
            <div className="font-medium text-sm">{'Aircraft DB'}</div>
            <div className="text-xs text-gray-500">{'Add/edit models'}</div>
          </a>
        </div>



        {/* Minimum Call Out Fee */}
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">{'Minimum Fee'}</h3>
          <p className="text-sm text-gray-600 mb-3">
            {'Set a minimum charge for jobs. If the quote total is less than this amount, the minimum fee will be applied instead.'}
          </p>
          <div className="flex items-center space-x-2">
            <span className="text-gray-500">$</span>
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
              className="w-28 border rounded px-3 py-2"
              placeholder="0.00"
            />
            <span className="text-gray-500">{'minimum'}</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">Applies to all jobs. Quotes below this amount will be bumped up.</p>
        </div>







      </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="page-transition text-gray-500 p-4">Loading...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
