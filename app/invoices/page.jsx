"use client";
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { formatPrice, currencySymbol } from '@/lib/formatPrice';

const statusColors = {
  draft: 'bg-white/10 text-white/60',
  sent: 'bg-blue-900/30 text-blue-400',
  viewed: 'bg-purple-900/30 text-purple-400',
  paid: 'bg-green-900/30 text-green-400',
  overdue: 'bg-red-900/30 text-red-400',
};

const statusLabels = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  paid: 'Paid',
  overdue: 'Overdue',
};

const CATEGORY_ORDER = ['exterior', 'interior', 'paint_correction', 'coating', 'brightwork', 'other'];
const CATEGORY_LABELS = {
  exterior: 'Exterior', interior: 'Interior', paint_correction: 'Paint Correction',
  coating: 'Coatings & Protection', brightwork: 'Brightwork', other: 'Other',
};

export default function InvoicesPageWrapper() {
  return <Suspense fallback={<div className="min-h-screen bg-v-charcoal" />}><InvoicesPageInner /></Suspense>;
}

function InvoicesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [viewInvoice, setViewInvoice] = useState(null);
  const [markPaidModal, setMarkPaidModal] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [actionLoading, setActionLoading] = useState(false);
  const [createModal, setCreateModal] = useState(false); // false | 'choose' | 'from_job' | 'blank'
  const [allJobs, setAllJobs] = useState([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
  const [error, setError] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  // Blank invoice form state
  const [blankForm, setBlankForm] = useState({
    customer_name: '', customer_email: '', aircraft_model: '', tail_number: '',
    line_items: [{ description: '', quantity: 1, rate: 0 }],
    net_terms: 30, notes: '',
  });
  const [customers, setCustomers] = useState([]);

  // Edit invoice state
  const [editInvoice, setEditInvoice] = useState(null); // full invoice being edited
  const [editForm, setEditForm] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSavedFlash, setEditSavedFlash] = useState(false);
  const [editServices, setEditServices] = useState([]);
  const [editModels, setEditModels] = useState([]);
  const [editAircraftHoursRef, setEditAircraftHoursRef] = useState(null);
  const [editSelectedServices, setEditSelectedServices] = useState([]);
  const [editHourOverrides, setEditHourOverrides] = useState({});
  const [editCustomLines, setEditCustomLines] = useState([]);
  const [editDiscount, setEditDiscount] = useState({ type: 'percent', value: '', reason: '' });
  const [detailer, setDetailer] = useState(null); // current detailer's business info for the From block

  const sym = currencySymbol();

  // Display label for an invoice. Falls back to a short UUID prefix when there's
  // no stored invoice number so we never render "Invoice undefined".
  const invoiceLabel = (inv) => {
    if (!inv) return '';
    if (inv.invoice_number) return inv.invoice_number;
    const idStr = (inv.id || '').toString();
    return idStr ? `#${idStr.slice(0, 8).toUpperCase()}` : '';
  };

  // Given a pre-discount subtotal and a discount {type, value}, compute the dollar
  // amount that should be subtracted from the invoice total.
  // - percent: subtotal * (value / 100), capped at subtotal
  // - flat:    value, capped at subtotal
  // Returns 0 for invalid/zero discounts.
  const computeDiscountAmount = (subtotal, discount) => {
    const value = parseFloat(discount?.value);
    if (!isFinite(value) || value <= 0 || subtotal <= 0) return 0;
    const raw = discount?.type === 'flat' ? value : subtotal * (value / 100);
    return Math.min(Math.max(raw, 0), subtotal);
  };

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
    try {
      const stored = localStorage.getItem('vector_user');
      const u = stored ? JSON.parse(stored) : {};
      const plan = u.plan || 'free';
      if (plan === 'free' && !u.is_admin) {
        alert('Invoicing is available on Pro and above. Upgrade in Settings.');
        router.push('/quotes');
        return;
      }
    } catch {}
    fetchInvoices(token);
    fetch('/api/user/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.user) setDetailer(d.user); })
      .catch(() => {});
  }, [router]);

  const getToken = () => localStorage.getItem('vector_token');
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` });

  const fetchInvoices = async (token) => {
    setLoading(true);
    try {
      const res = await fetch('/api/invoices', {
        headers: { Authorization: `Bearer ${token || getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices || []);
      }
    } catch (err) {
      console.error('Failed to fetch invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllJobs = async () => {
    try {
      // Fetch from both quotes and jobs tables — all active statuses
      const invoicedIds = new Set(invoices.map(i => i.job_id || i.quote_id).filter(Boolean));
      const invoiceStatusMap = {};
      invoices.forEach(i => { const k = i.job_id || i.quote_id; if (k) invoiceStatusMap[k] = i.status; });

      const jobs = [];
      // Quotes-based jobs
      for (const st of ['paid', 'completed', 'scheduled', 'accepted', 'in_progress']) {
        const res = await fetch(`/api/quotes?status=${st}&limit=100`, { headers: headers() });
        if (res.ok) {
          const data = await res.json();
          (data.quotes || []).forEach(q => jobs.push({
            id: q.id, _source: 'quotes',
            customer_name: q.client_name || q.customer_name,
            aircraft: q.aircraft_model || q.aircraft_type,
            total: q.total_price, status: q.status,
            date: q.created_at, email: q.client_email || q.customer_email,
            invoiced: invoicedIds.has(q.id), invoice_status: invoiceStatusMap[q.id] || null,
          }));
        }
      }
      // Manual jobs
      const jRes = await fetch('/api/jobs?limit=100', { headers: headers() });
      if (jRes.ok) {
        const jData = await jRes.json();
        (jData.jobs || []).forEach(j => jobs.push({
          id: j.id, _source: 'jobs',
          customer_name: j.customer_name,
          aircraft: [j.aircraft_make, j.aircraft_model].filter(Boolean).join(' '),
          total: j.total_price, status: j.status,
          date: j.created_at, email: j.customer_email,
          invoiced: invoicedIds.has(j.id), invoice_status: invoiceStatusMap[j.id] || null,
        }));
      }
      setAllJobs(jobs.sort((a, b) => new Date(b.date) - new Date(a.date)));
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers?limit=100', { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setCustomers((data.customers || []).map(c => ({ name: c.name, email: c.email })));
      }
    } catch {}
  };

  // Match a free-text aircraft_model string (e.g. "Falcon 20") against the models catalog
  // to recover the make needed for aircraft_hours lookups.
  const matchModel = (aircraftModel, models) => {
    if (!aircraftModel || !models?.length) return null;
    const s = aircraftModel.toLowerCase().trim();
    const exact = models.find(m => (m.model || '').toLowerCase().trim() === s);
    if (exact) return { make: exact.manufacturer, model: exact.model };
    const sub = models.find(m => {
      const mm = (m.model || '').toLowerCase().trim();
      return mm && (s.includes(mm) || mm.includes(s));
    });
    if (sub) return { make: sub.manufacturer, model: sub.model };
    return null;
  };

  // Open edit modal for an invoice — fetches latest invoice, services, and aircraft hours.
  // DB line_items canonical shape: { name, hours, rate, price }.
  // Existing line items whose name matches a service row pre-check that service; the rest
  // become editable custom line items.
  const openEdit = async (inv) => {
    setEditError('');
    setEditSavedFlash(false);
    setEditServices([]); setEditModels([]); setEditAircraftHoursRef(null);
    setEditSelectedServices([]); setEditHourOverrides({}); setEditCustomLines([]);
    setEditDiscount({ type: 'percent', value: '', reason: '' });
    try {
      const [invJson, svcJson, mdlJson] = await Promise.all([
        fetch(`/api/invoices/${inv.id}`, { headers: headers() }).then(r => r.json()).catch(() => ({})),
        fetch('/api/services', { headers: headers() }).then(r => r.ok ? r.json() : { services: [] }).catch(() => ({ services: [] })),
        fetch('/api/aircraft/models', { headers: headers() }).then(r => r.ok ? r.json() : { models: [] }).catch(() => ({ models: [] })),
      ]);
      const full = invJson.invoice || inv;
      const services = svcJson.services || svcJson || [];
      const models = mdlJson.models || [];
      setEditServices(services);
      setEditModels(models);

      const aircraftModel = full.aircraft_model || '';
      const lookup = matchModel(aircraftModel, models);
      let hoursRef = null;
      if (lookup?.make && lookup?.model) {
        try {
          const hrRes = await fetch(`/api/aircraft-hours?make=${encodeURIComponent(lookup.make)}&model=${encodeURIComponent(lookup.model)}`, { headers: headers() });
          if (hrRes.ok) hoursRef = (await hrRes.json())?.hours || null;
        } catch {}
      }
      setEditAircraftHoursRef(hoursRef);

      // Map existing line_items → selected services + custom lines (case-insensitive name match).
      const svcByName = new Map();
      services.forEach(s => svcByName.set((s.name || '').toLowerCase().trim(), s));
      const selIds = [];
      const overrides = {};
      const custom = [];
      (full.line_items || []).forEach(li => {
        const rawName = li.name || li.description || li.service || '';
        const key = rawName.toLowerCase().trim();
        const hours = li.hours != null ? parseFloat(li.hours)
          : li.qty != null ? parseFloat(li.qty)
          : li.quantity != null ? parseFloat(li.quantity)
          : 0;
        const svc = svcByName.get(key);
        if (svc) {
          selIds.push(svc.id);
          if (hours) overrides[svc.id] = hours;
        } else if (rawName) {
          custom.push({ name: rawName, hours: hours || '', rate: parseFloat(li.rate) || 0 });
        }
      });
      setEditSelectedServices(selIds);
      setEditHourOverrides(overrides);
      setEditCustomLines(custom);

      setEditDiscount({
        type: full.discount_type === 'flat' ? 'flat' : 'percent',
        value: (parseFloat(full.discount_value) || 0) > 0 ? String(full.discount_value) : '',
        reason: full.discount_reason || '',
      });

      setEditInvoice(full);
      setEditForm({
        customer_name: full.customer_name || '',
        customer_email: full.customer_email || '',
        customer_phone: full.customer_phone || '',
        aircraft_model: aircraftModel,
        tail_number: full.tail_number || '',
        notes: full.notes || '',
        net_terms: full.net_terms || 30,
        due_date: full.due_date ? full.due_date.slice(0, 10) : '',
        status: (full.status === 'paid') ? full.status : (full.status || 'draft'),
      });
    } catch (err) {
      setEditError('Failed to load invoice');
    }
  };

  // Reset all edit-modal state in one place.
  const closeEditModal = () => {
    setEditInvoice(null); setEditForm(null);
    setEditServices([]); setEditModels([]); setEditAircraftHoursRef(null);
    setEditSelectedServices([]); setEditHourOverrides({}); setEditCustomLines([]);
    setEditDiscount({ type: 'percent', value: '', reason: '' });
    setEditError(''); setEditSavedFlash(false);
  };

  // Re-fetch aircraft_hours when the user edits aircraft_model in the modal.
  useEffect(() => {
    if (!editForm) return;
    const mdl = editForm.aircraft_model;
    if (!mdl) { setEditAircraftHoursRef(null); return; }
    const lookup = matchModel(mdl, editModels);
    if (!lookup?.make || !lookup?.model) { setEditAircraftHoursRef(null); return; }
    const ctrl = new AbortController();
    fetch(`/api/aircraft-hours?make=${encodeURIComponent(lookup.make)}&model=${encodeURIComponent(lookup.model)}`, { headers: headers(), signal: ctrl.signal })
      .then(r => r.ok ? r.json() : { hours: null })
      .then(d => setEditAircraftHoursRef(d?.hours || null))
      .catch(() => {});
    return () => ctrl.abort();
  }, [editForm?.aircraft_model, editModels]);

  // Service-row hours helpers — mirror /jobs/new (see commit 642678e).
  const getEditRefHours = (svc) => {
    if (!editAircraftHoursRef) return 0;
    const name = (svc.name || '').toLowerCase();
    if (name.includes('maintenance') || (name.includes('wash') && !name.includes('decon'))) return parseFloat(editAircraftHoursRef.maintenance_wash_hrs) || 0;
    if (name.includes('decon')) return parseFloat(editAircraftHoursRef.decon_paint_hrs) || 0;
    if (name.includes('polish')) return parseFloat(editAircraftHoursRef.one_step_polish_hrs) || 0;
    if (name.includes('spray ceramic') || name.includes('spray coat') || name.includes('topcoat') || name.includes('air guard')) return parseFloat(editAircraftHoursRef.spray_ceramic_hrs) || 0;
    if (name.includes('ceramic')) return parseFloat(editAircraftHoursRef.ceramic_coating_hrs) || 0;
    if (name.includes('wax') || name.includes('static guard')) return parseFloat(editAircraftHoursRef.wax_hrs) || 0;
    if (name.includes('leather')) return parseFloat(editAircraftHoursRef.leather_hrs) || 0;
    if (name.includes('carpet') || name.includes('extract')) return parseFloat(editAircraftHoursRef.carpet_hrs) || 0;
    return 0;
  };
  const getEditDefaultHours = (svc) => {
    const ref = getEditRefHours(svc);
    if (ref > 0) return ref;
    return parseFloat(svc.default_hours) || 0;
  };
  const getEditHours = (svc) => editHourOverrides[svc.id] !== undefined ? editHourOverrides[svc.id] : getEditDefaultHours(svc);
  const getEditRate = (svc) => parseFloat(svc.hourly_rate) || 0;
  const getEditServiceTotal = (svc) => (parseFloat(getEditHours(svc)) || 0) * getEditRate(svc);

  const toggleEditService = (svcId) => {
    setEditSelectedServices(prev => prev.includes(svcId) ? prev.filter(id => id !== svcId) : [...prev, svcId]);
  };

  const saveEdit = async () => {
    if (!editInvoice || !editForm) return;
    setEditSaving(true);
    setEditError('');
    try {
      // Build DB canonical shape { name, hours, rate, price } from the checkbox grid + custom rows.
      const svcLines = editSelectedServices.map(id => {
        const svc = editServices.find(s => s.id === id);
        if (!svc) return null;
        const hours = parseFloat(getEditHours(svc)) || 0;
        const rate = getEditRate(svc);
        return { name: svc.name, hours, rate, price: Math.round(hours * rate * 100) / 100 };
      }).filter(Boolean);
      const customLines = editCustomLines
        .filter(cl => (cl.name || '').trim())
        .map(cl => {
          const hours = parseFloat(cl.hours) || 0;
          const rate = parseFloat(cl.rate) || 0;
          return { name: cl.name, hours, rate, price: Math.round(hours * rate * 100) / 100 };
        });
      const lineItems = [...svcLines, ...customLines];
      const subtotal = lineItems.reduce((s, li) => s + li.price, 0);
      const discountAmount = Math.round(computeDiscountAmount(subtotal, editDiscount) * 100) / 100;
      const total = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);
      const discountValueNum = parseFloat(editDiscount.value);
      const discountValue = isFinite(discountValueNum) && discountValueNum > 0 ? discountValueNum : 0;
      const body = {
        customer_name: editForm.customer_name,
        customer_email: editForm.customer_email,
        customer_phone: editForm.customer_phone,
        aircraft_model: editForm.aircraft_model,
        tail_number: editForm.tail_number,
        line_items: lineItems,
        subtotal,
        total,
        discount_type: editDiscount.type === 'flat' ? 'flat' : 'percent',
        discount_value: discountValue,
        discount_amount: discountAmount,
        discount_reason: (editDiscount.reason || '').trim() || null,
        notes: editForm.notes,
        net_terms: parseInt(editForm.net_terms) || 30,
        status: editForm.status,
      };
      if (editForm.due_date) body.due_date = new Date(editForm.due_date).toISOString();
      const res = await fetch(`/api/invoices/${editInvoice.id}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(data.error || 'Failed to save');
        return;
      }
      const updated = data.invoice || { ...editInvoice, ...body };
      setInvoices(prev => prev.map(inv => inv.id === updated.id ? { ...inv, ...updated } : inv));
      if (viewInvoice?.id === updated.id) setViewInvoice(prev => ({ ...prev, ...updated }));
      setEditInvoice(updated);
      setEditSavedFlash(true);
      setTimeout(() => setEditSavedFlash(false), 2000);
    } catch (err) {
      setEditError(err.message || 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  };

  // Auto-open edit when navigated with ?edit=<id> (from job convert flow)
  useEffect(() => {
    const editId = searchParams?.get('edit');
    if (!editId || invoices.length === 0 || editInvoice) return;
    const inv = invoices.find(i => i.id === editId);
    if (inv) {
      openEdit(inv);
      router.replace('/invoices');
    }
  }, [searchParams, invoices]); // eslint-disable-line react-hooks/exhaustive-deps

  const createInvoiceFromJob = async ({ send = false } = {}) => {
    if (!selectedQuoteId) return;
    setActionLoading(true);
    setError('');
    try {
      const job = allJobs.find(j => j.id === selectedQuoteId);
      const body = job?._source === 'jobs'
        ? { job_id: selectedQuoteId, customer_name: job.customer_name, customer_email: job.email, aircraft_model: job.aircraft, total: job.total, line_items: [{ description: job.aircraft || 'Service', quantity: 1, rate: job.total || 0, price: job.total || 0 }] }
        : { quote_id: selectedQuoteId, customer_name: job?.customer_name, customer_email: job?.email, total: job?.total, line_items: [{ description: job?.aircraft || 'Service', quantity: 1, rate: job?.total || 0, price: job?.total || 0 }] };
      const res = await fetch('/api/invoices', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok || data.invoice) {
        const created = data.invoice;
        if (data.already_exists) {
          setError('Invoice already exists for this job — showing existing.');
        }
        if (send && created?.id) {
          await fetch(`/api/invoices/${created.id}/send`, { method: 'POST', headers: headers() });
        }
        fetchInvoices();
        setCreateModal(false);
        setSelectedQuoteId('');
        if (!send && created?.id) openEdit(created);
      } else {
        setError(data.error || 'Failed to create');
      }
    } catch (err) {
      setError('Failed to create');
    } finally {
      setActionLoading(false);
    }
  };

  const createBlankInvoice = async ({ send = false } = {}) => {
    if (!blankForm.customer_name || !blankForm.customer_email) {
      setError('Customer name and email are required');
      return;
    }
    const items = blankForm.line_items.filter(li => li.description.trim());
    if (items.length === 0) {
      setError('Add at least one line item');
      return;
    }
    setActionLoading(true);
    setError('');
    try {
      const lineItems = items.map(li => ({
        description: li.description,
        quantity: parseFloat(li.quantity) || 1,
        rate: parseFloat(li.rate) || 0,
        price: (parseFloat(li.quantity) || 1) * (parseFloat(li.rate) || 0),
      }));
      const total = lineItems.reduce((s, li) => s + li.price, 0);
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          customer_name: blankForm.customer_name,
          customer_email: blankForm.customer_email,
          aircraft_model: blankForm.aircraft_model || '',
          tail_number: blankForm.tail_number || '',
          line_items: lineItems,
          total,
          net_terms: blankForm.net_terms || 30,
          notes: blankForm.notes || '',
        }),
      });
      const data = await res.json();
      if (res.ok || data.invoice) {
        const created = data.invoice;
        if (send && created?.id) {
          await fetch(`/api/invoices/${created.id}/send`, { method: 'POST', headers: headers() });
        }
        fetchInvoices();
        setCreateModal(false);
        setBlankForm({ customer_name: '', customer_email: '', aircraft_model: '', tail_number: '', line_items: [{ description: '', quantity: 1, rate: 0 }], net_terms: 30, notes: '' });
      } else {
        setError(data.error || 'Failed to create');
      }
    } catch {
      setError('Failed to create invoice');
    } finally {
      setActionLoading(false);
    }
  };

  const addLineItem = () => setBlankForm(f => ({ ...f, line_items: [...f.line_items, { description: '', quantity: 1, rate: 0 }] }));
  const updateLineItem = (i, field, val) => setBlankForm(f => {
    const items = [...f.line_items];
    items[i] = { ...items[i], [field]: val };
    return { ...f, line_items: items };
  });
  const removeLineItem = (i) => setBlankForm(f => ({ ...f, line_items: f.line_items.filter((_, j) => j !== i) }));

  const getDisplayStatus = (inv) => {
    if (inv.status === 'paid') return 'paid';
    if (inv.status === 'draft') return 'draft';
    if ((inv.status === 'sent' || inv.status === 'viewed' || inv.status === 'unpaid') && inv.due_date && new Date(inv.due_date) < new Date()) return 'overdue';
    if (inv.status === 'viewed') return 'viewed';
    if (inv.status === 'sent') return 'sent';
    // Legacy: unpaid maps to sent
    if (inv.status === 'unpaid') return 'sent';
    return inv.status || 'draft';
  };

  const sendInvoice = async (invoice) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: 'POST',
        headers: headers(),
      });
      if (res.ok) {
        setInvoices(invoices.map(inv => inv.id === invoice.id ? { ...inv, status: 'sent', emailed_at: new Date().toISOString() } : inv));
      } else {
        // Fallback to the old email endpoint
        const res2 = await fetch(`/api/invoices/${invoice.id}`, {
          method: 'POST',
          headers: headers(),
        });
        if (res2.ok) {
          setInvoices(invoices.map(inv => inv.id === invoice.id ? { ...inv, status: 'sent', emailed_at: new Date().toISOString() } : inv));
        } else {
          const data = await res2.json();
          alert(data.error || 'Failed to send');
        }
      }
    } catch (err) {
      alert('Failed to send invoice');
    } finally {
      setActionLoading(false);
    }
  };

  const sendReminder = async (invoice) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/remind`, {
        method: 'POST',
        headers: headers(),
      });
      if (res.ok) {
        alert('Reminder sent to ' + invoice.customer_email);
        setInvoices(invoices.map(inv => inv.id === invoice.id ? { ...inv, last_reminder_at: new Date().toISOString() } : inv));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to send reminder');
      }
    } catch (err) {
      alert('Failed to send reminder');
    } finally {
      setActionLoading(false);
    }
  };

  const markAsPaid = async () => {
    if (!markPaidModal) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/invoices/${markPaidModal.id}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ status: 'paid', payment_method: paymentMethod, manual_payment_note: paymentNote || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setInvoices(invoices.map(inv => inv.id === markPaidModal.id ? data.invoice : inv));
        if (viewInvoice?.id === markPaidModal.id) setViewInvoice(data.invoice);
        setMarkPaidModal(null);
      }
    } catch (err) {
      console.error('Failed to mark as paid:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const downloadPDF = (invoice) => {
    const items = invoice.line_items || [];
    const addons = invoice.addon_fees || [];
    const lineRows = items.map(item => {
      const hrs = item.hours != null ? item.hours : (item.quantity != null ? item.quantity : null);
      const rate = parseFloat(item.rate) || 0;
      const price = item.price != null ? parseFloat(item.price)
        : item.amount != null ? parseFloat(item.amount)
        : (parseFloat(hrs) || 0) * rate;
      const label = item.name || item.description || item.service || 'Service';
      return `<tr><td style="padding:8px;border-bottom:1px solid #eee">${label}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${sym}${formatPrice(price)}</td></tr>`;
    }).join('');
    const addonRows = addons.map(a =>
      `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">${a.name || 'Add-on'}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;color:#666">${sym}${formatPrice(a.calculated || a.amount || 0)}</td></tr>`
    ).join('');
    const label = invoiceLabel(invoice);
    const d = detailer || {};
    const logoSrc = d.logo_light_url || d.logo_url || '';
    const fromLogo = logoSrc ? `<img src="${logoSrc}" alt="" style="height:40px;max-width:180px;object-fit:contain;margin-bottom:6px" />` : '';
    const fromName = d.company || d.name || '';
    const html = `<!DOCTYPE html><html><head><title>Invoice ${label}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#333}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:30px}
.inv-num{font-size:28px;font-weight:700;color:#1e3a5f}
.status{display:inline-block;padding:4px 14px;border-radius:9999px;font-size:12px;font-weight:600;color:#fff}
.paid{background:#059669}.unpaid{background:#d97706}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;padding:16px;background:#f9fafb;border-radius:8px}
.label{font-size:11px;color:#9ca3af;text-transform:uppercase;margin-bottom:2px}
.name{font-weight:600;color:#1f2937}
table{width:100%;border-collapse:collapse;margin:16px 0}
th{text-align:left;padding:8px;border-bottom:2px solid #e5e7eb;color:#6b7280;font-size:12px;text-transform:uppercase}
th:last-child{text-align:right}
.total-row{border-top:2px solid #1e3a5f;padding-top:12px;margin-top:12px;display:flex;justify-content:space-between;align-items:center}
.total-label{font-size:18px;font-weight:700}.total-amount{font-size:24px;font-weight:700;color:#1e3a5f}
@media print{body{margin:0;padding:20px}}</style></head>
<body>
<div class="header">
  <div><div class="inv-num">Invoice ${label}</div>
  <div style="color:#6b7280">${new Date(invoice.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div></div>
  <span class="status ${invoice.status === 'paid' ? 'paid' : 'unpaid'}">${(invoice.status || 'unpaid').toUpperCase()}</span>
</div>
<div class="info-grid">
  <div><div class="label">From</div>${fromLogo}${fromName ? `<div class="name">${fromName}</div>` : ''}
  ${d.name && d.name !== fromName ? `<div style="color:#6b7280;font-size:14px">${d.name}</div>` : ''}
  ${d.email ? `<div style="color:#6b7280;font-size:14px">${d.email}</div>` : ''}
  ${d.phone ? `<div style="color:#6b7280;font-size:14px">${d.phone}</div>` : ''}
  ${d.home_airport ? `<div style="color:#6b7280;font-size:14px">${d.home_airport}</div>` : ''}</div>
  <div><div class="label">Bill To</div><div class="name">${invoice.customer_name || 'Customer'}</div>
  ${invoice.customer_company ? `<div style="color:#6b7280;font-size:14px">${invoice.customer_company}</div>` : ''}
  ${invoice.customer_email ? `<div style="color:#6b7280;font-size:14px">${invoice.customer_email}</div>` : ''}</div>
</div>
${invoice.aircraft ? `<p style="color:#6b7280;margin:0 0 4px">Aircraft: <strong style="color:#1f2937">${invoice.aircraft}</strong></p>` : ''}
<table><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody>${lineRows}${addonRows}</tbody></table>
${(() => {
  const lineSub = (invoice.line_items || []).reduce((s, li) => {
    const hrs = li.hours != null ? li.hours : li.quantity;
    const rate = parseFloat(li.rate) || 0;
    const price = li.price != null ? parseFloat(li.price)
      : li.amount != null ? parseFloat(li.amount)
      : (parseFloat(hrs) || 0) * rate;
    return s + (isFinite(price) ? price : 0);
  }, 0);
  const storedSub = parseFloat(invoice.subtotal);
  const discAmt = parseFloat(invoice.discount_amount) || 0;
  const totalNum = parseFloat(invoice.total) || 0;
  const sub = isFinite(storedSub) && storedSub > 0 ? storedSub : (lineSub > 0 ? lineSub : totalNum + discAmt);
  const discRow = discAmt > 0 || parseFloat(invoice.discount_value) > 0
    ? `<div style="display:flex;justify-content:space-between;align-items:center;font-size:14px;color:#dc2626;margin-top:4px"><span>Discount (${invoice.discount_type === 'flat' ? `${sym}${formatPrice(invoice.discount_value)} off` : `${parseFloat(invoice.discount_value) || 0}% off`}${invoice.discount_reason ? ` &mdash; ${invoice.discount_reason}` : ''})</span><span>-${sym}${formatPrice(discAmt)}</span></div>`
    : '';
  return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:14px;color:#6b7280;margin-top:8px"><span>Subtotal</span><span style="color:#1f2937;font-weight:600">${sym}${formatPrice(sub)}</span></div>${discRow}`;
})()}
<div class="total-row"><span class="total-label">Total</span><span class="total-amount">${sym}${formatPrice(invoice.total)}</span></div>
${invoice.status !== 'paid' && invoice.due_date ? `<p style="color:#d97706;margin-top:16px">Due by ${new Date(invoice.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>` : ''}
${invoice.notes ? `<div style="margin-top:16px;padding:12px;background:#fffbeb;border-radius:8px;border:1px solid #fde68a"><strong>Notes:</strong> ${invoice.notes}</div>` : ''}
</body></html>`;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  // Compute stats
  const enriched = invoices.map(inv => ({ ...inv, displayStatus: getDisplayStatus(inv) }));
  const filtered = filter === 'all' ? enriched
    : filter === 'overdue' ? enriched.filter(inv => inv.displayStatus === 'overdue')
    : enriched.filter(inv => inv.displayStatus === filter);

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const totalOutstanding = invoices
    .filter(i => i.status !== 'paid' && i.status !== 'draft')
    .reduce((sum, i) => sum + (parseFloat(i.balance_due) || parseFloat(i.total) || 0), 0);

  const totalPaidThisMonth = invoices
    .filter(i => i.status === 'paid' && i.paid_at && new Date(i.paid_at) >= thisMonthStart)
    .reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);

  const overdueCount = enriched.filter(inv => inv.displayStatus === 'overdue').length;

  const filterTabs = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Draft' },
    { key: 'sent', label: 'Sent' },
    { key: 'viewed', label: 'Viewed' },
    { key: 'paid', label: 'Paid' },
    { key: 'overdue', label: 'Overdue' },
  ];

  return (
    <AppShell title="Invoices">
    <div className="px-6 md:px-10 py-8 pb-40 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-3">
        <h1 className="font-heading text-[2rem] font-light text-v-text-primary" style={{ letterSpacing: '0.15em' }}>INVOICES</h1>
        <button
          onClick={() => { setCreateModal('choose'); setError(''); }}
          className="px-5 py-2 rounded-lg text-sm font-semibold bg-v-gold text-white shadow hover:brightness-110 transition-colors"
        >
          + Create Invoice
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-v-surface rounded-lg p-4 shadow border border-v-border-subtle">
          <p className="text-v-text-secondary text-[10px] tracking-[0.15em] uppercase mb-1">Total Outstanding</p>
          <p className="text-2xl font-bold text-v-gold">{sym}{formatPrice(totalOutstanding)}</p>
        </div>
        <div className="bg-v-surface rounded-lg p-4 shadow border border-v-border-subtle">
          <p className="text-v-text-secondary text-[10px] tracking-[0.15em] uppercase mb-1">Paid This Month</p>
          <p className="text-2xl font-bold text-green-400">{sym}{formatPrice(totalPaidThisMonth)}</p>
        </div>
        <div className="bg-v-surface rounded-lg p-4 shadow border border-v-border-subtle">
          <p className="text-v-text-secondary text-[10px] tracking-[0.15em] uppercase mb-1">Overdue</p>
          <p className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-400' : 'text-v-text-primary'}`}>{overdueCount}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
        {filterTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-xs font-medium uppercase tracking-[0.1em] transition-colors whitespace-nowrap ${
              filter === tab.key
                ? 'bg-v-gold text-white'
                : 'bg-v-surface text-v-text-secondary hover:text-v-text-primary hover:bg-v-surface-light/30'
            }`}
          >
            {tab.label}
            {tab.key === 'overdue' && overdueCount > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-[16px] inline-flex items-center justify-center rounded-full px-1">{overdueCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-white text-center py-16">
          <div className="inline-block w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mb-3" />
          <p className="text-v-text-secondary text-sm">Loading invoices...</p>
        </div>
      )}

      {/* Invoice Table */}
      {!loading && (
        <>
          {filtered.length === 0 ? (
            <div className="bg-v-surface rounded-lg p-8 text-center shadow border border-v-border-subtle">
              <p className="text-v-text-secondary">
                {filter === 'all' ? 'No invoices yet. Create one from a completed job.' : `No ${filter} invoices.`}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block bg-v-surface rounded-lg shadow border border-v-border-subtle overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-v-border-subtle">
                      <th className="text-left px-4 py-3 text-v-text-secondary text-[10px] tracking-[0.15em] uppercase font-medium">Customer</th>
                      <th className="text-left px-4 py-3 text-v-text-secondary text-[10px] tracking-[0.15em] uppercase font-medium">Aircraft</th>
                      <th className="text-right px-4 py-3 text-v-text-secondary text-[10px] tracking-[0.15em] uppercase font-medium">Amount</th>
                      <th className="text-center px-4 py-3 text-v-text-secondary text-[10px] tracking-[0.15em] uppercase font-medium">Status</th>
                      <th className="text-left px-4 py-3 text-v-text-secondary text-[10px] tracking-[0.15em] uppercase font-medium">Due Date</th>
                      <th className="text-right px-4 py-3 text-v-text-secondary text-[10px] tracking-[0.15em] uppercase font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(inv => {
                      const ds = inv.displayStatus;
                      return (
                        <tr
                          key={inv.id}
                          className="border-b border-v-border-subtle/50 hover:bg-v-surface-light/20 transition-colors cursor-pointer"
                          onClick={() => {
                            if (inv.status === 'draft') { openEdit(inv); return; }
                            if (inv.job_id) router.push(`/jobs/${inv.job_id}`);
                            else setViewInvoice(inv);
                          }}
                        >
                          <td className="px-4 py-3">
                            <p className="text-v-text-primary text-sm font-medium">{inv.customer_name || 'Customer'}</p>
                            <p className="text-v-text-secondary text-xs">{invoiceLabel(inv)}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-v-text-primary text-sm">{inv.aircraft || inv.aircraft_model || '-'}</p>
                            {inv.tail_number && <p className="text-v-text-secondary text-xs font-mono">{inv.tail_number}</p>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-v-text-primary text-sm font-semibold">{sym}{formatPrice(inv.total)}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[ds] || statusColors.sent}`}>
                              {statusLabels[ds] || ds}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {inv.due_date ? (
                              <p className={`text-sm ${ds === 'overdue' ? 'text-red-400 font-medium' : 'text-v-text-secondary'}`}>
                                {new Date(inv.due_date).toLocaleDateString()}
                              </p>
                            ) : (
                              <p className="text-v-text-secondary text-sm">-</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex gap-1 justify-end" onClick={e => e.stopPropagation()}>
                              {ds !== 'paid' && (
                                <button
                                  onClick={() => openEdit(inv)}
                                  className="text-xs px-2.5 py-1.5 bg-v-charcoal border border-v-border text-v-text-primary rounded-md hover:bg-white/10 transition-colors"
                                >
                                  Edit
                                </button>
                              )}
                              {ds === 'draft' && (
                                <button
                                  onClick={() => sendInvoice(inv)}
                                  disabled={!inv.customer_email || actionLoading}
                                  className="text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
                                >
                                  Send
                                </button>
                              )}
                              {ds === 'overdue' && (
                                <button
                                  onClick={() => sendReminder(inv)}
                                  disabled={!inv.customer_email || actionLoading}
                                  className="text-xs px-2.5 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-40 transition-colors"
                                >
                                  Remind
                                </button>
                              )}
                              {ds !== 'paid' && ds !== 'draft' && (
                                <button
                                  onClick={() => { setMarkPaidModal(inv); setPaymentMethod('cash'); setPaymentNote(''); }}
                                  className="text-xs px-2.5 py-1.5 bg-green-600/80 text-white rounded-md hover:bg-green-600 transition-colors"
                                >
                                  Mark Paid
                                </button>
                              )}
                              <button
                                onClick={() => downloadPDF(inv)}
                                className="text-xs px-2.5 py-1.5 bg-v-charcoal text-v-text-secondary rounded-md hover:text-v-text-primary transition-colors"
                              >
                                PDF
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {filtered.map(inv => {
                  const ds = inv.displayStatus;
                  return (
                    <div
                      key={inv.id}
                      className="bg-v-surface rounded-lg p-4 shadow border border-v-border-subtle"
                      onClick={() => {
                        if (inv.status === 'draft') { openEdit(inv); return; }
                        if (inv.job_id) router.push(`/jobs/${inv.job_id}`);
                        else setViewInvoice(inv);
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-v-text-primary text-sm font-medium">{inv.customer_name || 'Customer'}</p>
                          <p className="text-v-text-secondary text-xs">{invoiceLabel(inv)}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[ds] || statusColors.sent}`}>
                          {statusLabels[ds] || ds}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-v-text-secondary text-xs">
                          {inv.aircraft || '-'}
                          {inv.due_date ? ` \u00B7 Due ${new Date(inv.due_date).toLocaleDateString()}` : ''}
                        </div>
                        <p className="text-v-text-primary text-base font-semibold">{sym}{formatPrice(inv.total)}</p>
                      </div>
                      <div className="flex gap-1 mt-2 flex-wrap" onClick={e => e.stopPropagation()}>
                        {ds !== 'paid' && (
                          <button onClick={() => openEdit(inv)} className="text-xs px-2 py-1 bg-v-charcoal border border-v-border text-v-text-primary rounded">Edit</button>
                        )}
                        {ds === 'draft' && (
                          <button onClick={() => sendInvoice(inv)} disabled={!inv.customer_email || actionLoading} className="text-xs px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-40">Send</button>
                        )}
                        {ds === 'overdue' && (
                          <button onClick={() => sendReminder(inv)} disabled={!inv.customer_email || actionLoading} className="text-xs px-2 py-1 bg-red-600 text-white rounded disabled:opacity-40">Remind</button>
                        )}
                        {ds !== 'paid' && ds !== 'draft' && (
                          <button onClick={() => { setMarkPaidModal(inv); setPaymentMethod('cash'); setPaymentNote(''); }} className="text-xs px-2 py-1 bg-green-600/80 text-white rounded">Mark Paid</button>
                        )}
                        <button onClick={() => downloadPDF(inv)} className="text-xs px-2 py-1 bg-v-charcoal text-v-text-secondary rounded">PDF</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* View Invoice Modal */}
      {viewInvoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setViewInvoice(null)}>
          <div className="bg-v-surface rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-v-text-primary">Invoice {invoiceLabel(viewInvoice)}</h2>
                <p className="text-sm text-v-text-secondary">{new Date(viewInvoice.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${statusColors[getDisplayStatus(viewInvoice)] || statusColors.sent}`}>
                  {(statusLabels[getDisplayStatus(viewInvoice)] || viewInvoice.status || 'Sent').toUpperCase()}
                </span>
                {viewInvoice.status !== 'paid' && (
                  <button onClick={() => { openEdit(viewInvoice); setViewInvoice(null); }}
                    className="text-xs px-2.5 py-1 border border-v-border rounded text-v-text-secondary hover:text-white hover:bg-white/10 transition-colors">
                    Edit
                  </button>
                )}
                <button onClick={() => setViewInvoice(null)} className="text-v-text-secondary hover:text-v-text-primary text-xl">&times;</button>
              </div>
            </div>

            {/* From / To */}
            <div className="grid grid-cols-2 gap-4 bg-v-charcoal rounded-lg p-3 mb-4 text-sm">
              <div>
                <p className="text-xs text-v-text-secondary uppercase">From</p>
                {(detailer?.logo_url || detailer?.logo_light_url) && (
                  <img src={detailer.logo_light_url || detailer.logo_url} alt="" className="h-10 max-w-[160px] object-contain mb-1" />
                )}
                {detailer?.company && <p className="font-semibold text-v-text-primary">{detailer.company}</p>}
                {detailer?.name && <p className="text-v-text-secondary">{detailer.name}</p>}
                {detailer?.email && <p className="text-v-text-secondary">{detailer.email}</p>}
                {detailer?.phone && <p className="text-v-text-secondary">{detailer.phone}</p>}
                {detailer?.home_airport && <p className="text-v-text-secondary">{detailer.home_airport}</p>}
              </div>
              <div>
                <p className="text-xs text-v-text-secondary uppercase">Bill To</p>
                <p className="font-semibold text-v-text-primary">{viewInvoice.customer_name || 'Customer'}</p>
                {viewInvoice.customer_email && <p className="text-v-text-secondary">{viewInvoice.customer_email}</p>}
              </div>
            </div>

            {viewInvoice.aircraft && <p className="text-sm text-v-text-secondary mb-1">Aircraft: <strong className="text-v-text-primary">{viewInvoice.aircraft}</strong>{viewInvoice.tail_number ? ` (${viewInvoice.tail_number})` : ''}</p>}

            {/* Line items */}
            {(viewInvoice.line_items || []).length > 0 && (
              <div className="border border-v-border-subtle rounded-lg overflow-hidden mb-3 mt-3">
                <table className="w-full text-sm">
                  <thead className="bg-v-charcoal">
                    <tr>
                      <th className="text-left px-3 py-2 text-v-text-secondary text-xs uppercase">Services</th>
                      <th className="text-right px-3 py-2 text-v-text-secondary text-xs uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewInvoice.line_items.map((item, i) => {
                      const hrs = item.hours != null ? item.hours : (item.quantity != null ? item.quantity : null);
                      const rate = parseFloat(item.rate) || 0;
                      const price = item.price != null ? parseFloat(item.price)
                        : item.amount != null ? parseFloat(item.amount)
                        : (parseFloat(hrs) || 0) * rate;
                      return (
                        <tr key={i} className="border-t border-v-border-subtle/50">
                          <td className="px-3 py-2 text-v-text-primary">
                            {item.name || item.description || item.service || 'Service'}
                          </td>
                          <td className="px-3 py-2 text-right text-v-text-primary font-medium">{sym}{formatPrice(price)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Addons */}
            {(viewInvoice.addon_fees || []).length > 0 && (
              <div className="space-y-1 mb-3">
                {viewInvoice.addon_fees.map((a, i) => (
                  <div key={i} className="flex justify-between text-sm text-v-text-secondary">
                    <span>{a.name}</span>
                    <span>{sym}{formatPrice(a.calculated || a.amount || 0)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Total */}
            {(() => {
              const lineSub = (viewInvoice.line_items || []).reduce((s, li) => {
                const hrs = li.hours != null ? li.hours : li.quantity;
                const rate = parseFloat(li.rate) || 0;
                const price = li.price != null ? parseFloat(li.price)
                  : li.amount != null ? parseFloat(li.amount)
                  : (parseFloat(hrs) || 0) * rate;
                return s + (isFinite(price) ? price : 0);
              }, 0);
              const storedSub = parseFloat(viewInvoice.subtotal);
              const discAmt = parseFloat(viewInvoice.discount_amount) || 0;
              const totalNum = parseFloat(viewInvoice.total) || 0;
              const subtotal = isFinite(storedSub) && storedSub > 0
                ? storedSub
                : (lineSub > 0 ? lineSub : totalNum + discAmt);
              return (
                <div className="border-t-2 border-v-border pt-3">
                  <div className="flex justify-between items-center text-sm mb-1">
                    <span className="text-v-text-secondary">Subtotal</span>
                    <span className="text-v-text-primary">{sym}{formatPrice(subtotal)}</span>
                  </div>
                  {(discAmt > 0 || parseFloat(viewInvoice.discount_value) > 0) && (
                    <div className="flex justify-between items-center text-sm mb-2">
                      <span className="text-v-text-secondary">
                        Discount ({viewInvoice.discount_type === 'flat'
                          ? `${sym}${formatPrice(viewInvoice.discount_value)} off`
                          : `${parseFloat(viewInvoice.discount_value) || 0}% off`}
                        {viewInvoice.discount_reason ? ` — ${viewInvoice.discount_reason}` : ''})
                      </span>
                      <span className="text-red-400">-{sym}{formatPrice(discAmt)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-v-text-primary">Total</span>
                    <span className="text-2xl font-bold text-v-gold">{sym}{formatPrice(totalNum)}</span>
                  </div>
                </div>
              );
            })()}
            {(parseFloat(viewInvoice.amount_paid) > 0 || parseFloat(viewInvoice.deposit_amount) > 0) && viewInvoice.status !== 'paid' && (
              <div className="mt-2 pt-2 border-t border-v-border space-y-1">
                {parseFloat(viewInvoice.amount_paid) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-400">Amount Paid</span>
                    <span className="text-green-400 font-semibold">{sym}{formatPrice(viewInvoice.amount_paid)}</span>
                  </div>
                )}
                {parseFloat(viewInvoice.balance_due) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-red-400 font-semibold">Balance Due</span>
                    <span className="text-red-400 font-bold text-base">{sym}{formatPrice(viewInvoice.balance_due)}</span>
                  </div>
                )}
              </div>
            )}
            {viewInvoice.due_date && viewInvoice.status !== 'paid' && (
              <p className={`text-sm mt-2 ${getDisplayStatus(viewInvoice) === 'overdue' ? 'text-red-400 font-semibold' : 'text-v-gold'}`}>
                {getDisplayStatus(viewInvoice) === 'overdue' ? 'Overdue \u2014 was due' : 'Due by'} {new Date(viewInvoice.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            )}

            {viewInvoice.notes && (
              <div className="mt-3 p-3 bg-v-gold/10 rounded-lg border border-v-gold/30 text-sm text-v-gold">
                <strong>Notes:</strong> {viewInvoice.notes}
              </div>
            )}

            {viewInvoice.payment_method && (
              <p className="text-sm text-v-text-secondary mt-2">Payment method: {viewInvoice.payment_method}</p>
            )}
            {viewInvoice.manual_payment_note && (
              <p className="text-sm text-v-text-secondary mt-1">Note: {viewInvoice.manual_payment_note}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-4 flex-wrap">
              <button onClick={() => downloadPDF(viewInvoice)} className="px-4 py-2 bg-v-charcoal rounded-lg text-sm font-medium text-v-text-secondary hover:text-v-text-primary transition-colors">
                Download PDF
              </button>
              {viewInvoice.status !== 'paid' && (
                <button
                  onClick={() => { openEdit(viewInvoice); setViewInvoice(null); }}
                  className="px-4 py-2 bg-v-charcoal border border-v-border text-v-text-primary rounded-lg text-sm font-medium hover:bg-white/10 transition-colors"
                >
                  Edit
                </button>
              )}
              {getDisplayStatus(viewInvoice) === 'draft' && (
                <button
                  onClick={() => { sendInvoice(viewInvoice); setViewInvoice(null); }}
                  disabled={!viewInvoice.customer_email || actionLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  Send Invoice
                </button>
              )}
              {getDisplayStatus(viewInvoice) === 'overdue' && (
                <button
                  onClick={() => sendReminder(viewInvoice)}
                  disabled={!viewInvoice.customer_email || actionLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 transition-colors"
                >
                  Send Reminder
                </button>
              )}
              {viewInvoice.status !== 'paid' && getDisplayStatus(viewInvoice) !== 'draft' && (
                <button
                  onClick={() => { setMarkPaidModal(viewInvoice); setPaymentMethod('cash'); setPaymentNote(''); }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  Mark as Paid
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mark Paid Modal */}
      {markPaidModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setMarkPaidModal(null)}>
          <div className="bg-v-surface rounded-xl max-w-sm w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-v-text-primary mb-3">Mark as Paid</h3>
            <p className="text-sm text-v-text-secondary mb-3">{invoiceLabel(markPaidModal)} &mdash; {sym}{formatPrice(markPaidModal.total)}</p>
            <label className="block text-sm font-medium text-v-text-primary mb-1">Payment method</label>
            <div className="flex gap-2 mb-3 flex-wrap">
              {['cash', 'check', 'bank_transfer', 'other'].map(m => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    paymentMethod === m ? 'bg-v-gold text-white border-v-gold' : 'bg-v-surface text-v-text-secondary border-v-border hover:bg-white/5'
                  }`}
                >
                  {m === 'cash' ? 'Cash' : m === 'check' ? 'Check' : m === 'bank_transfer' ? 'Bank Transfer' : 'Other'}
                </button>
              ))}
            </div>
            <label className="block text-sm font-medium mb-1 text-v-text-secondary">Note (optional)</label>
            <input
              type="text"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              placeholder="e.g. Check #1234, Venmo confirmation..."
              className="w-full px-3 py-2 rounded-lg bg-v-charcoal border border-v-border text-v-text-primary text-sm mb-4 placeholder:text-v-text-secondary/50"
            />
            <div className="flex gap-2">
              <button onClick={() => setMarkPaidModal(null)} className="flex-1 px-4 py-2 border border-v-border rounded-lg text-v-text-secondary hover:bg-white/5 transition-colors">Cancel</button>
              <button
                onClick={markAsPaid}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? 'Saving...' : 'Confirm Paid'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Invoice — Choose Mode */}
      {createModal === 'choose' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCreateModal(false)}>
          <div className="bg-v-surface rounded-xl max-w-sm w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-v-text-primary mb-4">Create Invoice</h3>
            <div className="space-y-3">
              <button
                onClick={() => { setCreateModal('from_job'); fetchAllJobs(); }}
                className="w-full flex items-center gap-3 p-4 border border-v-border rounded-lg hover:bg-white/5 transition-colors text-left"
              >
                <span className="text-2xl">&#128203;</span>
                <div>
                  <p className="text-sm font-semibold text-v-text-primary">From a Job</p>
                  <p className="text-xs text-v-text-secondary">Invoice an existing job</p>
                </div>
              </button>
              <button
                onClick={() => { setCreateModal('blank'); fetchCustomers(); }}
                className="w-full flex items-center gap-3 p-4 border border-v-border rounded-lg hover:bg-white/5 transition-colors text-left"
              >
                <span className="text-2xl">&#128221;</span>
                <div>
                  <p className="text-sm font-semibold text-v-text-primary">Quick Invoice</p>
                  <p className="text-xs text-v-text-secondary">Add services — no job needed. Save draft or send.</p>
                </div>
              </button>
            </div>
            <button onClick={() => setCreateModal(false)} className="w-full mt-3 text-xs text-v-text-secondary hover:text-white">Cancel</button>
          </div>
        </div>
      )}

      {/* Create Invoice — From a Job */}
      {createModal === 'from_job' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCreateModal(false)}>
          <div className="bg-v-surface rounded-xl max-w-md w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-v-text-primary mb-3">Create Invoice from Job</h3>
            <p className="text-sm text-v-text-secondary mb-3">Select a job to invoice.</p>
            {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
            {allJobs.length === 0 ? (
              <p className="text-v-text-secondary text-center py-6">No jobs found.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto mb-4">
                {allJobs.map(j => {
                  const disabled = j.invoice_status === 'paid';
                  return (
                    <label key={j.id} className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                      disabled ? 'opacity-40 cursor-not-allowed border-v-border' :
                      selectedQuoteId === j.id ? 'border-v-gold bg-v-gold/10 cursor-pointer' : 'border-v-border hover:border-v-gold/30 cursor-pointer'
                    }`}>
                      <div className="flex items-center gap-2">
                        <input type="radio" name="job" value={j.id}
                          checked={selectedQuoteId === j.id}
                          disabled={disabled}
                          onChange={() => setSelectedQuoteId(j.id)}
                          className="accent-v-gold" />
                        <div>
                          <p className="text-sm font-medium text-v-text-primary">{j.customer_name || 'Customer'}</p>
                          <p className="text-xs text-v-text-secondary">
                            {j.aircraft || 'Service'} &middot; {j.status}
                            {j.invoiced && <span className="ml-1 text-v-gold">&#183; Already invoiced</span>}
                          </p>
                        </div>
                      </div>
                      <span className="font-bold text-v-text-primary text-sm">{sym}{formatPrice(j.total || 0)}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-v-text-secondary mb-2 text-center">Saving creates a <strong className="text-white">draft</strong> — the customer is not emailed until you click Send.</p>
            <div className="flex gap-2">
              <button onClick={() => setCreateModal('choose')} className="px-4 py-2 border border-v-border rounded-lg text-v-text-secondary hover:bg-white/5 text-sm">Back</button>
              <button onClick={() => createInvoiceFromJob({ send: false })} disabled={!selectedQuoteId || actionLoading}
                className="flex-1 px-4 py-2 bg-v-charcoal border border-v-border text-v-text-primary rounded-lg font-medium disabled:opacity-50 text-sm hover:bg-white/10">
                {actionLoading ? 'Saving...' : 'Save Draft'}
              </button>
              <button onClick={() => createInvoiceFromJob({ send: true })} disabled={!selectedQuoteId || actionLoading}
                className="flex-1 px-4 py-2 bg-v-gold text-white rounded-lg font-medium disabled:opacity-50 text-sm">
                {actionLoading ? 'Working...' : 'Save &amp; Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Invoice — Blank Form */}
      {createModal === 'blank' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCreateModal(false)}>
          <div className="bg-v-surface rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-v-text-primary mb-4">New Invoice</h3>
            {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

            <div className="space-y-3 mb-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-v-text-secondary mb-1">Customer name *</label>
                  <input value={blankForm.customer_name} onChange={e => setBlankForm(f => ({ ...f, customer_name: e.target.value }))}
                    list="customer-names" placeholder="Customer name"
                    className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white outline-none focus:border-v-gold/50" />
                  <datalist id="customer-names">
                    {customers.map((c, i) => <option key={i} value={c.name} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs text-v-text-secondary mb-1">Email *</label>
                  <input value={blankForm.customer_email} onChange={e => setBlankForm(f => ({ ...f, customer_email: e.target.value }))}
                    type="email" placeholder="customer@email.com"
                    className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white outline-none focus:border-v-gold/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-v-text-secondary mb-1">Aircraft</label>
                  <input value={blankForm.aircraft_model} onChange={e => setBlankForm(f => ({ ...f, aircraft_model: e.target.value }))}
                    placeholder="Optional"
                    className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white outline-none focus:border-v-gold/50" />
                </div>
                <div>
                  <label className="block text-xs text-v-text-secondary mb-1">Tail #</label>
                  <input value={blankForm.tail_number} onChange={e => setBlankForm(f => ({ ...f, tail_number: e.target.value }))}
                    placeholder="Optional"
                    className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white outline-none focus:border-v-gold/50 uppercase" />
                </div>
              </div>
            </div>

            {/* Line items */}
            <p className="text-xs text-v-text-secondary mb-2">Line Items</p>
            <div className="space-y-2 mb-3">
              {blankForm.line_items.map((li, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <input value={li.description} onChange={e => updateLineItem(i, 'description', e.target.value)}
                    placeholder="Description" className="flex-1 bg-v-charcoal border border-v-border rounded px-2 py-1.5 text-sm text-white outline-none" />
                  <input type="number" value={li.quantity} onChange={e => updateLineItem(i, 'quantity', e.target.value)}
                    placeholder="Qty" min="1" step="0.5" className="w-16 bg-v-charcoal border border-v-border rounded px-2 py-1.5 text-sm text-white outline-none text-center" />
                  <input type="number" value={li.rate} onChange={e => updateLineItem(i, 'rate', e.target.value)}
                    placeholder="Rate" step="0.01" className="w-24 bg-v-charcoal border border-v-border rounded px-2 py-1.5 text-sm text-white outline-none text-right" />
                  <span className="text-sm text-v-text-secondary py-1.5 w-20 text-right">{sym}{((parseFloat(li.quantity) || 0) * (parseFloat(li.rate) || 0)).toFixed(2)}</span>
                  {blankForm.line_items.length > 1 && (
                    <button onClick={() => removeLineItem(i)} className="text-red-400 hover:text-red-300 text-sm py-1.5">&times;</button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addLineItem} className="text-v-gold text-xs hover:underline mb-4">+ Add line item</button>

            <div className="flex items-center justify-between border-t border-v-border pt-3 mb-4">
              <span className="text-sm font-semibold text-v-text-primary">Total</span>
              <span className="text-lg font-bold text-v-gold">
                {sym}{blankForm.line_items.reduce((s, li) => s + (parseFloat(li.quantity) || 0) * (parseFloat(li.rate) || 0), 0).toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Net Terms (days)</label>
                <input type="number" value={blankForm.net_terms} onChange={e => setBlankForm(f => ({ ...f, net_terms: parseInt(e.target.value) || 30 }))}
                  className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white outline-none" />
              </div>
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Notes</label>
                <input value={blankForm.notes} onChange={e => setBlankForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional" className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white outline-none" />
              </div>
            </div>

            <p className="text-xs text-v-text-secondary mb-2 text-center">Saving creates a <strong className="text-white">draft</strong> — the customer is not emailed until you click Send.</p>
            <div className="flex gap-2">
              <button onClick={() => setCreateModal('choose')} className="px-4 py-2 border border-v-border rounded-lg text-v-text-secondary hover:bg-white/5 text-sm">Back</button>
              <button onClick={() => createBlankInvoice({ send: false })} disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-v-charcoal border border-v-border text-v-text-primary rounded-lg font-medium disabled:opacity-50 text-sm hover:bg-white/10">
                {actionLoading ? 'Saving...' : 'Save Draft'}
              </button>
              <button onClick={() => createBlankInvoice({ send: true })} disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-v-gold text-white rounded-lg font-medium disabled:opacity-50 text-sm">
                {actionLoading ? 'Working...' : 'Save &amp; Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Invoice Modal */}
      {editInvoice && editForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={closeEditModal}>
          <div className="bg-v-surface rounded-xl max-w-2xl w-full p-6 shadow-xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-v-text-primary">Edit Invoice</h3>
                <p className="text-xs text-v-text-secondary font-mono">{invoiceLabel(editInvoice)}</p>
              </div>
              <div className="flex items-center gap-2">
                {editSavedFlash && <span className="text-green-400 text-xs">Saved ✓</span>}
                <button onClick={closeEditModal} className="text-v-text-secondary hover:text-white text-xl">&times;</button>
              </div>
            </div>
            {editError && <p className="text-red-400 text-sm mb-3">{editError}</p>}

            {/* Customer */}
            <p className="text-xs text-v-text-secondary uppercase tracking-wider mb-2">Customer</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Name</label>
                <input value={editForm.customer_name} onChange={e => setEditForm(f => ({ ...f, customer_name: e.target.value }))}
                  className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white outline-none focus:border-v-gold/50" />
              </div>
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Email</label>
                <input type="email" value={editForm.customer_email} onChange={e => setEditForm(f => ({ ...f, customer_email: e.target.value }))}
                  className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white outline-none focus:border-v-gold/50" />
              </div>
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Phone</label>
                <input value={editForm.customer_phone} onChange={e => setEditForm(f => ({ ...f, customer_phone: e.target.value }))}
                  className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white outline-none focus:border-v-gold/50" />
              </div>
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Status</label>
                <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white outline-none focus:border-v-gold/50">
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="viewed">Viewed</option>
                </select>
              </div>
            </div>

            {/* Aircraft */}
            <p className="text-xs text-v-text-secondary uppercase tracking-wider mb-2">Aircraft</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Model</label>
                <input value={editForm.aircraft_model} onChange={e => setEditForm(f => ({ ...f, aircraft_model: e.target.value }))}
                  className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white outline-none focus:border-v-gold/50" />
              </div>
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Tail #</label>
                <input value={editForm.tail_number} onChange={e => setEditForm(f => ({ ...f, tail_number: e.target.value }))}
                  className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white outline-none focus:border-v-gold/50 uppercase" />
              </div>
            </div>

            {/* Services */}
            <p className="text-xs text-v-text-secondary uppercase tracking-wider mb-2">Services</p>
            {(() => {
              const grouped = {};
              editServices.forEach(svc => {
                const cat = svc.category || 'other';
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(svc);
              });
              const cats = CATEGORY_ORDER.filter(c => grouped[c]?.length);
              Object.keys(grouped).forEach(c => { if (!cats.includes(c)) cats.push(c); });
              if (cats.length === 0) {
                return <p className="text-xs text-v-text-secondary/60 italic mb-3">Loading services…</p>;
              }
              return (
                <div className="space-y-4 mb-4">
                  {cats.map(cat => (
                    <div key={cat}>
                      <p className="text-[10px] uppercase tracking-wider text-v-gold/60 mb-1.5">{CATEGORY_LABELS[cat] || cat}</p>
                      <div className="space-y-1">
                        {grouped[cat].map(svc => {
                          const sel = editSelectedServices.includes(svc.id);
                          const hrs = getEditHours(svc);
                          const rate = getEditRate(svc);
                          const svcTotal = getEditServiceTotal(svc);
                          return (
                            <div key={svc.id} className={`flex items-center gap-3 p-3 rounded border transition-colors ${sel ? 'border-v-gold/50 bg-v-gold/5' : 'border-v-border bg-v-charcoal'}`}>
                              <input type="checkbox" checked={sel}
                                onChange={() => toggleEditService(svc.id)}
                                className="w-4 h-4 rounded accent-v-gold cursor-pointer" />
                              <div className="flex-1 min-w-0">
                                <span className="text-sm text-v-text-primary">{svc.name}</span>
                                {!editAircraftHoursRef && <span className="text-[10px] text-v-text-secondary/50 ml-2 italic">Set aircraft for auto hours</span>}
                              </div>
                              {sel && (
                                <div className="flex items-center gap-2 shrink-0">
                                  <input type="number" step="0.01" min="0"
                                    value={editHourOverrides[svc.id] !== undefined ? editHourOverrides[svc.id] : (getEditDefaultHours(svc) || '')}
                                    onChange={e => setEditHourOverrides(prev => ({ ...prev, [svc.id]: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }))}
                                    className="w-16 bg-v-surface border border-v-border text-v-text-primary rounded px-2 py-1 text-xs text-center outline-none focus:border-v-gold/50" />
                                  <span className="text-[10px] text-v-text-secondary">hrs</span>
                                </div>
                              )}
                              <div className="text-right shrink-0 w-24">
                                {svcTotal > 0 && <span className="text-sm text-v-text-primary font-medium">{sym}{svcTotal.toFixed(2)}</span>}
                                {rate > 0 && parseFloat(hrs) > 0 && <span className="text-[10px] text-v-text-secondary block">@ {sym}{rate}/hr</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Custom line items */}
            <p className="text-xs text-v-text-secondary uppercase tracking-wider mb-2">Custom Line Items</p>
            {editCustomLines.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {editCustomLines.map((cl, i) => (
                  <div key={i} className="flex gap-2 items-center p-2 rounded border border-v-gold/20 bg-v-gold/5">
                    <input value={cl.name}
                      onChange={e => setEditCustomLines(prev => { const c = [...prev]; c[i] = { ...c[i], name: e.target.value }; return c; })}
                      placeholder="Description"
                      className="flex-1 bg-v-charcoal border border-v-border rounded px-2 py-1.5 text-xs text-white outline-none" />
                    <input type="number" step="0.01" value={cl.hours}
                      onChange={e => setEditCustomLines(prev => { const c = [...prev]; c[i] = { ...c[i], hours: e.target.value }; return c; })}
                      placeholder="Hrs"
                      className="w-16 bg-v-charcoal border border-v-border rounded px-2 py-1.5 text-xs text-white outline-none text-center" />
                    <input type="number" step="0.01" value={cl.rate}
                      onChange={e => setEditCustomLines(prev => { const c = [...prev]; c[i] = { ...c[i], rate: e.target.value }; return c; })}
                      placeholder="Rate"
                      className="w-20 bg-v-charcoal border border-v-border rounded px-2 py-1.5 text-xs text-white outline-none text-right" />
                    <span className="text-xs text-v-text-secondary w-20 text-right">
                      {sym}{((parseFloat(cl.hours) || 0) * (parseFloat(cl.rate) || 0)).toFixed(2)}
                    </span>
                    <button onClick={() => setEditCustomLines(prev => prev.filter((_, j) => j !== i))}
                      className="text-red-400 hover:text-red-300 text-sm w-6">&times;</button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setEditCustomLines(prev => [...prev, { name: '', hours: '', rate: '' }])}
              className="text-v-gold text-xs hover:underline mb-4">+ Add custom line item</button>

            {/* Discount */}
            <p className="text-xs text-v-text-secondary uppercase tracking-wider mb-2">Discount</p>
            <div className="flex flex-wrap gap-2 items-center mb-4">
              <div className="inline-flex rounded border border-v-border overflow-hidden">
                <button type="button"
                  onClick={() => setEditDiscount(d => ({ ...d, type: 'percent' }))}
                  className={`px-3 py-1.5 text-xs ${editDiscount.type === 'percent' ? 'bg-v-gold text-white' : 'bg-v-charcoal text-v-text-secondary'}`}>
                  % percent
                </button>
                <button type="button"
                  onClick={() => setEditDiscount(d => ({ ...d, type: 'flat' }))}
                  className={`px-3 py-1.5 text-xs ${editDiscount.type === 'flat' ? 'bg-v-gold text-white' : 'bg-v-charcoal text-v-text-secondary'}`}>
                  $ flat
                </button>
              </div>
              <input
                type="number"
                step="1"
                min="0"
                max={editDiscount.type === 'percent' ? 100 : undefined}
                value={editDiscount.value}
                onChange={e => {
                  const raw = e.target.value;
                  if (raw === '') { setEditDiscount(d => ({ ...d, value: '' })); return; }
                  let n = parseFloat(raw);
                  if (!isFinite(n)) return;
                  if (n < 0) n = 0;
                  if (editDiscount.type === 'percent' && n > 100) n = 100;
                  setEditDiscount(d => ({ ...d, value: String(n) }));
                }}
                placeholder="0"
                className="w-24 bg-v-charcoal border border-v-border rounded px-2 py-1.5 text-xs text-white outline-none text-right" />
              <input type="text" value={editDiscount.reason}
                onChange={e => setEditDiscount(d => ({ ...d, reason: e.target.value }))}
                placeholder="Reason (optional)"
                className="flex-1 min-w-[140px] bg-v-charcoal border border-v-border rounded px-2 py-1.5 text-xs text-white outline-none" />
              <button type="button"
                onClick={() => setEditDiscount({ type: 'percent', value: '', reason: '' })}
                className="text-red-400 hover:text-red-300 text-sm w-6"
                aria-label="Clear discount"
              >&times;</button>
            </div>

            {(() => {
              const svcSub = editSelectedServices.reduce((s, id) => {
                const svc = editServices.find(x => x.id === id);
                return s + (svc ? getEditServiceTotal(svc) : 0);
              }, 0);
              const customSub = editCustomLines.reduce((s, cl) => s + (parseFloat(cl.hours) || 0) * (parseFloat(cl.rate) || 0), 0);
              const subtotal = svcSub + customSub;
              const discAmt = computeDiscountAmount(subtotal, editDiscount);
              const total = Math.max(0, subtotal - discAmt);
              const discValue = parseFloat(editDiscount.value);
              const discLabel = editDiscount.type === 'flat'
                ? `${sym}${(isFinite(discValue) ? discValue : 0).toFixed(2)} off`
                : `${isFinite(discValue) ? discValue : 0}% off`;
              return (
                <div className="border-t border-v-border pt-3 mb-4 space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-v-text-secondary">Subtotal</span>
                    <span className="text-v-text-primary">{sym}{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-v-text-secondary">
                      Discount ({discLabel}{editDiscount.reason?.trim() ? ` — ${editDiscount.reason.trim()}` : ''})
                    </span>
                    <span className={discAmt > 0 ? 'text-red-400' : 'text-v-text-secondary'}>
                      {discAmt > 0 ? '-' : ''}{sym}{discAmt.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-v-text-primary">Total</span>
                    <span className="text-lg font-bold text-v-gold">{sym}{total.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Terms & notes */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Net Terms (days)</label>
                <input type="number" value={editForm.net_terms} onChange={e => setEditForm(f => ({ ...f, net_terms: e.target.value }))}
                  className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white outline-none" />
              </div>
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Due Date</label>
                <input type="date" value={editForm.due_date} onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))}
                  className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white outline-none" />
              </div>
            </div>
            <div className="mb-5">
              <label className="block text-xs text-v-text-secondary mb-1">Notes</label>
              <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white outline-none resize-none" />
            </div>

            <div className="flex gap-2">
              <button onClick={closeEditModal}
                className="px-4 py-2 border border-v-border rounded-lg text-v-text-secondary hover:bg-white/5 text-sm">
                Cancel
              </button>
              <button onClick={saveEdit} disabled={editSaving}
                className="flex-1 px-4 py-2 bg-v-gold text-white rounded-lg font-medium disabled:opacity-50 text-sm">
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
              {editForm.status === 'draft' && (
                <button
                  onClick={async () => { await saveEdit(); await sendInvoice(editInvoice); closeEditModal(); }}
                  disabled={editSaving || !editForm.customer_email}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 text-sm hover:bg-blue-700"
                >
                  Save &amp; Send
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </AppShell>
  );
}
