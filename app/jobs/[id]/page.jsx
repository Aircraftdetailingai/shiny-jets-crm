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
        if (status === 'completed') setShowInvoicePrompt(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(false);
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
          <button onClick={() => setShowDeleteConfirm(true)} className="px-3 py-1 text-xs text-red-400 border border-red-400/30 rounded-full hover:bg-red-400/10 transition-colors">
            Delete
          </button>
        </div>
      </div>

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
            {servicesList.map((svc, i) => (
              <div key={i} className="flex justify-between items-center text-sm">
                <div>
                  <span className="text-v-text-primary">{svc.name}</span>
                  {svc.hours > 0 && <span className="text-v-text-secondary text-xs ml-2">{svc.hours.toFixed(1)}h</span>}
                </div>
                <div className="text-right">
                  {svc.price > 0 && <span className="text-v-text-primary font-medium">{currencySymbol()}{formatPrice(svc.price)}</span>}
                  {svc.rate > 0 && svc.hours > 0 && <span className="text-v-text-secondary text-[10px] block">@ {currencySymbol()}{svc.rate}/hr</span>}
                </div>
              </div>
            ))}
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
