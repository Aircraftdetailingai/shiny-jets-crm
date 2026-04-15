"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { formatPrice, currencySymbol } from '@/lib/formatPrice';

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id;

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [beforePhotos, setBeforePhotos] = useState([]);
  const [afterPhotos, setAfterPhotos] = useState([]);
  const [labor, setLabor] = useState(null);
  const [standingNotes, setStandingNotes] = useState([]);
  const [newStandingNote, setNewStandingNote] = useState('');
  const [crewNotes, setCrewNotes] = useState('');
  const [crewNotesSaving, setCrewNotesSaving] = useState(false);
  const [briefingSending, setBriefingSending] = useState(false);
  const [briefingResult, setBriefingResult] = useState(null);
  const [deliveryPref, setDeliveryPref] = useState('day_before');
  const [progress, setProgress] = useState(0);
  const progressTimer = useRef(null);

  useEffect(() => {
    if (job?.progress_percentage !== undefined) setProgress(job.progress_percentage || 0);
  }, [job?.progress_percentage]);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
    fetchJob(token);
  }, [jobId]);

  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceSent, setInvoiceSent] = useState(false);
  const [showInvoicePrompt, setShowInvoicePrompt] = useState(false);
  const [showCompletionPrompt, setShowCompletionPrompt] = useState(false);
  const [completionData, setCompletionData] = useState(null);
  const [submittingCompletion, setSubmittingCompletion] = useState(false);

  // Delivery report state
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryLink, setDeliveryLink] = useState(null);

  // Product selection state
  const [jobProducts, setJobProducts] = useState({ selections: [], serviceProducts: [] });
  const [changingProduct, setChangingProduct] = useState(null);

  // Edit job state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  // Dispatch / crew assignment state
  const [assignments, setAssignments] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showAddCrew, setShowAddCrew] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchedToast, setDispatchedToast] = useState(false);
  const [planRequired, setPlanRequired] = useState(false);

  // Fetch dispatch board data scoped to this job
  const fetchAssignments = async (token) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };

      // Always fetch assignments directly from the dedicated endpoint (most reliable)
      try {
        const aRes = await fetch(`/api/jobs/${jobId}/assign`, { headers });
        if (aRes.ok) {
          const aData = await aRes.json();
          setAssignments(aData.assignments || []);
        }
      } catch {}

      // Load team members if not already loaded
      if (teamMembers.length === 0) {
        // Try dispatch board for team + suggestions
        try {
          const res = await fetch('/api/dispatch/board', { headers });
          if (res.status === 403) { setPlanRequired(true); }
          else if (res.ok) {
            const data = await res.json();
            const active = (data.team_members || []).filter(m => m.status === 'active');
            if (active.length > 0) setTeamMembers(active);
          }
        } catch {}

        // Fallback: load team directly
        if (teamMembers.length === 0) {
          const teamRes = await fetch('/api/team', { headers });
          if (teamRes.ok) {
            const teamData = await teamRes.json();
            const members = (teamData.members || teamData.team || teamData || []).filter(m => m.status === 'active');
            setTeamMembers(members);
          }
        }
      }
    } catch (e) {
      console.error('[crew] fetchAssignments error:', e);
    }
  };

  // Fetch smart crew suggestions for this job
  const fetchSuggestions = async (token) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const date = job?.scheduled_date || new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/dispatch/suggest?job_id=${jobId}&date=${date}`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch {}
  };

  // Load dispatch data when job loads
  useEffect(() => {
    if (!job) return;
    const token = localStorage.getItem('vector_token');
    if (!token) return;
    fetchAssignments(token);
    fetchSuggestions(token);
    // Load existing delivery link
    if (job?.delivery_link) setDeliveryLink(job.delivery_link);
    // Fetch product selections for this job
    fetch(`/api/jobs/${jobId}/products`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : {})
      .then(d => { if (d.selections || d.serviceProducts) setJobProducts(d); })
      .catch(() => {});
  }, [job?.id]);

  const handleAssignCrew = async (memberId) => {
    setAssigning(true);
    try {
      const token = localStorage.getItem('vector_token');

      // Optimistic update: show member as pending immediately
      const member = teamMembers.find(m => m.id === memberId);
      if (member) {
        setAssignments(prev => [...prev, {
          team_member_id: memberId,
          member_name: member.name,
          member_title: member.title,
          status: 'pending',
          _optimistic: true,
        }]);
      }
      setShowAddCrew(false);

      const res = await fetch('/api/dispatch/assign', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, team_member_ids: [memberId] }),
      });

      // Refresh real data from server regardless of success
      await fetchAssignments(token);

      if (!res.ok) {
        console.error('[assign] API error:', res.status);
        // Revert optimistic update on failure
        setAssignments(prev => prev.filter(a => !a._optimistic || a.team_member_id !== memberId));
      }
    } catch (err) {
      console.error('[assign] error:', err);
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassignCrew = async (memberId) => {
    try {
      const token = localStorage.getItem('vector_token');
      await fetch('/api/dispatch/assign', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, team_member_id: memberId }),
      });
      await fetchAssignments(token);
    } catch {}
  };

  const openEditModal = () => {
    setEditForm({
      scheduled_date: job.scheduled_date || '',
      airport: job.airport || '',
      tail_number: job.tail_number || '',
      completion_notes: job.completion_notes || job.notes || '',
      total_price: job.total_price || '',
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        await fetchJob(token);
        setShowEditModal(false);
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Failed to save changes');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDispatch = async () => {
    setDispatching(true);
    try {
      const token = localStorage.getItem('vector_token');
      const pendingIds = assignments.filter(a => a.status === 'pending').map(a => a.team_member_id);
      if (pendingIds.length === 0) { setDispatching(false); return; }
      const res = await fetch('/api/dispatch/assign', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, team_member_ids: pendingIds }),
      });
      if (res.ok) {
        setDispatchedToast(true);
        setTimeout(() => setDispatchedToast(false), 2500);
        await fetchAssignments(token);
      }
    } finally { setDispatching(false); }
  };

  const fetchJob = async (token) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      let data = null;

      // Try jobs table first (manually created jobs have enriched data)
      const jobRes = await fetch(`/api/jobs/${jobId}/detail`, { headers });
      if (jobRes.ok) {
        const jobData = await jobRes.json();
        if (jobData && !jobData.error) data = jobData;
      }

      // Fall back to quotes table (legacy quote-based jobs)
      if (!data) {
        const quoteRes = await fetch(`/api/quotes/${jobId}`, { headers });
        if (quoteRes.ok) {
          const quoteData = await quoteRes.json();
          if (quoteData?.id) data = quoteData;
        }
      }

      if (data) setJob(data);

      const mediaRes = await fetch(`/api/job-media?quote_id=${jobId}`, { headers });
      if (mediaRes.ok) {
        const media = await mediaRes.json();
        setBeforePhotos(media.beforeMedia || []);
        setAfterPhotos(media.afterMedia || []);
      }

      // Fetch labor breakdown (non-blocking)
      try {
        const laborRes = await fetch(`/api/jobs/${jobId}/labor`, { headers });
        if (laborRes.ok) {
          const laborData = await laborRes.json();
          setLabor(laborData);
        }
      } catch {}

      // Fetch aircraft standing notes + crew notes
      if (data) {
        setCrewNotes(data.crew_notes || '');
        setDeliveryPref(data.delivery_preference || 'day_before');
        if (data.tail_number) {
          try {
            const notesRes = await fetch(`/api/aircraft-notes?tail_number=${encodeURIComponent(data.tail_number)}`, { headers });
            if (notesRes.ok) {
              const nd = await notesRes.json();
              setStandingNotes(nd.notes || []);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch(`/api/jobs/${jobId}/delete`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) router.push('/jobs');
    } catch {} finally { setDeleting(false); }
  };

  const updateStatus = async (status) => {
    setUpdating(true);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/jobs/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ job_id: jobId, status }),
      });
      if (res.ok) {
        await fetchJob(token);
        if (status === 'completed') {
          setShowInvoicePrompt(true);
          // Build calibration data comparing estimated vs actual hours
          buildCompletionCalibration();
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(false);
    }
  };

  const buildCompletionCalibration = () => {
    const svcs = Array.isArray(job?.services) ? job.services.map(s => {
      if (typeof s === 'string') return { name: s, hours: 0 };
      return { name: s.name || s.service_name || 'Service', hours: parseFloat(s.hours) || 0 };
    }) : [];
    const estimatedTotal = svcs.reduce((sum, s) => sum + s.hours, 0);
    const actualTotal = labor?.actual_hours || 0;
    if (estimatedTotal <= 0 || actualTotal <= 0) return;
    const variancePct = Math.abs((actualTotal - estimatedTotal) / estimatedTotal) * 100;
    if (variancePct <= 10) return; // Within tolerance

    // Build per-service variance data
    const ratio = actualTotal / estimatedTotal;
    const serviceVariances = svcs.filter(s => s.hours > 0).map(s => {
      const estH = s.hours;
      const actH = parseFloat((s.hours * ratio).toFixed(1));
      const pct = ((actH - estH) / estH * 100).toFixed(0);
      return { name: s.name, estimated: estH, actual: actH, variance_pct: parseFloat(pct) };
    }).filter(s => Math.abs(s.variance_pct) > 10);

    setCompletionData({
      aircraft_model: job.aircraft_model || 'Aircraft',
      estimated_total: estimatedTotal,
      actual_total: actualTotal,
      variance_pct: parseFloat(((actualTotal - estimatedTotal) / estimatedTotal * 100).toFixed(0)),
      services: serviceVariances,
    });
    setShowCompletionPrompt(true);
  };

  const handleCompletionSubmit = async (updateEstimates) => {
    setSubmittingCompletion(true);
    try {
      const token = localStorage.getItem('vector_token');
      const body = {
        services: (completionData?.services || []).map(s => ({
          name: s.name,
          estimated_hours: s.estimated,
          actual_hours: s.actual,
          update_override: updateEstimates,
        })),
      };
      await fetch(`/api/jobs/${jobId}/complete-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error('Completion data submit error:', err);
    } finally {
      setSubmittingCompletion(false);
      setShowCompletionPrompt(false);
    }
  };

  const handleGenerateInvoice = async () => {
    setInvoiceLoading(true);
    try {
      const token = localStorage.getItem('vector_token');
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

      const invoiceRes = await fetch('/api/invoices', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          job_id: jobId,
          customer_name: job.client_name || job.customer_name,
          customer_email: job.client_email || job.customer_email,
          aircraft_model: job.aircraft_model,
          tail_number: job.tail_number,
          line_items: servicesList,
          total: displayTotal,
          net_terms: 30,
          notes: '',
        }),
      });

      if (!invoiceRes.ok) {
        const err = await invoiceRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create invoice');
      }

      const invoice = await invoiceRes.json();

      const sendRes = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: 'POST',
        headers,
      });

      if (!sendRes.ok) {
        throw new Error('Invoice created but failed to send email');
      }

      setInvoiceSent(true);
      setShowInvoicePrompt(false);
      alert('Invoice generated and sent successfully.');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to generate invoice');
    } finally {
      setInvoiceLoading(false);
    }
  };

  const statusColors = {
    paid: 'bg-green-500/20 text-green-400',
    accepted: 'bg-blue-500/20 text-blue-400',
    approved: 'bg-blue-500/20 text-blue-400',
    scheduled: 'bg-purple-500/20 text-purple-400',
    in_progress: 'bg-yellow-500/20 text-yellow-400',
    completed: 'bg-green-500/20 text-green-400',
  };

  if (loading) return <AppShell title="Job"><div className="p-8 text-v-text-secondary">Loading...</div></AppShell>;
  if (!job) return <AppShell title="Job"><div className="p-8 text-red-400">Job not found</div></AppShell>;

  const saveProgress = (val) => {
    setProgress(val);
    clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(async () => {
      const token = localStorage.getItem('vector_token');
      await fetch(`/api/jobs/${jobId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ progress_percentage: val }),
      }).catch(() => {});
    }, 1000);
  };

  // Services come enriched from the API with hours, rate, price
  const servicesList = Array.isArray(job.services) ? job.services.map(s => {
    if (typeof s === 'string') return { name: s, hours: 0, rate: 0, price: 0 };
    return { name: s.name || s.service_name || s.description || 'Service', hours: parseFloat(s.hours) || 0, rate: parseFloat(s.rate) || 0, price: parseFloat(s.price) || 0 };
  }) : [];
  const displayTotal = parseFloat(job.total_price) || servicesList.reduce((sum, s) => sum + s.price, 0);

  // Business-day completion estimate — adjusts with progress
  const totalHours = parseFloat(job.total_hours) || servicesList.reduce((sum, s) => sum + s.hours, 0);
  const remainingHours = totalHours * (1 - progress / 100);
  const remainingDays = remainingHours > 0 ? Math.max(1, Math.ceil(remainingHours / 8)) : 0;
  const finishDate = (() => {
    if (!remainingDays) return null;
    const baseDate = progress > 0 ? new Date() : (job.scheduled_date ? new Date(job.scheduled_date + 'T12:00') : new Date());
    const start = new Date(baseDate);
    if (start.getDay() === 0) start.setDate(start.getDate() + 1);
    if (start.getDay() === 6) start.setDate(start.getDate() + 2);
    const finish = new Date(start);
    let rem = remainingDays - 1;
    while (rem > 0) { finish.setDate(finish.getDate() + 1); if (finish.getDay() !== 0 && finish.getDay() !== 6) rem--; }
    return finish;
  })();
  const totalBusinessDays = totalHours > 0 ? Math.max(1, Math.ceil(totalHours / 8)) : 0;

  const isScheduled = ['paid', 'accepted', 'approved', 'scheduled'].includes(job.status);
  const isInProgress = job.status === 'in_progress';
  const isCompleted = job.status === 'completed' || job.status === 'complete';

  return (
    <AppShell title={`Job — ${job.tail_number || job.aircraft_model || 'Detail'}`}>
    <div className="px-6 md:px-10 py-8 pb-40 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => router.push('/jobs')} className="text-sm text-v-text-secondary hover:text-v-text-primary mb-2 block">&larr; Back to Jobs</button>
          <h1 className="font-heading text-2xl text-v-text-primary">
            {job.aircraft_model || 'Aircraft Detail'}
            {job.tail_number && <span className="text-v-text-secondary ml-2 text-lg">{job.tail_number}</span>}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[job.status] || 'bg-gray-500/20 text-gray-400'}`}>
            {(job.status || '').replace('_', ' ')}
          </span>
          {assignments.some(a => a.status === 'pending') && (
            <button
              onClick={handleDispatch}
              disabled={dispatching}
              className="px-3 py-1 text-xs text-blue-400 border border-blue-400/30 rounded-full hover:bg-blue-400/10 transition-colors disabled:opacity-50"
            >
              {dispatching ? 'Sending...' : dispatchedToast ? 'Dispatched ✓' : 'Dispatch'}
            </button>
          )}
          <button onClick={openEditModal} className="px-3 py-1 text-xs text-v-gold border border-v-gold/30 rounded-full hover:bg-v-gold/10 transition-colors">
            Edit
          </button>
          <button onClick={() => setShowDeleteConfirm(true)} className="px-3 py-1 text-xs text-red-400 border border-red-400/30 rounded-full hover:bg-red-400/10 transition-colors">
            Delete
          </button>
        </div>
      </div>

      {/* Edit modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowEditModal(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-v-surface border border-v-border rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Edit Job</h3>
              <button onClick={() => setShowEditModal(false)} className="text-v-text-secondary hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-1">Scheduled Date</label>
                <input
                  type="date"
                  value={editForm.scheduled_date || ''}
                  onChange={e => setEditForm(p => ({ ...p, scheduled_date: e.target.value || null }))}
                  className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white outline-none focus:border-v-gold/50"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-1">Airport</label>
                <input
                  type="text"
                  value={editForm.airport || ''}
                  onChange={e => setEditForm(p => ({ ...p, airport: e.target.value.toUpperCase() }))}
                  placeholder="KCNO"
                  className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white uppercase outline-none focus:border-v-gold/50"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-1">Tail Number</label>
                <input
                  type="text"
                  value={editForm.tail_number || ''}
                  onChange={e => setEditForm(p => ({ ...p, tail_number: e.target.value.toUpperCase() }))}
                  placeholder="N12345"
                  className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white uppercase outline-none focus:border-v-gold/50"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-1">Total Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.total_price || ''}
                  onChange={e => setEditForm(p => ({ ...p, total_price: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white outline-none focus:border-v-gold/50"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-v-text-secondary mb-1">Notes</label>
                <textarea
                  value={editForm.completion_notes || ''}
                  onChange={e => setEditForm(p => ({ ...p, completion_notes: e.target.value }))}
                  rows={3}
                  className="w-full bg-v-charcoal border border-v-border rounded px-3 py-2 text-sm text-white outline-none focus:border-v-gold/50 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 text-sm text-v-text-secondary border border-v-border rounded hover:bg-white/5">Cancel</button>
              <button onClick={handleSaveEdit} disabled={savingEdit} className="px-4 py-2 text-sm bg-v-gold text-v-charcoal font-semibold rounded hover:bg-v-gold-dim disabled:opacity-50">
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-v-surface border border-v-border rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-2">Delete this job?</h3>
            <p className="text-v-text-secondary text-sm mb-4">This action cannot be undone. The job and all associated data will be permanently removed.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-sm text-v-text-secondary border border-v-border rounded">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
                {deleting ? 'Deleting...' : 'Delete Job'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <div className="bg-v-surface border border-v-border rounded-lg p-4">
          <p className="text-xs text-v-text-secondary">Customer</p>
          <p className="text-v-text-primary font-medium mt-1">{job.client_name || job.customer_name || job.customer_company || '—'}</p>
        </div>
        <div className="bg-v-surface border border-v-border rounded-lg p-4">
          <p className="text-xs text-v-text-secondary">Value</p>
          <p className="text-v-text-primary font-medium mt-1">{currencySymbol()}{formatPrice(displayTotal)}</p>
        </div>
        <div className="bg-v-surface border border-v-border rounded-lg p-4">
          <p className="text-xs text-v-text-secondary">Scheduled</p>
          <p className="text-v-text-primary font-medium mt-1">
            {job.scheduled_date ? new Date(job.scheduled_date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
          </p>
        </div>
        <div className="bg-v-surface border border-v-border rounded-lg p-4">
          <p className="text-xs text-v-text-secondary">Location</p>
          <p className="text-v-text-primary font-medium mt-1">{job.airport || job.job_location || 'Not set'}</p>
        </div>
        <div className="bg-v-surface border border-v-border rounded-lg p-4">
          <p className="text-xs text-v-text-secondary">Est. Completion</p>
          <p className="text-v-text-primary font-medium mt-1">
            {progress >= 100 ? 'Complete' : finishDate ? finishDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
            {progress < 100 && remainingDays > 0 && <span className="text-v-text-secondary text-xs ml-1">({remainingDays}d left)</span>}
          </p>
        </div>
      </div>

      {/* Progress Slider */}
      <div className="bg-v-surface border border-v-border rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-v-text-secondary">Job Progress</h3>
          <span className="text-sm font-semibold text-v-text-primary">{progress}% Complete</span>
        </div>
        <input
          type="range" min="0" max="100" step="5"
          value={progress}
          onChange={e => saveProgress(parseInt(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer"
          style={{ background: `linear-gradient(to right, #0081b8 ${progress}%, rgba(255,255,255,0.1) ${progress}%)` }}
        />
        <div className="flex justify-between text-[10px] text-v-text-secondary/50 mt-1">
          <span>Not Started</span>
          <span>Complete</span>
        </div>
        {/* Share with customer toggle */}
        <label className="flex items-center justify-between mt-3 pt-3 border-t border-v-border cursor-pointer">
          <span className="text-xs text-v-text-secondary">Share progress with customer</span>
          <div onClick={async (e) => {
            e.preventDefault();
            const newVal = !job.share_progress_with_customer;
            setJob(prev => ({ ...prev, share_progress_with_customer: newVal }));
            const token = localStorage.getItem('vector_token');
            await fetch(`/api/jobs/${jobId}/progress`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ share_progress_with_customer: newVal }),
            }).catch(() => {});
          }}
            className={`relative w-9 h-5 rounded-full transition-colors ${job.share_progress_with_customer ? 'bg-[#0081b8]' : 'bg-gray-600'}`}>
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${job.share_progress_with_customer ? 'translate-x-4' : ''}`} />
          </div>
        </label>
      </div>

      {/* Services */}
      {servicesList.length > 0 && (
        <div className="bg-v-surface border border-v-border rounded-lg p-4 mb-6">
          <h3 className="text-sm font-medium text-v-text-secondary mb-3">Services</h3>
          <div className="space-y-2">
            {servicesList.map((svc, i) => {
              const svcId = svc.service_id || svc.id;
              const linkedProducts = (jobProducts.serviceProducts || []).filter(sp => sp.service_id === svcId);
              const selectedProduct = (jobProducts.selections || []).find(s => s.service_id === svcId);
              const defaultProduct = linkedProducts.find(lp => lp.is_default);
              const activeProduct = selectedProduct
                ? linkedProducts.find(lp => lp.product_id === selectedProduct.product_id)?.product
                : defaultProduct?.product;

              return (
                <div key={i} className="text-sm">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-v-text-primary">{svc.name}</span>
                      {svc.hours > 0 && <span className="text-v-text-secondary text-xs ml-2">{svc.hours.toFixed(1)}h</span>}
                    </div>
                    <div className="text-right">
                      {svc.price > 0 && <span className="text-v-text-primary font-medium">{currencySymbol()}{formatPrice(svc.price)}</span>}
                      {svc.rate > 0 && svc.hours > 0 && <span className="text-v-text-secondary text-[10px] block">@ {currencySymbol()}{svc.rate}/hr</span>}
                    </div>
                  </div>
                  {linkedProducts.length > 0 && (
                    <div className="mt-1 flex items-center gap-2">
                      {changingProduct === svcId ? (
                        <select
                          value={selectedProduct?.product_id || defaultProduct?.product_id || ''}
                          onChange={async (e) => {
                            const token = localStorage.getItem('vector_token');
                            await fetch(`/api/jobs/${jobId}/products`, {
                              method: 'POST',
                              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                              body: JSON.stringify({ service_id: svcId, product_id: e.target.value }),
                            });
                            const res = await fetch(`/api/jobs/${jobId}/products`, { headers: { Authorization: `Bearer ${token}` } });
                            if (res.ok) setJobProducts(await res.json());
                            setChangingProduct(null);
                          }}
                          className="text-[10px] bg-v-charcoal border border-v-border text-v-text-primary rounded px-2 py-0.5 outline-none"
                          autoFocus
                          onBlur={() => setTimeout(() => setChangingProduct(null), 200)}
                        >
                          {linkedProducts.map(lp => (
                            <option key={lp.product_id} value={lp.product_id}>
                              {lp.product?.name}{lp.product?.brand ? ` (${lp.product.brand})` : ''}{lp.is_default ? ' ★' : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <>
                          <span className="text-[10px] text-v-text-secondary/60">
                            {activeProduct ? `${activeProduct.name}${activeProduct.brand ? ` · ${activeProduct.brand}` : ''}` : ''}
                            {!selectedProduct && defaultProduct ? ' (default)' : ''}
                          </span>
                          {linkedProducts.length > 1 && (
                            <button onClick={() => setChangingProduct(svcId)} className="text-[10px] text-v-gold hover:underline">Change</button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {servicesList.length > 1 && displayTotal > 0 && (
              <div className="flex justify-between text-sm border-t border-v-border pt-2 mt-2">
                <span className="text-v-text-secondary font-medium">Total</span>
                <span className="text-v-text-primary font-semibold">{currencySymbol()}{formatPrice(displayTotal)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-3 mb-8">
        {isScheduled && (
          <div className="bg-v-surface border border-v-border rounded-lg p-6 text-center">
            <p className="text-v-text-secondary text-sm mb-4">Ready to start this job? Take pre-job photos first.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => router.push(`/jobs/${jobId}/photos`)}
                className="px-6 py-3 bg-v-gold/20 text-v-gold border border-v-gold/30 rounded-lg font-medium hover:bg-v-gold/30 transition-colors"
              >
                Take Pre-Job Photos
              </button>
              <button
                onClick={() => updateStatus('in_progress')}
                disabled={updating}
                className="px-6 py-3 bg-v-gold text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {updating ? 'Starting...' : 'Start Job'}
              </button>
              <button
                onClick={handleGenerateInvoice}
                disabled={invoiceLoading || invoiceSent}
                className="px-6 py-3 border border-blue-500/30 text-blue-400 rounded-lg font-medium hover:bg-blue-500/10 transition-colors disabled:opacity-50"
              >
                {invoiceLoading ? 'Sending...' : invoiceSent ? 'Invoice Sent' : 'Generate & Send Invoice'}
              </button>
            </div>
          </div>
        )}

        {isInProgress && (
          <div className="bg-v-surface border border-yellow-500/30 rounded-lg p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              <p className="text-yellow-400 font-medium">Job In Progress</p>
            </div>
            <p className="text-v-text-secondary text-sm mb-4">
              Started {job.started_at ? new Date(job.started_at).toLocaleString() : 'just now'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => router.push(`/jobs/${jobId}/photos`)}
                className="px-6 py-3 bg-v-gold/20 text-v-gold border border-v-gold/30 rounded-lg font-medium hover:bg-v-gold/30 transition-colors"
              >
                Add Photos
              </button>
              <button
                onClick={() => router.push(`/jobs/${jobId}/log-products`)}
                className="px-6 py-3 bg-white/10 text-v-text-primary border border-v-border rounded-lg font-medium hover:bg-white/20 transition-colors"
              >
                Log Products
              </button>
              <button
                onClick={() => {
                  router.push(`/jobs/${jobId}/photos?mode=after`);
                }}
                className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
              >
                Complete Job
              </button>
              <button
                onClick={handleGenerateInvoice}
                disabled={invoiceLoading || invoiceSent}
                className="px-6 py-3 border border-blue-500/30 text-blue-400 rounded-lg font-medium hover:bg-blue-500/10 transition-colors disabled:opacity-50"
              >
                {invoiceLoading ? 'Sending...' : invoiceSent ? 'Invoice Sent' : 'Generate & Send Invoice'}
              </button>
            </div>
          </div>
        )}

        {isCompleted && (
          <div className="bg-v-surface border border-green-500/30 rounded-lg p-6 text-center">
            <p className="text-green-400 font-medium mb-2">Job Completed</p>
            <p className="text-v-text-secondary text-sm mb-4">
              {job.completed_at ? `Completed on ${new Date(job.completed_at).toLocaleString()}` : 'Marked as complete'}
            </p>

            {showInvoicePrompt && !invoiceSent && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-4">
                <p className="text-blue-400 font-medium text-sm mb-3">Job complete! Generate invoice?</p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={handleGenerateInvoice}
                    disabled={invoiceLoading}
                    className="px-5 py-2 border border-blue-500/30 text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                  >
                    {invoiceLoading ? 'Sending...' : 'Generate & Send Invoice'}
                  </button>
                  <button
                    onClick={() => setShowInvoicePrompt(false)}
                    className="px-5 py-2 text-sm text-v-text-secondary border border-v-border rounded-lg hover:bg-white/5 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {invoiceSent && (
              <p className="text-blue-400 text-sm">Invoice sent.</p>
            )}

            {!showInvoicePrompt && !invoiceSent && (
              <button
                onClick={handleGenerateInvoice}
                disabled={invoiceLoading}
                className="px-6 py-3 border border-blue-500/30 text-blue-400 rounded-lg font-medium hover:bg-blue-500/10 transition-colors disabled:opacity-50"
              >
                {invoiceLoading ? 'Sending...' : 'Generate & Send Invoice'}
              </button>
            )}

            {/* Delivery Report */}
            <div className="mt-4 pt-4 border-t border-green-500/10">
              {deliveryLink ? (
                <div className="text-center">
                  <p className="text-green-400 text-sm mb-2">Delivery report ready</p>
                  <a href={`/delivery/${deliveryLink}`} target="_blank" rel="noreferrer" className="text-v-gold text-xs hover:underline">
                    View Report &rarr;
                  </a>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    setDeliveryLoading(true);
                    try {
                      const token = localStorage.getItem('vector_token');
                      const customerEmail = job.client_email || job.customer_email;
                      const res = await fetch(`/api/jobs/${jobId}/delivery`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ send_email: !!customerEmail, customer_email: customerEmail }),
                      });
                      if (res.ok) {
                        const d = await res.json();
                        setDeliveryLink(d.share_link);
                        if (customerEmail) alert('Delivery report sent to ' + customerEmail);
                      }
                    } catch {} finally { setDeliveryLoading(false); }
                  }}
                  disabled={deliveryLoading}
                  className="w-full px-5 py-2 border border-green-500/30 text-green-400 rounded-lg text-sm font-medium hover:bg-green-500/10 transition-colors disabled:opacity-50"
                >
                  {deliveryLoading ? 'Generating...' : 'Generate Delivery Report'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Labor */}
      {labor && labor.entry_count > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-v-text-secondary uppercase tracking-wider">Labor</h3>
            <div className="text-xs text-v-text-secondary">
              {labor.actual_hours.toFixed(2)}h actual
              {labor.estimated_hours > 0 && (
                <span className="text-v-text-secondary/60"> / {labor.estimated_hours.toFixed(1)}h estimated</span>
              )}
            </div>
          </div>

          {labor.over_estimate && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
              <p className="text-amber-400 text-xs font-medium">
                ⚠ Job is running over estimate ({((labor.actual_hours / labor.estimated_hours - 1) * 100).toFixed(0)}% over)
              </p>
            </div>
          )}

          <div className="bg-v-surface border border-v-border rounded-lg overflow-hidden">
            {labor.members.map((m) => (
              <div key={m.team_member_id} className="px-4 py-3 border-b border-v-border last:border-0">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <p className="text-v-text-primary text-sm font-medium">{m.name}</p>
                    {m.title && <p className="text-v-text-secondary text-[10px]">{m.title}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-v-text-primary text-sm font-semibold">{m.total_hours.toFixed(2)}h</p>
                    {m.total_pay > 0 && (
                      <p className="text-v-text-secondary text-xs">{currencySymbol()}{formatPrice(m.total_pay)}</p>
                    )}
                  </div>
                </div>
                {/* Per-entry breakdown */}
                {m.entries.length > 1 && (
                  <div className="mt-2 pl-2 border-l-2 border-v-border/50 space-y-0.5">
                    {m.entries.map((e) => (
                      <p key={e.id} className="text-v-text-secondary text-[10px]">
                        {e.clock_in && new Date(e.clock_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        {e.clock_out && ' – ' + new Date(e.clock_out).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        {' · '}{e.hours_worked.toFixed(2)}h
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="px-4 py-3 bg-v-charcoal/50 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-v-text-secondary">Total Labor</span>
              <div className="text-right">
                <p className="text-v-text-primary text-base font-bold">{labor.actual_hours.toFixed(2)}h</p>
                {labor.total_labor_cost > 0 && (
                  <p className="text-v-text-secondary text-xs">{currencySymbol()}{formatPrice(labor.total_labor_cost)}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Crew / Dispatch */}
      {!planRequired && (
        <div className="mb-8 bg-v-surface border border-v-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-v-text-secondary uppercase tracking-wider">Crew</h3>
            {!showAddCrew && (
              <button
                onClick={() => setShowAddCrew(true)}
                className="text-xs text-v-gold hover:text-v-gold-dim transition-colors"
              >
                + Add Crew
              </button>
            )}
          </div>

          {/* Currently assigned crew */}
          {assignments.length > 0 && (
            <div className="space-y-2 mb-4">
              {assignments.map(a => {
                const member = teamMembers.find(m => m.id === a.team_member_id);
                if (!member) return null;
                const statusBadge = a.status === 'accepted'
                  ? { color: 'text-green-400 bg-green-500/10 border-green-500/30', icon: '✓', label: 'Accepted' }
                  : a.status === 'declined'
                  ? { color: 'text-red-400 bg-red-500/10 border-red-500/30', icon: '✕', label: 'Declined' }
                  : { color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', icon: '◷', label: 'Pending' };
                return (
                  <div key={a.id} className="flex items-center justify-between p-3 bg-v-charcoal border border-v-border rounded">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-v-gold/20 text-v-gold flex items-center justify-center text-xs font-semibold shrink-0">
                        {(member.name || '?').charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-v-text-primary text-sm truncate">{member.name}</p>
                        {member.title && <p className="text-v-text-secondary text-xs truncate">{member.title}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusBadge.color}`}>
                        <span>{statusBadge.icon}</span>
                        {statusBadge.label}
                      </span>
                      <button
                        onClick={() => handleUnassignCrew(a.team_member_id)}
                        className="text-v-text-secondary/60 hover:text-red-400 text-lg leading-none px-1"
                        title="Unassign"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add crew picker — also shows when no crew assigned */}
          {(showAddCrew || assignments.length === 0) && (
            <div className={assignments.length > 0 ? 'border-t border-v-border pt-4' : ''}>
              {assignments.length === 0 && !showAddCrew && (
                <p className="text-v-text-secondary text-sm mb-3">No crew assigned yet. Pick from your team:</p>
              )}
              {showAddCrew && (
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-v-text-secondary uppercase tracking-wider">Add Team Member</p>
                  <button onClick={() => setShowAddCrew(false)} className="text-xs text-v-text-secondary hover:text-v-text-primary">Cancel</button>
                </div>
              )}

              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {teamMembers
                  .filter(m => !assignments.some(a => a.team_member_id === m.id))
                  .sort((a, b) => {
                    const aSug = suggestions.find(s => s.team_member_id === a.id)?.score || 0;
                    const bSug = suggestions.find(s => s.team_member_id === b.id)?.score || 0;
                    if (aSug !== bSug) return bSug - aSug;
                    return (a.name || '').localeCompare(b.name || '');
                  })
                  .map(m => {
                    const sug = suggestions.find(s => s.team_member_id === m.id);
                    const isSuggested = sug && sug.score > 0;
                    const overbooked = sug && !sug.available;
                    return (
                      <button
                        key={m.id}
                        onClick={() => handleAssignCrew(m.id)}
                        disabled={assigning || overbooked}
                        className={`w-full flex items-center justify-between p-3 rounded border transition-colors text-left ${
                          isSuggested
                            ? 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/15'
                            : 'bg-v-charcoal border-v-border hover:bg-white/5'
                        } ${overbooked ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${isSuggested ? 'bg-blue-500/20 text-blue-400' : 'bg-white/10 text-v-text-secondary'}`}>
                            {(m.name || '?').charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-v-text-primary text-sm truncate">{m.name}</p>
                              {isSuggested && <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[9px] uppercase tracking-wider rounded-full">Suggested</span>}
                            </div>
                            {m.title && <p className="text-v-text-secondary text-xs truncate">{m.title}</p>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {sug && sug.hours_today > 0 ? (
                            <p className={`text-xs ${overbooked ? 'text-red-400' : 'text-v-text-secondary'}`}>{sug.hours_today}h today</p>
                          ) : (
                            <p className="text-xs text-green-400">Available</p>
                          )}
                          {sug && sug.specialty_match > 0 && (
                            <p className="text-[10px] text-v-gold mt-0.5">{sug.specialty_match} specialty match</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                {teamMembers.length === 0 && (
                  <p className="text-v-text-secondary text-sm text-center py-4">
                    No team members yet. <a href="/team" className="text-v-gold hover:underline">Invite your team →</a>
                  </p>
                )}
                {teamMembers.length > 0 && teamMembers.filter(m => !assignments.some(a => a.team_member_id === m.id)).length === 0 && (
                  <p className="text-v-text-secondary text-sm text-center py-4">All team members assigned</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Before/After Photos */}
      {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-v-text-secondary uppercase tracking-wider">Photos</h3>
            <button
              onClick={() => router.push(`/jobs/${jobId}/photos`)}
              className="text-xs text-v-gold hover:underline"
            >
              View All / Add More
            </button>
          </div>

          {beforePhotos.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-v-text-secondary mb-2">Before ({beforePhotos.length})</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {beforePhotos.slice(0, 8).map((photo) => (
                  <div key={photo.id} className="aspect-square rounded-lg overflow-hidden bg-v-charcoal">
                    <img src={photo.url} alt="Before" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {afterPhotos.length > 0 && (
            <div>
              <p className="text-xs text-v-text-secondary mb-2">After ({afterPhotos.length})</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {afterPhotos.slice(0, 8).map((photo) => (
                  <div key={photo.id} className="aspect-square rounded-lg overflow-hidden bg-v-charcoal">
                    <img src={photo.url} alt="After" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Completion Calibration Prompt */}
      {showCompletionPrompt && completionData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-v-surface border border-v-border rounded-xl max-w-lg w-full p-6 shadow-2xl">
            <h3 className="text-lg font-heading text-v-text-primary mb-1">Job Complete — Update your estimates?</h3>
            <p className="text-sm text-v-text-secondary mb-4">
              You estimated {completionData.estimated_total}h but it took {completionData.actual_total.toFixed(1)}h for {completionData.aircraft_model}
            </p>
            {completionData.services.length > 0 && (
              <div className="space-y-2 mb-6">
                {completionData.services.map((s, i) => (
                  <div key={i} className="flex items-center justify-between bg-v-charcoal border border-v-border rounded-lg px-4 py-2.5">
                    <span className="text-sm text-v-text-primary">{s.name}</span>
                    <span className={`text-xs font-data ${s.variance_pct > 0 ? 'text-amber-400' : 'text-blue-400'}`}>
                      Estimated {s.estimated}h → Actual {s.actual}h ({s.variance_pct > 0 ? '+' : ''}{s.variance_pct}%)
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => handleCompletionSubmit(false)}
                disabled={submittingCompletion}
                className="px-5 py-2.5 text-sm text-v-text-secondary border border-v-border rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                Skip
              </button>
              <button
                onClick={() => handleCompletionSubmit(true)}
                disabled={submittingCompletion}
                className="px-5 py-2.5 text-sm bg-v-gold text-v-charcoal rounded-lg font-medium hover:bg-v-gold-dim transition-colors disabled:opacity-50"
              >
                {submittingCompletion ? 'Updating...' : 'Update Estimates'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Crew Notes ─── */}
      <div className="mb-8 space-y-4">
        {/* Standing notes for this aircraft */}
        {job?.tail_number && (
          <div className="bg-v-surface border border-v-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-v-text-secondary uppercase tracking-wider mb-3">
              Standing Notes for {job.tail_number}
            </h3>
            <p className="text-[10px] text-v-text-secondary/60 mb-3">Applies to all future jobs for this aircraft</p>
            {standingNotes.length > 0 && (
              <div className="space-y-2 mb-3">
                {standingNotes.map(n => (
                  <div key={n.id} className="flex items-start gap-2 bg-v-charcoal/50 rounded p-2">
                    <span className="text-white/70 text-sm flex-1">{n.note}</span>
                    <button onClick={async () => {
                      const token = localStorage.getItem('vector_token');
                      await fetch(`/api/aircraft-notes?id=${n.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
                      setStandingNotes(prev => prev.filter(x => x.id !== n.id));
                    }} className="text-red-400/50 hover:text-red-400 text-xs shrink-0">&times;</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input value={newStandingNote} onChange={e => setNewStandingNote(e.target.value)}
                placeholder="Add standing note..." onKeyDown={async e => {
                  if (e.key === 'Enter' && newStandingNote.trim()) {
                    const token = localStorage.getItem('vector_token');
                    const res = await fetch('/api/aircraft-notes', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ tail_number: job.tail_number, note: newStandingNote.trim() }) });
                    if (res.ok) { const d = await res.json(); setStandingNotes(prev => [...prev, d.note]); setNewStandingNote(''); }
                  }
                }}
                className="flex-1 bg-v-charcoal border border-v-border text-white rounded px-3 py-2 text-sm outline-none focus:border-v-gold/50 placeholder-v-text-secondary/40" />
              <button onClick={async () => {
                if (!newStandingNote.trim()) return;
                const token = localStorage.getItem('vector_token');
                const res = await fetch('/api/aircraft-notes', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ tail_number: job.tail_number, note: newStandingNote.trim() }) });
                if (res.ok) { const d = await res.json(); setStandingNotes(prev => [...prev, d.note]); setNewStandingNote(''); }
              }} className="px-4 py-2 bg-v-gold text-v-charcoal text-xs font-semibold rounded hover:bg-v-gold-dim">Add</button>
            </div>
          </div>
        )}

        {/* Job-specific crew note */}
        <div className="bg-v-surface border border-v-border rounded-lg p-5">
          <h3 className="text-sm font-medium text-v-text-secondary uppercase tracking-wider mb-2">
            Crew Notes — This Job Only
            {crewNotesSaving && <span className="text-v-text-secondary/40 text-[10px] ml-2 normal-case">Saving...</span>}
          </h3>
          <textarea value={crewNotes} onChange={e => setCrewNotes(e.target.value)}
            onBlur={async () => {
              if (crewNotes === (job?.crew_notes || '')) return;
              setCrewNotesSaving(true);
              const token = localStorage.getItem('vector_token');
              await fetch(`/api/jobs/${jobId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ crew_notes: crewNotes }) }).catch(() => {});
              setCrewNotesSaving(false);
            }}
            placeholder="One-time note for this job..."
            rows={2}
            className="w-full bg-v-charcoal border border-v-border text-white rounded px-3 py-2 text-sm outline-none focus:border-v-gold/50 placeholder-v-text-secondary/40 resize-none" />
        </div>
      </div>

      {/* ─── Crew Briefing ─── */}
      {assignments.length > 0 && (
        <div className="mb-8 bg-v-surface border border-v-border rounded-lg p-5">
          <h3 className="text-sm font-medium text-v-text-secondary uppercase tracking-wider mb-3">Crew Briefing</h3>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center mb-4">
            <label className="text-sm text-v-text-secondary shrink-0">Auto-send:</label>
            <select value={deliveryPref} onChange={async (e) => {
              const val = e.target.value;
              setDeliveryPref(val);
              const token = localStorage.getItem('vector_token');
              await fetch(`/api/jobs/${jobId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ delivery_preference: val }) }).catch(() => {});
            }} className="bg-v-charcoal border border-v-border text-white rounded px-3 py-2 text-sm outline-none focus:border-v-gold/50">
              <option value="day_before">Day before job</option>
              <option value="morning_of">Morning of job</option>
              <option value="manual">Manual only</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button disabled={briefingSending} onClick={async () => {
              setBriefingSending(true);
              setBriefingResult(null);
              try {
                const token = localStorage.getItem('vector_token');
                const res = await fetch(`/api/jobs/${jobId}/send-briefing`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                const data = await res.json();
                if (res.ok) {
                  setBriefingResult({ success: true, count: data.sent });
                  setTimeout(() => setBriefingResult(null), 5000);
                } else {
                  setBriefingResult({ success: false, message: data.error || 'Failed to send' });
                  setTimeout(() => setBriefingResult(null), 5000);
                }
              } catch {
                setBriefingResult({ success: false, message: 'Network error' });
                setTimeout(() => setBriefingResult(null), 5000);
              } finally {
                setBriefingSending(false);
              }
            }} className="px-5 py-2.5 bg-v-gold text-v-charcoal text-sm font-semibold rounded-lg hover:bg-v-gold-dim disabled:opacity-50 transition-colors">
              {briefingSending ? 'Sending...' : 'Send Briefing Now'}
            </button>
            {briefingResult && (
              <span className={`text-sm ${briefingResult.success ? 'text-green-400' : 'text-red-400'}`}>
                {briefingResult.success ? `Briefing sent to ${briefingResult.count} crew member${briefingResult.count !== 1 ? 's' : ''}` : briefingResult.message}
              </span>
            )}
            {job?.reminder_sent_at && !briefingResult && (
              <span className="text-xs text-v-text-secondary/50">Last sent {new Date(job.reminder_sent_at).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <button onClick={() => router.push(`/jobs/${jobId}/photos`)} className="bg-v-surface border border-v-border rounded-lg p-4 text-center hover:bg-white/5 transition-colors">
          <p className="text-lg mb-1">&#128247;</p>
          <p className="text-sm text-v-text-primary">Photos</p>
          <p className="text-xs text-v-text-secondary">{beforePhotos.length + afterPhotos.length} uploaded</p>
        </button>
        <button onClick={() => router.push(`/jobs/${jobId}/log-products`)} className="bg-v-surface border border-v-border rounded-lg p-4 text-center hover:bg-white/5 transition-colors">
          <p className="text-lg mb-1">&#128230;</p>
          <p className="text-sm text-v-text-primary">Products</p>
          <p className="text-xs text-v-text-secondary">Log usage</p>
        </button>
        {job.tail_number && (
          <button onClick={() => router.push(`/aircraft/${encodeURIComponent(job.tail_number)}`)} className="bg-v-surface border border-v-border rounded-lg p-4 text-center hover:bg-white/5 transition-colors">
            <p className="text-lg mb-1">&#9992;</p>
            <p className="text-sm text-v-text-primary">{job.tail_number}</p>
            <p className="text-xs text-v-text-secondary">Aircraft history</p>
          </button>
        )}
      </div>
    </div>
    </AppShell>
  );
}
