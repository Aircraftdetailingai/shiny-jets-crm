"use client";
import { useState, useEffect, Fragment, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';
import CalibrationModal from '@/components/CalibrationModal';
import { isCrossFamily } from '@/lib/calibration-reference';
import { currencySymbol } from '@/lib/formatPrice';
import { FEE_TYPES, SUB_ITEM_TYPES, SUB_ITEM_PRESETS, feeTypeMeta, computeAddonTotal, PERCENT } from '@/lib/addon-fees';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const CATEGORY_OPTIONS = {
  exterior: 'Exterior',
  paint_correction: 'Paint Correction',
  coating: 'Coating',
  interior: 'Interior',
  brightwork: 'Brightwork',
  package: 'Package',
  other: 'Other',
};

// --- Sortable service row using @dnd-kit (reorder via ≡ handle) ---
function SortableServiceRow({ id, left, right, svc, handleDragStart, handleDragEnd: onNativeDragEnd }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <div
        draggable
        onDragStart={(e) => handleDragStart?.(e, svc)}
        onDragEnd={() => onNativeDragEnd?.()}
        className="flex items-center justify-between p-3 bg-v-charcoal rounded-lg border transition-all group hover:border-v-gold hover:bg-v-gold/10"
      >
        <div className="flex items-center gap-3">
          <span
            {...attributes}
            {...listeners}
            className="text-gray-500 group-hover:text-v-gold select-none cursor-grab active:cursor-grabbing touch-none px-1"
            title="Drag to reorder"
          >&#9776;</span>
          {left}
        </div>
        {right}
      </div>
    </div>
  );
}

// --- Sortable package card using @dnd-kit ---
function SortablePackageCard({ pkg, getServiceById, setEditingPackage, deletePackage, dragOver, draggedService, handleDragOverPkg, handleDragLeavePkg, handleDropOnPackage }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pkg.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onDragOver={(e) => handleDragOverPkg(e, pkg.id)}
      onDragLeave={handleDragLeavePkg}
      onDrop={(e) => { e.stopPropagation(); handleDropOnPackage(e, pkg); }}
      className={`p-4 rounded-lg border transition-all ${
        dragOver === pkg.id ? 'bg-[#1A2236] border-[#C9A84C] ring-2 ring-[#C9A84C]/50 scale-[1.02]'
        : 'bg-[#1A2236] border-[#2A3548] hover:border-[#C9A84C]/30'
      }`}
    >
      {dragOver === pkg.id && draggedService && (
        <div className="text-xs text-v-gold font-medium mb-2">
          Drop to add &quot;{draggedService.name}&quot; to this package
        </div>
      )}
      <div className="flex justify-between items-start">
        <div className="flex items-start gap-2">
          <span
            {...attributes}
            {...listeners}
            className="text-white/40 hover:text-white/80 cursor-grab active:cursor-grabbing select-none mt-1 touch-none"
            title="Drag to reorder"
          >&#9776;</span>
          <div>
            <h4 className="font-semibold text-white">{pkg.name}</h4>
            {pkg.description && <p className="text-sm text-white/60">{pkg.description}</p>}
            <div className="flex flex-wrap gap-1 mt-2">
              {(pkg.service_ids || []).map(id => {
                const svc = getServiceById(id);
                return svc ? (
                  <span key={id} className="text-xs bg-white/10 border border-white/20 text-white/80 px-2 py-0.5 rounded">{svc.name}</span>
                ) : null;
              })}
            </div>
          </div>
        </div>
        <div className="text-right">
          {(pkg.discount_percent || 0) > 0 ? (
            <span className="inline-block px-2 py-1 bg-v-gold/20 text-v-gold text-xs font-medium rounded">{pkg.discount_percent}% off</span>
          ) : (
            <p className="text-xs text-white/40">No discount</p>
          )}
          <div className="flex gap-1 mt-2 justify-end">
            <button onClick={() => setEditingPackage({ ...pkg })} className="p-1.5 text-white/50 hover:text-white transition-colors">&#9998;</button>
            <button onClick={() => deletePackage(pkg)} className="p-1.5 text-white/50 hover:text-red-400 transition-colors">&#128465;</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PackageSortableList({ packages, setPackages, getToken, getServiceById, setEditingPackage, deletePackage, dragOver, draggedService, handleDragOverPkg, handleDragLeavePkg, handleDropOnPackage }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = packages.findIndex(p => p.id === active.id);
    const newIndex = packages.findIndex(p => p.id === over.id);
    const reordered = arrayMove(packages, oldIndex, newIndex);
    setPackages(reordered);
    try {
      await fetch('/api/packages/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ order: reordered.map(p => p.id) }),
      });
    } catch {}
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={packages.map(p => p.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {packages.map(pkg => (
            <SortablePackageCard
              key={pkg.id}
              pkg={pkg}
              getServiceById={getServiceById}
              setEditingPackage={setEditingPackage}
              deletePackage={deletePackage}
              dragOver={dragOver}
              draggedService={draggedService}
              handleDragOverPkg={handleDragOverPkg}
              handleDragLeavePkg={handleDragLeavePkg}
              handleDropOnPackage={handleDropOnPackage}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

const DEFAULT_SERVICES = [
  { name: 'Maintenance Wash', description: 'Regular exterior wash', hourly_rate: 120, category: 'exterior' },
  { name: 'Decon Wash', description: 'Deep clean with iron remover and clay bar', hourly_rate: 130, category: 'exterior' },
  { name: 'One-Step Polish', description: 'Light polish to remove minor swirls', hourly_rate: 140, category: 'exterior' },
  { name: 'Wax Application', description: 'Protective wax coating', hourly_rate: 100, category: 'exterior' },
  { name: 'Spray Ceramic', description: 'Ceramic spray sealant', hourly_rate: 120, category: 'exterior' },
  { name: 'Ceramic Coating', description: 'Professional ceramic coating, 2+ year protection', hourly_rate: 175, category: 'exterior' },
  { name: 'Vacuum & Wipe Down', description: 'Interior vacuum and surface wipe', hourly_rate: 100, category: 'interior' },
  { name: 'Carpet Extraction', description: 'Deep carpet and upholstery cleaning', hourly_rate: 110, category: 'interior' },
  { name: 'Leather Clean & Condition', description: 'Full leather treatment', hourly_rate: 115, category: 'interior' },
  { name: 'Polish Brightwork', description: 'Metal and chrome polishing', hourly_rate: 130, category: 'exterior' },
];

const DEFAULT_ADDON_FEES = [
  { name: 'Hazmat Fee', description: 'Hazardous material handling surcharge', fee_type: 'flat', amount: 250 },
  { name: 'After Hours', description: 'Work performed outside business hours', fee_type: 'flat', amount: 150 },
  { name: 'Weekend', description: 'Weekend service surcharge', fee_type: 'flat', amount: 100 },
  { name: 'Rush / Emergency', description: 'Expedited service premium', fee_type: 'percent', amount: 25 },
  { name: 'Travel Fee', description: 'Travel surcharge per crew member', fee_type: 'per_staff', amount: 500 },
  { name: 'Lodging', description: 'Hotel per night, per crew member', fee_type: 'per_night', amount: 200, buffer_before: 1, buffer_after: 1 },
  { name: 'Rental Car', description: 'Rental car per day', fee_type: 'per_unit_day', amount: 75, buffer_before: 1, buffer_after: 1 },
];

const ADDON_RATE_HELP = {
  flat: 'Charged once, as-is.',
  percent: 'Percent of the service subtotal.',
  per_staff: 'Multiplied by the number of staff on the job.',
  per_night: 'Per night, multiplied by nights and staff count.',
  per_unit_day: 'Per unit (e.g. car) per day. Quantity is set on each quote/invoice.',
};

const AIRCRAFT_HOURS_MAP = [
  { column: 'ext_wash_hours', label: 'Exterior Wash', keywords: ['wash', 'maintenance', 'exterior wash', 'ramp wash'] },
  { column: 'int_detail_hours', label: 'Interior Detail', keywords: ['interior', 'detail', 'cabin', 'cockpit'] },
  { column: 'polish_hours', label: 'Polish', keywords: ['polish', 'one step', 'machine polish', 'compound'] },
  { column: 'wax_hours', label: 'Wax', keywords: ['wax', 'sealant', 'polymer', 'paint sealant'] },
  { column: 'ceramic_hours', label: 'Ceramic', keywords: ['ceramic', 'spray ceramic', 'ceramic spray', 'sio2', 'coating', 'nano'] },
  { column: 'leather_hours', label: 'Leather', keywords: ['leather', 'condition', 'interior leather'] },
  { column: 'carpet_hours', label: 'Carpet', keywords: ['carpet', 'extraction', 'steam'] },
  { column: 'decon_hours', label: 'Decon', keywords: ['decon', 'iron', 'clay', 'fallout'] },
  { column: 'spray_ceramic_hours', label: 'Spray Ceramic', keywords: ['spray ceramic', 'spray coat', 'topcoat'] },
  { column: 'brightwork_hours', label: 'Brightwork', keywords: ['brightwork', 'metal polish', 'chrome', 'aluminum'] },
];

function matchServiceName(name) {
  const lower = name.toLowerCase();
  for (const entry of AIRCRAFT_HOURS_MAP) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return entry;
      }
    }
  }
  return null;
}

export default function ServicesPage() {
  const router = useRouter();
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
  const [newService, setNewService] = useState({ name: '', description: '', hourly_rate: '', category: 'other', minimum_price: '' });

  // Package form
  const [showPackageBuilder, setShowPackageBuilder] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [newPackage, setNewPackage] = useState({ name: '', description: '', discount_percent: '', service_ids: [] });

  // Addon fee form
  const [showAddonModal, setShowAddonModal] = useState(false);
  const [editingAddon, setEditingAddon] = useState(null);
  const [newAddon, setNewAddon] = useState({ name: '', description: '', fee_type: 'flat', amount: '', buffer_before: 0, buffer_after: 0, is_compound: false, sub_items: [] });

  // AI estimate state (Enterprise only)
  const [aiEstimate, setAiEstimate] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Service suggestion tips (aircraft hours matching)
  const [serviceSuggestions, setServiceSuggestions] = useState({});
  const [serviceAccuracy, setServiceAccuracy] = useState({});

  // Calibration modal state
  const [calibratingService, setCalibratingService] = useState(null);
  const [calibrations, setCalibrations] = useState([]);

  // Error state
  const [error, setError] = useState('');
  const [savedFlash, setSavedFlash] = useState('');
  const flashSaved = (msg = 'Saved') => { setSavedFlash(msg); setTimeout(() => setSavedFlash(''), 2000); };

  // Drag state (for package builder)
  const [draggedService, setDraggedService] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  // Reorder drag state (for service list ordering)
  // reorderDragIdx/reorderOverIdx removed — using @dnd-kit now
  // Package reorder state
  const [pkgDragIdx, setPkgDragIdx] = useState(null);
  const [pkgOverIdx, setPkgOverIdx] = useState(null);
  // Service reorder within package edit modal
  const [pkgSvcDragIdx, setPkgSvcDragIdx] = useState(null);
  const [pkgSvcOverIdx, setPkgSvcOverIdx] = useState(null);
  const [orderSavedToast, setOrderSavedToast] = useState(false);

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
      const [svcRes, pkgRes, feeRes, prodRes, equipRes, calRes] = await Promise.all([
        fetch('/api/services', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/packages', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/addon-fees', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/products', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch('/api/equipment', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch('/api/services/calibrations', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
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
      if (calRes?.ok) {
        try {
          const data = await calRes.json();
          setCalibrations(data.calibrations || []);
        } catch {}
      }
      // Fetch all service links for badge counts
      const [spRes, seRes] = await Promise.all([
        fetch('/api/services/products', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch('/api/services/equipment', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ]);
      if (spRes?.ok) { const d = await spRes.json(); setAllProductLinks(d.links || []); }
      if (seRes?.ok) { const d = await seRes.json(); setAllEquipmentLinks(d.links || []); }

      // Fetch service accuracy data for badges
      try {
        const accRes = await fetch('/api/services/accuracy', { headers: { Authorization: `Bearer ${token}` } });
        if (accRes?.ok) {
          const accData = await accRes.json();
          const accMap = {};
          (accData.accuracy || []).forEach(a => {
            accMap[a.service_name] = { avg_variance_pct: a.avg_variance_pct, sample_size: a.sample_size, badge: a.badge };
          });
          setServiceAccuracy(accMap);
        }
      } catch {}
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

  // ---- AI Estimate ----
  const fetchAiEstimate = async (column) => {
    if (!column) return;
    setAiLoading(true);
    setAiEstimate(null);
    try {
      const res = await fetch(`/api/aircraft-hours/average?column=${column}`);
      if (res.ok) {
        const data = await res.json();
        setAiEstimate(data);
      }
    } catch (err) {
      console.error('AI estimate fetch failed:', err);
    } finally {
      setAiLoading(false);
    }
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
        body: JSON.stringify({
          service_id: serviceId,
          product_id: productId,
          quantity_per_job: 0,
          quantity_per_sqft: 0,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLinkedProducts(prev => [...prev, data.link]);
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('[settings/services] addProductLink failed:', res.status, err);
        alert(err.error || `Failed to link product (HTTP ${res.status})`);
      }
    } catch (err) {
      console.error('Failed to link product:', err);
      alert('Network error linking product. Check the console.');
    }
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
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('[settings/services] updateProductLink failed:', res.status, err);
        alert(err.error || `Failed to update product link (HTTP ${res.status})`);
      }
    } catch (err) {
      console.error('Failed to update link:', err);
      alert('Network error updating product link. Check the console.');
    }
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
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('[settings/services] addEquipmentLink failed:', res.status, err);
        alert(err.error || `Failed to link equipment (HTTP ${res.status})`);
      }
    } catch (err) {
      console.error('Failed to link equipment:', err);
      alert('Network error linking equipment. Check the console.');
    }
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

  const dismissSuggestion = (serviceId) => {
    const dismissed = JSON.parse(localStorage.getItem('vector_svc_tips_dismissed') || '[]');
    if (!dismissed.includes(serviceId)) {
      dismissed.push(serviceId);
      localStorage.setItem('vector_svc_tips_dismissed', JSON.stringify(dismissed));
    }
    setServiceSuggestions(prev => {
      const next = { ...prev };
      delete next[serviceId];
      return next;
    });
  };

  const linkServiceToHours = (serviceId, column) => {
    const svc = services.find(s => s.id === serviceId);
    if (svc) {
      setEditingService({ ...svc, hours_field: column });
      fetchServiceLinks(svc.id);
    }
    dismissSuggestion(serviceId);
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
          category: newService.category || 'other',
          minimum_price: newService.minimum_price === '' ? null : parseFloat(newService.minimum_price),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to add service'); return; }
      setServices([...services, data.service]);
      setNewService({ name: '', description: '', hourly_rate: '', category: 'other', minimum_price: '' });
      setShowServiceModal(false);
      setError('');
      flashSaved('Service added');

      // Check if service name matches aircraft hours database
      const dismissed = JSON.parse(localStorage.getItem('vector_svc_tips_dismissed') || '[]');
      if (!dismissed.includes(data.service.id)) {
        const match = matchServiceName(data.service.name);
        if (match) {
          setServiceSuggestions(prev => ({ ...prev, [data.service.id]: { type: 'partial_match', match } }));
        } else {
          setServiceSuggestions(prev => ({ ...prev, [data.service.id]: { type: 'no_match' } }));
        }
      }
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
          category: editingService.category || 'other',
          hours_field: editingService.hours_field || null,
          product_cost_per_hour: parseFloat(editingService.product_cost_per_hour) || 0,
          product_notes: editingService.product_notes || '',
          sop_url: editingService.sop_url || null,
          sop_summary: editingService.sop_summary || null,
          sop_file_path: editingService.sop_file_path || null,
          sop_file_name: editingService.sop_file_name || null,
          minimum_price: editingService.minimum_price === '' || editingService.minimum_price == null
            ? null
            : parseFloat(editingService.minimum_price),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to update service'); return; }
      setServices(services.map(s => s.id === data.service.id ? data.service : s));
      setEditingService(null);
      setError('');
      flashSaved('Service updated');
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
        flashSaved('Package added');
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
        flashSaved('Package updated');
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
          buffer_before: parseInt(newAddon.buffer_before, 10) || 0,
          buffer_after: parseInt(newAddon.buffer_after, 10) || 0,
          is_compound: !!newAddon.is_compound,
          sub_items: Array.isArray(newAddon.sub_items) ? newAddon.sub_items : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to add fee'); return; }
      setAddonFees([...addonFees, data.fee]);
      setNewAddon({ name: '', description: '', fee_type: 'flat', amount: '', buffer_before: 0, buffer_after: 0, is_compound: false, sub_items: [] });
      setShowAddonModal(false);
      setError('');
      flashSaved('Add-on added');
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
          buffer_before: parseInt(editingAddon.buffer_before, 10) || 0,
          buffer_after: parseInt(editingAddon.buffer_after, 10) || 0,
          is_compound: !!editingAddon.is_compound,
          sub_items: Array.isArray(editingAddon.sub_items) ? editingAddon.sub_items : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to update fee'); return; }
      setAddonFees(addonFees.map(f => f.id === data.fee.id ? data.fee : f));
      setEditingAddon(null);
      setError('');
      flashSaved('Add-on updated');
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

  // ---- Auto-scroll while dragging near viewport edges ----
  const autoScroll = (clientY) => {
    const ZONE = 100;
    const MAX_SPEED = 12;
    const vh = window.innerHeight;
    if (clientY < ZONE) {
      window.scrollBy(0, -MAX_SPEED * (1 - clientY / ZONE));
    } else if (clientY > vh - ZONE) {
      window.scrollBy(0, MAX_SPEED * (1 - (vh - clientY) / ZONE));
    }
  };

  // ---- Drag handlers ----
  const handleDragStart = (e, svc) => {
    setDraggedService(svc);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', svc.id);
  };
  const handleDragEnd = () => { setDraggedService(null); setDragOver(null); };

  const handleDragOverNew = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOver('new'); autoScroll(e.clientY); };
  const handleDragLeaveNew = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); };
  const handleDropNew = (e) => {
    e.preventDefault(); setDragOver(null);
    if (draggedService && !newPackage.service_ids.includes(draggedService.id)) {
      setNewPackage(prev => ({ ...prev, service_ids: [...prev.service_ids, draggedService.id] }));
    }
    setDraggedService(null);
  };

  const handleDragOverPkg = (e, pkgId) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOver(pkgId); autoScroll(e.clientY); };
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

  // ---- Reorder handlers (service list ordering) ----
  // @dnd-kit service reorder handler (replaces native drag)
  const svcSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const handleServiceDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = services.findIndex(s => s.id === active.id);
    const newIndex = services.findIndex(s => s.id === over.id);
    const reordered = arrayMove(services, oldIndex, newIndex);
    setServices(reordered);
    const token = getToken();
    try {
      const res = await fetch('/api/services/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ order: reordered.map(s => s.id) }),
      });
      if (res.ok) {
        setOrderSavedToast(true);
        setTimeout(() => setOrderSavedToast(false), 2000);
      }
    } catch (err) {
      console.error('Failed to save order:', err);
    }
  };

  // Package reorder handlers
  const handlePkgDragStart = (e, idx) => {
    setPkgDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  };
  const handlePkgDragOver = (e, idx) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setPkgOverIdx(idx); autoScroll(e.clientY); };
  const handlePkgDrop = async (e, dropIdx) => {
    e.preventDefault(); e.stopPropagation();
    setPkgOverIdx(null);
    if (pkgDragIdx === null || pkgDragIdx === dropIdx) { setPkgDragIdx(null); return; }
    const reordered = [...packages];
    const [moved] = reordered.splice(pkgDragIdx, 1);
    reordered.splice(dropIdx, 0, moved);
    setPackages(reordered);
    setPkgDragIdx(null);
    try {
      await fetch('/api/packages/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ order: reordered.map(p => p.id) }),
      });
    } catch {}
  };

  // Service reorder within package edit modal
  const handlePkgSvcDragStart = (e, idx) => {
    setPkgSvcDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handlePkgSvcDragOver = (e, idx) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setPkgSvcOverIdx(idx); };
  const handlePkgSvcDrop = (e, dropIdx) => {
    e.preventDefault();
    setPkgSvcOverIdx(null);
    if (pkgSvcDragIdx === null || pkgSvcDragIdx === dropIdx) { setPkgSvcDragIdx(null); return; }
    const ids = [...(editingPackage?.service_ids || [])];
    const [moved] = ids.splice(pkgSvcDragIdx, 1);
    ids.splice(dropIdx, 0, moved);
    setEditingPackage({ ...editingPackage, service_ids: ids });
    setPkgSvcDragIdx(null);
  };

  if (loading) {
    return <LoadingSpinner message="Loading services..." />;
  }

  return (
    <div className="page-transition min-h-screen bg-v-charcoal p-4" onDragOver={(e) => { if (draggedService || pkgDragIdx !== null) autoScroll(e.clientY); }}>
      {/* Order saved toast */}
      {orderSavedToast && (
        <div className="fixed top-4 right-4 z-50 bg-green-900/90 border border-green-500/50 text-green-200 px-4 py-2 rounded-lg shadow-lg text-sm animate-pulse">
          Order saved
        </div>
      )}
      {savedFlash && (
        <div className="fixed top-4 right-4 z-[100] bg-emerald-500/10 border border-emerald-500/30 text-green-400 text-xs px-3 py-2 rounded shadow-lg">{`✓ ${savedFlash}`}</div>
      )}

      {/* Header */}
      <header className="flex justify-between items-center mb-6 text-white">
        <div className="flex items-center space-x-4">
          <a href="/settings" className="text-v-text-secondary hover:text-white">&larr; {'Settings'}</a>
          <h1 className="text-2xl font-bold">{'Services'}</h1>
        </div>
        <a href="/dashboard" className="text-v-gold hover:underline">{'Dashboard'}</a>
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
        <div className="bg-v-surface rounded-lg shadow-lg overflow-hidden">
          <div className="p-4 border-b flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold">{'Services'}</h2>
              <p className="text-sm text-v-text-secondary">Drag to reorder or drop onto packages</p>
            </div>
            <div className="flex gap-2">
              {services.length === 0 && (
                <button onClick={importDefaults} disabled={saving} className="px-3 py-1.5 text-sm border border-blue-500 text-blue-600 rounded hover:bg-blue-900/20">
                  Import Defaults
                </button>
              )}
              <button onClick={() => setShowServiceModal(true)} className="px-3 py-1.5 text-sm bg-v-gold text-white rounded hover:bg-v-gold-dim">
                + Add
              </button>
            </div>
          </div>
          <div className="p-4">
            {services.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <p className="text-v-text-secondary mb-2">No services yet</p>
                <button onClick={importDefaults} className="text-v-gold hover:underline">Import suggested services</button>
              </div>
            ) : (
              <DndContext sensors={svcSensors} collisionDetection={closestCenter} onDragEnd={handleServiceDragEnd}>
                <SortableContext items={services.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1">
                    {services.map((svc) => (
                      <Fragment key={svc.id}>
                        <SortableServiceRow
                          id={svc.id}
                          svc={svc}
                          handleDragStart={handleDragStart}
                          handleDragEnd={handleDragEnd}
                          left={
                            <div>
                              <p className="font-medium flex items-center gap-1.5">
                                {svc.name}
                                {(() => {
                                  const cal = (calibrations || []).find(c => c.service_id === svc.id);
                                  if (!cal || !isCrossFamily(svc.hours_field, cal.reference_service_type, services)) return null;
                                  return (
                                    <span
                                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                      title="Calibration reference is outside this service's bucket — open Calibrate to re-point it"
                                    >
                                      &#9888; ref outside bucket
                                    </span>
                                  );
                                })()}
                                {serviceAccuracy[svc.name] && serviceAccuracy[svc.name].sample_size >= 3 && (() => {
                                  const acc = serviceAccuracy[svc.name];
                                  const v = acc.avg_variance_pct;
                                  const color = v < 10 ? 'bg-green-500' : v <= 25 ? 'bg-amber-500' : 'bg-red-500';
                                  const tip = v < 10
                                    ? `Well calibrated — ${v.toFixed(0)}% avg variance over ${acc.sample_size} jobs`
                                    : v <= 25
                                    ? `Consider calibrating — ${v.toFixed(0)}% avg variance`
                                    : `Needs calibration — ${v.toFixed(0)}% avg variance over ${acc.sample_size} jobs`;
                                  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} title={tip} />;
                                })()}
                              </p>
                              {svc.description && <p className="text-xs text-v-text-secondary">{svc.description}</p>}
                              <p className="text-[10px] text-v-text-secondary">
                                {CATEGORY_OPTIONS[svc.category] || 'Other'}
                                {getServiceLinkCount(svc.id) > 0 && (
                                  <span className="ml-2 px-1.5 py-0.5 bg-blue-900/30 text-blue-400 rounded text-[9px] font-medium">
                                    {getServiceLinkCount(svc.id)} linked
                                  </span>
                                )}
                              </p>
                            </div>
                          }
                          right={
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <span className="text-lg font-bold text-v-gold">${svc.hourly_rate || 0}</span>
                                <span className="text-xs text-v-text-secondary">/hr</span>
                                {parseFloat(svc.product_cost_per_hour) > 0 && (
                                  <p className="text-[10px] text-v-text-secondary">${svc.product_cost_per_hour} product/hr</p>
                                )}
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); setCalibratingService({ id: svc.id, name: svc.name, hours_field: svc.hours_field }); }}
                                title="Calibrate Hours"
                                className="px-2 py-1 text-[10px] font-medium text-v-text-secondary border border-v-border rounded hover:text-v-gold hover:border-v-gold/50 hover:bg-v-gold/10"
                              >
                                &#9881; Calibrate
                              </button>
                              <button onClick={() => openEditService(svc)} className="p-1.5 text-v-text-secondary hover:text-blue-600 hover:bg-blue-900/20 rounded">&#9998;</button>
                              <button onClick={() => deleteService(svc)} className="p-1.5 text-v-text-secondary hover:text-red-600 hover:bg-red-900/20 rounded">&#128465;</button>
                            </div>
                          }
                        />
                        {serviceSuggestions[svc.id] && (
                          <div
                            className="ml-8 mr-3 p-3 bg-v-gold/5 border border-v-gold/20 rounded-lg flex items-start gap-3 cursor-pointer hover:bg-v-gold/10 transition-colors"
                            onClick={() => setCalibratingService({ id: svc.id, name: svc.name, hours_field: svc.hours_field })}
                          >
                            <span className="text-v-gold text-sm mt-0.5">&#10022;</span>
                            <div className="flex-1 text-sm text-v-text-secondary">
                              {serviceSuggestions[svc.id].type === 'no_match' ? (
                                <p><span className="text-v-gold font-medium">Tip:</span> This service doesn&apos;t match our aircraft hours database. Click to calibrate hours based on a similar standard service.</p>
                              ) : (
                                <div>
                                  <p><span className="text-v-gold font-medium">We found a possible match:</span> this service looks similar to &ldquo;{serviceSuggestions[svc.id].match.label}&rdquo;. Link it to use aircraft-based hour estimates?</p>
                                  <div className="flex gap-2 mt-2">
                                    <button onClick={(e) => { e.stopPropagation(); linkServiceToHours(svc.id, serviceSuggestions[svc.id].match.column); }} className="px-3 py-1 text-xs bg-v-gold text-v-charcoal rounded font-medium hover:bg-v-gold-dim">Yes, link it</button>
                                    <button onClick={(e) => { e.stopPropagation(); dismissSuggestion(svc.id); }} className="px-3 py-1 text-xs text-v-text-secondary border border-v-border rounded hover:bg-white/5">No thanks</button>
                                  </div>
                                </div>
                              )}
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); dismissSuggestion(svc.id); }} className="text-v-text-secondary hover:text-v-text-primary text-sm shrink-0">&times;</button>
                          </div>
                        )}
                      </Fragment>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        {/* Right: Packages */}
        <div className="bg-v-surface rounded-lg shadow-lg overflow-hidden"
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
          onDrop={handleDropOnArea}>
          <div className="p-4 border-b flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold">Packages</h2>
              <p className="text-sm text-v-text-secondary">
                {draggedService ? 'Drop service here!' : 'Bundle services with a discount'}
              </p>
            </div>
            <button
              onClick={() => { setNewPackage({ name: '', description: '', discount_percent: '', service_ids: [] }); setShowPackageBuilder(true); }}
              disabled={services.length === 0}
              className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
              + Create
            </button>
          </div>
          <div className="p-4">
            {/* Package Builder */}
            {showPackageBuilder && (
              <div className="mb-4 p-4 border-2 border-dashed border-green-400 rounded-lg bg-green-900/20">
                <h3 className="font-medium mb-3">{'Create'} Package</h3>
                <input type="text" placeholder="Package name (e.g., Quick Turn)" value={newPackage.name}
                  onChange={(e) => setNewPackage({ ...newPackage, name: e.target.value })} className="w-full border rounded px-3 py-2 mb-3" />
                {/* Drop Zone */}
                <div onDragOver={handleDragOverNew} onDragLeave={handleDragLeaveNew}
                  onDrop={(e) => { e.stopPropagation(); handleDropNew(e); }}
                  className={`min-h-[100px] border-2 border-dashed rounded-lg p-3 mb-3 transition-colors ${dragOver === 'new' ? 'border-v-gold bg-v-gold/10 scale-[1.02]' : 'border-v-border'}`}>
                  {newPackage.service_ids.length === 0 ? (
                    <p className="text-center text-v-text-secondary py-6">Drag services here</p>
                  ) : (
                    <div className="space-y-2">
                      {newPackage.service_ids.map(id => {
                        const svc = getServiceById(id);
                        return svc ? (
                          <div key={id} className="flex justify-between items-center bg-v-surface p-2 rounded border">
                            <span>{svc.name} <span className="text-xs text-v-text-secondary">(${svc.hourly_rate}/hr)</span></span>
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
                    <span className="absolute right-3 top-2 text-v-text-secondary">%</span>
                    <span className="text-[10px] text-v-text-secondary mt-0.5 block text-center">discount</span>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowPackageBuilder(false)} className="px-4 py-2 border rounded">{'Cancel'}</button>
                  <button onClick={addPackage} disabled={saving || !newPackage.name || newPackage.service_ids.length === 0}
                    className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50">{'Save'}</button>
                </div>
              </div>
            )}

            {/* Existing Packages — @dnd-kit sortable */}
            {packages.length === 0 && !showPackageBuilder ? (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <p className="text-v-text-secondary mb-2">No packages yet</p>
                <p className="text-sm text-v-text-secondary">Create a package to bundle services</p>
              </div>
            ) : (
              <PackageSortableList
                packages={packages}
                setPackages={setPackages}
                getToken={getToken}
                getServiceById={getServiceById}
                setEditingPackage={setEditingPackage}
                deletePackage={deletePackage}
                dragOver={dragOver}
                draggedService={draggedService}
                handleDragOverPkg={handleDragOverPkg}
                handleDragLeavePkg={handleDragLeavePkg}
                handleDropOnPackage={handleDropOnPackage}
              />
            )}
          </div>
        </div>
      </div>

      {/* Add-on Fees Section */}
      <div className="bg-v-surface rounded-lg shadow-lg overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold">{'Add-on Fees'}</h2>
            <p className="text-sm text-v-text-secondary">Flat or percentage surcharges added on top of service pricing (hazmat, after-hours, rush, etc.)</p>
          </div>
          <div className="flex gap-2">
            {addonFees.length === 0 && (
              <button onClick={importDefaultAddons} disabled={saving} className="px-3 py-1.5 text-sm border border-blue-500 text-blue-600 rounded hover:bg-blue-900/20">
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
              <p className="text-v-text-secondary mb-2">No add-on fees yet</p>
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
                      {fee.description && <p className="text-xs text-v-text-secondary mt-1">{fee.description}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setEditingAddon({ ...fee })} className="p-1 text-v-text-secondary hover:text-blue-600">&#9998;</button>
                      <button onClick={() => deleteAddonFee(fee)} className="p-1 text-v-text-secondary hover:text-red-600">&#128465;</button>
                    </div>
                  </div>
                  <div className="mt-2">
                    {fee.is_compound ? (
                      <>
                        <span className="text-xl font-bold text-orange-600">{currencySymbol()}{computeAddonTotal(fee.sub_items || [], { staffCount: 1, jobDays: 1 }).toFixed(2)}</span>
                        <span className="text-xs text-v-text-secondary ml-2">compound · {(fee.sub_items || []).length} item{(fee.sub_items || []).length !== 1 ? 's' : ''}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-xl font-bold text-orange-600">
                          {fee.fee_type === 'percent' ? `${fee.amount}%` : `${currencySymbol()}${fee.amount}`}
                        </span>
                        <span className="text-xs text-v-text-secondary ml-2">{feeTypeMeta(fee.fee_type).unitLabel}</span>
                        {((fee.buffer_before || 0) + (fee.buffer_after || 0)) > 0 && (
                          <p className="text-[11px] text-v-text-secondary mt-1">+{(fee.buffer_before || 0) + (fee.buffer_after || 0)} day(s) added to the job</p>
                        )}
                      </>
                    )}
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
          <h3 className="text-lg font-semibold mb-4 text-v-text-primary">Add Service</h3>
          {error && <div className="mb-4 p-3 bg-red-900/20 border border-red-900/40 rounded-lg text-red-400 text-sm">{error}</div>}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">Service Name *</label>
              <input type="text" value={newService.name} onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                placeholder="e.g., Full Interior Detail" className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">Description <span className="font-normal">(shown to customer)</span></label>
              <textarea value={newService.description} onChange={(e) => setNewService({ ...newService, description: e.target.value })}
                placeholder="What's included?" rows={2} className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2 resize-y min-h-[60px]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">Hourly Rate *</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-v-text-secondary">$</span>
                <input type="number" value={newService.hourly_rate} onChange={(e) => setNewService({ ...newService, hourly_rate: e.target.value })}
                  placeholder="120" className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg pl-7 pr-12 py-2" />
                <span className="absolute right-3 top-2.5 text-v-text-secondary">/hr</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">Category</label>
              <select value={newService.category || 'other'}
                onChange={(e) => setNewService({ ...newService, category: e.target.value })}
                className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2">
                {Object.entries(CATEGORY_OPTIONS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">Minimum Price</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-v-text-secondary">$</span>
                <input type="number" step="0.01" value={newService.minimum_price}
                  onChange={(e) => setNewService({ ...newService, minimum_price: e.target.value })}
                  placeholder="0.00" className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg pl-7 pr-3 py-2" />
              </div>
              <p className="text-xs text-v-text-secondary mt-1">Optional floor. Line item price will be at least this amount.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowServiceModal(false)} className="px-4 py-2 border border-v-border text-v-text-secondary rounded-lg hover:bg-white/5">Cancel</button>
            <button onClick={addService} disabled={saving || !newService.name || !newService.hourly_rate}
              className="px-4 py-2 bg-v-gold text-v-charcoal rounded-lg disabled:opacity-50 font-medium">Save</button>
          </div>
        </Modal>
      )}

      {/* Edit Service Modal */}
      {editingService && (
        <Modal onClose={() => { setEditingService(null); setLinkedProducts([]); setLinkedEquipment([]); setAiEstimate(null); setError(''); }}>
          <h3 className="text-lg font-semibold mb-4 text-v-text-primary">Edit {editingService.name || 'Service'}</h3>
          {error && <div className="mb-4 p-3 bg-red-900/20 border border-red-900/40 rounded-lg text-red-400 text-sm">{error}</div>}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">Service Name</label>
              <input type="text" value={editingService.name} onChange={(e) => setEditingService({ ...editingService, name: e.target.value })}
                className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">Description <span className="font-normal">(shown to customer)</span></label>
              <textarea value={editingService.description || ''} onChange={(e) => setEditingService({ ...editingService, description: e.target.value })}
                rows={2} className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2 resize-y min-h-[60px]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">Hourly Rate</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-v-text-secondary">$</span>
                <input type="number" value={editingService.hourly_rate || ''} onChange={(e) => setEditingService({ ...editingService, hourly_rate: e.target.value })}
                  className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg pl-7 pr-12 py-2" />
                <span className="absolute right-3 top-2.5 text-v-text-secondary">/hr</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">Category</label>
              <select value={editingService.category || 'other'}
                onChange={(e) => setEditingService({ ...editingService, category: e.target.value })}
                className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2">
                {Object.entries(CATEGORY_OPTIONS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">Aircraft Hours Column</label>
              <select value={editingService.hours_field || ''}
                onChange={(e) => setEditingService({ ...editingService, hours_field: e.target.value || null })}
                className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2">
                <option value="">None (manual hours only)</option>
                {AIRCRAFT_HOURS_MAP.map(m => (
                  <option key={m.column} value={m.column}>{m.label}</option>
                ))}
              </select>
              <p className="text-xs text-v-text-secondary mt-1">Link to aircraft database for automatic hour estimates</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">Minimum Price</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-v-text-secondary">$</span>
                <input type="number" step="0.01"
                  value={editingService.minimum_price == null ? '' : editingService.minimum_price}
                  onChange={(e) => setEditingService({ ...editingService, minimum_price: e.target.value })}
                  placeholder="0.00" className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg pl-7 pr-3 py-2" />
              </div>
              <p className="text-xs text-v-text-secondary mt-1">Optional floor. Line item price will be at least this amount.</p>
            </div>
            {/* Level 1 SOP — default procedure link + summary. Internal only;
                never rendered on customer-facing surfaces. Aircraft-specific
                overrides (Level 2) live on the aircraft detail page. */}
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-v-text-secondary mb-3">Service SOP <span className="text-xs text-v-text-secondary font-normal">(internal only — default procedure)</span></p>
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">SOP URL <span className="text-xs text-v-text-secondary font-normal">(or upload a PDF below)</span></label>
                <input
                  type="url"
                  value={editingService.sop_url || ''}
                  onChange={(e) => setEditingService({ ...editingService, sop_url: e.target.value })}
                  placeholder="https://docs.google.com/document/d/…"
                  className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2"
                />
                <p className="text-xs text-v-text-secondary mt-1">Link to the procedure document. Shown to crew on job detail + in briefing emails.</p>
              </div>
              {/* PDF upload alongside the URL field. Either field is valid;
                  read surfaces prefer the uploaded file when both are set
                  (file → signed URL → opens without login from email). */}
              <div className="mt-3">
                <label className="block text-sm font-medium text-v-text-secondary mb-1">SOP PDF</label>
                {editingService.sop_file_path ? (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-v-charcoal border border-v-border rounded-lg">
                    <span className="text-sm text-v-text-primary truncate">
                      📄 {editingService.sop_file_name || 'Uploaded SOP'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingService({ ...editingService, sop_file_path: null, sop_file_name: null })}
                      className="text-xs text-red-400 hover:text-red-300 shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.type !== 'application/pdf') { alert('Only PDF files accepted.'); return; }
                      const token = getToken();
                      const fd = new FormData();
                      fd.append('file', f);
                      fd.append('scope', 'service');
                      fd.append('scope_id', editingService.id);
                      try {
                        const res = await fetch('/api/sop-upload', {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}` },
                          body: fd,
                        });
                        if (!res.ok) {
                          const err = await res.json().catch(() => ({}));
                          alert(err.error || `Upload failed (HTTP ${res.status})`);
                          return;
                        }
                        const out = await res.json();
                        setEditingService({
                          ...editingService,
                          sop_file_path: out.sop_file_path,
                          sop_file_name: out.sop_file_name,
                        });
                      } catch (err) {
                        alert(`Upload failed: ${err.message || err}`);
                      } finally {
                        // Reset input so re-selecting the same file fires onChange again
                        e.target.value = '';
                      }
                    }}
                    className="block w-full text-sm text-v-text-primary file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-v-gold/10 file:text-v-gold hover:file:bg-v-gold/20"
                  />
                )}
                <p className="text-xs text-v-text-secondary mt-1">Stored in a private bucket. Email links sign for 7-day access; in-app links for 1 hour.</p>
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium text-v-text-secondary mb-1">SOP Summary</label>
                <textarea
                  rows={2}
                  value={editingService.sop_summary || ''}
                  onChange={(e) => setEditingService({ ...editingService, sop_summary: e.target.value })}
                  placeholder="One-line callout shown next to the link (optional)"
                  className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-v-text-secondary mb-3">Product Cost Tracking <span className="text-xs text-v-text-secondary font-normal">(internal only)</span></p>
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">Product Cost / Hour</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-v-text-secondary">$</span>
                  <input type="number" step="0.01" value={editingService.product_cost_per_hour || ''} onChange={(e) => setEditingService({ ...editingService, product_cost_per_hour: e.target.value })}
                    placeholder="0.00" className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg pl-7 pr-12 py-2" />
                  <span className="absolute right-3 top-2.5 text-v-text-secondary">/hr</span>
                </div>
                <p className="text-xs text-v-text-secondary mt-1">Average product/material cost per hour of this service</p>
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium text-v-text-secondary mb-1">Product Notes</label>
                <textarea value={editingService.product_notes || ''} onChange={(e) => setEditingService({ ...editingService, product_notes: e.target.value })}
                  placeholder="e.g., 1oz IronX, 2oz ceramic per hour" rows={2} className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2 resize-y min-h-[40px]" />
              </div>
            </div>

            {/* Linked Products Section */}
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-v-text-secondary mb-1">Products Needed</p>
              <p className="text-xs text-v-text-secondary mb-3">Link inventory products to auto-populate on quotes and jobs</p>
              {linkLoading ? (
                <p className="text-xs text-v-text-secondary py-2">Loading links...</p>
              ) : (
                <>
                  {linkedProducts.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {linkedProducts.map(link => (
                        <div key={link.id} className="flex items-center gap-2 p-2 bg-blue-900/20 rounded-lg border border-blue-900/40">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-v-text-primary truncate">{link.products?.name}</p>
                            <p className="text-[10px] text-v-text-secondary">{link.products?.category} &middot; {currencySymbol()}{link.products?.cost_per_unit}/{link.products?.unit}</p>
                          </div>
                          <div className="flex flex-col items-end gap-0.5">
                            <input
                              type="number"
                              step="0.01"
                              value={link.quantity_per_job ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setLinkedProducts(prev => prev.map(l => l.id === link.id ? { ...l, quantity_per_job: val } : l));
                              }}
                              onBlur={(e) => updateProductLink(link.id, { quantity_per_job: parseFloat(e.target.value) || 0 })}
                              className="w-20 border border-v-border bg-v-charcoal text-v-text-primary rounded px-1.5 py-1 text-xs text-right"
                              title="Flat amount used every job, regardless of aircraft size (optional)."
                              placeholder="0"
                              aria-label="Quantity per job"
                            />
                            <span className="text-[10px] text-v-text-secondary">{link.products?.unit || 'units'} / job</span>
                          </div>
                          <div className="flex flex-col items-end gap-0.5">
                            <input
                              type="number"
                              step="0.0001"
                              value={link.quantity_per_sqft ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setLinkedProducts(prev => prev.map(l => l.id === link.id ? { ...l, quantity_per_sqft: val } : l));
                              }}
                              onBlur={(e) => updateProductLink(link.id, { quantity_per_sqft: parseFloat(e.target.value) || 0 })}
                              className="w-20 border border-v-border bg-v-charcoal text-v-text-primary rounded px-1.5 py-1 text-xs text-right"
                              title="Amount that scales with the aircraft's exterior surface area (per sq ft)."
                              placeholder="0"
                              aria-label="Quantity per square foot"
                            />
                            <span className="text-[10px] text-v-text-secondary">{link.products?.unit || 'units'} / ft&sup2;</span>
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
                      className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">+ Link a product...</option>
                      {allProducts.filter(p => !linkedProducts.some(l => l.product_id === p.id)).map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.current_quantity} {p.unit})</option>
                      ))}
                    </select>
                  ) : (
                    <a href="/products" className="text-xs text-v-gold hover:underline">Add products to inventory first</a>
                  )}
                </>
              )}
            </div>

            {/* Linked Equipment Section */}
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-v-text-secondary mb-1">Tools / Equipment Needed</p>
              <p className="text-xs text-v-text-secondary mb-3">Link tools your crew needs for this service</p>
              {linkLoading ? (
                <p className="text-xs text-v-text-secondary py-2">Loading links...</p>
              ) : (
                <>
                  {linkedEquipment.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {linkedEquipment.map(link => (
                        <div key={link.id} className="flex items-center gap-2 p-2 bg-purple-900/20 rounded-lg border border-purple-900/40">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-v-text-primary truncate">{link.equipment?.name}</p>
                            <p className="text-[10px] text-v-text-secondary">{link.equipment?.brand} {link.equipment?.model}</p>
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
                      className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">+ Link equipment...</option>
                      {allEquipment.filter(eq => !linkedEquipment.some(l => l.equipment_id === eq.id)).map(eq => (
                        <option key={eq.id} value={eq.id}>{eq.name}{eq.brand ? ` (${eq.brand})` : ''}</option>
                      ))}
                    </select>
                  ) : (
                    <a href="/equipment" className="text-xs text-v-gold hover:underline">Add equipment first</a>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => { setEditingService(null); setLinkedProducts([]); setLinkedEquipment([]); }} className="px-4 py-2 border border-v-border text-v-text-secondary rounded-lg hover:bg-white/5">Cancel</button>
            <button onClick={updateService} disabled={saving} className="px-4 py-2 bg-v-gold text-v-charcoal rounded-lg disabled:opacity-50 font-medium">Save</button>
          </div>
        </Modal>
      )}

      {/* Edit Package Modal */}
      {editingPackage && (
        <Modal onClose={() => setEditingPackage(null)}>
          <h3 className="text-lg font-semibold mb-4">{'Edit'} Package</h3>
          <div className="space-y-4">
            <input type="text" placeholder="Package name" value={editingPackage.name}
              onChange={(e) => setEditingPackage({ ...editingPackage, name: e.target.value })} className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2" />
            <textarea placeholder="Description" value={editingPackage.description || ''}
              onChange={(e) => setEditingPackage({ ...editingPackage, description: e.target.value })}
              rows={2} className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2 resize-y min-h-[60px]" />
            <div>
              <p className="text-sm font-medium mb-2">Services <span className="text-v-text-secondary font-normal">(drag ≡ to reorder)</span>:</p>
              <div className="space-y-1 mb-2">
                {(editingPackage.service_ids || []).map((id, svcIdx) => {
                  const svc = getServiceById(id);
                  return svc ? (
                    <div key={id}
                      draggable
                      onDragStart={(e) => handlePkgSvcDragStart(e, svcIdx)}
                      onDragOver={(e) => handlePkgSvcDragOver(e, svcIdx)}
                      onDrop={(e) => handlePkgSvcDrop(e, svcIdx)}
                      onDragEnd={() => { setPkgSvcDragIdx(null); setPkgSvcOverIdx(null); }}
                      className={`flex items-center justify-between bg-v-charcoal p-2 rounded cursor-grab transition-all ${
                        pkgSvcDragIdx === svcIdx ? 'opacity-40 scale-[0.98]'
                        : pkgSvcOverIdx === svcIdx && pkgSvcDragIdx !== null ? 'ring-1 ring-v-gold scale-[1.01]'
                        : ''
                      }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 select-none text-sm">&#9776;</span>
                        <span>{svc.name} <span className="text-xs text-v-text-secondary">(${svc.hourly_rate}/hr)</span></span>
                      </div>
                      <button onClick={() => setEditingPackage({ ...editingPackage, service_ids: editingPackage.service_ids.filter(sid => sid !== id) })}
                        className="text-red-500 hover:text-red-400 px-1">&times;</button>
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
              }} className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2">
                <option value="">+ Add service...</option>
                {services.filter(s => !(editingPackage.service_ids || []).includes(s.id)).map(svc => (
                  <option key={svc.id} value={svc.id}>{svc.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">Bundle Discount %</label>
              <div className="relative">
                <input type="number" placeholder="0" min="0" max="100" value={editingPackage.discount_percent || ''}
                  onChange={(e) => setEditingPackage({ ...editingPackage, discount_percent: e.target.value })}
                  className="w-full border rounded-lg pr-8 px-3 py-2" />
                <span className="absolute right-3 top-2.5 text-v-text-secondary">%</span>
              </div>
              <p className="text-xs text-v-text-secondary mt-1">Package price = sum of service rates x aircraft hours, minus this discount</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setEditingPackage(null)} className="px-4 py-2 border border-v-border text-v-text-secondary rounded-lg hover:bg-white/5">{'Cancel'}</button>
            <button onClick={updatePackage} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50">{'Save'}</button>
          </div>
        </Modal>
      )}

      {/* Add Addon Fee Modal */}
      {showAddonModal && (
        <Modal onClose={() => { setShowAddonModal(false); setError(''); }}>
          <h3 className="text-lg font-semibold mb-4">{'Add'}</h3>
          {error && <div className="mb-4 p-3 bg-red-900/20 border border-red-900/40 rounded-lg text-red-400 text-sm">{error}</div>}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Name'} *</label>
              <input type="text" value={newAddon.name} onChange={(e) => setNewAddon({ ...newAddon, name: e.target.value })}
                placeholder="e.g., After Hours" className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Description'}</label>
              <input type="text" value={newAddon.description} onChange={(e) => setNewAddon({ ...newAddon, description: e.target.value })}
                placeholder="Optional description" className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2" />
            </div>
            <AddonFeeFields fee={newAddon} set={(p) => setNewAddon({ ...newAddon, ...p })} />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowAddonModal(false)} className="px-4 py-2 border border-v-border text-v-text-secondary rounded-lg hover:bg-white/5">{'Cancel'}</button>
            <button onClick={addAddonFee} disabled={saving || !newAddon.name}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg disabled:opacity-50">{'Add'}</button>
          </div>
        </Modal>
      )}

      {/* Edit Addon Fee Modal */}
      {editingAddon && (
        <Modal onClose={() => { setEditingAddon(null); setError(''); }}>
          <h3 className="text-lg font-semibold mb-4">{'Edit'}</h3>
          {error && <div className="mb-4 p-3 bg-red-900/20 border border-red-900/40 rounded-lg text-red-400 text-sm">{error}</div>}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Name'}</label>
              <input type="text" value={editingAddon.name} onChange={(e) => setEditingAddon({ ...editingAddon, name: e.target.value })}
                className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Description'}</label>
              <input type="text" value={editingAddon.description || ''} onChange={(e) => setEditingAddon({ ...editingAddon, description: e.target.value })}
                className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2" />
            </div>
            <AddonFeeFields fee={editingAddon} set={(p) => setEditingAddon({ ...editingAddon, ...p })} />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setEditingAddon(null)} className="px-4 py-2 border border-v-border text-v-text-secondary rounded-lg hover:bg-white/5">{'Cancel'}</button>
            <button onClick={updateAddonFee} disabled={saving} className="px-4 py-2 bg-orange-500 text-white rounded-lg disabled:opacity-50">{'Save'}</button>
          </div>
        </Modal>
      )}

      <CalibrationModal
        isOpen={!!calibratingService}
        onClose={() => { setCalibratingService(null); fetchData(); }}
        service={calibratingService}
        detailerServices={services}
        calibrations={calibrations}
      />
    </div>
  );
}

// Shared fee-type + rate + buffer inputs for the add/edit add-on fee modals.
// `fee` is the working fee object; `set(partial)` merges changes into it.
function AddonFeeFields({ fee, set }) {
  const type = fee.fee_type || 'flat';
  const meta = feeTypeMeta(type);
  const compound = !!fee.is_compound;
  const subItems = Array.isArray(fee.sub_items) ? fee.sub_items : [];
  const setSub = (id, patch) => set({ sub_items: subItems.map(s => s.id === id ? { ...s, ...patch } : s) });
  const removeSub = (id) => set({ sub_items: subItems.filter(s => s.id !== id) });
  const addSub = (preset) => set({ sub_items: [...subItems, {
    id: crypto.randomUUID(), name: preset?.name || '', fee_type: preset?.fee_type || 'flat', amount: preset?.amount ?? 0, note: '',
  }] });
  const baseTotal = computeAddonTotal(subItems, { staffCount: 1, jobDays: 1 });

  return (
    <>
      <label className="flex items-center justify-between gap-2 py-1 cursor-pointer">
        <span className="text-sm font-medium text-v-text-secondary">Compound fee (bundle of sub-items)</span>
        <input type="checkbox" checked={compound} onChange={(e) => set({ is_compound: e.target.checked })} className="w-4 h-4 accent-orange-500" />
      </label>

      {compound ? (
        <div>
          <label className="block text-sm font-medium text-v-text-secondary mb-1">Sub-items</label>
          <div className="space-y-2">
            {subItems.length === 0 && <p className="text-[11px] text-v-text-secondary">No sub-items yet — add from the palette below.</p>}
            {subItems.map(si => (
              <div key={si.id} className="bg-v-charcoal border border-v-border rounded-lg p-2">
                <div className="flex items-center gap-2 mb-2">
                  <input type="text" value={si.name} onChange={(e) => setSub(si.id, { name: e.target.value })} placeholder="Sub-item name"
                    className="flex-1 bg-v-surface border border-v-border text-v-text-primary rounded px-2 py-1 text-xs" />
                  <button type="button" onClick={() => removeSub(si.id)} className="text-red-400 hover:text-red-300 text-lg leading-none">&times;</button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={si.fee_type} onChange={(e) => setSub(si.id, { fee_type: e.target.value })} className="bg-v-surface border border-v-border text-v-text-primary px-2 py-1 text-xs rounded">
                    {SUB_ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-v-text-secondary">{si.fee_type === PERCENT ? '%' : currencySymbol()}</span>
                    <input type="number" value={si.amount ?? ''} onChange={(e) => setSub(si.id, { amount: e.target.value })}
                      className="w-20 bg-v-surface border border-v-border text-v-text-primary px-2 py-1 text-xs text-right rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {SUB_ITEM_PRESETS.map(p => (
              <button key={p.name} type="button" onClick={() => addSub(p)} className="text-[11px] text-orange-600 border border-orange-300 rounded px-2 py-0.5 hover:bg-orange-500/10">+ {p.name}</button>
            ))}
          </div>
          <p className="text-[11px] text-v-text-secondary mt-2">Base total (1 staff, 1 day): {currencySymbol()}{baseTotal.toFixed(2)} — per-staff / per-day items scale on each quote.</p>
        </div>
      ) : (
      <>
      <div>
        <label className="block text-sm font-medium text-v-text-secondary mb-1">Fee Type</label>
        <div className="grid grid-cols-2 gap-2">
          {FEE_TYPES.map(t => (
            <button key={t.value} type="button" onClick={() => set({ fee_type: t.value })}
              className={`py-2 px-2 rounded-lg text-xs font-medium border transition-colors ${
                type === t.value ? 'bg-orange-500 text-white border-orange-500' : 'bg-v-surface text-v-text-secondary border-v-border hover:bg-white/5'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-v-text-secondary mb-1">{type === PERCENT ? 'Percentage' : 'Rate'} *</label>
        <div className="relative">
          {type !== PERCENT && <span className="absolute left-3 top-2.5 text-v-text-secondary">{currencySymbol()}</span>}
          <input type="number" value={fee.amount ?? ''} onChange={(e) => set({ amount: e.target.value })}
            placeholder={type === PERCENT ? '25' : '150'}
            className={`w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg py-2 ${type === PERCENT ? 'pl-3 pr-8' : 'pl-7 pr-3'}`} />
          {type === PERCENT && <span className="absolute right-3 top-2.5 text-v-text-secondary">%</span>}
        </div>
        <p className="text-[11px] text-v-text-secondary mt-1">{ADDON_RATE_HELP[type]}</p>
      </div>
      {meta.usesBuffer && (
        <div>
          <label className="block text-sm font-medium text-v-text-secondary mb-1">Extra days added to the job</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <input type="number" min="0" value={fee.buffer_before ?? 0} onChange={(e) => set({ buffer_before: e.target.value })}
                className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2" />
              <p className="text-[11px] text-v-text-secondary mt-1">Days before (arrival)</p>
            </div>
            <div>
              <input type="number" min="0" value={fee.buffer_after ?? 0} onChange={(e) => set({ buffer_after: e.target.value })}
                className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded-lg px-3 py-2" />
              <p className="text-[11px] text-v-text-secondary mt-1">Days after (job complete)</p>
            </div>
          </div>
          <p className="text-[11px] text-v-text-secondary mt-1">Billed nights/days = job days + before + after.</p>
        </div>
      )}
      </>
      )}
    </>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-v-surface rounded-t-2xl sm:rounded-lg p-5 sm:p-6 w-full sm:max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
