"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SendQuoteModal from '../../../components/SendQuoteModal.jsx';
import LoadingSpinner from '../../../components/LoadingSpinner.jsx';
import { useToast } from '../../../components/Toast.jsx';
import { formatPrice, currencySymbol } from '../../../lib/formatPrice';
import { calculateProductEstimates } from '../../../lib/product-calculator';

const categoryOrder = ['piston', 'turboprop', 'light_jet', 'midsize_jet', 'super_midsize_jet', 'large_jet', 'helicopter'];

const HOURS_FIELD_OPTIONS = {
  ext_wash_hours: 'Exterior Wash',
  int_detail_hours: 'Interior Detail',
  leather_hours: 'Leather Treatment',
  carpet_hours: 'Carpet Cleaning',
  wax_hours: 'Wax Application',
  polish_hours: 'Polish',
  ceramic_hours: 'Ceramic Coating',
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
  const { success: toastSuccess } = useToast();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [availableServices, setAvailableServices] = useState([]);
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
  const [customProductRatios, setCustomProductRatios] = useState(null);
  const [serviceProductLinks, setServiceProductLinks] = useState([]);
  const [serviceEquipmentLinks, setServiceEquipmentLinks] = useState([]);

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

  // Fetch models when manufacturer changes
  useEffect(() => {
    const fetchModels = async () => {
      const params = new URLSearchParams();
      if (selectedManufacturer) params.set('make', selectedManufacturer);
      try {
        const res = await fetch(`/api/aircraft/models?${params}`);
        if (res.ok) {
          const data = await res.json();
          setModels(data.models || []);
        }
      } catch (err) {
        console.error('Failed to fetch models:', err);
      }
    };
    fetchModels();
    setSelectedAircraft(null);
  }, [selectedManufacturer]);

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
      const [servicesRes, packagesRes, minFeeRes, addonsRes, productRatiosRes, svcProdRes, svcEquipRes] = await Promise.allSettled([
        fetch('/api/services', { headers }),
        fetch('/api/packages', { headers }),
        fetch('/api/user/minimum-fee', { headers }),
        fetch('/api/addon-fees', { headers }),
        fetch('/api/user/product-ratios', { headers }),
        fetch('/api/services/products', { headers }),
        fetch('/api/services/equipment', { headers }),
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
    };

    fetchData().catch(err => console.error('Quote builder fetch error:', err));
  }, [router]);

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

  const getHoursForService = (svc) => {
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
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4 pb-40 text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-40 -mx-4 -mt-4 px-4 pt-4 pb-3 mb-4 bg-gradient-to-b from-[#0f172a] via-[#0f172a] to-transparent flex justify-between items-center text-white">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors">
            <span>&#8592;</span> Dashboard
          </a>
          <span className="text-gray-500">|</span>
          <h1 className="text-xl font-bold">New Quote</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <a href="/quotes" className="text-gray-300 hover:text-white">Quotes</a>
          <a href="/customers" className="text-gray-300 hover:text-white">Customers</a>
          <a href="/settings" className="text-gray-300 hover:text-white">Settings</a>
        </div>
      </header>

      {/* Services Configuration Prompt */}
      {user && availableServices.length === 0 && (
        <div className="bg-blue-100 border border-blue-300 rounded-lg p-4 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center">
            <span className="text-blue-600 text-xl mr-3">&#9432;</span>
            <div>
              <p className="text-blue-800 font-medium">Set up your service menu</p>
              <p className="text-blue-700 text-sm">Add services you offer to start building quotes.</p>
            </div>
          </div>
          <a
            href="/settings/services"
            className="px-4 py-3 rounded bg-blue-500 text-white font-medium hover:bg-blue-600 min-h-[44px] whitespace-nowrap"
          >
            Add services to get started
          </a>
        </div>
      )}

      <div className="max-w-3xl mx-auto">
          {/* 1. Select Aircraft */}
          <div className="bg-white rounded-lg p-4 mb-4 shadow">
            <h3 className="font-semibold mb-3 text-lg">Select Aircraft</h3>

            {/* Manufacturer Dropdown */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer</label>
              <select
                value={selectedManufacturer}
                onChange={(e) => setSelectedManufacturer(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-base"
              >
                <option value="">All Manufacturers</option>
                {manufacturers.map(m => (
                  <option key={m} value={m}>{m}</option>
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
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 text-base"
                />
              </div>
            )}

            {/* Category filter chips */}
            {selectedManufacturer && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                <button
                  onClick={() => setSelectedCategory('')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors min-h-[32px] ${!selectedCategory ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  All Categories
                </button>
                {categoryOrder.filter(c => models.some(m => m.category === c)).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors min-h-[32px] ${selectedCategory === cat ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
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
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {groupedModels[cat].map(aircraft => (
                        <button
                          key={aircraft.id}
                          onClick={() => handleSelectAircraft(aircraft)}
                          className={`p-2.5 rounded-lg border text-left transition-all text-sm min-h-[44px] ${
                            selectedAircraft?.id === aircraft.id
                              ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-500'
                              : 'border-gray-200 hover:border-amber-300 hover:bg-amber-50/50'
                          }`}
                        >
                          <p className="font-medium text-gray-900 truncate">{aircraft.model}</p>
                          {aircraft.surface_area_sqft && (
                            <p className="text-xs text-gray-400">{aircraft.surface_area_sqft} sq ft</p>
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
            <div className="bg-white rounded-lg p-4 mb-4 shadow">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tail Number (N-number)</label>
              <input
                type="text"
                value={tailNumber}
                onChange={(e) => setTailNumber(e.target.value.toUpperCase())}
                placeholder="N12345"
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 text-base"
              />
            </div>
          )}

          {/* 2. Select Services */}
          {selectedAircraft && (
            <div id="services-section" className="bg-white rounded-lg p-4 mb-4 shadow">
              <h3 className="font-semibold mb-3 text-lg">Select Services</h3>

              {/* Individual Services */}
              <div className="space-y-2 mb-4">
                {availableServices.map(svc => {
                  const hours = getHoursForService(svc);
                  const price = getServicePrice(svc);
                  const isSelected = !!selectedServices[svc.id];
                  return (
                    <button
                      key={svc.id}
                      onClick={() => toggleService(svc.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all min-h-[44px] ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50'
                          : 'border-gray-200 hover:border-amber-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          isSelected ? 'bg-amber-500 border-amber-500 text-white' : 'border-gray-300'
                        }`}>
                          {isSelected && <span className="text-xs">&#10003;</span>}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{svc.name}</p>
                          <p className="text-xs text-gray-400">{hours.toFixed(1)} hrs @ {currencySymbol()}{parseFloat(svc.hourly_rate || 0).toFixed(0)}/hr</p>
                        </div>
                      </div>
                      <span className="font-bold text-gray-900">{currencySymbol()}{formatPrice(price)}</span>
                    </button>
                  );
                })}
              </div>

              {/* Packages */}
              {availablePackages.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm text-gray-700 mb-2">Packages</h4>
                  <div className="space-y-2">
                    {availablePackages.map(pkg => {
                      const isSelected = selectedPackage?.id === pkg.id;
                      return (
                        <button
                          key={pkg.id}
                          onClick={() => selectPackage(pkg)}
                          className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all min-h-[44px] ${
                            isSelected
                              ? 'border-green-500 bg-green-50'
                              : 'border-gray-200 hover:border-green-300'
                          }`}
                        >
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{pkg.name}</p>
                            <p className="text-xs text-gray-400">{Array.isArray(pkg.service_ids) ? pkg.service_ids.length : 0} services{pkg.discount_percent > 0 ? ` \u00B7 ${pkg.discount_percent}% off` : ''}</p>
                          </div>
                          {isSelected && <span className="text-green-600 font-bold text-sm">Selected</span>}
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
            <div className="bg-white rounded-lg p-4 mb-4 shadow">
              <h3 className="font-semibold mb-3 text-sm">Access Difficulty</h3>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Standard', value: 1.0 },
                  { label: 'Moderate', value: 1.15 },
                  { label: 'Difficult', value: 1.3 },
                  { label: 'Extreme', value: 1.5 },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setAccessDifficulty(opt.value)}
                    className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all min-h-[44px] ${
                      accessDifficulty === opt.value
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-gray-200 text-gray-600 hover:border-amber-300'
                    }`}
                  >
                    {opt.label}
                    <br />
                    <span className="text-gray-400">{opt.value === 1.0 ? '' : `+${Math.round((opt.value - 1) * 100)}%`}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 4. Add-on Fees */}
          {selectedAircraft && selectedServicesList.length > 0 && availableAddons.length > 0 && (
            <div className="bg-white rounded-lg p-4 mb-4 shadow">
              <h3 className="font-semibold mb-3 text-sm">Add-on Fees</h3>
              <div className="space-y-2">
                {availableAddons.map(addon => {
                  const isSelected = !!selectedAddons[addon.id];
                  return (
                    <button
                      key={addon.id}
                      onClick={() => toggleAddon(addon.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all min-h-[44px] ${
                        isSelected ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-amber-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          isSelected ? 'bg-amber-500 border-amber-500 text-white' : 'border-gray-300'
                        }`}>
                          {isSelected && <span className="text-xs">&#10003;</span>}
                        </div>
                        <span className="text-sm font-medium text-gray-900">{addon.name}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-700">
                        {addon.fee_type === 'percent' ? `${addon.amount}%` : `${currencySymbol()}${parseFloat(addon.amount).toFixed(2)}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. Airport / Job Location */}
          {selectedAircraft && selectedServicesList.length > 0 && (
            <div className="bg-white rounded-lg p-4 mb-4 shadow">
              <label className="block text-sm font-medium text-gray-700 mb-1">Airport Code</label>
              <input
                type="text"
                value={airport}
                onChange={(e) => setAirport(e.target.value.toUpperCase())}
                placeholder="KJFK"
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 text-base"
              />
            </div>
          )}

          {/* 6. Notes */}
          {selectedAircraft && selectedServicesList.length > 0 && (
            <div className="bg-white rounded-lg p-4 mb-4 shadow">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={quoteNotes}
                onChange={(e) => setQuoteNotes(e.target.value)}
                placeholder="Add notes for this quote (visible to customer)..."
                rows={3}
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 text-base"
              />
            </div>
          )}

          {/* 7. Aircraft Details Accordion */}
          {selectedAircraft && (
            <details className="bg-white rounded-lg p-4 mb-4 shadow">
              <summary className="font-semibold text-sm cursor-pointer text-gray-700">Aircraft Details</summary>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-600">
                <div><span className="text-gray-400">Type:</span> {selectedAircraft.category}</div>
                <div><span className="text-gray-400">Model:</span> {selectedAircraft.manufacturer} {selectedAircraft.model}</div>
                {selectedAircraft.surface_area_sqft && <div><span className="text-gray-400">Surface:</span> {selectedAircraft.surface_area_sqft} sq ft</div>}
                {Object.entries(HOURS_FIELD_OPTIONS).map(([field, label]) =>
                  selectedAircraft[field] ? (
                    <div key={field}><span className="text-gray-400">{label}:</span> {selectedAircraft[field]}h</div>
                  ) : null
                )}
              </div>
            </details>
          )}

          {/* 8. Quote Summary */}
          {selectedAircraft && selectedServicesList.length > 0 && (
            <div className="bg-[#1e293b] rounded-lg p-4 mb-4 shadow text-white">
              <h3 className="font-bold text-lg mb-3">Quote Summary</h3>

              {/* Line items */}
              <div className="space-y-1 mb-3">
                {selectedServicesList.map(svc => (
                  <div key={svc.id} className="flex justify-between text-sm">
                    <span className="text-gray-300">{svc.name} ({getHoursForService(svc).toFixed(1)}h)</span>
                    <span>{currencySymbol()}{formatPrice(getServicePrice(svc))}</span>
                  </div>
                ))}
              </div>

              {/* Package discount */}
              {discountPercent > 0 && (
                <div className="flex justify-between text-sm text-green-400 mb-1">
                  <span>{selectedPackage?.name} (-{discountPercent}%)</span>
                  <span>-{currencySymbol()}{formatPrice(discountAmount)}</span>
                </div>
              )}

              <div className="border-t border-white/20 my-2" />

              {/* Subtotal */}
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Subtotal</span>
                <span>{currencySymbol()}{formatPrice(afterDiscount)}</span>
              </div>

              {/* Difficulty */}
              {accessDifficulty > 1 && (
                <div className="flex justify-between text-sm text-amber-400 mb-1">
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

              <div className="border-t border-white/20 my-2" />

              {/* Total */}
              <div className="flex justify-between text-xl font-bold">
                <span>Total</span>
                <span className="text-amber-400">{currencySymbol()}{formatPrice(totalPrice)}</span>
              </div>

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
                className="w-full mt-4 px-6 py-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-base min-h-[48px]"
              >
                {!airport || airport.length < 3 ? 'Enter Airport to Send' : 'Send to Client'}
              </button>

              {/* Reset */}
              <button
                type="button"
                onClick={resetQuoteForm}
                className="w-full mt-2 px-4 py-3 rounded-lg border border-gray-500 text-gray-300 hover:bg-gray-800 text-sm min-h-[44px]"
              >
                Start New Quote
              </button>
            </div>
          )}
      </div>

      {/* Sticky footer bar */}
      {selectedAircraft && selectedServicesList.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#0f172a]/95 backdrop-blur-sm border-t border-white/10 px-4 py-3 z-50 shadow-2xl">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-white font-medium text-sm truncate">{selectedAircraft.manufacturer} {selectedAircraft.model}</p>
              <p className="text-gray-400 text-xs">{selectedServicesList.length} service{selectedServicesList.length !== 1 ? 's' : ''} &middot; {totalHours.toFixed(1)}h</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-white text-xl sm:text-2xl font-bold">{currencySymbol()}{formatPrice(totalPrice)}</span>
              <button
                type="button"
                onClick={openSendModal}
                disabled={totalPrice === 0 || !airport || airport.length < 3}
                className="px-4 sm:px-6 py-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base min-h-[44px] whitespace-nowrap"
              >
                {!airport || airport.length < 3 ? 'Enter Airport to Send' : 'Send to Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SendQuoteModal */}
      {isModalOpen && quoteData && (
        <SendQuoteModal
          isOpen={isModalOpen}
          onClose={closeSendModal}
          onSuccess={resetQuoteForm}
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
  return <NewQuoteContent />;
}
