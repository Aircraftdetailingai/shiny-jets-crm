"use client";
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { DEFAULT_PRODUCT_RATIOS, SERVICE_TYPE_LABELS } from '../../lib/product-calculator';
import { setUserCurrency } from '@/lib/currency';
import { currencySymbol } from '@/lib/formatPrice';
import { restartTour } from '@/components/DashboardTour';

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
  const [currency, setCurrency] = useState('USD');
  const [currencies, setCurrencies] = useState([]);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [minimumFee, setMinimumFee] = useState(0);
  const [minimumFeeLocations, setMinimumFeeLocations] = useState([]);
  const [newLocation, setNewLocation] = useState('');

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
    const u = JSON.parse(stored);
    setUser(u);
    setPriceReminder(u.price_reminder_months || 6);
    setQuoteDisplayPref(u.quote_display_preference || 'package');
    setEfficiencyFactor(u.efficiency_factor || 1.0);
    setLaborRate(u.default_labor_rate || 25);
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

  useEffect(() => {
    checkStripeStatus();
    fetchCurrency();
    fetchMinimumFee();
    fetchAddonFees();
    fetchPassFee();
    fetchProductRatios();
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
      if (pendingChanges.has('minimumFee')) promises.push(saveMinimumFee(parseFloat(minimumFee) || 0, minimumFeeLocations));
      if (pendingChanges.has('currency')) promises.push(saveCurrency(currency));
      if (pendingChanges.has('passFee')) promises.push(savePassFee(passFeeToCustomer));
      if (pendingChanges.has('quoteDisplay')) promises.push(saveQuoteDisplayPref(quoteDisplayPref));
      if (pendingChanges.has('notifications')) {
        const allNotifs = { ...emailNotifs, ...smsAlerts, ...smsClient, priceReviewMonths: priceReminder };
        promises.push(saveNotifications(allNotifs));
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
        {/* Sticky Save Bar */}
        {(pendingChanges.size > 0 || saveSuccess) && (
          <div className={`sticky top-0 z-40 rounded-lg px-4 py-3 flex items-center justify-between shadow-lg transition-all duration-300 ${
            saveSuccess ? 'bg-green-600 text-white' : 'bg-[#0f172a] text-white border border-white/10'
          }`}>
            {saveSuccess ? (
              <div className="flex items-center gap-2 w-full justify-center">
                <span className="text-lg">&#10003;</span>
                <span className="font-medium">Settings saved successfully!</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                  <span className="text-sm text-gray-300">
                    {pendingChanges.size} unsaved change{pendingChanges.size !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-1.5 text-sm border border-white/30 rounded hover:bg-white/10 transition-colors"
                  >
                    Discard
                  </button>
                  <button
                    onClick={saveAllChanges}
                    disabled={saving}
                    className="px-6 py-1.5 text-sm bg-gradient-to-r from-amber-500 to-amber-600 rounded font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {saving ? 'Saving...' : `Save Changes (${pendingChanges.size} unsaved)`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Plan & Billing */}
        <div className="bg-[#0f172a] text-white p-4 rounded">
          <h2 className="text-lg font-semibold mb-1">Plan & Billing</h2>
          {user?.is_admin ? (
            <div>
              <p className="mb-1 capitalize">{user?.plan || 'enterprise'} Plan</p>
              <span className="inline-block px-3 py-1 rounded bg-green-600 text-white text-sm font-medium">Admin Access - All Features</span>
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
                      Monthly
                    </button>
                    <button
                      onClick={() => setUpgradeBilling('annual')}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        upgradeBilling === 'annual' ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white border border-white/20'
                      }`}
                    >
                      Annual <span className="text-green-500 font-bold">-25%</span>
                    </button>
                  </div>
                  {/* Promo Code Section */}
                  <div className="mb-3">
                    <button
                      onClick={() => setShowPromo(!showPromo)}
                      className="text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      {showPromo ? '- Hide promo code' : '+ Have a promo code?'}
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
                          <span className="text-xs text-gray-400">Checking...</span>
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

        {/* Quick Links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <a href="/settings/services" className="bg-white p-4 rounded shadow hover:shadow-md transition-shadow text-center">
            <div className="text-2xl mb-1">&#9881;</div>
            <div className="font-medium text-sm">Services</div>
            <div className="text-xs text-gray-500">Configure rates</div>
          </a>
          <a href="/settings/embed" className="bg-white p-4 rounded shadow hover:shadow-md transition-shadow text-center">
            <div className="text-2xl mb-1">&#128279;</div>
            <div className="font-medium text-sm">Embed & QR</div>
            <div className="text-xs text-gray-500">Website widget</div>
          </a>
          <a href="/settings/lead-intake" className="bg-white p-4 rounded shadow hover:shadow-md transition-shadow text-center">
            <div className="text-2xl mb-1">&#129302;</div>
            <div className="font-medium text-sm">AI Lead Intake</div>
            <div className="text-xs text-gray-500">Custom questions</div>
          </a>
          <a href="/admin/aircraft" className="bg-white p-4 rounded shadow hover:shadow-md transition-shadow text-center">
            <div className="text-2xl mb-1">&#9992;</div>
            <div className="font-medium text-sm">Aircraft DB</div>
            <div className="text-xs text-gray-500">Add/edit models</div>
          </a>
        </div>

        {/* Stripe Connect */}
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">Stripe Payments</h3>
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
                <span className="text-green-700 font-medium">Connected</span>
              </div>
              {stripeStatus.bankAccount && (
                <p className="text-sm text-gray-600 mb-2">Account: {stripeStatus.bankAccount}</p>
              )}
              <p className="text-sm text-gray-500 mb-3">Status: Active - You can receive payments</p>
              <a
                href="https://dashboard.stripe.com"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 text-sm underline"
              >
                Manage in Stripe Dashboard
              </a>
            </div>
          ) : stripeStatus.connected && stripeStatus.status === 'PENDING' ? (
            <div>
              <div className="flex items-center mb-2">
                <span className="text-amber-500 mr-2">&#9888;</span>
                <span className="text-amber-700 font-medium">Pending Verification</span>
              </div>
              <p className="text-sm text-gray-600 mb-3">Your Stripe account is being reviewed. This usually takes 1-2 business days.</p>
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
                  <span className="text-red-700 font-medium">Disconnected - Payments Disabled</span>
                </div>
                <p className="text-sm text-red-600">Your Stripe account needs attention. Online payments are currently disabled on your quotes.</p>
              </div>
              <button
                onClick={handleConnectStripe}
                disabled={stripeLoading}
                className="w-full px-4 py-2 rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 font-medium"
              >
                {stripeLoading ? 'Reconnecting...' : 'Reconnect Stripe'}
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center mb-2">
                <span className="text-red-500 mr-2">&#10007;</span>
                <span className="text-red-700 font-medium">Not Connected</span>
              </div>
              <p className="text-sm text-gray-600 mb-3">Connect Stripe to receive payments for your quotes.</p>
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

        {/* Platform Fee */}
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">Platform Fee</h3>
          <p className="text-sm text-gray-600 mb-3">
            Vector charges a {user?.plan === 'enterprise' ? '0%' : hasAllFeatures ? '1%' : user?.plan === 'pro' ? '2%' : '5%'} platform fee on each job.
            Choose who pays it.
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
                <p className="font-medium">I absorb the fee</p>
                <p className="text-sm text-gray-500">Fee is deducted from your payout. Customer sees only the quote price.</p>
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
                <p className="font-medium">Pass fee to customer</p>
                <p className="text-sm text-gray-500">A "Service Fee" line item is added to the customer's quote. You receive the full quote amount.</p>
              </div>
            </label>
          </div>
        </div>

        {/* Currency */}
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">Currency</h3>
          <p className="text-sm text-gray-600 mb-3">
            Select your preferred currency for quotes and payments.
          </p>
          <select
            value={currency}
            onChange={(e) => { setCurrency(e.target.value); markDirty('currency'); }}
            disabled={currencyLoading}
            className="w-full md:w-auto border rounded px-3 py-2 disabled:opacity-50"
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
          <p className="text-xs text-gray-400 mt-2">
            All prices will be displayed in this currency. Stripe handles conversion for international payments.
          </p>
        </div>

        {/* Efficiency Factor */}
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">Efficiency Factor</h3>
          <p className="text-sm text-gray-600 mb-3">
            Adjust estimated hours based on your team's speed. 1.0 = standard, 0.8 = 20% faster, 1.2 = 20% slower.
          </p>
          <div className="flex items-center space-x-4">
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={efficiencyFactor}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setEfficiencyFactor(val);
                markDirty('efficiencyFactor');
              }}
              className="flex-1"
            />
            <div className="w-20 text-center">
              <span className="text-2xl font-bold">{efficiencyFactor.toFixed(2)}</span>
              <p className="text-xs text-gray-500">
                {efficiencyFactor < 1 ? `${Math.round((1 - efficiencyFactor) * 100)}% faster` :
                 efficiencyFactor > 1 ? `${Math.round((efficiencyFactor - 1) * 100)}% slower` : 'Standard'}
              </p>
            </div>
          </div>
          <div className="mt-3 flex justify-between text-xs text-gray-400">
            <span>Faster (0.5x)</span>
            <span>Standard (1.0x)</span>
            <span>Slower (1.5x)</span>
          </div>
        </div>

        {/* Default Labor Rate for Profitability */}
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">Default Labor Rate</h3>
          <p className="text-sm text-gray-600 mb-3">
            Your internal labor cost per hour. Used for profitability tracking after job completion.
          </p>
          <div className="flex items-center space-x-2">
            <span className="text-gray-500">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={laborRate}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                  setLaborRate(val);
                  markDirty('laborRate');
                }
              }}
              onBlur={(e) => {
                const num = parseFloat(e.target.value) || 0;
                setLaborRate(num);
              }}
              className="w-24 border rounded px-3 py-2"
            />
            <span className="text-gray-500">/hr</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            This is your cost (wages, overhead), not what you charge customers.
          </p>
        </div>

        {/* Minimum Call Out Fee */}
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">Minimum Call Out Fee</h3>
          <p className="text-sm text-gray-600 mb-3">
            Set a minimum charge for jobs. If the quote total is less than this amount, the minimum fee will be applied instead.
          </p>
          <div className="flex items-center space-x-2 mb-4">
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
            <span className="text-gray-500">minimum</span>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium mb-2">Apply to Specific Locations (Optional)</h4>
            <p className="text-sm text-gray-500 mb-3">
              Leave empty to apply to all jobs, or add specific airports/locations where this minimum applies.
            </p>
            <div className="flex space-x-2 mb-3">
              <input
                type="text"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addLocation()}
                placeholder="e.g., KJFK, KLAX"
                className="flex-1 border rounded px-3 py-2"
              />
              <button
                onClick={addLocation}
                className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600"
              >
                Add
              </button>
            </div>
            {minimumFeeLocations.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {minimumFeeLocations.map((loc) => (
                  <span
                    key={loc}
                    className="inline-flex items-center px-3 py-1 bg-gray-100 rounded-full text-sm"
                  >
                    {loc}
                    <button
                      onClick={() => removeLocation(loc)}
                      className="ml-2 text-gray-400 hover:text-red-500"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
            {minimumFeeLocations.length === 0 && (
              <p className="text-xs text-gray-400 italic">Minimum fee will apply to all locations</p>
            )}
          </div>
        </div>

        {/* Add-on Fees */}
        <div className="bg-white p-4 rounded shadow">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="font-semibold">Add-on Fees</h3>
              <p className="text-sm text-gray-500">Flat or percentage surcharges (hazmat, after-hours, rush, etc.) added on top of service pricing.</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {addonFees.length === 0 && (
                <button onClick={importDefaultAddons} disabled={addonLoading} className="px-3 py-1.5 text-sm border border-blue-500 text-blue-600 rounded hover:bg-blue-50 disabled:opacity-50">
                  Import Defaults
                </button>
              )}
              <button onClick={() => { setNewAddon({ name: '', description: '', fee_type: 'flat', amount: '' }); setShowAddonModal(true); }} className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded hover:bg-amber-600">
                + Add Fee
              </button>
            </div>
          </div>
          {addonFees.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed rounded-lg">
              <p className="text-gray-500 mb-2">No add-on fees yet</p>
              <button onClick={importDefaultAddons} disabled={addonLoading} className="text-amber-600 hover:underline">
                Import suggested defaults
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {addonFees.map((fee) => (
                <div key={fee.id} className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-amber-800">{fee.name}</h4>
                      {fee.description && <p className="text-xs text-gray-600 mt-0.5">{fee.description}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setAddonError(''); setEditingAddon({ ...fee }); }} className="p-1 text-gray-400 hover:text-blue-600 text-sm">&#9998;</button>
                      <button onClick={() => deleteAddonFee(fee)} className="p-1 text-gray-400 hover:text-red-600 text-sm">&#128465;</button>
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-xl font-bold text-amber-600">
                      {fee.fee_type === 'percent' ? `${fee.amount}%` : `${currencySymbol()}${fee.amount}`}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">
                      {fee.fee_type === 'percent' ? 'of subtotal' : 'flat fee'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Product Usage Ratios */}
        <div className="bg-white p-4 rounded shadow">
          <div className="flex justify-between items-center mb-2">
            <div>
              <h3 className="font-semibold">Product Usage Ratios</h3>
              <p className="text-sm text-gray-600">Customize estimated product quantities per service type. Used in quote builder.</p>
            </div>
            <button
              onClick={() => { setProductRatios(null); markDirty('productRatios'); }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              Reset to Defaults
            </button>
          </div>
          <div className="space-y-3 mt-3">
            {Object.entries(DEFAULT_PRODUCT_RATIOS).map(([key, defaults]) => {
              const customProducts = productRatios?.[key] || defaults;
              return (
                <div key={key} className="border rounded-lg p-3">
                  <h4 className="font-medium text-sm text-amber-700 mb-2">{SERVICE_TYPE_LABELS[key] || key}</h4>
                  <div className="space-y-2">
                    {customProducts.map((pr, idx) => {
                      const isInterior = pr.ratio_type === 'interior';
                      const perValue = isInterior ? (pr.per_ft || 10) : (pr.per_sqft || 50);
                      return (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <span className="w-40 text-gray-700">{pr.product_name}</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={pr.ratio}
                            onChange={(e) => {
                              const updated = { ...(productRatios || {}) };
                              const arr = [...(updated[key] || [...defaults])];
                              arr[idx] = { ...arr[idx], ratio: parseFloat(e.target.value) || 0.1 };
                              updated[key] = arr;
                              setProductRatios(updated);
                              markDirty('productRatios');
                            }}
                            className="w-16 border rounded px-2 py-1 text-center"
                          />
                          <span className="text-gray-500 text-xs">{pr.unit} per</span>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            value={perValue}
                            onChange={(e) => {
                              const updated = { ...(productRatios || {}) };
                              const arr = [...(updated[key] || [...defaults])];
                              const field = isInterior ? 'per_ft' : 'per_sqft';
                              arr[idx] = { ...arr[idx], [field]: parseInt(e.target.value) || 1 };
                              updated[key] = arr;
                              setProductRatios(updated);
                              markDirty('productRatios');
                            }}
                            className="w-16 border rounded px-2 py-1 text-center"
                          />
                          <span className="text-gray-500 text-xs">{isInterior ? 'ft' : 'sqft'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quote Display Preference */}
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">Quote Display for Customers</h3>
          <p className="text-sm text-gray-600 mb-3">Choose what pricing details customers see on their quotes.</p>
          <div className="space-y-3">
            {[
              { value: 'package', label: 'Package Price Only', desc: 'Customer sees single total price (recommended)' },
              { value: 'labor_products', label: 'Labor + Products', desc: 'Shows two line items: labor and products/materials' },
              { value: 'full_breakdown', label: 'Full Breakdown', desc: 'Shows all service line items with individual pricing' },
            ].map((option) => (
              <label
                key={option.value}
                className={`flex items-start p-3 border rounded-lg cursor-pointer transition-colors ${
                  quoteDisplayPref === option.value ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="quoteDisplay"
                  value={option.value}
                  checked={quoteDisplayPref === option.value}
                  onChange={(e) => {
                    setQuoteDisplayPref(e.target.value);
                    markDirty('quoteDisplay');
                  }}
                  className="mt-1 mr-3"
                />
                <div>
                  <p className="font-medium">{option.label}</p>
                  <p className="text-sm text-gray-500">{option.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Email Notifications */}
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">Email Notifications</h3>
          {[
            { key: 'quoteCreated', label: 'Quote created confirmation' },
            { key: 'quoteSent', label: 'Quote sent confirmation' },
            { key: 'weeklySummary', label: 'Weekly summary' },
            { key: 'priceReview', label: 'Price review reminders' },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between mb-2">
              <span>{item.label}</span>
              <input
                type="checkbox"
                checked={emailNotifs[item.key]}
                onChange={(e) => {
                  const newSettings = { ...emailNotifs, [item.key]: e.target.checked };
                  setEmailNotifs(newSettings);
                  markDirty('notifications');
                }}
              />
            </div>
          ))}
        </div>
        {/* SMS Alerts to You */}
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">SMS Alerts to You</h3>
          {!hasAllFeatures && user?.plan === 'free' && (
            <div className="text-center py-4">
              <p className="mb-2">SMS alerts are available on Pro plans.</p>
              <a href="/settings?upgrade=pro" className="px-4 py-2 rounded bg-gradient-to-r from-amber-500 to-amber-600 text-white">Upgrade to Pro</a>
            </div>
          )}
          {(hasAllFeatures || (user && user.plan !== 'free')) && (
            [
              { key: 'quoteViewed', label: 'Quote viewed alert' },
              { key: 'quoteExpiring', label: 'Quote expiring soon' },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between mb-2">
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={smsAlerts[item.key]}
                  onChange={(e) => {
                    const newSettings = { ...smsAlerts, [item.key]: e.target.checked };
                    setSmsAlerts(newSettings);
                    markDirty('notifications');
                  }}
                />
              </div>
            ))
          )}
        </div>
        {/* SMS to Your Clients */}
        <div id="smsClients" className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">SMS to Your Clients</h3>
          {!hasAllFeatures && (
            <div className="text-center py-4">
              <p className="mb-2">Texting clients is available on the Business plan.</p>
              <a href="/settings?upgrade=business" className="px-4 py-2 rounded bg-gradient-to-r from-amber-500 to-amber-600 text-white">Upgrade to Business</a>
            </div>
          )}
          {hasAllFeatures && (
            <>
              {/* Master SMS Toggle */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b">
                <div>
                  <span className="font-medium">Enable SMS</span>
                  <p className="text-xs text-gray-500">Master toggle for all client SMS</p>
                </div>
                <input
                  type="checkbox"
                  checked={smsEnabled}
                  onChange={(e) => {
                    setSmsEnabled(e.target.checked);
                    markDirty('smsEnabled');
                  }}
                />
              </div>
              {[
                { key: 'quoteDelivery', label: 'Quote delivery via SMS' },
                { key: 'followup3', label: '3-day follow-up' },
                { key: 'followup7', label: '7-day follow-up' },
                { key: 'expiration', label: 'Expiration warning to client' },
                { key: 'jobReminderSms', label: 'Job reminder (day before)' },
                { key: 'paymentConfirmSms', label: 'Payment confirmation' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between mb-2">
                  <span className={!smsEnabled ? 'text-gray-400' : ''}>{item.label}</span>
                  <input
                    type="checkbox"
                    disabled={!smsEnabled}
                    checked={smsClient[item.key]}
                    onChange={(e) => {
                      const newSettings = { ...smsClient, [item.key]: e.target.checked };
                      setSmsClient(newSettings);
                      markDirty('notifications');
                    }}
                  />
                </div>
              ))}
            </>
          )}
        </div>
        {/* Account Section */}
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-semibold mb-2">Account</h3>
          <p className="mb-2">Email: {user?.email}</p>
          <a href="#" className="text-blue-600 underline mb-2 inline-block">Change Password</a>
          <div className="mt-3 pt-3 border-t">
            <button
              onClick={() => { restartTour(); window.location.href = '/dashboard'; }}
              className="text-sm text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Restart Dashboard Tour
            </button>
          </div>
          <div className="mt-2">
            <label className="block mb-1">Price Review Reminder</label>
            <select
              value={priceReminder}
              onChange={(e) => {
                setPriceReminder(parseInt(e.target.value));
                markDirty('notifications');
              }}
              className="border rounded px-2 py-1"
            >
              <option value={6}>Every 6 months</option>
              <option value={12}>Every 12 months</option>
            </select>
          </div>
        </div>

        {/* Add Addon Fee Modal */}
        {showAddonModal && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-lg p-5 sm:p-6 w-full sm:max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">Add Fee</h3>
              {addonError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{addonError}</div>}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fee Name *</label>
                  <input type="text" value={newAddon.name} onChange={(e) => setNewAddon({ ...newAddon, name: e.target.value })}
                    placeholder="e.g., After Hours" className="w-full border rounded px-3 py-2" autoFocus />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input type="text" value={newAddon.description} onChange={(e) => setNewAddon({ ...newAddon, description: e.target.value })}
                    placeholder="Optional description" className="w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fee Type</label>
                  <div className="flex gap-2">
                    {['flat', 'percent'].map(t => (
                      <button key={t} type="button" onClick={() => setNewAddon({ ...newAddon, fee_type: t })}
                        className={`flex-1 py-2 rounded text-sm font-medium border transition-colors ${
                          newAddon.fee_type === t ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                        }`}>
                        {t === 'flat' ? 'Flat $' : 'Percent %'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                  <div className="relative">
                    {newAddon.fee_type === 'flat' && <span className="absolute left-3 top-2.5 text-gray-400">$</span>}
                    <input type="number" value={newAddon.amount} onChange={(e) => setNewAddon({ ...newAddon, amount: e.target.value })}
                      placeholder={newAddon.fee_type === 'flat' ? '150' : '25'}
                      className={`w-full border rounded py-2 ${newAddon.fee_type === 'flat' ? 'pl-7 pr-3' : 'pl-3 pr-8'}`} />
                    {newAddon.fee_type === 'percent' && <span className="absolute right-3 top-2.5 text-gray-400">%</span>}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => { setShowAddonModal(false); setAddonError(''); }} className="px-4 py-2 border rounded">Cancel</button>
                <button onClick={addAddonFee} disabled={addonLoading || !newAddon.name}
                  className="px-4 py-2 bg-amber-500 text-white rounded disabled:opacity-50">{addonLoading ? 'Saving...' : 'Add Fee'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Addon Fee Modal */}
        {editingAddon && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-lg p-5 sm:p-6 w-full sm:max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">Edit Fee</h3>
              {addonError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{addonError}</div>}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fee Name</label>
                  <input type="text" value={editingAddon.name} onChange={(e) => setEditingAddon({ ...editingAddon, name: e.target.value })}
                    className="w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input type="text" value={editingAddon.description || ''} onChange={(e) => setEditingAddon({ ...editingAddon, description: e.target.value })}
                    className="w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fee Type</label>
                  <div className="flex gap-2">
                    {['flat', 'percent'].map(t => (
                      <button key={t} type="button" onClick={() => setEditingAddon({ ...editingAddon, fee_type: t })}
                        className={`flex-1 py-2 rounded text-sm font-medium border transition-colors ${
                          editingAddon.fee_type === t ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                        }`}>
                        {t === 'flat' ? 'Flat $' : 'Percent %'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                  <div className="relative">
                    {editingAddon.fee_type === 'flat' && <span className="absolute left-3 top-2.5 text-gray-400">$</span>}
                    <input type="number" value={editingAddon.amount || ''} onChange={(e) => setEditingAddon({ ...editingAddon, amount: e.target.value })}
                      className={`w-full border rounded py-2 ${editingAddon.fee_type === 'flat' ? 'pl-7 pr-3' : 'pl-3 pr-8'}`} />
                    {editingAddon.fee_type === 'percent' && <span className="absolute right-3 top-2.5 text-gray-400">%</span>}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => { setEditingAddon(null); setAddonError(''); }} className="px-4 py-2 border rounded">Cancel</button>
                <button onClick={updateAddonFee} disabled={addonLoading}
                  className="px-4 py-2 bg-amber-500 text-white rounded disabled:opacity-50">{addonLoading ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="text-gray-500 p-4">Loading...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
