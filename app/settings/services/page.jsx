"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';
import { currencySymbol } from '@/lib/formatPrice';
import { useTranslation } from '@/lib/i18n';

const HOURS_FIELD_OPTIONS = {
  ext_wash_hours: 'Exterior Wash Time',
  int_detail_hours: 'Interior Detail Time',
  leather_hours: 'Leather Treatment Time',
  carpet_hours: 'Carpet Cleaning Time',
  wax_hours: 'Wax Application Time',
  polish_hours: 'Polish Time',
  ceramic_hours: 'Ceramic Coating Time',
  brightwork_hours: 'Brightwork Time',
};

const DEFAULT_SERVICES = [
  { name: 'Maintenance Wash', description: 'Regular exterior wash', hourly_rate: 120, hours_field: 'ext_wash_hours' },
  { name: 'Decon Wash', description: 'Deep clean with iron remover and clay bar', hourly_rate: 130, hours_field: 'ext_wash_hours' },
  { name: 'One-Step Polish', description: 'Light polish to remove minor swirls', hourly_rate: 140, hours_field: 'polish_hours' },
  { name: 'Wax Application', description: 'Protective wax coating', hourly_rate: 100, hours_field: 'wax_hours' },
  { name: 'Spray Ceramic', description: 'Ceramic spray sealant', hourly_rate: 120, hours_field: 'ceramic_hours' },
  { name: 'Ceramic Coating', description: 'Professional ceramic coating, 2+ year protection', hourly_rate: 175, hours_field: 'ceramic_hours' },
  { name: 'Vacuum & Wipe Down', description: 'Interior vacuum and surface wipe', hourly_rate: 100, hours_field: 'int_detail_hours' },
  { name: 'Carpet Extraction', description: 'Deep carpet and upholstery cleaning', hourly_rate: 110, hours_field: 'carpet_hours' },
  { name: 'Leather Clean & Condition', description: 'Full leather treatment', hourly_rate: 115, hours_field: 'leather_hours' },
  { name: 'Polish Brightwork', description: 'Metal and chrome polishing', hourly_rate: 130, hours_field: 'brightwork_hours' },
];

const DEFAULT_ADDON_FEES = [
  { name: 'Hazmat Fee', description: 'Hazardous material handling surcharge', fee_type: 'flat', amount: 250 },
  { name: 'After Hours', description: 'Work performed outside business hours', fee_type: 'flat', amount: 150 },
  { name: 'Weekend', description: 'Weekend service surcharge', fee_type: 'flat', amount: 100 },
  { name: 'Rush / Emergency', description: 'Expedited service premium', fee_type: 'percent', amount: 25 },
  { name: 'Travel Fee', description: 'Per-job travel surcharge', fee_type: 'flat', amount: 50 },
];

export default function ServicesPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [services, setServices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [addonFees, setAddonFees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Products & equipment lists (for linking)
  const [allProducts, setAllProducts] = useState([]);
  const [allEquipment, setAllEquipment] = useState([]);

  // Service product/equipment links for currently editing service
  const [linkedProducts, setLinkedProducts] = useState([]);
  const [linkedEquipment, setLinkedEquipment] = useState([]);
  const [linkLoading, setLinkLoading] = useState(false);

  // All links for badge counts
  const [allProductLinks, setAllProductLinks] = useState([]);
  const [allEquipmentLinks, setAllEquipmentLinks] = useState([]);

  // Service form
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [newService, setNewService] = useState({ name: '', description: '', hourly_rate: '', hours_field: 'ext_wash_hours', product_cost_per_hour: '', product_notes: '' });

  // Package form
  const [showPackageBuilder, setShowPackageBuilder] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [newPackage, setNewPackage] = useState({ name: '', description: '', discount_percent: '', service_ids: [] });

  // Addon fee form
  const [showAddonModal, setShowAddonModal] = useState(false);
  const [editingAddon, setEditingAddon] = useState(null);
  const [newAddon, setNewAddon] = useState({ name: '', description: '', fee_type: 'flat', amount: '' });

  // Error state
  const [error, setError] = useState('');

  // Drag state
  const [draggedService, setDraggedService] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchData();
  }, [router]);

  const fetchData = async () => {
    const token = localStorage.getItem('vector_token');
    try {
      const [svcRes, pkgRes, feeRes, prodRes, equipRes] = await Promise.all([
        fetch('/api/services', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/packages', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/addon-fees', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/products', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch('/api/equipment', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ]);
      if (svcRes.ok) {
        const data = await svcRes.json();
        setServices(data.services || []);
      }
      if (pkgRes.ok) {
        const data = await pkgRes.json();
        setPackages(data.packages || []);
      }
      if (feeRes.ok) {
        const data = await feeRes.json();
        setAddonFees(data.fees || []);
      }
      if (prodRes?.ok) {
        const data = await prodRes.json();
        setAllProducts(data.products || []);
      }
      if (equipRes?.ok) {
        const data = await equipRes.json();
        setAllEquipment(data.equipment || []);
      }
      // Fetch all service links for badge counts
      const [spRes, seRes] = await Promise.all([
        fetch('/api/services/products', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch('/api/services/equipment', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ]);
      if (spRes?.ok) { const d = await spRes.json(); setAllProductLinks(d.links || []); }
      if (seRes?.ok) { const d = await seRes.json(); setAllEquipmentLinks(d.links || []); }
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  };

  const getToken = () => localStorage.getItem('vector_token');
  const getServiceById = (id) => services.find(s => s.id === id);
  const getServiceLinkCount = (svcId) => {
    const pCount = allProductLinks.filter(l => l.service_id === svcId).length;
    const eCount = allEquipmentLinks.filter(l => l.service_id === svcId).length;
    return pCount + eCount;
  };

  // ---- Service Linking ----
  const fetchServiceLinks = async (serviceId) => {
    const token = getToken();
    setLinkLoading(true);
    try {
      const [prodRes, equipRes] = await Promise.all([
        fetch(`/api/services/products?service_id=${serviceId}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch(`/api/services/equipment?service_id=${serviceId}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ]);
      if (prodRes?.ok) {
        const data = await prodRes.json();
        setLinkedProducts(data.links || []);
      } else {
        setLinkedProducts([]);
      }
      if (equipRes?.ok) {
        const data = await equipRes.json();
        setLinkedEquipment(data.links || []);
      } else {
        setLinkedEquipment([]);
      }
    } catch (err) {
      console.error('Failed to fetch service links:', err);
      setLinkedProducts([]);
      setLinkedEquipment([]);
    } finally {
      setLinkLoading(false);
    }
  };

  const addProductLink = async (serviceId, productId) => {
    const token = getToken();
    try {
      const res = await fetch('/api/services/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ service_id: serviceId, product_id: productId, quantity_per_hour: 1 }),
      });
      if (res.ok) {
        const data = await res.json();
        setLinkedProducts(prev => [...prev, data.link]);
      }
    } catch (err) { console.error('Failed to link product:', err); }
  };

  const updateProductLink = async (linkId, updates) => {
    const token = getToken();
    try {
      const res = await fetch('/api/services/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: linkId, ...updates }),
      });
      if (res.ok) {
        const data = await res.json();
        setLinkedProducts(prev => prev.map(l => l.id === linkId ? data.link : l));
      }
    } catch (err) { console.error('Failed to update link:', err); }
  };

  const removeProductLink = async (linkId) => {
    const token = getToken();
    try {
      await fetch(`/api/services/products?id=${linkId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setLinkedProducts(prev => prev.filter(l => l.id !== linkId));
    } catch (err) { console.error('Failed to remove link:', err); }
  };

  const addEquipmentLink = async (serviceId, equipmentId) => {
    const token = getToken();
    try {
      const res = await fetch('/api/services/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ service_id: serviceId, equipment_id: equipmentId }),
      });
      if (res.ok) {
        const data = await res.json();
        setLinkedEquipment(prev => [...prev, data.link]);
      }
    } catch (err) { console.error('Failed to link equipment:', err); }
  };

  const removeEquipmentLink = async (linkId) => {
    const token = getToken();
    try {
      await fetch(`/api/services/equipment?id=${linkId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setLinkedEquipment(prev => prev.filter(l => l.id !== linkId));
    } catch (err) { console.error('Failed to remove link:', err); }
  };

  const openEditService = (svc) => {
    setEditingService({ ...svc });
    fetchServiceLinks(svc.id);
  };

  // ---- Service CRUD ----
  const addService = async () => {
    if (!newService.name.trim() || !newService.hourly_rate) return;
    setSaving(true);
    setError('');
    try {
      const token = getToken();
      if (!token) { setError('Not logged in.'); return; }
      const res = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: newService.name,
          description: newService.description,
          hourly_rate: parseFloat(newService.hourly_rate) || 0,
          hours_field: newService.hours_field || 'ext_wash_hours',
          product_cost_per_hour: parseFloat(newService.product_cost_per_hour) || 0,
          product_notes: newService.product_notes || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to add service'); return; }
      setServices([...services, data.service]);
      setNewService({ name: '', description: '', hourly_rate: '', hours_field: 'ext_wash_hours', product_cost_per_hour: '', product_notes: '' });
      setShowServiceModal(false);
      setError('');
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const updateService = async () => {
    if (!editingService) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/services/${editingService.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          name: editingService.name,
          description: editingService.description,
          hourly_rate: parseFloat(editingService.hourly_rate) || 0,
          hours_field: editingService.hours_field || 'ext_wash_hours',
          product_cost_per_hour: parseFloat(editingService.product_cost_per_hour) || 0,
          product_notes: editingService.product_notes || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to update service'); return; }
      setServices(services.map(s => s.id === data.service.id ? data.service : s));
      setEditingService(null);
      setError('');
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const deleteService = async (svc) => {
    if (!confirm(`Delete "${svc.name}"?`)) return;
    try {
      await fetch(`/api/services/${svc.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
      setServices(services.filter(s => s.id !== svc.id));
    } catch (err) { console.error('Failed to delete:', err); }
  };

  const importDefaults = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/services/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ services: DEFAULT_SERVICES }),
      });
      if (res.ok) {
        const data = await res.json();
        setServices([...services, ...(data.services || [])]);
      }
    } catch (err) { console.error('Failed to import:', err); }
    finally { setSaving(false); }
  };

  // ---- Package CRUD ----
  const addPackage = async () => {
    if (!newPackage.name.trim() || newPackage.service_ids.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch('/api/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          name: newPackage.name,
          description: newPackage.description,
          discount_percent: parseFloat(newPackage.discount_percent) || 0,
          service_ids: newPackage.service_ids,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPackages([...packages, data.package]);
        setNewPackage({ name: '', description: '', discount_percent: '', service_ids: [] });
        setShowPackageBuilder(false);
      }
    } catch (err) { console.error('Failed to add package:', err); }
    finally { setSaving(false); }
  };

  const updatePackage = async () => {
    if (!editingPackage) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/packages/${editingPackage.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          name: editingPackage.name,
          description: editingPackage.description,
          discount_percent: parseFloat(editingPackage.discount_percent) || 0,
          service_ids: editingPackage.service_ids || [],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPackages(packages.map(p => p.id === data.package.id ? data.package : p));
        setEditingPackage(null);
      }
    } catch (err) { console.error('Failed to update package:', err); }
    finally { setSaving(false); }
  };

  const deletePackage = async (pkg) => {
    if (!confirm(`Delete package "${pkg.name}"?`)) return;
    try {
      await fetch(`/api/packages/${pkg.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
      setPackages(packages.filter(p => p.id !== pkg.id));
    } catch (err) { console.error('Failed to delete package:', err); }
  };

  // ---- Addon Fee CRUD ----
  const addAddonFee = async () => {
    if (!newAddon.name.trim()) return;
    setSaving(true);
    setError('');
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
      if (!res.ok) { setError(data.error || 'Failed to add fee'); return; }
      setAddonFees([...addonFees, data.fee]);
      setNewAddon({ name: '', description: '', fee_type: 'flat', amount: '' });
      setShowAddonModal(false);
      setError('');
    } catch (err) {
      setError('Network error. Please try again.');
    } finally { setSaving(false); }
  };

  const updateAddonFee = async () => {
    if (!editingAddon) return;
    setSaving(true);
    setError('');
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
      if (!res.ok) { setError(data.error || 'Failed to update fee'); return; }
      setAddonFees(addonFees.map(f => f.id === data.fee.id ? data.fee : f));
      setEditingAddon(null);
      setError('');
    } catch (err) {
      setError('Network error. Please try again.');
    } finally { setSaving(false); }
  };

  const deleteAddonFee = async (fee) => {
    if (!confirm(`Delete "${fee.name}"?`)) return;
    try {
      await fetch(`/api/addon-fees/${fee.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
      setAddonFees(addonFees.filter(f => f.id !== fee.id));
    } catch (err) { console.error('Failed to delete:', err); }
  };

  const importDefaultAddons = async () => {
    setSaving(true);
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
    finally { setSaving(false); }
  };

  // ---- Drag handlers ----
  const handleDragStart = (e, svc) => {
    setDraggedService(svc);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', svc.id);
  };
  const handleDragEnd = () => { setDraggedService(null); setDragOver(null); };

  const handleDragOverNew = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOver('new'); };
  const handleDragLeaveNew = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); };
  const handleDropNew = (e) => {
    e.preventDefault(); setDragOver(null);
    if (draggedService && !newPackage.service_ids.includes(draggedService.id)) {
      setNewPackage(prev => ({ ...prev, service_ids: [...prev.service_ids, draggedService.id] }));
    }
    setDraggedService(null);
  };

  const handleDragOverPkg = (e, pkgId) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOver(pkgId); };
  const handleDragLeavePkg = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); };
  const handleDropOnPackage = async (e, pkg) => {
    e.preventDefault(); setDragOver(null);
    if (!draggedService) return;
    if ((pkg.service_ids || []).includes(draggedService.id)) { setDraggedService(null); return; }
    const updatedIds = [...(pkg.service_ids || []), draggedService.id];
    setDraggedService(null);
    setPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, service_ids: updatedIds } : p));
    try {
      const res = await fetch(`/api/packages/${pkg.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ name: pkg.name, description: pkg.description, discount_percent: pkg.discount_percent || 0, service_ids: updatedIds }),
      });
      if (res.ok) {
        const data = await res.json();
        setPackages(prev => prev.map(p => p.id === data.package.id ? data.package : p));
      }
    } catch (err) {
      setPackages(prev => prev.map(p => p.id === pkg.id ? pkg : p));
    }
  };

  const handleDropOnArea = (e) => {
    e.preventDefault(); setDragOver(null);
    if (!draggedService) return;
    if (!showPackageBuilder) {
      setNewPackage({ name: '', description: '', discount_percent: '', service_ids: [draggedService.id] });
      setShowPackageBuilder(true);
    }
    setDraggedService(null);
  };

  const removeFromPackage = (id) => {
    setNewPackage(prev => ({ ...prev, service_ids: prev.service_ids.filter(sid => sid !== id) }));
  };

  if (loading) {
    return <LoadingSpinner message="Loading services..." />;
  }

  return (
    <div className="page-transition min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      {/* Header */}
      <header className="flex justify-between items-center mb-6 text-white">
        <div className="flex items-center space-x-4">
          <a href="/settings" className="text-gray-400 hover:text-white">&larr; {t('nav.settings')}</a>
          <h1 className="text-2xl font-bold">{t('nav.services')}</h1>
        </div>
        <a href="/dashboard" className="text-amber-400 hover:underline">{t('nav.dashboard')}</a>
      </header>

      {/* Info Banner */}
      <div className="bg-blue-900/50 border border-blue-500/30 rounded-lg p-4 mb-6 text-blue-100">
        <p className="text-sm">
          <strong>How pricing works:</strong> Set your hourly rate per service.
          When you build a quote, hours come from the aircraft database and multiply by your rate.
          Packages bundle services with an optional discount %. Add-on fees are flat or % surcharges added on top.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Left: Services */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="p-4 border-b flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold">{t('nav.services')}</h2>
              <p className="text-sm text-gray-500">Drag to packages on the right</p>
            </div>
            <div className="flex gap-2">
              {services.length === 0 && (
                <button onClick={importDefaults} disabled={saving} className="px-3 py-1.5 text-sm border border-blue-500 text-blue-600 rounded hover:bg-blue-50">
                  Import Defaults
                </button>
              )}
              <button onClick={() => setShowServiceModal(true)} className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded hover:bg-amber-600">
                + Add
              </button>
            </div>
          </div>
          <div className="p-4">
            {services.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <p className="text-gray-500 mb-2">No services yet</p>
                <button onClick={importDefaults} className="text-amber-600 hover:underline">Import suggested services</button>
              </div>
            ) : (
              <div className="space-y-2">
                {services.map((svc) => (
                  <div key={svc.id} draggable onDragStart={(e) => handleDragStart(e, svc)} onDragEnd={handleDragEnd}
                    className={`flex items-center justify-between p-3 bg-gray-50 rounded-lg border cursor-grab hover:border-amber-400 hover:bg-amber-50 transition-all group ${draggedService?.id === svc.id ? 'opacity-50 border-amber-400' : ''}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-300 group-hover:text-amber-400">&#9776;</span>
                      <div>
                        <p className="font-medium">{svc.name}</p>
                        {svc.description && <p className="text-xs text-gray-500">{svc.description}</p>}
                        <p className="text-[10px] text-gray-400">
                          {HOURS_FIELD_OPTIONS[svc.hours_field] || 'Ext Wash (default)'}
                          {getServiceLinkCount(svc.id) > 0 && (
                            <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[9px] font-medium">
                              {getServiceLinkCount(svc.id)} linked
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-lg font-bold text-amber-600">${svc.hourly_rate || 0}</span>
                        <span className="text-xs text-gray-400">/hr</span>
                        {parseFloat(svc.product_cost_per_hour) > 0 && (
                          <p className="text-[10px] text-gray-400">${svc.product_cost_per_hour} product/hr</p>
                        )}
                      </div>
                      <button onClick={() => openEditService(svc)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">&#9998;</button>
                      <button onClick={() => deleteService(svc)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">&#128465;</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Packages */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden"
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
          onDrop={handleDropOnArea}>
          <div className="p-4 border-b flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold">Packages</h2>
              <p className="text-sm text-gray-500">
                {draggedService ? 'Drop service here!' : 'Bundle services with a discount'}
              </p>
            </div>
            <button
              onClick={() => { setNewPackage({ name: '', description: '', discount_percent: '', service_ids: [] }); setShowPackageBuilder(true); }}
              disabled={services.length === 0}
              className="px-3 py-1.5 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50">
              + Create
            </button>
          </div>
          <div className="p-4">
            {/* Package Builder */}
            {showPackageBuilder && (
              <div className="mb-4 p-4 border-2 border-dashed border-green-400 rounded-lg bg-green-50">
                <h3 className="font-medium mb-3">{t('common.create')} Package</h3>
                <input type="text" placeholder="Package name (e.g., Quick Turn)" value={newPackage.name}
                  onChange={(e) => setNewPackage({ ...newPackage, name: e.target.value })} className="w-full border rounded px-3 py-2 mb-3" />
                {/* Drop Zone */}
                <div onDragOver={handleDragOverNew} onDragLeave={handleDragLeaveNew}
                  onDrop={(e) => { e.stopPropagation(); handleDropNew(e); }}
                  className={`min-h-[100px] border-2 border-dashed rounded-lg p-3 mb-3 transition-colors ${dragOver === 'new' ? 'border-amber-500 bg-amber-50 scale-[1.02]' : 'border-gray-300'}`}>
                  {newPackage.service_ids.length === 0 ? (
                    <p className="text-center text-gray-400 py-6">Drag services here</p>
                  ) : (
                    <div className="space-y-2">
                      {newPackage.service_ids.map(id => {
                        const svc = getServiceById(id);
                        return svc ? (
                          <div key={id} className="flex justify-between items-center bg-white p-2 rounded border">
                            <span>{svc.name} <span className="text-xs text-gray-400">(${svc.hourly_rate}/hr)</span></span>
                            <button onClick={() => removeFromPackage(id)} className="text-red-500 hover:text-red-700">&times;</button>
                          </div>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
                <div className="flex gap-3 mb-3">
                  <textarea placeholder="Description (optional)" value={newPackage.description}
                    onChange={(e) => setNewPackage({ ...newPackage, description: e.target.value })}
                    rows={2} className="flex-1 border rounded px-3 py-2 resize-y min-h-[40px]" />
                  <div className="relative w-32">
                    <input type="number" placeholder="0" min="0" max="100" value={newPackage.discount_percent}
                      onChange={(e) => setNewPackage({ ...newPackage, discount_percent: e.target.value })}
                      className="w-full border rounded pl-3 pr-8 py-2" />
                    <span className="absolute right-3 top-2 text-gray-400">%</span>
                    <span className="text-[10px] text-gray-400 mt-0.5 block text-center">discount</span>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowPackageBuilder(false)} className="px-4 py-2 border rounded">{t('common.cancel')}</button>
                  <button onClick={addPackage} disabled={saving || !newPackage.name || newPackage.service_ids.length === 0}
                    className="px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50">{t('common.save')}</button>
                </div>
              </div>
            )}

            {/* Existing Packages */}
            {packages.length === 0 && !showPackageBuilder ? (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <p className="text-gray-500 mb-2">No packages yet</p>
                <p className="text-sm text-gray-400">Create a package to bundle services</p>
              </div>
            ) : (
              <div className="space-y-3">
                {packages.map((pkg) => (
                  <div key={pkg.id} onDragOver={(e) => handleDragOverPkg(e, pkg.id)} onDragLeave={handleDragLeavePkg}
                    onDrop={(e) => { e.stopPropagation(); handleDropOnPackage(e, pkg); }}
                    className={`p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border transition-all ${
                      dragOver === pkg.id ? 'border-amber-500 ring-2 ring-amber-300 scale-[1.02]' : 'border-green-200'
                    }`}>
                    {dragOver === pkg.id && (
                      <div className="text-xs text-amber-600 font-medium mb-2">
                        Drop to add &quot;{draggedService?.name}&quot; to this package
                      </div>
                    )}
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-green-800">{pkg.name}</h4>
                        {pkg.description && <p className="text-sm text-gray-600">{pkg.description}</p>}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {(pkg.service_ids || []).map(id => {
                            const svc = getServiceById(id);
                            return svc ? (
                              <span key={id} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">{svc.name}</span>
                            ) : null;
                          })}
                        </div>
                      </div>
                      <div className="text-right">
                        {(pkg.discount_percent || 0) > 0 ? (
                          <p className="text-xl font-bold text-green-600">{pkg.discount_percent}% off</p>
                        ) : (
                          <p className="text-sm text-gray-400">No discount</p>
                        )}
                        <div className="flex gap-1 mt-1">
                          <button onClick={() => setEditingPackage({ ...pkg })} className="p-1 text-gray-400 hover:text-blue-600">&#9998;</button>
                          <button onClick={() => deletePackage(pkg)} className="p-1 text-gray-400 hover:text-red-600">&#128465;</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add-on Fees Section */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold">{t('settings.addonFees')}</h2>
            <p className="text-sm text-gray-500">Flat or percentage surcharges added on top of service pricing (hazmat, after-hours, rush, etc.)</p>
          </div>
          <div className="flex gap-2">
            {addonFees.length === 0 && (
              <button onClick={importDefaultAddons} disabled={saving} className="px-3 py-1.5 text-sm border border-blue-500 text-blue-600 rounded hover:bg-blue-50">
                Import Defaults
              </button>
            )}
            <button onClick={() => setShowAddonModal(true)} className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded hover:bg-orange-600">
              + Add Fee
            </button>
          </div>
        </div>
        <div className="p-4">
          {addonFees.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <p className="text-gray-500 mb-2">No add-on fees yet</p>
              <button onClick={importDefaultAddons} disabled={saving} className="text-orange-600 hover:underline">
                Import suggested fees
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {addonFees.map((fee) => (
                <div key={fee.id} className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-orange-800">{fee.name}</h4>
                      {fee.description && <p className="text-xs text-gray-600 mt-1">{fee.description}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setEditingAddon({ ...fee })} className="p-1 text-gray-400 hover:text-blue-600">&#9998;</button>
                      <button onClick={() => deleteAddonFee(fee)} className="p-1 text-gray-400 hover:text-red-600">&#128465;</button>
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-xl font-bold text-orange-600">
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
      </div>

      {/* Add Service Modal */}
      {showServiceModal && (
        <Modal onClose={() => { setShowServiceModal(false); setError(''); }}>
          <h3 className="text-lg font-semibold mb-4">{t('common.add')} {t('nav.services')}</h3>
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.name')} *</label>
              <input type="text" value={newService.name} onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                placeholder="e.g., Full Interior Detail" className="w-full border rounded-lg px-3 py-2" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.description')}</label>
              <textarea value={newService.description} onChange={(e) => setNewService({ ...newService, description: e.target.value })}
                placeholder="What's included?" rows={2} className="w-full border rounded-lg px-3 py-2 resize-y min-h-[60px]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate *</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-400">$</span>
                <input type="number" value={newService.hourly_rate} onChange={(e) => setNewService({ ...newService, hourly_rate: e.target.value })}
                  placeholder="120" className="w-full border rounded-lg pl-7 pr-12 py-2" />
                <span className="absolute right-3 top-2.5 text-gray-400">/hr</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Aircraft Hours Field</label>
              <select value={newService.hours_field || 'ext_wash_hours'}
                onChange={(e) => setNewService({ ...newService, hours_field: e.target.value })}
                className="w-full border rounded-lg px-3 py-2">
                {Object.entries(HOURS_FIELD_OPTIONS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Which aircraft time estimate to use for this service</p>
            </div>
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Product Cost Tracking <span className="text-xs text-gray-400 font-normal">(internal only)</span></p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Cost / Hour</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-400">$</span>
                  <input type="number" step="0.01" value={newService.product_cost_per_hour} onChange={(e) => setNewService({ ...newService, product_cost_per_hour: e.target.value })}
                    placeholder="0.00" className="w-full border rounded-lg pl-7 pr-12 py-2" />
                  <span className="absolute right-3 top-2.5 text-gray-400">/hr</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Average product/material cost per hour of this service</p>
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Notes</label>
                <textarea value={newService.product_notes} onChange={(e) => setNewService({ ...newService, product_notes: e.target.value })}
                  placeholder="e.g., 1oz IronX, 2oz ceramic per hour" rows={2} className="w-full border rounded-lg px-3 py-2 resize-y min-h-[40px]" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowServiceModal(false)} className="px-4 py-2 border rounded-lg">{t('common.cancel')}</button>
            <button onClick={addService} disabled={saving || !newService.name || !newService.hourly_rate}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg disabled:opacity-50">{t('common.add')}</button>
          </div>
        </Modal>
      )}

      {/* Edit Service Modal */}
      {editingService && (
        <Modal onClose={() => { setEditingService(null); setLinkedProducts([]); setLinkedEquipment([]); setError(''); }}>
          <h3 className="text-lg font-semibold mb-4">{t('common.edit')} {t('nav.services')}</h3>
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.name')}</label>
              <input type="text" value={editingService.name} onChange={(e) => setEditingService({ ...editingService, name: e.target.value })}
                className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.description')}</label>
              <textarea value={editingService.description || ''} onChange={(e) => setEditingService({ ...editingService, description: e.target.value })}
                rows={2} className="w-full border rounded-lg px-3 py-2 resize-y min-h-[60px]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-400">$</span>
                <input type="number" value={editingService.hourly_rate || ''} onChange={(e) => setEditingService({ ...editingService, hourly_rate: e.target.value })}
                  className="w-full border rounded-lg pl-7 pr-12 py-2" />
                <span className="absolute right-3 top-2.5 text-gray-400">/hr</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Aircraft Hours Field</label>
              <select value={editingService.hours_field || 'ext_wash_hours'}
                onChange={(e) => setEditingService({ ...editingService, hours_field: e.target.value })}
                className="w-full border rounded-lg px-3 py-2">
                {Object.entries(HOURS_FIELD_OPTIONS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Which aircraft time estimate to use for this service</p>
            </div>
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Product Cost Tracking <span className="text-xs text-gray-400 font-normal">(internal only)</span></p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Cost / Hour</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-400">$</span>
                  <input type="number" step="0.01" value={editingService.product_cost_per_hour || ''} onChange={(e) => setEditingService({ ...editingService, product_cost_per_hour: e.target.value })}
                    placeholder="0.00" className="w-full border rounded-lg pl-7 pr-12 py-2" />
                  <span className="absolute right-3 top-2.5 text-gray-400">/hr</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Average product/material cost per hour of this service</p>
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Notes</label>
                <textarea value={editingService.product_notes || ''} onChange={(e) => setEditingService({ ...editingService, product_notes: e.target.value })}
                  placeholder="e.g., 1oz IronX, 2oz ceramic per hour" rows={2} className="w-full border rounded-lg px-3 py-2 resize-y min-h-[40px]" />
              </div>
            </div>

            {/* Linked Products Section */}
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-gray-700 mb-1">Products Needed</p>
              <p className="text-xs text-gray-400 mb-3">Link inventory products to auto-populate on quotes and jobs</p>
              {linkLoading ? (
                <p className="text-xs text-gray-400 py-2">Loading links...</p>
              ) : (
                <>
                  {linkedProducts.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {linkedProducts.map(link => (
                        <div key={link.id} className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{link.products?.name}</p>
                            <p className="text-[10px] text-gray-500">{link.products?.category} &middot; {currencySymbol()}{link.products?.cost_per_unit}/{link.products?.unit}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.1"
                              value={link.quantity_per_hour || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setLinkedProducts(prev => prev.map(l => l.id === link.id ? { ...l, quantity_per_hour: val } : l));
                              }}
                              onBlur={(e) => updateProductLink(link.id, { quantity_per_hour: parseFloat(e.target.value) || 0 })}
                              className="w-16 border rounded px-1.5 py-1 text-xs text-right"
                              title="Quantity per hour"
                            />
                            <span className="text-[10px] text-gray-500">/hr</span>
                          </div>
                          <button onClick={() => removeProductLink(link.id)} className="text-red-400 hover:text-red-600 text-sm">&times;</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {allProducts.length > 0 ? (
                    <select
                      onChange={(e) => {
                        const pid = e.target.value;
                        if (pid && !linkedProducts.some(l => l.product_id === pid)) {
                          addProductLink(editingService.id, pid);
                        }
                        e.target.value = '';
                      }}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">+ Link a product...</option>
                      {allProducts.filter(p => !linkedProducts.some(l => l.product_id === p.id)).map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.current_quantity} {p.unit})</option>
                      ))}
                    </select>
                  ) : (
                    <a href="/products" className="text-xs text-amber-600 hover:underline">Add products to inventory first</a>
                  )}
                </>
              )}
            </div>

            {/* Linked Equipment Section */}
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-gray-700 mb-1">Tools / Equipment Needed</p>
              <p className="text-xs text-gray-400 mb-3">Link tools your crew needs for this service</p>
              {linkLoading ? (
                <p className="text-xs text-gray-400 py-2">Loading links...</p>
              ) : (
                <>
                  {linkedEquipment.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {linkedEquipment.map(link => (
                        <div key={link.id} className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg border border-purple-200">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{link.equipment?.name}</p>
                            <p className="text-[10px] text-gray-500">{link.equipment?.brand} {link.equipment?.model}</p>
                          </div>
                          <button onClick={() => removeEquipmentLink(link.id)} className="text-red-400 hover:text-red-600 text-sm">&times;</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {allEquipment.length > 0 ? (
                    <select
                      onChange={(e) => {
                        const eid = e.target.value;
                        if (eid && !linkedEquipment.some(l => l.equipment_id === eid)) {
                          addEquipmentLink(editingService.id, eid);
                        }
                        e.target.value = '';
                      }}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">+ Link equipment...</option>
                      {allEquipment.filter(eq => !linkedEquipment.some(l => l.equipment_id === eq.id)).map(eq => (
                        <option key={eq.id} value={eq.id}>{eq.name}{eq.brand ? ` (${eq.brand})` : ''}</option>
                      ))}
                    </select>
                  ) : (
                    <a href="/equipment" className="text-xs text-amber-600 hover:underline">Add equipment first</a>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => { setEditingService(null); setLinkedProducts([]); setLinkedEquipment([]); }} className="px-4 py-2 border rounded-lg">{t('common.cancel')}</button>
            <button onClick={updateService} disabled={saving} className="px-4 py-2 bg-amber-500 text-white rounded-lg disabled:opacity-50">{t('common.save')}</button>
          </div>
        </Modal>
      )}

      {/* Edit Package Modal */}
      {editingPackage && (
        <Modal onClose={() => setEditingPackage(null)}>
          <h3 className="text-lg font-semibold mb-4">{t('common.edit')} Package</h3>
          <div className="space-y-4">
            <input type="text" placeholder="Package name" value={editingPackage.name}
              onChange={(e) => setEditingPackage({ ...editingPackage, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
            <textarea placeholder="Description" value={editingPackage.description || ''}
              onChange={(e) => setEditingPackage({ ...editingPackage, description: e.target.value })}
              rows={2} className="w-full border rounded-lg px-3 py-2 resize-y min-h-[60px]" />
            <div>
              <p className="text-sm font-medium mb-2">Services:</p>
              <div className="space-y-2 mb-2">
                {(editingPackage.service_ids || []).map(id => {
                  const svc = getServiceById(id);
                  return svc ? (
                    <div key={id} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                      <span>{svc.name} <span className="text-xs text-gray-400">(${svc.hourly_rate}/hr)</span></span>
                      <button onClick={() => setEditingPackage({ ...editingPackage, service_ids: editingPackage.service_ids.filter(sid => sid !== id) })}
                        className="text-red-500">&times;</button>
                    </div>
                  ) : null;
                })}
              </div>
              <select onChange={(e) => {
                const id = e.target.value;
                if (id && !(editingPackage.service_ids || []).includes(id)) {
                  setEditingPackage({ ...editingPackage, service_ids: [...(editingPackage.service_ids || []), id] });
                }
                e.target.value = '';
              }} className="w-full border rounded-lg px-3 py-2">
                <option value="">+ Add service...</option>
                {services.filter(s => !(editingPackage.service_ids || []).includes(s.id)).map(svc => (
                  <option key={svc.id} value={svc.id}>{svc.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bundle Discount %</label>
              <div className="relative">
                <input type="number" placeholder="0" min="0" max="100" value={editingPackage.discount_percent || ''}
                  onChange={(e) => setEditingPackage({ ...editingPackage, discount_percent: e.target.value })}
                  className="w-full border rounded-lg pr-8 px-3 py-2" />
                <span className="absolute right-3 top-2.5 text-gray-400">%</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Package price = sum of service rates x aircraft hours, minus this discount</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setEditingPackage(null)} className="px-4 py-2 border rounded-lg">{t('common.cancel')}</button>
            <button onClick={updatePackage} disabled={saving} className="px-4 py-2 bg-green-500 text-white rounded-lg disabled:opacity-50">{t('common.save')}</button>
          </div>
        </Modal>
      )}

      {/* Add Addon Fee Modal */}
      {showAddonModal && (
        <Modal onClose={() => { setShowAddonModal(false); setError(''); }}>
          <h3 className="text-lg font-semibold mb-4">{t('common.add')}</h3>
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.name')} *</label>
              <input type="text" value={newAddon.name} onChange={(e) => setNewAddon({ ...newAddon, name: e.target.value })}
                placeholder="e.g., After Hours" className="w-full border rounded-lg px-3 py-2" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.description')}</label>
              <input type="text" value={newAddon.description} onChange={(e) => setNewAddon({ ...newAddon, description: e.target.value })}
                placeholder="Optional description" className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fee Type</label>
              <div className="flex gap-2">
                {['flat', 'percent'].map(t => (
                  <button key={t} type="button" onClick={() => setNewAddon({ ...newAddon, fee_type: t })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      newAddon.fee_type === t ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}>
                    {t === 'flat' ? 'Flat $' : 'Percent %'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.amount')} *</label>
              <div className="relative">
                {newAddon.fee_type === 'flat' && <span className="absolute left-3 top-2.5 text-gray-400">$</span>}
                <input type="number" value={newAddon.amount} onChange={(e) => setNewAddon({ ...newAddon, amount: e.target.value })}
                  placeholder={newAddon.fee_type === 'flat' ? '150' : '25'}
                  className={`w-full border rounded-lg py-2 ${newAddon.fee_type === 'flat' ? 'pl-7 pr-3' : 'pl-3 pr-8'}`} />
                {newAddon.fee_type === 'percent' && <span className="absolute right-3 top-2.5 text-gray-400">%</span>}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowAddonModal(false)} className="px-4 py-2 border rounded-lg">{t('common.cancel')}</button>
            <button onClick={addAddonFee} disabled={saving || !newAddon.name}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg disabled:opacity-50">{t('common.add')}</button>
          </div>
        </Modal>
      )}

      {/* Edit Addon Fee Modal */}
      {editingAddon && (
        <Modal onClose={() => { setEditingAddon(null); setError(''); }}>
          <h3 className="text-lg font-semibold mb-4">{t('common.edit')}</h3>
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.name')}</label>
              <input type="text" value={editingAddon.name} onChange={(e) => setEditingAddon({ ...editingAddon, name: e.target.value })}
                className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.description')}</label>
              <input type="text" value={editingAddon.description || ''} onChange={(e) => setEditingAddon({ ...editingAddon, description: e.target.value })}
                className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fee Type</label>
              <div className="flex gap-2">
                {['flat', 'percent'].map(t => (
                  <button key={t} type="button" onClick={() => setEditingAddon({ ...editingAddon, fee_type: t })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      editingAddon.fee_type === t ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}>
                    {t === 'flat' ? 'Flat $' : 'Percent %'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.amount')}</label>
              <div className="relative">
                {editingAddon.fee_type === 'flat' && <span className="absolute left-3 top-2.5 text-gray-400">$</span>}
                <input type="number" value={editingAddon.amount || ''} onChange={(e) => setEditingAddon({ ...editingAddon, amount: e.target.value })}
                  className={`w-full border rounded-lg py-2 ${editingAddon.fee_type === 'flat' ? 'pl-7 pr-3' : 'pl-3 pr-8'}`} />
                {editingAddon.fee_type === 'percent' && <span className="absolute right-3 top-2.5 text-gray-400">%</span>}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setEditingAddon(null)} className="px-4 py-2 border rounded-lg">{t('common.cancel')}</button>
            <button onClick={updateAddonFee} disabled={saving} className="px-4 py-2 bg-orange-500 text-white rounded-lg disabled:opacity-50">{t('common.save')}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-lg p-5 sm:p-6 w-full sm:max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
