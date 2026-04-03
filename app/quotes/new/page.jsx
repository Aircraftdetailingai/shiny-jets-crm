"use client";
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import SendQuoteModal from '../../../components/SendQuoteModal.jsx';
import LoadingSpinner from '../../../components/LoadingSpinner.jsx';
import { useToast } from '../../../components/Toast.jsx';
import { formatPrice, currencySymbol } from '../../../lib/formatPrice';
import { calculateProductEstimates } from '../../../lib/product-calculator';
import { calculateCcFee } from '../../../lib/cc-fee';

const categoryOrder = ['piston', 'turboprop', 'light_jet', 'midsize_jet', 'super_midsize_jet', 'large_jet', 'helicopter'];

const HOURS_FIELD_OPTIONS = {
  ext_wash_hours: 'Exterior Wash',
  decon_hours: 'Decon Wash',
  int_detail_hours: 'Interior Detail',
  leather_hours: 'Leather Treatment',
  carpet_hours: 'Carpet Cleaning',
  wax_hours: 'Wax Application',
  polish_hours: 'Polish',
  ceramic_hours: 'Ceramic Coating',
  spray_ceramic_hours: 'Spray Ceramic',
  brightwork_hours: 'Brightwork',
};

const categoryLabels = {
  piston: 'Pistons',
  turboprop: 'Turboprops',
  light_jet: 'Light Jets',
  midsize_jet: 'Midsize Jets',
  super_midsize_jet: 'Super Midsize',
  large_jet: 'Large Jets',
  helicopter: 'Helicopters',
};

function NewQuoteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success: toastSuccess } = useToast();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [availableServices, setAvailableServices] = useState([]);
  const [preselectedCustomer, setPreselectedCustomer] = useState(null);
  const [availablePackages, setAvailablePackages] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [models, setModels] = useState([]);
  const [selectedManufacturer, setSelectedManufacturer] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [selectedAircraft, setSelectedAircraft] = useState(null);
  const [selectedServices, setSelectedServices] = useState({});
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [accessDifficulty, setAccessDifficulty] = useState(1.0);
  const [quoteNotes, setQuoteNotes] = useState('');
  const [isModalOpen, setModalOpen] = useState(false);
  const [minimumFee, setMinimumFee] = useState(0);
  const [minimumFeeLocations, setMinimumFeeLocations] = useState([]);
  const [jobLocation, setJobLocation] = useState('');
  const [availableAddons, setAvailableAddons] = useState([]);
  const [selectedAddons, setSelectedAddons] = useState({});
  const [airport, setAirport] = useState('');
  const [tailNumber, setTailNumber] = useState('');
  const [proposedDate, setProposedDate] = useState('');
  const [proposedTime, setProposedTime] = useState('08:00');
  const [bufferMinutes, setBufferMinutes] = useState(60);
  const [excludeWeekends, setExcludeWeekends] = useState(true);
  const [calendarSuggestion, setCalendarSuggestion] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [leadContext, setLeadContext] = useState(null); // { service, notes, photos, aircraft, tail, airport }
  const [pendingAircraftMatch, setPendingAircraftMatch] = useState(null); // { manufacturer, model, id }
  const [customProductRatios, setCustomProductRatios] = useState(null);
  const [serviceProductLinks, setServiceProductLinks] = useState([]);
  const [serviceEquipmentLinks, setServiceEquipmentLinks] = useState([]);
  const [customHours, setCustomHours] = useState({});
  const [saveDefaultPrompt, setSaveDefaultPrompt] = useState({});
  const [savingDefault, setSavingDefault] = useState({});
  const [aircraftHoursRef, setAircraftHoursRef] = useState(null);
  const [communityHours, setCommunityHours] = useState({});
  const [ccFeeMode, setCcFeeMode] = useState('absorb');

  // Fetch manufacturers on mount
  useEffect(() => {
    const fetchManufacturers = async () => {
      try {
        const res = await fetch('/api/aircraft/manufacturers');
        if (res.ok) {
          const data = await res.json();
          setManufacturers(data.manufacturers || []);
        }
      } catch (err) {
        console.error('Failed to fetch manufacturers:', err);
      }
    };
    fetchManufacturers();
  }, []);

  // Match pending aircraft after manufacturers load
  useEffect(() => {
    if (manufacturers.length === 0) return;
    const pending = localStorage.getItem('_pending_aircraft');
    if (!pending) return;
    localStorage.removeItem('_pending_aircraft');

    const q = pending.toLowerCase();
    // Find which manufacturer the aircraft string starts with (longest match first)
    const sortedMfrs = [...manufacturers].sort((a, b) => b.length - a.length);
    const mfrMatch = sortedMfrs.find(m => q.startsWith(m.toLowerCase()));

    if (mfrMatch) {
      const mdl = q.slice(mfrMatch.length).trim();
      setSelectedManufacturer(mfrMatch);
      if (mdl) setPendingAircraftMatch({ manufacturer: mfrMatch, model: mdl });
    }
  }, [manufacturers]);

  // Fetch models when manufacturer changes
  useEffect(() => {
    if (!selectedManufacturer) {
      setModels([]);
      return;
    }
    const fetchModels = async () => {
      try {
        const res = await fetch(`/api/aircraft/models?make=${encodeURIComponent(selectedManufacturer)}`);
        if (res.ok) {
          const data = await res.json();
          setModels(data.models || []);
        }
      } catch (err) {
        console.error('Failed to fetch models:', err);
      }
    };
    fetchModels();
    // Only clear aircraft if not doing a prefill
    if (!pendingAircraftMatch) setSelectedAircraft(null);
  }, [selectedManufacturer]);

  // Auto-select model after models list loads (from prefill)
  useEffect(() => {
    if (!pendingAircraftMatch || models.length === 0) return;
    const headers = { Authorization: `Bearer ${localStorage.getItem('vector_token')}` };
    let q = pendingAircraftMatch.model.toLowerCase().trim();
    // FAA model code mappings
    const faaMap = { 'g-iv': 'g4', 'g-ivsp': 'g4', 'g-v': 'g550', 'gv-sp': 'g550', 'g-vi': 'g650', 'g-200': 'g280', 'giv-x': 'g450' };
    if (faaMap[q]) q = faaMap[q];
    // Strip common suffixes
    const cleaned = q.replace(/[-\s]/g, '');

    const match = models.find(m => m.model.toLowerCase() === q)
      || models.find(m => m.model.toLowerCase().replace(/[-\s]/g, '') === cleaned)
      || models.find(m => m.model.toLowerCase().includes(q) || q.includes(m.model.toLowerCase()));
    if (match) {
      fetch(`/api/aircraft/${match.id}`, { headers })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.aircraft) setSelectedAircraft(data.aircraft); })
        .catch(() => {});
    }
    setPendingAircraftMatch(null);
  }, [models, pendingAircraftMatch]);

  // Auth + fetch services/packages/addons/minimum fee
  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    const stored = localStorage.getItem('vector_user');
    if (!token || !stored) {
      router.push('/login');
      return;
    }
    let parsedUser;
    try { parsedUser = JSON.parse(stored); } catch { localStorage.removeItem('vector_user'); router.push('/login'); return; }
    setUser(parsedUser);
    setLoading(false);

    const headers = { Authorization: `Bearer ${token}` };

    const fetchData = async () => {
      const [servicesRes, packagesRes, minFeeRes, addonsRes, productRatiosRes, svcProdRes, svcEquipRes, ccFeeRes] = await Promise.allSettled([
        fetch('/api/services', { headers }),
        fetch('/api/packages', { headers }),
        fetch('/api/user/minimum-fee', { headers }),
        fetch('/api/addon-fees', { headers }),
        fetch('/api/user/product-ratios', { headers }),
        fetch('/api/services/products', { headers }),
        fetch('/api/services/equipment', { headers }),
        fetch('/api/user/cc-fee', { headers }),
      ]);

      if (servicesRes.status === 'fulfilled' && servicesRes.value.ok) {
        const data = await servicesRes.value.json();
        setAvailableServices(data.services || []);
      }
      if (packagesRes.status === 'fulfilled' && packagesRes.value.ok) {
        const data = await packagesRes.value.json();
        setAvailablePackages(data.packages || []);
      }
      if (minFeeRes.status === 'fulfilled' && minFeeRes.value.ok) {
        const data = await minFeeRes.value.json();
        setMinimumFee(parseFloat(data.minimum_callout_fee) || 0);
        setMinimumFeeLocations(data.minimum_fee_locations || []);
      }
      if (addonsRes.status === 'fulfilled' && addonsRes.value.ok) {
        const data = await addonsRes.value.json();
        setAvailableAddons(data.fees || []);
      }
      if (productRatiosRes.status === 'fulfilled' && productRatiosRes.value.ok) {
        const data = await productRatiosRes.value.json();
        if (data.ratios) setCustomProductRatios(data.ratios);
      }
      if (svcProdRes.status === 'fulfilled' && svcProdRes.value.ok) {
        const data = await svcProdRes.value.json();
        setServiceProductLinks(data.links || []);
      }
      if (svcEquipRes.status === 'fulfilled' && svcEquipRes.value.ok) {
        const data = await svcEquipRes.value.json();
        setServiceEquipmentLinks(data.links || []);
      }
      if (ccFeeRes.status === 'fulfilled' && ccFeeRes.value.ok) {
        const data = await ccFeeRes.value.json();
        setCcFeeMode(data.cc_fee_mode || 'absorb');
      }
    };

    fetchData().catch(err => console.error('Quote builder fetch error:', err));

    // Pre-select customer from URL param
    const customerIdParam = searchParams.get('customer_id');
    if (customerIdParam) {
      fetch(`/api/customers/${customerIdParam}`, { headers })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.customer) setPreselectedCustomer(data.customer);
        })
        .catch(() => {});
    }

    // Pre-fill from lead request (stored in localStorage)
    try {
      const stored = localStorage.getItem('quote_prefill');
      if (stored) {
        const prefill = JSON.parse(stored);
        // Only use if less than 5 minutes old
        if (Date.now() - (prefill.timestamp || 0) < 300000) {
          if (prefill.name || prefill.email) {
            setPreselectedCustomer({
              name: prefill.name || '',
              email: prefill.email || '',
              phone: prefill.phone || '',
              company_name: '',
            });
          }
          if (prefill.airport) setAirport(prefill.airport);
          if (prefill.tail) setTailNumber(prefill.tail);

          // Store lead context for reference panel
          if (prefill.notes || prefill.service || prefill.photos?.length) {
            setLeadContext({
              leadId: prefill.leadId,
              customerName: prefill.name,
              service: prefill.service,
              notes: prefill.notes,
              photos: prefill.photos || [],
              aircraft: prefill.aircraft,
              tail: prefill.tail,
              airport: prefill.airport,
            });
          }

          // Match aircraft — store for deferred matching after manufacturers load
          if (prefill.aircraft) {
            const q = prefill.aircraft.trim();
            // Store raw aircraft string — will be matched in useEffect after manufacturers load
            localStorage.setItem('_pending_aircraft', q);
          }
        }
        localStorage.removeItem('quote_prefill');
      }
    } catch {}
  }, [router]);

  // Auto-suggest date from Google Calendar when services change
  useEffect(() => {
    if (!selectedAircraft || Object.keys(selectedServices).length === 0) return;
    if (proposedDate) return; // don't override manual selection

    const token = localStorage.getItem('vector_token');
    if (!token) return;

    // Calculate total hours from selected services
    const svcList = availableServices.filter(s => selectedServices[s.id]);
    if (svcList.length === 0) return;

    let hours = 0;
    svcList.forEach(svc => {
      const h = parseFloat(customHours[svc.id] ?? svc.default_hours ?? 0) || (selectedAircraft[svc.hours_field] ? parseFloat(selectedAircraft[svc.hours_field]) : 1);
      hours += h;
    });
    if (hours <= 0) hours = 4;

    setCalendarLoading(true);
    fetch(`/api/google-calendar/free-busy?duration=${hours}&excludeWeekends=${excludeWeekends}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.suggested) {
          setCalendarSuggestion(data.suggested);
          setProposedDate(data.suggested.date);
          setProposedTime(data.suggested.time);
        }
      })
      .catch(() => {})
      .finally(() => setCalendarLoading(false));
  }, [selectedAircraft?.id, Object.keys(selectedServices).length]);

  const handleSelectAircraft = async (aircraft) => {
    try {
      const res = await fetch(`/api/aircraft/${aircraft.id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedAircraft(data.aircraft);
        setSelectedServices({});
        setSelectedPackage(null);
        setSelectedAddons({});
        setAccessDifficulty(1.0);
        setQuoteNotes('');
        setJobLocation('');
        setAirport('');
        setCustomHours({});
        setSaveDefaultPrompt({});
        setAircraftHoursRef(null);
        setCommunityHours({});

        // Fetch reference hours from aircraft_hours table
        const ac = data.aircraft;
        if (ac.manufacturer && ac.model) {
          const encodedMake = encodeURIComponent(ac.manufacturer);
          const encodedModel = encodeURIComponent(ac.model);
          fetch(`/api/aircraft-hours?make=${encodedMake}&model=${encodedModel}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.hours) setAircraftHoursRef(d.hours); })
            .catch(() => {});

          // Fetch community hours data (Enterprise tier only)
          const storedUser = localStorage.getItem('vector_user');
          const userPlan = storedUser ? (JSON.parse(storedUser).plan || 'free') : 'free';
          if (userPlan === 'enterprise' || JSON.parse(storedUser || '{}').is_admin) {
            const token = localStorage.getItem('vector_token');
            fetch(`/api/community-hours?make=${encodedMake}&model=${encodedModel}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then(r => r.ok ? r.json() : null)
              .then(d => { if (d?.hours) setCommunityHours(d.hours); })
              .catch(() => {});
          }
        }

        setTimeout(() => {
          document.getElementById('services-section')?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    } catch (err) {
      console.error('Failed to fetch aircraft details:', err);
    }
  };

  const toggleService = (serviceId) => {
    setSelectedPackage(null);
    setSelectedServices((prev) => ({ ...prev, [serviceId]: !prev[serviceId] }));
  };

  const selectPackage = (pkg) => {
    if (selectedPackage?.id === pkg.id) {
      setSelectedPackage(null);
      setSelectedServices({});
    } else {
      setSelectedPackage(pkg);
      const newSelected = {};
      const serviceIds = Array.isArray(pkg.service_ids) ? pkg.service_ids : [];
      serviceIds.forEach(id => { newSelected[id] = true; });
      setSelectedServices(newSelected);
    }
  };

  // Map a service name to the matching aircraft_hours column
  const getRefHours = (svc) => {
    if (!aircraftHoursRef) return 0;
    const name = (svc.name || '').toLowerCase();
    if (name.includes('maintenance') || (name.includes('wash') && !name.includes('decon'))) return parseFloat(aircraftHoursRef.maintenance_wash_hrs) || 0;
    if (name.includes('decon')) return parseFloat(aircraftHoursRef.decon_paint_hrs) || 0;
    if (name.includes('polish')) return parseFloat(aircraftHoursRef.one_step_polish_hrs) || 0;
    if (name.includes('spray ceramic') || name.includes('spray coat') || name.includes('topcoat') || name.includes('air guard')) return parseFloat(aircraftHoursRef.spray_ceramic_hrs) || 0;
    if (name.includes('ceramic')) return parseFloat(aircraftHoursRef.ceramic_coating_hrs) || 0;
    if (name.includes('wax') || name.includes('static guard')) return parseFloat(aircraftHoursRef.wax_hrs) || 0;
    if (name.includes('leather')) return parseFloat(aircraftHoursRef.leather_hrs) || 0;
    if (name.includes('carpet') || name.includes('extract')) return parseFloat(aircraftHoursRef.carpet_hrs) || 0;
    // Package-level hours from the reference sheet
    if (name.includes('bronze')) return parseFloat(aircraftHoursRef.bronze_pkg_hrs) || 0;
    if (name.includes('silver')) return parseFloat(aircraftHoursRef.silver_pkg_hrs) || 0;
    if (name.includes('gold')) return parseFloat(aircraftHoursRef.gold_pkg_hrs) || 0;
    if (name.includes('platinum')) return parseFloat(aircraftHoursRef.platinum_pkg_hrs) || 0;
    if (name.includes('shiny jet')) return parseFloat(aircraftHoursRef.shiny_jet_pkg_hrs) || 0;
    return 0;
  };

  // Fallback: hours from the old aircraft table (based on hours_field or name matching)
  const getOldAircraftHours = (svc) => {
    if (!selectedAircraft) return 0;
    if (svc.hours_field && selectedAircraft[svc.hours_field] !== undefined) {
      return parseFloat(selectedAircraft[svc.hours_field]) || 0;
    }
    const name = (svc.name || '').toLowerCase();
    if (name.includes('leather')) return parseFloat(selectedAircraft.leather_hours) || 0;
    if (name.includes('carpet') || name.includes('upholster') || name.includes('extract')) return parseFloat(selectedAircraft.carpet_hours) || 0;
    if (name.includes('decon')) return parseFloat(selectedAircraft.decon_hours) || parseFloat(selectedAircraft.ext_wash_hours) || 0;
    if (name.includes('spray ceramic') || name.includes('spray coat') || name.includes('topcoat')) return parseFloat(selectedAircraft.spray_ceramic_hours) || parseFloat(selectedAircraft.ceramic_hours) || 0;
    if (name.includes('ceramic')) return parseFloat(selectedAircraft.ceramic_hours) || 0;
    if (name.includes('wax')) return parseFloat(selectedAircraft.wax_hours) || 0;
    if (name.includes('brightwork') || name.includes('bright') || name.includes('chrome')) return parseFloat(selectedAircraft.brightwork_hours) || 0;
    if (name.includes('polish')) return parseFloat(selectedAircraft.polish_hours) || 0;
    if (name.includes('quick turn') && name.includes('interior')) return parseFloat(selectedAircraft.int_detail_hours) || 0;
    if (name.includes('quick turn') && name.includes('exterior')) return parseFloat(selectedAircraft.ext_wash_hours) || 0;
    if (name.includes('interior') || name.includes('vacuum') || name.includes('wipe') || name.includes('cabin')) return parseFloat(selectedAircraft.int_detail_hours) || 0;
    return parseFloat(selectedAircraft.ext_wash_hours) || 0;
  };

  // Combined: aircraft_hours reference > old aircraft table
  const getAircraftHours = (svc) => {
    const refHrs = getRefHours(svc);
    if (refHrs > 0) return refHrs;
    return getOldAircraftHours(svc);
  };

  // Get community average hours for a service
  const getCommunityHours = (svc) => {
    const field = svc.hours_field;
    if (field && communityHours[field] && communityHours[field].sample_count >= 3) {
      return communityHours[field].avg_hours;
    }
    return 0;
  };

  // Get hours for a service: manual override > detailer default > community avg > aircraft_hours ref > old aircraft > 1.0 fallback
  const getHoursForService = (svc) => {
    if (customHours[svc.id] !== undefined) return customHours[svc.id];
    if (svc.default_hours && parseFloat(svc.default_hours) > 0) return parseFloat(svc.default_hours);
    const community = getCommunityHours(svc);
    if (community > 0) return community;
    const aircraft = getAircraftHours(svc);
    if (aircraft > 0) return aircraft;
    return 1.0; // Default for custom services not in aircraft database
  };

  // Get the source of hours for display
  const getHoursSource = (svc) => {
    if (customHours[svc.id] !== undefined) return { type: 'manual', label: 'Your override' };
    if (svc.default_hours && parseFloat(svc.default_hours) > 0) return { type: 'personal', label: 'Your default' };
    const field = svc.hours_field;
    if (field && communityHours[field] && communityHours[field].sample_count >= 3) {
      return { type: 'community', label: `Based on ${communityHours[field].sample_count} completions` };
    }
    const refHrs = getRefHours(svc);
    if (refHrs > 0) return { type: 'aircraft', label: 'From aircraft hours database' };
    const oldHrs = getOldAircraftHours(svc);
    if (oldHrs > 0) return { type: 'aircraft', label: 'From aircraft data' };
    return { type: 'platform', label: 'Estimated' };
  };

  // Get the "starting" hours (before manual override) for comparison
  const getDefaultHours = (svc) => {
    if (svc.default_hours && parseFloat(svc.default_hours) > 0) return parseFloat(svc.default_hours);
    const community = getCommunityHours(svc);
    if (community > 0) return community;
    const aircraft = getAircraftHours(svc);
    if (aircraft > 0) return aircraft;
    return 1.0;
  };

  const handleHoursChange = (svcId, svcName, newHours) => {
    const val = Math.max(0, parseFloat(newHours) || 0);
    setCustomHours(prev => ({ ...prev, [svcId]: val }));
    // Show save-default prompt
    const svc = availableServices.find(s => s.id === svcId);
    const defaultHrs = svc ? getDefaultHours(svc) : 0;
    if (val !== defaultHrs && val > 0) {
      setSaveDefaultPrompt(prev => ({ ...prev, [svcId]: true }));
    } else {
      setSaveDefaultPrompt(prev => ({ ...prev, [svcId]: false }));
    }
  };

  const saveAsDefault = async (svcId) => {
    const hours = customHours[svcId];
    if (hours === undefined) return;
    setSavingDefault(prev => ({ ...prev, [svcId]: true }));
    try {
      const token = localStorage.getItem('vector_token');
      await fetch(`/api/services/${svcId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ default_hours: hours }),
      });
      // Update local service data
      setAvailableServices(prev => prev.map(s => s.id === svcId ? { ...s, default_hours: hours } : s));
      setSaveDefaultPrompt(prev => ({ ...prev, [svcId]: false }));
      toastSuccess('Default hours saved');
    } catch {} finally {
      setSavingDefault(prev => ({ ...prev, [svcId]: false }));
    }
  };

  const dismissSavePrompt = (svcId) => {
    setSaveDefaultPrompt(prev => ({ ...prev, [svcId]: false }));
  };

  const getServicePrice = (svc) => {
    const hours = getHoursForService(svc);
    return hours * (parseFloat(svc.hourly_rate) || 0);
  };

  const getSelectedServicesList = () => availableServices.filter(svc => selectedServices[svc.id]);

  const selectedServicesList = getSelectedServicesList();
  const totalHours = selectedServicesList.reduce((sum, svc) => sum + getHoursForService(svc), 0);
  const servicesSubtotal = selectedServicesList.reduce((sum, svc) => sum + getServicePrice(svc), 0);
  const discountPercent = selectedPackage ? (parseFloat(selectedPackage.discount_percent) || 0) : 0;
  const discountAmount = servicesSubtotal * (discountPercent / 100);
  const afterDiscount = servicesSubtotal - discountAmount;
  const afterDifficulty = afterDiscount * accessDifficulty;

  const getSelectedAddonsList = () => availableAddons.filter(a => selectedAddons[a.id]);
  const selectedAddonsList = getSelectedAddonsList();
  const flatAddonsTotal = selectedAddonsList.filter(a => a.fee_type === 'flat').reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
  const percentAddonsTotal = selectedAddonsList.filter(a => a.fee_type === 'percent').reduce((sum, a) => sum + (afterDifficulty * (parseFloat(a.amount) || 0) / 100), 0);
  const addonsTotal = flatAddonsTotal + percentAddonsTotal;
  const calculatedPrice = afterDifficulty + addonsTotal;

  const minimumFeeApplies = () => {
    if (minimumFee <= 0) return false;
    if (calculatedPrice >= minimumFee) return false;
    if (minimumFeeLocations.length > 0 && airport) {
      const normalizedJob = airport.toUpperCase().trim();
      return minimumFeeLocations.some(loc => normalizedJob.includes(loc.toUpperCase().trim()));
    }
    return true;
  };

  const isMinimumApplied = minimumFeeApplies();
  const totalPrice = isMinimumApplied ? minimumFee : calculatedPrice;
  const ccFeeAmount = ccFeeMode === 'pass' ? calculateCcFee(totalPrice) : 0;
  const grandTotal = totalPrice + ccFeeAmount;

  const lineItems = selectedServicesList.map(svc => ({
    service_id: svc.id,
    description: svc.name,
    service_type: svc.service_type || 'exterior',
    hours_field: svc.hours_field || '',
    hours: getHoursForService(svc),
    rate: parseFloat(svc.hourly_rate) || 0,
    amount: getServicePrice(svc) * accessDifficulty * (1 - discountPercent / 100),
    product_cost_per_hour: parseFloat(svc.product_cost_per_hour) || 0,
  }));

  const estimatedProductCost = selectedServicesList.reduce((sum, svc) => {
    const hours = getHoursForService(svc);
    const costPerHour = parseFloat(svc.product_cost_per_hour) || 0;
    return sum + (hours * costPerHour);
  }, 0);
  const estimatedProfit = totalPrice - estimatedProductCost;
  const laborTotal = totalPrice - estimatedProductCost;
  const productsTotal = estimatedProductCost;

  const productEstimates = selectedAircraft && selectedServicesList.length > 0
    ? calculateProductEstimates(selectedServicesList, selectedAircraft, customProductRatios)
    : [];

  const addonFeeItems = selectedAddonsList.map(a => ({
    id: a.id,
    name: a.name,
    fee_type: a.fee_type,
    amount: parseFloat(a.amount) || 0,
    calculated: a.fee_type === 'percent' ? afterDifficulty * (parseFloat(a.amount) || 0) / 100 : (parseFloat(a.amount) || 0),
  }));

  const toggleAddon = (addonId) => {
    setSelectedAddons(prev => ({ ...prev, [addonId]: !prev[addonId] }));
  };

  const openSendModal = () => setModalOpen(true);
  const closeSendModal = () => setModalOpen(false);

  const resetQuoteForm = () => {
    setSelectedAircraft(null);
    setSelectedServices({});
    setSelectedPackage(null);
    setSelectedManufacturer('');
    setSelectedCategory('');
    setModelSearch('');
    setAccessDifficulty(1.0);
    setQuoteNotes('');
    setJobLocation('');
    setAirport('');
    setTailNumber('');
    setSelectedAddons({});
    setCustomProductRatios(null);
    setCustomHours({});
    setSaveDefaultPrompt({});
    setModalOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const quoteData = selectedAircraft
    ? {
        aircraft: {
          id: selectedAircraft.id,
          name: `${selectedAircraft.manufacturer} ${selectedAircraft.model}`,
          category: selectedAircraft.category,
          surface_area_sqft: selectedAircraft.surface_area_sqft,
        },
        selectedServices: selectedServicesList,
        selectedPackage,
        totalHours,
        totalPrice,
        calculatedPrice,
        isMinimumApplied,
        minimumFee: isMinimumApplied ? minimumFee : null,
        jobLocation,
        lineItems,
        laborTotal,
        productsTotal,
        accessDifficulty,
        discountPercent,
        discountAmount,
        addonFees: addonFeeItems,
        addonsTotal,
        airport,
        tailNumber,
        proposedDate: proposedDate || null,
        proposedTime: proposedTime || null,
        bufferMinutes,
        productEstimates,
        linkedProducts: serviceProductLinks.filter(l => selectedServicesList.some(s => s.id === l.service_id)).map(l => {
          const svc = selectedServicesList.find(s => s.id === l.service_id);
          const hours = svc ? getHoursForService(svc) : 0;
          return {
            product_id: l.product_id,
            product_name: l.products?.name,
            unit: l.products?.unit,
            quantity: l.fixed_quantity > 0 ? l.fixed_quantity : (l.quantity_per_hour || 0) * hours,
            cost_per_unit: l.products?.cost_per_unit || 0,
          };
        }),
        linkedEquipment: (() => {
          const eqLinks = serviceEquipmentLinks.filter(l => selectedServicesList.some(s => s.id === l.service_id));
          const unique = [];
          const seen = new Set();
          for (const l of eqLinks) {
            if (!seen.has(l.equipment_id)) {
              seen.add(l.equipment_id);
              unique.push({ equipment_id: l.equipment_id, equipment_name: l.equipment?.name, brand: l.equipment?.brand });
            }
          }
          return unique;
        })(),
      }
    : null;

  if (loading) {
    return <LoadingSpinner message="Loading..." />;
  }

  // Filter models by search and category
  const filteredModels = models.filter(m => {
    if (selectedCategory && m.category !== selectedCategory) return false;
    if (modelSearch) {
      const search = modelSearch.toLowerCase();
      return (m.model || '').toLowerCase().includes(search) || (m.manufacturer || '').toLowerCase().includes(search);
    }
    return true;
  });

  // Group models by category
  const groupedModels = {};
  filteredModels.forEach(m => {
    const cat = m.category || 'other';
    if (!groupedModels[cat]) groupedModels[cat] = [];
    groupedModels[cat].push(m);
  });

  const sortedCategories = categoryOrder.filter(c => groupedModels[c]);

  return (
    <div className="min-h-screen bg-v-charcoal p-4 pb-40 text-v-text-primary">
      {/* Header */}
      <header className="sticky top-0 z-40 -mx-4 -mt-4 px-4 pt-4 pb-3 mb-6 bg-gradient-to-b from-v-charcoal via-v-charcoal to-transparent flex justify-between items-center text-white">
        <div className="flex items-center gap-4">
          <a href={leadContext?.leadId ? `/requests/${leadContext.leadId}` : '/quotes'} className="text-lg text-gray-400 hover:text-v-gold transition-colors">&#8592;</a>
          <h1 className="text-2xl font-normal tracking-[0.2em] uppercase" style={{ fontFamily: "var(--font-playfair), 'Playfair Display', serif" }}>
            {leadContext?.customerName ? `Quote for ${leadContext.customerName.split(' ')[0]}` : 'New Quote'}
          </h1>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-sm">
          <a href="/quotes" className="text-gray-400 hover:text-white transition-colors">Quotes</a>
          <a href="/customers" className="text-gray-400 hover:text-white transition-colors">Customers</a>
          <a href="/settings" className="text-gray-400 hover:text-white transition-colors">Settings</a>
        </div>
      </header>

      {/* Step Indicator */}
      <div className="max-w-3xl mx-auto mb-6">
        <div className="relative flex items-center justify-between">
          <div className="absolute left-0 right-0 top-1/2 h-px bg-v-gold/30" />
          {[
            { n: 1, label: 'Aircraft', active: true },
            { n: 2, label: 'Services', active: !!selectedAircraft },
            { n: 3, label: 'Details', active: !!selectedAircraft && selectedServicesList.length > 0 },
            { n: 4, label: 'Review', active: !!selectedAircraft && selectedServicesList.length > 0 },
          ].map((step) => (
            <div key={step.n} className="relative flex flex-col items-center z-10">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border ${
                step.active ? 'bg-v-gold border-v-gold text-v-charcoal' : 'bg-v-charcoal border-gray-600 text-gray-500'
              }`}>
                {step.n}
              </div>
              <span className={`text-[10px] uppercase tracking-wider mt-1 ${step.active ? 'text-v-gold' : 'text-gray-600'}`}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Customer Request Context (from lead) */}
      {leadContext && (
        <details open className="max-w-3xl mx-auto bg-v-gold/5 border border-v-gold/20 rounded p-4 mb-5">
          <summary className="text-xs uppercase tracking-wider text-v-gold cursor-pointer font-medium">Customer Request</summary>
          <div className="mt-3 space-y-2 text-sm">
            {leadContext.aircraft && (
              <p className="text-v-text-secondary">
                <span className="text-v-text-secondary/60">Aircraft:</span> {leadContext.aircraft}
                {leadContext.tail ? ` \u2014 ${leadContext.tail}` : ''}
                {leadContext.airport ? ` at ${leadContext.airport}` : ''}
              </p>
            )}
            {leadContext.service && (
              <p className="text-v-text-secondary">
                <span className="text-v-text-secondary/60">Service Type:</span> {leadContext.service}
              </p>
            )}
            {leadContext.notes && (() => {
              const lines = leadContext.notes.split('\n').filter(Boolean);
              if (lines.length === 0) return null;
              return (
                <div className="mt-2">
                  <p className="text-v-text-secondary/60 text-[10px] uppercase tracking-wider mb-1.5">Surface Conditions (as reported by customer)</p>
                  {lines.map((line, i) => {
                    // Show full condition: "Paint — Some dullness or light scratches" → "Paint: Some dullness or light scratches"
                    const parts = line.split(/\s*[\u2014—]\s*/);
                    if (parts.length >= 2) {
                      return <p key={i} className="text-v-text-primary text-xs">{parts[0].trim()}: {parts[1].trim()}</p>;
                    }
                    return <p key={i} className="text-v-text-primary text-xs">{line}</p>;
                  })}
                </div>
              );
            })()}
            {leadContext.photos?.length > 0 && (
              <div className="flex gap-2 mt-2 overflow-x-auto">
                {leadContext.photos.slice(0, 6).map((p, i) => (
                  <img key={i} src={typeof p === 'string' ? p : p.url} alt="" className="w-16 h-16 object-cover rounded border border-white/10 shrink-0" />
                ))}
              </div>
            )}
          </div>
        </details>
      )}

      {/* Services Configuration Prompt */}
      {user && availableServices.length === 0 && (
        <div className="max-w-3xl mx-auto bg-v-surface border border-v-border/40 p-5 mb-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <p className="text-gray-300 text-sm">Set up your service menu</p>
            <p className="text-gray-500 text-xs mt-0.5">Add services you offer to start building quotes.</p>
          </div>
          <a
            href="/settings/services"
            className="px-5 py-2.5 bg-v-gold text-v-charcoal text-xs uppercase tracking-wider font-medium hover:bg-v-gold-dim min-h-[44px] flex items-center whitespace-nowrap transition-colors"
          >
            Add Services
          </a>
        </div>
      )}

      <div className="max-w-3xl mx-auto">
          {/* 1. Select Aircraft */}
          <div className="bg-v-surface border border-v-border/40 p-5 mb-5">
            <h3 className="text-lg font-light tracking-wider uppercase text-v-gold mb-4">Select Aircraft</h3>

            {/* Manufacturer Dropdown */}
            <div className="mb-4">
              <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Manufacturer</label>
              <select
                value={selectedManufacturer}
                onChange={(e) => setSelectedManufacturer(e.target.value)}
                className="w-full bg-v-surface border border-v-border rounded-sm px-3 py-2 text-v-text-primary focus:outline-none focus:ring-2 focus:ring-v-gold focus:border-v-gold text-base"
                style={{ colorScheme: 'dark' }}
              >
                <option value="" style={{ backgroundColor: '#1A2236', color: '#F5F5F5' }}>All Manufacturers</option>
                {manufacturers.map(m => (
                  <option key={m} value={m} style={{ backgroundColor: '#1A2236', color: '#F5F5F5' }}>{m}</option>
                ))}
              </select>
            </div>

            {/* Search */}
            {selectedManufacturer && (
              <div className="mb-3">
                <input
                  type="text"
                  placeholder="Search models..."
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  className="w-full bg-v-surface border border-v-border rounded-sm px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary focus:outline-none focus:ring-2 focus:ring-v-gold focus:border-v-gold text-base"
                />
              </div>
            )}

            {/* Category filter chips */}
            {selectedManufacturer && (
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => setSelectedCategory('')}
                  className={`px-3 py-1.5 text-xs tracking-wider uppercase transition-colors min-h-[32px] border ${!selectedCategory ? 'border-v-gold text-v-gold' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                >
                  All
                </button>
                {categoryOrder.filter(c => models.some(m => m.category === c)).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
                    className={`px-3 py-1.5 text-xs tracking-wider uppercase transition-colors min-h-[32px] border ${selectedCategory === cat ? 'border-v-gold text-v-gold' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                  >
                    {categoryLabels[cat] || cat}
                  </button>
                ))}
              </div>
            )}

            {/* Models grid */}
            {selectedManufacturer ? (
              <div className="max-h-64 overflow-y-auto space-y-3">
                {sortedCategories.map(cat => (
                  <div key={cat}>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{categoryLabels[cat] || cat}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {groupedModels[cat].map(aircraft => (
                        <button
                          key={aircraft.id}
                          onClick={() => handleSelectAircraft(aircraft)}
                          className={`p-3 border text-left transition-all min-h-[56px] ${
                            selectedAircraft?.id === aircraft.id
                              ? 'border-v-gold bg-v-gold/10'
                              : 'border-v-border/40 hover:border-v-gold/50'
                          }`}
                        >
                          <p className="font-medium text-v-text-primary text-base truncate">{aircraft.model}</p>
                          {aircraft.surface_area_sqft && (
                            <p className="text-xs text-gray-500 mt-0.5">{aircraft.surface_area_sqft} sq ft</p>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {filteredModels.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No models found</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">Choose a manufacturer to see available models</p>
            )}
          </div>

          {/* Tail Number */}
          {selectedAircraft && (
            <div className="bg-v-surface border border-v-border/40 p-5 mb-5">
              <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Tail Number (N-number)</label>
              <input
                type="text"
                value={tailNumber}
                onChange={(e) => setTailNumber(e.target.value.toUpperCase())}
                placeholder="N12345"
                className="w-full bg-v-surface border border-v-border rounded-sm px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary focus:outline-none focus:ring-2 focus:ring-v-gold focus:border-v-gold text-base"
              />
            </div>
          )}

          {/* 2. Select Services */}
          {selectedAircraft && (
            <div id="services-section" className="bg-v-surface border border-v-border/40 p-5 mb-5">
              <h3 className="text-lg font-light tracking-wider uppercase text-v-gold mb-4">Select Services</h3>

              {/* Individual Services */}
              <div className="divide-y divide-v-border/30 mb-4">
                {availableServices.map(svc => {
                  const hours = getHoursForService(svc);
                  const price = getServicePrice(svc);
                  const isSelected = !!selectedServices[svc.id];
                  const showPrompt = isSelected && saveDefaultPrompt[svc.id];
                  return (
                    <div key={svc.id}>
                      <div
                        className={`w-full flex items-center justify-between py-3 text-left transition-all min-h-[48px] ${
                          isSelected ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0" onClick={() => toggleService(svc.id)} role="button" tabIndex={0}>
                          <div className={`w-4 h-4 border flex items-center justify-center transition-colors flex-shrink-0 ${
                            isSelected ? 'bg-v-gold border-v-gold text-v-charcoal' : 'border-gray-500'
                          }`}>
                            {isSelected && <span className="text-[10px]">&#10003;</span>}
                          </div>
                          <p className="text-v-text-primary text-sm truncate">{svc.name}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 text-sm">
                          {isSelected ? (
                            <>
                              <input
                                type="number"
                                min="0.5"
                                step="0.5"
                                value={customHours[svc.id] !== undefined ? customHours[svc.id] : hours}
                                onChange={(e) => handleHoursChange(svc.id, svc.name, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-16 bg-v-surface border border-v-border rounded px-2 py-1 text-center text-sm font-mono text-v-text-primary focus:outline-none focus:ring-2 focus:ring-v-gold focus:border-v-gold"
                              />
                              <span className="text-gray-400 text-xs relative group/tip">
                                hrs
                                {(() => {
                                  const source = getHoursSource(svc);
                                  if (source.type === 'aircraft') {
                                    return (
                                      <>
                                        <span className="text-v-gold ml-0.5 align-middle text-[10px]">✦</span>
                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-v-charcoal border border-v-border rounded text-xs text-v-text-primary whitespace-nowrap opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity z-50">
                                          {source.label}
                                        </span>
                                      </>
                                    );
                                  }
                                  const dotColor = source.type === 'community' ? 'bg-green-400' : source.type === 'personal' ? 'bg-blue-400' : 'bg-gray-400';
                                  return (
                                    <>
                                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor} ml-0.5 align-middle`} />
                                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-v-charcoal border border-v-border rounded text-xs text-v-text-primary whitespace-nowrap opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity z-50">
                                        {source.label}
                                      </span>
                                    </>
                                  );
                                })()}
                              </span>
                              <span className="text-gray-300 mx-0.5 hidden sm:inline">@</span>
                              <span className="text-gray-500 text-xs hidden sm:inline">{currencySymbol()}{parseFloat(svc.hourly_rate || 0).toFixed(0)}/hr</span>
                              <span className="text-gray-300 mx-0.5 hidden sm:inline">=</span>
                              <span className="font-bold text-v-text-primary min-w-[60px] text-right">{currencySymbol()}{formatPrice(price)}</span>
                            </>
                          ) : (
                            <>
                              <span className="text-xs text-gray-400 relative group/tip2">
                                {hours.toFixed(1)} hrs
                                {(() => {
                                  const source = getHoursSource(svc);
                                  if (source.type === 'aircraft') {
                                    return (
                                      <>
                                        <span className="text-v-gold ml-0.5 align-middle text-[10px]">✦</span>
                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-v-charcoal border border-v-border rounded text-xs text-v-text-primary whitespace-nowrap opacity-0 group-hover/tip2:opacity-100 pointer-events-none transition-opacity z-50">
                                          {source.label}
                                        </span>
                                      </>
                                    );
                                  }
                                  const dotColor = source.type === 'community' ? 'bg-green-400' : source.type === 'personal' ? 'bg-blue-400' : 'bg-gray-400';
                                  return (
                                    <>
                                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor} ml-0.5 align-middle`} />
                                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-v-charcoal border border-v-border rounded text-xs text-v-text-primary whitespace-nowrap opacity-0 group-hover/tip2:opacity-100 pointer-events-none transition-opacity z-50">
                                        {source.label}
                                      </span>
                                    </>
                                  );
                                })()}
                                <span className="hidden sm:inline">{' '}@ {currencySymbol()}{parseFloat(svc.hourly_rate || 0).toFixed(0)}/hr</span>
                              </span>
                              <span className="font-bold text-v-text-primary ml-2">{currencySymbol()}{formatPrice(price)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {/* Save default prompt */}
                      {showPrompt && (
                        <div className="flex items-center gap-2 px-3 py-1.5 text-xs ml-7">
                          <span className="text-gray-500">Save {(customHours[svc.id] || 0).toFixed(1)} hrs as default for {svc.name}?</span>
                          <button
                            onClick={() => saveAsDefault(svc.id)}
                            disabled={savingDefault[svc.id]}
                            className="text-v-gold hover:text-v-gold-dim font-medium disabled:opacity-50"
                          >
                            {savingDefault[svc.id] ? 'Saving...' : 'Save Default'}
                          </button>
                          <button
                            onClick={() => dismissSavePrompt(svc.id)}
                            className="text-gray-500 hover:text-gray-300"
                          >
                            Just this quote
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Packages */}
              {availablePackages.length > 0 && (
                <div className="pt-4 border-t border-v-border/30">
                  <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-3">Packages</h4>
                  <div className="divide-y divide-v-border/30">
                    {availablePackages.map(pkg => {
                      const isSelected = selectedPackage?.id === pkg.id;
                      const pkgServices = availableServices.filter(s => (pkg.service_ids || []).includes(s.id));
                      const pkgHours = pkgServices.reduce((sum, svc) => sum + getHoursForService(svc), 0);
                      const pkgSubtotal = pkgServices.reduce((sum, svc) => sum + getServicePrice(svc), 0);
                      const pkgDiscount = pkgSubtotal * ((parseFloat(pkg.discount_percent) || 0) / 100);
                      const pkgPrice = pkgSubtotal - pkgDiscount;
                      return (
                        <button
                          key={pkg.id}
                          onClick={() => selectPackage(pkg)}
                          className={`w-full flex items-center justify-between py-3 text-left transition-all min-h-[44px] ${
                            isSelected ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                          }`}
                        >
                          <div>
                            <p className="text-v-text-primary text-sm">{pkg.name}</p>
                            <p className="text-xs text-gray-500">{pkgServices.length} services{pkg.discount_percent > 0 ? ` \u00B7 ${pkg.discount_percent}% off` : ''} &middot; {pkgHours.toFixed(1)}h</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            {isSelected ? (
                              <span className="text-v-gold text-xs uppercase tracking-wider">Selected</span>
                            ) : (
                              <span className="text-gray-300 text-sm font-bold">{currencySymbol()}{formatPrice(pkgPrice)}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. Access Difficulty */}
          {selectedAircraft && selectedServicesList.length > 0 && (
            <div className="bg-v-surface border border-v-border/40 p-5 mb-5">
              <h3 className="text-sm font-light tracking-wider uppercase text-gray-400 mb-3">Access Difficulty</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-v-border/30">
                {[
                  { label: 'Standard', value: 1.0 },
                  { label: 'Moderate', value: 1.1 },
                  { label: 'Difficult', value: 1.15 },
                  { label: 'Very Difficult', value: 1.25 },
                  { label: 'Extreme', value: 1.5 },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setAccessDifficulty(opt.value)}
                    className={`px-3 py-3 text-xs transition-all min-h-[44px] ${
                      accessDifficulty === opt.value
                        ? 'bg-v-gold/10 text-v-gold'
                        : 'bg-v-surface text-gray-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                    {opt.value !== 1.0 && <span className="block text-gray-500 mt-0.5">+{Math.round((opt.value - 1) * 100)}%</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 4. Add-on Fees */}
          {selectedAircraft && selectedServicesList.length > 0 && availableAddons.length > 0 && (
            <div className="bg-v-surface border border-v-border/40 p-5 mb-5">
              <h3 className="text-sm font-light tracking-wider uppercase text-gray-400 mb-3">Add-on Fees</h3>
              <div className="divide-y divide-v-border/30">
                {availableAddons.map(addon => {
                  const isSelected = !!selectedAddons[addon.id];
                  return (
                    <button
                      key={addon.id}
                      onClick={() => toggleAddon(addon.id)}
                      className={`w-full flex items-center justify-between py-3 text-left transition-all min-h-[44px] ${
                        isSelected ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 border flex items-center justify-center ${
                          isSelected ? 'bg-v-gold border-v-gold text-v-charcoal' : 'border-gray-500'
                        }`}>
                          {isSelected && <span className="text-[10px]">&#10003;</span>}
                        </div>
                        <span className="text-sm text-v-text-primary">{addon.name}</span>
                      </div>
                      <span className="text-sm text-gray-400">
                        {addon.fee_type === 'percent' ? `${addon.amount}%` : `${currencySymbol()}${formatPrice(addon.amount)}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. Airport / Job Location */}
          {selectedAircraft && selectedServicesList.length > 0 && (
            <div className="bg-v-surface border border-v-border/40 p-5 mb-5">
              <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Airport Code</label>
              <input
                type="text"
                value={airport}
                onChange={(e) => setAirport(e.target.value.toUpperCase())}
                placeholder="KJFK"
                className="w-full bg-v-surface border border-v-border rounded-sm px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary focus:outline-none focus:ring-2 focus:ring-v-gold focus:border-v-gold text-base"
              />
            </div>
          )}

          {/* 6. Notes */}
          {selectedAircraft && selectedServicesList.length > 0 && (
            <div className="bg-v-surface border border-v-border/40 p-5 mb-5">
              <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Notes</label>
              <textarea
                value={quoteNotes}
                onChange={(e) => setQuoteNotes(e.target.value)}
                placeholder="Add notes for this quote (visible to customer)..."
                rows={3}
                className="w-full bg-v-surface border border-v-border rounded-sm px-3 py-2 text-v-text-primary placeholder:text-v-text-secondary focus:outline-none focus:ring-2 focus:ring-v-gold focus:border-v-gold text-base"
              />
            </div>
          )}

          {/* 7. Scheduling */}
          {selectedAircraft && selectedServicesList.length > 0 && (() => {
            // Auto-suggest: calculate buffer and find next available date
            const autoBuffer = totalHours < 4 ? 30 : totalHours <= 8 ? 60 : 120;
            const jobDurationHours = totalHours + (bufferMinutes / 60);
            const endTimeStr = (() => {
              const [h, m] = proposedTime.split(':').map(Number);
              const endMin = h * 60 + m + Math.round(totalHours * 60);
              return `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
            })();

            // Auto-suggest next weekday if no date selected
            if (!proposedDate) {
              const today = new Date();
              const lead = 2; // 2-day lead time default
              const suggest = new Date(today);
              suggest.setDate(suggest.getDate() + lead);
              while (excludeWeekends && (suggest.getDay() === 0 || suggest.getDay() === 6)) {
                suggest.setDate(suggest.getDate() + 1);
              }
              // Don't auto-set in render — use effect or leave for user
            }

            return (
              <div className="bg-v-surface border border-v-border/40 p-5 mb-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-light tracking-wider uppercase text-gray-400">Proposed Schedule</h3>
                  {calendarLoading && <span className="text-[10px] text-v-gold animate-pulse">Checking calendar...</span>}
                  {calendarSuggestion && !calendarLoading && (
                    <span className="text-[10px] text-green-400">Auto-suggested from calendar</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Date</label>
                    <input type="date" value={proposedDate}
                      onChange={e => setProposedDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full bg-v-surface border border-v-border rounded-sm px-3 py-2 text-v-text-primary text-base focus:outline-none focus:ring-2 focus:ring-v-gold" />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Start Time</label>
                    <input type="time" value={proposedTime}
                      onChange={e => setProposedTime(e.target.value)}
                      className="w-full bg-v-surface border border-v-border rounded-sm px-3 py-2 text-v-text-primary text-base focus:outline-none focus:ring-2 focus:ring-v-gold" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1.5">Buffer Time</label>
                    <select value={bufferMinutes} onChange={e => setBufferMinutes(Number(e.target.value))}
                      className="w-full bg-v-surface border border-v-border rounded-sm px-3 py-2 text-v-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-v-gold">
                      <option value={30}>30 min</option>
                      <option value={60}>1 hour</option>
                      <option value={120}>2 hours</option>
                      <option value={240}>Half day</option>
                      <option value={480}>Full day</option>
                    </select>
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={excludeWeekends} onChange={e => setExcludeWeekends(e.target.checked)}
                        className="w-4 h-4 rounded accent-v-gold" />
                      <span className="text-v-text-secondary text-xs">Exclude weekends</span>
                    </label>
                  </div>
                </div>

                {proposedDate && (
                  <div className="bg-white/5 rounded p-3 text-sm text-v-text-secondary">
                    <p>
                      {new Date(proposedDate + 'T12:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                      {' '}{proposedTime} &mdash; {endTimeStr}
                    </p>
                    <p className="text-xs text-v-text-secondary/60 mt-1">
                      {totalHours.toFixed(1)}h job + {bufferMinutes}min buffer
                    </p>
                  </div>
                )}
              </div>
            );
          })()}


          {/* 8. Quote Summary */}
          {selectedAircraft && selectedServicesList.length > 0 && (
            <div className="bg-v-navy border border-v-border/20 p-5 mb-5 text-white">
              <h3 className="text-sm font-light tracking-wider uppercase text-gray-400 mb-4">Quote Summary</h3>

              {/* Line items */}
              <div className="space-y-1 mb-3">
                {selectedServicesList.map(svc => {
                  const hrs = getHoursForService(svc);
                  const rate = parseFloat(svc.hourly_rate || 0);
                  const source = getHoursSource(svc);
                  return (
                    <div key={svc.id} className="flex justify-between text-sm">
                      <span className="text-gray-300">
                        {svc.name}
                        {source.type === 'aircraft' && <span className="text-v-gold text-[10px] ml-1">✦</span>}
                      </span>
                      <span className="text-gray-400 tabular-nums">
                        <span className="text-gray-500">{hrs.toFixed(1)}h × {currencySymbol()}{rate.toFixed(0)}</span>
                        <span className="text-gray-600 mx-1">=</span>
                        <span className="text-white">{currencySymbol()}{formatPrice(getServicePrice(svc))}</span>
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Package discount */}
              {discountPercent > 0 && (
                <div className="flex justify-between text-sm text-green-400 mb-1">
                  <span>{selectedPackage?.name} (-{discountPercent}%)</span>
                  <span>-{currencySymbol()}{formatPrice(discountAmount)}</span>
                </div>
              )}

              <div className="border-t border-white/10 my-3" />

              {/* Subtotal */}
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">Subtotal</span>
                <span className="text-gray-300">{currencySymbol()}{formatPrice(afterDiscount)}</span>
              </div>

              {/* Difficulty */}
              {accessDifficulty > 1 && (
                <div className="flex justify-between text-sm text-v-gold mb-1">
                  <span>Access Difficulty ({accessDifficulty}x)</span>
                  <span>+{currencySymbol()}{formatPrice(afterDifficulty - afterDiscount)}</span>
                </div>
              )}

              {/* Addons */}
              {selectedAddonsList.length > 0 && selectedAddonsList.map(addon => (
                <div key={addon.id} className="flex justify-between text-sm text-blue-300 mb-1">
                  <span>{addon.name}</span>
                  <span>+{currencySymbol()}{formatPrice(addon.fee_type === 'percent' ? afterDifficulty * (parseFloat(addon.amount) || 0) / 100 : parseFloat(addon.amount) || 0)}</span>
                </div>
              ))}

              {/* Minimum fee */}
              {isMinimumApplied && (
                <div className="flex justify-between text-sm text-yellow-400 mb-1">
                  <span>Minimum Fee Applied</span>
                  <span>{currencySymbol()}{formatPrice(minimumFee)}</span>
                </div>
              )}

              <div className="border-t border-white/10 my-3" />

              {/* Total */}
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-gray-400 uppercase tracking-wider">Total</span>
                <span className="text-[2.5rem] font-extralight text-v-gold">{currencySymbol()}{formatPrice(totalPrice)}</span>
              </div>

              {/* CC Processing Fee */}
              {ccFeeMode === 'pass' && ccFeeAmount > 0 && (
                <div className="mt-2 pt-2 border-t border-white/10">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>CC Processing Fee (2.9% + $0.30)</span>
                    <span>+{currencySymbol()}{ccFeeAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Customer Pays</span>
                    <span className="text-v-text-primary font-medium">{currencySymbol()}{grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}

              {/* Profit preview */}
              {estimatedProductCost > 0 && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Est. Product Cost</span>
                    <span>-{currencySymbol()}{formatPrice(estimatedProductCost)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-300">Est. Profit</span>
                    <span className="text-green-400 font-bold">{currencySymbol()}{formatPrice(estimatedProfit)}</span>
                  </div>
                </div>
              )}

              {/* Product estimates */}
              {productEstimates.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className="text-xs text-gray-400 mb-1">Estimated Products</p>
                  {productEstimates.map((pe, i) => (
                    <div key={i} className="flex justify-between text-xs text-gray-300">
                      <span>{pe.product_name}</span>
                      <span>{pe.amount} {pe.unit}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Linked Products */}
              {quoteData?.linkedProducts?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className="text-xs text-gray-400 mb-1">Products Needed</p>
                  {quoteData.linkedProducts.map((p, i) => (
                    <div key={i} className="flex justify-between text-xs text-gray-300">
                      <span>{p.product_name}</span>
                      <span>{(p.quantity || 0).toFixed(1)} {p.unit}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Linked Equipment */}
              {quoteData?.linkedEquipment?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className="text-xs text-gray-400 mb-1">Equipment Needed</p>
                  {quoteData.linkedEquipment.map((e, i) => (
                    <div key={i} className="text-xs text-gray-300">
                      {e.equipment_name} {e.brand && <span className="text-gray-500">({e.brand})</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Send button */}
              <button
                type="button"
                onClick={openSendModal}
                disabled={totalPrice === 0 || !airport || airport.length < 3}
                className="w-full mt-6 px-6 py-4 bg-v-gold text-v-charcoal font-medium uppercase tracking-[0.2em] hover:bg-v-gold-dim disabled:opacity-40 disabled:cursor-not-allowed text-sm min-h-[52px] transition-colors"
              >
                {!airport || airport.length < 3 ? 'Enter Airport to Send' : 'Send to Client'}
              </button>

              {/* Reset */}
              <button
                type="button"
                onClick={resetQuoteForm}
                className="w-full mt-2 px-4 py-3 border border-v-border/30 text-gray-500 hover:text-white hover:border-v-border text-xs uppercase tracking-wider min-h-[44px] transition-colors"
              >
                Start New Quote
              </button>
            </div>
          )}
      </div>

      {/* Sticky footer bar */}
      {selectedAircraft && selectedServicesList.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-v-charcoal/95 backdrop-blur-sm border-t border-v-gold/20 px-4 py-3 z-50">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between gap-3 mb-2 sm:mb-0">
              <div className="min-w-0">
                <p className="text-white text-sm truncate">{selectedAircraft.manufacturer} {selectedAircraft.model}</p>
                <p className="text-gray-500 text-xs">{selectedServicesList.length} service{selectedServicesList.length !== 1 ? 's' : ''} &middot; {totalHours.toFixed(1)}h</p>
              </div>
              <span className="text-v-gold text-2xl font-extralight flex-shrink-0">{currencySymbol()}{formatPrice(totalPrice)}</span>
            </div>
            <button
              type="button"
              onClick={openSendModal}
              disabled={totalPrice === 0 || !airport || airport.length < 3}
              className="w-full sm:w-auto sm:float-right px-5 sm:px-8 py-3 bg-v-gold text-v-charcoal font-medium uppercase tracking-[0.15em] hover:bg-v-gold-dim disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm min-h-[44px] whitespace-nowrap transition-colors"
            >
              {!airport || airport.length < 3 ? 'Enter Airport' : 'Send to Client'}
            </button>
          </div>
        </div>
      )}

      {/* SendQuoteModal */}
      {isModalOpen && quoteData && (
        <SendQuoteModal
          isOpen={isModalOpen}
          onClose={closeSendModal}
          onSuccess={() => router.push('/dashboard')}
          preselectedCustomer={preselectedCustomer}
          quote={{
            aircraft: quoteData.aircraft,
            selectedServices: quoteData.selectedServices,
            selectedPackage: quoteData.selectedPackage,
            totalHours: totalHours,
            totalPrice: totalPrice,
            calculatedPrice: calculatedPrice,
            isMinimumApplied: isMinimumApplied,
            minimumFee: isMinimumApplied ? minimumFee : null,
            jobLocation: jobLocation,
            lineItems: lineItems,
            laborTotal: laborTotal,
            productsTotal: productsTotal,
            accessDifficulty: accessDifficulty,
            discountPercent: discountPercent,
            discountAmount: discountAmount,
            addonFees: addonFeeItems,
            addonsTotal: addonsTotal,
            notes: quoteNotes,
            airport: airport,
            tailNumber: tailNumber,
            productEstimates: quoteData.productEstimates,
            linkedProducts: quoteData.linkedProducts,
            linkedEquipment: quoteData.linkedEquipment,
          }}
          user={user}
        />
      )}
    </div>
  );
}

export default function NewQuotePage() {
  return (
    <Suspense fallback={<LoadingSpinner message="Loading..." />}>
      <NewQuoteContent />
    </Suspense>
  );
}
