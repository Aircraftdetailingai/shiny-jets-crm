"use client";
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const API = (path, token, opts = {}) =>
  fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers } }).then(r => r.json());

export default function CrewDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [tab, setTab] = useState('jobs');
  const [loading, setLoading] = useState(true);

  // Jobs state
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);

  // Clock state
  const [clockStatus, setClockStatus] = useState(null);
  const [clockLoading, setClockLoading] = useState(false);
  const [clockElapsed, setClockElapsed] = useState('');

  // Photos state
  const [photos, setPhotos] = useState([]);
  const [photoUploading, setPhotoUploading] = useState(false);

  // Products state
  const [products, setProducts] = useState([]);
  const [usageForm, setUsageForm] = useState({ product_id: '', amount_used: '', notes: '' });
  const [inventoryChanges, setInventoryChanges] = useState({});
  const [inventorySaving, setInventorySaving] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', quantity: '', unit: 'oz', category: 'cleaner', size: '' });

  // Equipment state
  const [equipment, setEquipment] = useState([]);
  const [issueForm, setIssueForm] = useState({ equipment_id: '', issue: '' });

  // Job materials state (products & equipment needed for selected job)
  const [jobMaterials, setJobMaterials] = useState(null);
  const [jobMaterialsLoading, setJobMaterialsLoading] = useState(false);
  const [checkedProducts, setCheckedProducts] = useState({});
  const [checkedEquipment, setCheckedEquipment] = useState({});
  const [missingReport, setMissingReport] = useState({ type: '', item_id: '', item_name: '', notes: '' });

  // Issue report state
  const [showIssueReport, setShowIssueReport] = useState(false);
  const [issueDescription, setIssueDescription] = useState('');
  const [issuePhoto, setIssuePhoto] = useState(null);
  const [issueSending, setIssueSending] = useState(false);

  // Messages
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('success');

  const showMsg = (text, type = 'success') => {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(''), 3000);
  };

  // Auth check
  useEffect(() => {
    const tk = localStorage.getItem('crew_token');
    const u = localStorage.getItem('crew_user');
    if (!tk || !u) {
      router.push('/crew/login');
      return;
    }
    try {
      const parsed = JSON.parse(u);
      setUser(parsed);
      setToken(tk);
    } catch {
      router.push('/crew/login');
    }
  }, [router]);

  // Fetch jobs
  const fetchJobs = useCallback(async () => {
    if (!token) return;
    const data = await API('/api/crew/jobs', token);
    if (data.jobs) setJobs(data.jobs);
  }, [token]);

  // Fetch clock status
  const fetchClock = useCallback(async () => {
    if (!token) return;
    const data = await API('/api/crew/clock', token);
    setClockStatus(data);
  }, [token]);

  // Fetch photos for selected job
  const fetchPhotos = useCallback(async () => {
    if (!token || !selectedJob) return;
    const data = await API(`/api/crew/photos?quote_id=${selectedJob.id}`, token);
    if (data.photos) setPhotos(data.photos);
  }, [token, selectedJob]);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    if (!token || !user?.can_see_inventory) return;
    const data = await API('/api/crew/products', token);
    if (data.products) setProducts(data.products);
  }, [token, user]);

  // Fetch equipment
  const fetchEquipment = useCallback(async () => {
    if (!token || !user?.can_see_equipment) return;
    const data = await API('/api/crew/equipment', token);
    if (data.equipment) setEquipment(data.equipment);
  }, [token, user]);

  // Fetch job materials (products & equipment needed for a specific job)
  const fetchJobMaterials = useCallback(async (jobId) => {
    if (!token || (!user?.can_see_inventory && !user?.can_see_equipment)) return;
    setJobMaterialsLoading(true);
    try {
      const data = await API(`/api/crew/jobs/${jobId}/materials`, token);
      setJobMaterials(data);
      // Initialize checked state from existing product_usage
      const checked = {};
      (data.product_usage || []).forEach(u => { checked[u.product_id] = true; });
      setCheckedProducts(checked);
      setCheckedEquipment({});
    } catch {
      setJobMaterials(null);
    }
    setJobMaterialsLoading(false);
  }, [token, user]);

  // Initial load
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([fetchJobs(), fetchClock()]).finally(() => setLoading(false));
  }, [token, fetchJobs, fetchClock]);

  // Load tab data
  useEffect(() => {
    if (tab === 'products') fetchProducts();
    if (tab === 'equipment') fetchEquipment();
  }, [tab, fetchProducts, fetchEquipment]);

  // Load photos and materials when job selected
  useEffect(() => {
    if (selectedJob) {
      fetchPhotos();
      fetchJobMaterials(selectedJob.id);
    } else {
      setJobMaterials(null);
      setCheckedProducts({});
      setCheckedEquipment({});
    }
  }, [selectedJob, fetchPhotos, fetchJobMaterials]);

  // Clock elapsed timer
  useEffect(() => {
    if (!clockStatus?.clocked_in || !clockStatus?.clock_in_time) return;
    const update = () => {
      const diff = Date.now() - new Date(clockStatus.clock_in_time).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setClockElapsed(`${h}h ${m}m ${s}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [clockStatus]);

  // Clock in/out
  const handleClock = async (action) => {
    setClockLoading(true);
    const data = await API('/api/crew/clock', token, {
      method: 'POST',
      body: JSON.stringify({ action, quote_id: selectedJob?.id }),
    });
    if (data.success) {
      showMsg(action === 'clock_in' ? 'Clocked in!' : `Clocked out! ${data.hours_worked || 0}h logged`);
      fetchClock();
    } else {
      showMsg(data.error || 'Failed', 'error');
    }
    setClockLoading(false);
  };

  // Mark job complete
  const handleComplete = async (jobId) => {
    if (!confirm('Mark this job as complete?')) return;
    const data = await API('/api/crew/complete', token, {
      method: 'POST',
      body: JSON.stringify({ quote_id: jobId }),
    });
    if (data.success) {
      showMsg('Job marked complete!');
      fetchJobs();
      setSelectedJob(null);
    } else {
      showMsg(data.error || 'Failed', 'error');
    }
  };

  // Photo upload (base64)
  const handlePhotoUpload = async (e, mediaType) => {
    const file = e.target.files?.[0];
    if (!file || !selectedJob) return;
    setPhotoUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const data = await API('/api/crew/photos', token, {
          method: 'POST',
          body: JSON.stringify({
            quote_id: selectedJob.id,
            media_type: mediaType,
            url: reader.result,
          }),
        });
        if (data.success) {
          showMsg('Photo uploaded!');
          fetchPhotos();
        } else {
          showMsg(data.error || 'Failed to upload', 'error');
        }
        setPhotoUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      showMsg('Failed to upload', 'error');
      setPhotoUploading(false);
    }
  };

  // Log product usage
  const handleLogUsage = async () => {
    if (!selectedJob || !usageForm.product_id || !usageForm.amount_used) {
      showMsg('Select a product and enter amount', 'error');
      return;
    }
    const data = await API('/api/crew/products', token, {
      method: 'POST',
      body: JSON.stringify({
        quote_id: selectedJob.id,
        product_id: usageForm.product_id,
        amount_used: parseFloat(usageForm.amount_used),
        notes: usageForm.notes,
      }),
    });
    if (data.success) {
      showMsg('Product usage logged!');
      setUsageForm({ product_id: '', amount_used: '', notes: '' });
      fetchProducts();
    } else {
      showMsg(data.error || 'Failed', 'error');
    }
  };

  // Toggle product checked (log usage when checking, no undo)
  const handleToggleProduct = async (product) => {
    if (checkedProducts[product.id]) return; // already checked
    setCheckedProducts(prev => ({ ...prev, [product.id]: true }));
    // Log minimal usage to mark it as used
    await API('/api/crew/products', token, {
      method: 'POST',
      body: JSON.stringify({
        quote_id: selectedJob.id,
        product_id: product.id,
        amount_used: product.quantity_needed || 1,
        notes: 'Auto-logged from job checklist',
      }),
    });
  };

  // Toggle equipment checked (local only, no DB tracking needed)
  const handleToggleEquipment = (equipId) => {
    setCheckedEquipment(prev => ({ ...prev, [equipId]: !prev[equipId] }));
  };

  // Report missing item
  const handleReportMissing = async () => {
    if (!missingReport.item_name || !missingReport.type || !selectedJob) {
      showMsg('Select an item type and describe what is missing', 'error');
      return;
    }
    const data = await API(`/api/crew/jobs/${selectedJob.id}/materials`, token, {
      method: 'POST',
      body: JSON.stringify(missingReport),
    });
    if (data.success) {
      showMsg('Missing item reported!');
      setMissingReport({ type: '', item_id: '', item_name: '', notes: '' });
    } else {
      showMsg(data.error || 'Failed', 'error');
    }
  };

  // Report equipment issue
  const handleReportIssue = async () => {
    if (!issueForm.equipment_id || !issueForm.issue) {
      showMsg('Select equipment and describe the issue', 'error');
      return;
    }
    const data = await API('/api/crew/equipment', token, {
      method: 'POST',
      body: JSON.stringify(issueForm),
    });
    if (data.success) {
      showMsg('Issue reported!');
      setIssueForm({ equipment_id: '', issue: '' });
      fetchEquipment();
    } else {
      showMsg(data.error || 'Failed', 'error');
    }
  };

  const logout = () => {
    localStorage.removeItem('crew_token');
    localStorage.removeItem('crew_user');
    router.push('/crew/login');
  };

  if (loading || !user) {
    return (
      <div className="page-transition min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#1e3a5f]">
        <div className="text-white text-lg">{'Loading...'}</div>
      </div>
    );
  }

  const statusColors = {
    paid: 'bg-green-100 text-green-800',
    accepted: 'bg-blue-100 text-blue-800',
    scheduled: 'bg-purple-100 text-purple-800',
    in_progress: 'bg-v-gold/10 text-v-gold-muted',
  };

  const tabs = [
    { id: 'jobs', label: 'Jobs', icon: '📋' },
    ...(user.can_clock !== false ? [{ id: 'clock', label: 'Time Clock', icon: '⏱️' }] : []),
    ...(user.type === 'contractor' ? [{ id: 'earnings', label: 'Earnings', icon: '💰' }] : []),
    ...(user.can_see_inventory ? [{ id: 'products', label: 'Products', icon: '🧴' }] : []),
    ...(user.can_see_equipment ? [{ id: 'equipment', label: 'Equipment', icon: '🔧' }] : []),
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f]">
      {/* Header */}
      <div className="bg-[#0f172a]/80 border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg flex items-center gap-2">
            <span>✈️</span> {'Shiny Jets Crew'}
          </h1>
          <p className="text-white/60 text-sm">
            {user.name}
            {user.title && <span className="text-v-gold text-xs ml-1">{user.title}</span>}
            {!user.title && user.is_lead_tech && <span className="text-v-gold text-xs ml-1">Lead Tech</span>}
          </p>
        </div>
        <button onClick={logout} className="text-white/60 hover:text-white text-sm px-3 py-1 rounded border border-white/20">
          {'Logout'}
        </button>
      </div>

      {/* Toast */}
      {msg && (
        <div className={`toast-animate fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${
          msgType === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
        }`}>
          {msg}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-white/10 px-2 overflow-x-auto">
        {tabs.map(tb => (
          <button
            key={tb.id}
            onClick={() => { setTab(tb.id); setSelectedJob(null); }}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
              tab === tb.id ? 'text-v-gold border-b-2 border-v-gold' : 'text-white/60 hover:text-white'
            }`}
          >
            {tb.icon} {tb.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4 max-w-2xl mx-auto pb-24">

        {/* ===== JOBS TAB ===== */}
        {tab === 'jobs' && !selectedJob && (
          <div className="space-y-3">
            <h2 className="text-white font-semibold text-lg mb-3">{'Active Jobs'}</h2>
            {jobs.length === 0 && (
              <div className="text-white/50 text-center py-8">{'No active jobs'}</div>
            )}
            {jobs.map(job => (
              <button
                key={job.id}
                onClick={() => setSelectedJob(job)}
                className="w-full bg-white/10 backdrop-blur rounded-xl p-4 text-left hover:bg-white/15 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-white font-medium">{job.aircraft}</p>
                    <p className="text-white/60 text-sm">{job.airport || 'No airport'}</p>
                    {job.scheduled_date && (
                      <p className="text-white/50 text-xs mt-1">
                        {new Date(job.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[job.status] || 'bg-gray-100 text-gray-800'}`}>
                    {job.status?.replace('_', ' ')}
                  </span>
                </div>
                {job.services?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {job.services.map((s, i) => (
                      <span key={i} className="bg-white/10 text-white/70 text-xs px-2 py-0.5 rounded">
                        {s.description}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* ===== JOB DETAIL ===== */}
        {tab === 'jobs' && selectedJob && (
          <div className="space-y-4">
            <button onClick={() => setSelectedJob(null)} className="text-v-gold text-sm hover:underline">
              {'← Back to Jobs'}
            </button>

            <div className="bg-white/10 backdrop-blur rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-white font-bold text-xl">{selectedJob.aircraft}</h2>
                  <p className="text-white/60">{selectedJob.airport || 'No airport'}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[selectedJob.status] || 'bg-gray-100 text-gray-800'}`}>
                  {selectedJob.status?.replace('_', ' ')}
                </span>
              </div>

              {selectedJob.scheduled_date && (
                <p className="text-white/70 text-sm mb-2">
                  {'Scheduled'}: {new Date(selectedJob.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              )}

              {/* Lead tech contact info */}
              {user.is_lead_tech && (selectedJob.client_name || selectedJob.client_phone) && (
                <div className="bg-v-gold/10 border border-v-gold/30 rounded-lg p-3 mb-3">
                  <p className="text-v-gold text-xs font-medium mb-1">{'Client Contact (Lead Tech)'}</p>
                  {selectedJob.client_name && <p className="text-white text-sm">{selectedJob.client_name}</p>}
                  {selectedJob.client_phone && (
                    <a href={`tel:${selectedJob.client_phone}`} className="text-v-gold text-sm hover:underline">{selectedJob.client_phone}</a>
                  )}
                  {selectedJob.client_email && (
                    <a href={`mailto:${selectedJob.client_email}`} className="text-v-gold text-sm hover:underline block">{selectedJob.client_email}</a>
                  )}
                </div>
              )}

              {/* Services */}
              {selectedJob.services?.length > 0 && (
                <div className="mb-3">
                  <p className="text-white/50 text-xs uppercase tracking-wide mb-1">{'Services'}</p>
                  <div className="space-y-1">
                    {selectedJob.services.map((s, i) => (
                      <div key={i} className="text-white text-sm flex justify-between">
                        <span>{s.description}</span>
                        {s.hours > 0 && <span className="text-white/50">{s.hours}{'h'}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedJob.notes && (
                <div className="mb-3">
                  <p className="text-white/50 text-xs uppercase tracking-wide mb-1">{'Notes'}</p>
                  <p className="text-white/80 text-sm">{selectedJob.notes}</p>
                </div>
              )}

              {/* Products Needed */}
              {user.can_see_inventory && jobMaterials?.products?.length > 0 && (
                <div className="mb-3">
                  <p className="text-white/50 text-xs uppercase tracking-wide mb-2">{'Products Needed'}</p>
                  <div className="space-y-1">
                    {jobMaterials.products.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleToggleProduct(p)}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${
                          checkedProducts[p.id] ? 'bg-green-500/20' : 'bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        <span className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          checkedProducts[p.id] ? 'bg-green-500 border-green-500' : 'border-white/30'
                        }`}>
                          {checkedProducts[p.id] && <span className="text-white text-xs">✓</span>}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${checkedProducts[p.id] ? 'text-white/50 line-through' : 'text-white'}`}>
                            {p.name}
                          </p>
                          <p className="text-white/40 text-xs">
                            {p.quantity_needed > 0 && `${p.quantity_needed.toFixed(1)} ${p.unit}`}
                            {p.for_services?.length > 0 && ` · ${p.for_services.join(', ')}`}
                          </p>
                        </div>
                        {p.low_stock && (
                          <span className="text-red-400 text-xs font-medium px-2 py-0.5 bg-red-400/10 rounded">{'Low stock'}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Equipment Needed */}
              {user.can_see_equipment && jobMaterials?.equipment?.length > 0 && (
                <div className="mb-3">
                  <p className="text-white/50 text-xs uppercase tracking-wide mb-2">{'Equipment Needed'}</p>
                  <div className="space-y-1">
                    {jobMaterials.equipment.map(e => (
                      <button
                        key={e.id}
                        onClick={() => handleToggleEquipment(e.id)}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${
                          checkedEquipment[e.id] ? 'bg-green-500/20' : 'bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        <span className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          checkedEquipment[e.id] ? 'bg-green-500 border-green-500' : 'border-white/30'
                        }`}>
                          {checkedEquipment[e.id] && <span className="text-white text-xs">✓</span>}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${checkedEquipment[e.id] ? 'text-white/50 line-through' : 'text-white'}`}>
                            {e.name}
                          </p>
                          <p className="text-white/40 text-xs">
                            {[e.brand, e.model].filter(Boolean).join(' ')}
                            {e.for_services?.length > 0 && ` · ${e.for_services.join(', ')}`}
                          </p>
                        </div>
                        {e.status === 'needs_repair' && (
                          <span className="text-red-400 text-xs font-medium px-2 py-0.5 bg-red-400/10 rounded">{'Needs repair'}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Materials loading indicator */}
              {jobMaterialsLoading && (user.can_see_inventory || user.can_see_equipment) && (
                <p className="text-white/40 text-xs mb-3">{'Loading...'}</p>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 mt-4">
                {['paid', 'accepted', 'scheduled', 'in_progress'].includes(selectedJob.status) && user.can_mark_complete !== false && (
                  <button
                    onClick={() => handleComplete(selectedJob.id)}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-medium text-sm transition-colors"
                  >
                    Mark Complete
                  </button>
                )}
                {['paid', 'accepted', 'scheduled', 'in_progress'].includes(selectedJob.status) && (
                  <button
                    onClick={() => setShowIssueReport(true)}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-lg font-medium text-sm transition-colors"
                  >
                    Report Issue
                  </button>
                )}
              </div>

              {/* Issue Report Form */}
              {showIssueReport && (
                <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 mt-3">
                  <h4 className="text-amber-300 font-medium mb-2">Report an Issue</h4>
                  <textarea value={issueDescription} onChange={e => setIssueDescription(e.target.value)}
                    placeholder="Describe what you found..." rows={3}
                    className="w-full bg-black/20 border border-white/10 text-white rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-amber-400 resize-none placeholder-white/30" />
                  <label className="block mb-3">
                    <span className="text-xs text-white/50 mb-1 block">Photo (required)</span>
                    <input type="file" accept="image/*" capture="environment"
                      onChange={e => setIssuePhoto(e.target.files?.[0] || null)}
                      className="text-xs text-white/60" />
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => { setShowIssueReport(false); setIssueDescription(''); setIssuePhoto(null); }}
                      className="flex-1 py-2 text-sm text-white/60 border border-white/10 rounded-lg">Cancel</button>
                    <button disabled={!issueDescription.trim() || !issuePhoto || issueSending}
                      onClick={async () => {
                        setIssueSending(true);
                        try {
                          // Upload photo
                          let photoUrl = null;
                          if (issuePhoto) {
                            const reader = new FileReader();
                            photoUrl = await new Promise(resolve => { reader.onload = () => resolve(reader.result); reader.readAsDataURL(issuePhoto); });
                          }
                          const res = await API('/api/crew/change-order-request', token, {
                            method: 'POST',
                            body: JSON.stringify({ job_id: selectedJob.job_id || null, quote_id: selectedJob.id, photo_url: photoUrl, description: issueDescription }),
                          });
                          if (res.success) {
                            showMsg('Reported — your supervisor has been notified');
                            setShowIssueReport(false); setIssueDescription(''); setIssuePhoto(null);
                          } else {
                            showMsg(res.error || 'Failed to report', 'error');
                          }
                        } catch { showMsg('Failed to submit', 'error'); }
                        finally { setIssueSending(false); }
                      }}
                      className="flex-1 py-2 text-sm bg-amber-600 text-white rounded-lg font-medium disabled:opacity-50">
                      {issueSending ? 'Sending...' : 'Submit Report'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Photo upload section */}
            <div className="bg-white/10 backdrop-blur rounded-xl p-4">
              <h3 className="text-white font-semibold mb-3">{'Photos'}</h3>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {['before_photo', 'after_photo'].map(type => (
                  <label key={type} className="cursor-pointer bg-white/10 hover:bg-white/20 rounded-lg p-3 text-center transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => handlePhotoUpload(e, type)}
                      disabled={photoUploading}
                    />
                    <div className="text-2xl mb-1">{type === 'before_photo' ? '📸' : '✅'}</div>
                    <p className="text-white text-xs">{type === 'before_photo' ? 'Before Photo' : 'After Photo'}</p>
                  </label>
                ))}
              </div>
              {photoUploading && <p className="text-v-gold text-sm text-center">{'Uploading...'}</p>}
              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {photos.map(p => (
                    <div key={p.id} className="relative rounded-lg overflow-hidden">
                      <img src={p.url} alt={p.media_type} className="w-full h-20 object-cover" />
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5">
                        {p.media_type?.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Product usage on this job (if inventory access) */}
            {user.can_see_inventory && products.length === 0 && tab === 'jobs' && (
              <button onClick={() => { fetchProducts(); }} className="hidden">load</button>
            )}
            {user.can_see_inventory && (
              <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                <h3 className="text-white font-semibold mb-3">{'Log Product Usage'}</h3>
                {products.length === 0 ? (
                  <button onClick={fetchProducts} className="text-v-gold text-sm hover:underline">{'Load products'}</button>
                ) : (
                  <div className="space-y-2">
                    <select
                      value={usageForm.product_id}
                      onChange={e => setUsageForm(f => ({ ...f, product_id: e.target.value }))}
                      className="w-full bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm"
                    >
                      <option value="" className="text-gray-900">{'Select product'}</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id} className="text-gray-900">
                          {p.name} ({p.current_quantity} {p.unit} {'left'})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder={'Amount used'}
                      value={usageForm.amount_used}
                      onChange={e => setUsageForm(f => ({ ...f, amount_used: e.target.value }))}
                      className="w-full bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm placeholder-white/40"
                      step="1"
                      min="0"
                    />
                    <button
                      onClick={handleLogUsage}
                      className="w-full bg-v-gold-dim hover:bg-v-gold-dim text-white py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      {'Log Usage'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Report Missing Item */}
            {(user.can_see_inventory || user.can_see_equipment) && (
              <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                <h3 className="text-white font-semibold mb-3">{'Report Missing Item'}</h3>
                <div className="space-y-2">
                  <select
                    value={missingReport.type}
                    onChange={e => setMissingReport(f => ({ ...f, type: e.target.value, item_id: '', item_name: '' }))}
                    className="w-full bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm"
                  >
                    <option value="" className="text-gray-900">{'Select type...'}</option>
                    {user.can_see_inventory && <option value="product" className="text-gray-900">{'Products'}</option>}
                    {user.can_see_equipment && <option value="equipment" className="text-gray-900">{'Equipment'}</option>}
                  </select>
                  {missingReport.type === 'product' && jobMaterials?.products?.length > 0 && (
                    <select
                      value={missingReport.item_id}
                      onChange={e => {
                        const p = jobMaterials.products.find(x => x.id === e.target.value);
                        setMissingReport(f => ({ ...f, item_id: e.target.value, item_name: p?.name || '' }));
                      }}
                      className="w-full bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm"
                    >
                      <option value="" className="text-gray-900">{'Select product'}</option>
                      {jobMaterials.products.map(p => (
                        <option key={p.id} value={p.id} className="text-gray-900">{p.name}</option>
                      ))}
                    </select>
                  )}
                  {missingReport.type === 'equipment' && jobMaterials?.equipment?.length > 0 && (
                    <select
                      value={missingReport.item_id}
                      onChange={e => {
                        const eq = jobMaterials.equipment.find(x => x.id === e.target.value);
                        setMissingReport(f => ({ ...f, item_id: e.target.value, item_name: eq?.name || '' }));
                      }}
                      className="w-full bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm"
                    >
                      <option value="" className="text-gray-900">{'Select equipment'}</option>
                      {jobMaterials.equipment.map(e => (
                        <option key={e.id} value={e.id} className="text-gray-900">{e.name}</option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    placeholder={'Item name'}
                    value={missingReport.item_name}
                    onChange={e => setMissingReport(f => ({ ...f, item_name: e.target.value }))}
                    className="w-full bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm placeholder-white/40"
                  />
                  <textarea
                    placeholder={'Additional notes (optional)...'}
                    value={missingReport.notes}
                    onChange={e => setMissingReport(f => ({ ...f, notes: e.target.value }))}
                    className="w-full bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm placeholder-white/40 min-h-[60px]"
                  />
                  <button
                    onClick={handleReportMissing}
                    className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    {'Report Missing Item'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== CLOCK TAB ===== */}
        {tab === 'clock' && (
          <div className="space-y-4">
            <h2 className="text-white font-semibold text-lg">{'Time Clock'}</h2>

            <div className="bg-white/10 backdrop-blur rounded-xl p-6 text-center">
              {clockStatus?.clocked_in ? (
                <>
                  <div className="text-green-400 text-sm font-medium mb-2">{'Clocked In'}</div>
                  <div className="text-white text-4xl font-mono font-bold mb-4">{clockElapsed}</div>
                  <p className="text-white/50 text-sm mb-4">
                    {'Since'} {new Date(clockStatus.clock_in_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                  <button
                    onClick={() => handleClock('clock_out')}
                    disabled={clockLoading}
                    className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-4 rounded-xl font-bold text-lg transition-colors"
                  >
                    {clockLoading ? 'Processing...' : 'Clock Out'}
                  </button>
                </>
              ) : (
                <>
                  <div className="text-white/50 text-sm mb-4">{'Not clocked in'}</div>
                  <button
                    onClick={() => handleClock('clock_in')}
                    disabled={clockLoading}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-4 rounded-xl font-bold text-lg transition-colors"
                  >
                    {clockLoading ? 'Processing...' : 'Clock In'}
                  </button>
                </>
              )}

              {clockStatus?.today_hours > 0 && (
                <p className="text-white/50 text-sm mt-4">
                  {'Today:'} {clockStatus.today_hours.toFixed(2)} hours
                </p>
              )}
            </div>
          </div>
        )}

        {/* ===== PRODUCTS TAB ===== */}
        {tab === 'products' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-semibold text-lg">Inventory</h2>
              <button onClick={() => setShowAddProduct(v => !v)} className="px-3 py-1.5 text-xs bg-white/10 text-white border border-white/20 rounded-lg">
                {showAddProduct ? 'Cancel' : '+ Add Product'}
              </button>
            </div>

            {/* Add product form */}
            {showAddProduct && (
              <div className="bg-white/10 backdrop-blur rounded-xl p-4 space-y-2">
                <input value={newProduct.name} onChange={e => setNewProduct(p => ({...p, name: e.target.value}))} placeholder="Product name" className="w-full bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm placeholder-white/40" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" value={newProduct.size || ''} onChange={e => setNewProduct(p => ({...p, size: e.target.value}))} placeholder="Container size (e.g. 16)" className="bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm placeholder-white/40" />
                  <select value={newProduct.unit} onChange={e => setNewProduct(p => ({...p, unit: e.target.value}))} className="bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm">
                    <option value="oz">oz</option><option value="gallon">gallon</option><option value="ml">ml</option><option value="count">count</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" value={newProduct.quantity} onChange={e => setNewProduct(p => ({...p, quantity: e.target.value}))} placeholder="# of containers" className="bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm placeholder-white/40" />
                  <select value={newProduct.category} onChange={e => setNewProduct(p => ({...p, category: e.target.value}))} className="bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm">
                    <option value="cleaner">Cleaner</option><option value="wax">Wax</option><option value="polish">Polish</option><option value="ceramic">Ceramic</option><option value="degreaser">Degreaser</option><option value="other">Other</option>
                  </select>
                </div>
                <button onClick={async () => {
                  if (!newProduct.name) return;
                  const tk = localStorage.getItem('crew_token');
                  const res = await fetch('/api/crew/inventory', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(newProduct),
                  });
                  if (res.ok) {
                    const d = await res.json();
                    setProducts(prev => [...prev, d.product]);
                    setNewProduct({ name: '', quantity: '', unit: 'oz', category: 'cleaner', size: '' });
                    setShowAddProduct(false);
                  }
                }} className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium">Add Product</button>
              </div>
            )}

            {/* Product list with +/- controls */}
            {products.length === 0 && <div className="text-white/50 text-center py-8">No products yet</div>}
            {products.map(p => {
              const currentQty = inventoryChanges[p.id] !== undefined ? inventoryChanges[p.id] : p.quantity;
              const isLow = currentQty < 2;
              const changed = inventoryChanges[p.id] !== undefined && inventoryChanges[p.id] !== p.quantity;
              const sizeLabel = p.size ? `${p.size} ${p.unit || 'oz'}` : (p.unit || 'units');
              return (
                <div key={p.id} className={`bg-white/10 backdrop-blur rounded-xl p-4 ${isLow ? 'border border-amber-500/30' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium">{p.name}</p>
                      <p className="text-white/50 text-sm">{p.brand || p.category}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setInventoryChanges(prev => ({...prev, [p.id]: Math.max(0, (prev[p.id] !== undefined ? prev[p.id] : p.quantity) - 1)}))}
                        className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center text-lg font-bold hover:bg-white/20">&minus;</button>
                      <span className={`w-8 text-center font-semibold ${isLow ? 'text-amber-400' : 'text-white'} ${changed ? 'text-blue-400' : ''}`}>
                        {currentQty}
                      </span>
                      <button onClick={() => setInventoryChanges(prev => ({...prev, [p.id]: (prev[p.id] !== undefined ? prev[p.id] : p.quantity) + 1}))}
                        className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center text-lg font-bold hover:bg-white/20">+</button>
                      <span className="text-white/40 text-xs ml-1">{p.size ? `× ${sizeLabel}` : sizeLabel}</span>
                    </div>
                  </div>
                  {isLow && <p className="text-amber-400 text-xs mt-1">Low stock</p>}
                </div>
              );
            })}

            {/* Save button — only show when changes exist */}
            {Object.keys(inventoryChanges).length > 0 && (
              <button onClick={async () => {
                setInventorySaving(true);
                const tk = localStorage.getItem('crew_token');
                for (const [productId, quantity] of Object.entries(inventoryChanges)) {
                  try {
                    await fetch('/api/crew/inventory', {
                      method: 'PATCH',
                      headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ product_id: productId, quantity }),
                    });
                  } catch {}
                }
                // Refresh products
                try {
                  const res = await fetch('/api/crew/products', { headers: { Authorization: `Bearer ${tk}` } });
                  if (res.ok) { const d = await res.json(); setProducts(d.products || []); }
                } catch {}
                setInventoryChanges({});
                setInventorySaving(false);
              }} disabled={inventorySaving}
                className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors">
                {inventorySaving ? 'Saving...' : `Save Changes (${Object.keys(inventoryChanges).length} items)`}
              </button>
            )}
          </div>
        )}

        {/* ===== EQUIPMENT TAB ===== */}
        {tab === 'equipment' && (
          <div className="space-y-3">
            <h2 className="text-white font-semibold text-lg mb-3">{'Equipment'}</h2>
            {equipment.length === 0 && (
              <div className="text-white/50 text-center py-8">{'No products yet'}</div>
            )}
            {equipment.map(e => (
              <div key={e.id} className="bg-white/10 backdrop-blur rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-white font-medium">{e.name}</p>
                    <p className="text-white/50 text-sm">{e.brand} {e.model}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    e.status === 'active' ? 'bg-green-100 text-green-800' :
                    e.status === 'needs_repair' ? 'bg-red-100 text-red-800' :
                    e.status === 'maintenance' ? 'bg-v-gold/10 text-v-gold-muted' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {e.status?.replace('_', ' ')}
                  </span>
                </div>
                {e.needs_maintenance && (
                  <p className="text-v-gold text-xs mb-1">{'Maintenance due'}</p>
                )}
              </div>
            ))}

            {/* Report issue form */}
            <div className="bg-white/10 backdrop-blur rounded-xl p-4 mt-4">
              <h3 className="text-white font-semibold mb-3">{'Report an Issue'}</h3>
              <div className="space-y-2">
                <select
                  value={issueForm.equipment_id}
                  onChange={e => setIssueForm(f => ({ ...f, equipment_id: e.target.value }))}
                  className="w-full bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm"
                >
                  <option value="" className="text-gray-900">{'Select equipment'}</option>
                  {equipment.map(e => (
                    <option key={e.id} value={e.id} className="text-gray-900">{e.name}</option>
                  ))}
                </select>
                <textarea
                  placeholder={'Describe the issue...'}
                  value={issueForm.issue}
                  onChange={e => setIssueForm(f => ({ ...f, issue: e.target.value }))}
                  className="w-full bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm placeholder-white/40 min-h-[80px]"
                />
                <button
                  onClick={handleReportIssue}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {'Report an Issue'}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ===== EARNINGS TAB (Contractors) ===== */}
        {tab === 'earnings' && (
          <div className="space-y-4">
            <h2 className="text-white font-semibold text-lg">Earnings</h2>
            {(() => {
              const completedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'paid');
              const thisWeek = completedJobs.filter(j => {
                const d = new Date(j.completed_at || j.scheduled_date || j.created_at);
                const now = new Date();
                const weekAgo = new Date(now.getTime() - 7 * 86400000);
                return d >= weekAgo;
              });
              const rate = parseFloat(user.hourly_pay) || 0;
              const weekHours = thisWeek.reduce((s, j) => s + (parseFloat(j.actual_hours || j.total_hours) || 0), 0);
              const weekEarnings = weekHours * rate;
              return (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/10 backdrop-blur rounded-xl p-4 text-center">
                      <p className="text-white/50 text-xs uppercase tracking-wider mb-1">This Week</p>
                      <p className="text-2xl font-bold text-green-400">${weekEarnings.toFixed(0)}</p>
                      <p className="text-white/40 text-xs mt-1">{weekHours.toFixed(1)}h at ${rate}/hr</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur rounded-xl p-4 text-center">
                      <p className="text-white/50 text-xs uppercase tracking-wider mb-1">Jobs This Week</p>
                      <p className="text-2xl font-bold text-white">{thisWeek.length}</p>
                    </div>
                  </div>
                  <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                    <p className="text-white/50 text-xs uppercase tracking-wider mb-3">Recent Jobs</p>
                    {completedJobs.slice(0, 10).map(j => (
                      <div key={j.id} className="flex justify-between py-2 border-b border-white/5 last:border-0">
                        <div>
                          <p className="text-white text-sm">{j.aircraft_model || j.aircraft_type || 'Job'}</p>
                          <p className="text-white/40 text-xs">{new Date(j.completed_at || j.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-green-400 text-sm font-medium">${((parseFloat(j.actual_hours || j.total_hours) || 0) * rate).toFixed(0)}</p>
                          <p className="text-white/40 text-xs">{(parseFloat(j.actual_hours || j.total_hours) || 0).toFixed(1)}h</p>
                        </div>
                      </div>
                    ))}
                    {completedJobs.length === 0 && <p className="text-white/40 text-sm text-center py-4">No completed jobs yet</p>}
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
