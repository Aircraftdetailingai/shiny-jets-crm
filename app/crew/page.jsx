"use client";
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import BarcodeScanner from '@/components/BarcodeScanner';
import LanguageSelector from '@/components/LanguageSelector';
import { useTranslation } from '@/lib/i18n';

const API = (path, token, opts = {}) =>
  fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers } }).then(r => r.json());

export default function CrewDashboard() {
  const router = useRouter();
  const { t } = useTranslation();
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [tab, setTab] = useState('jobs');
  const [loading, setLoading] = useState(true);

  // Jobs state
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);

  // Assignments state
  const [assignments, setAssignments] = useState([]);
  const [pendingAssignments, setPendingAssignments] = useState(0);
  const [assignmentActioning, setAssignmentActioning] = useState(null);

  // Clock state
  const [clockStatus, setClockStatus] = useState(null);
  const [clockLoading, setClockLoading] = useState(false);
  const [clockElapsed, setClockElapsed] = useState('');
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState('clock_in'); // 'clock_in' | 'switch'

  // Photos state
  const [photos, setPhotos] = useState([]);
  const [photoUploading, setPhotoUploading] = useState(false);

  // Products state
  const [products, setProducts] = useState([]);
  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState(null); // { id, name }
  const [removingProductId, setRemovingProductId] = useState(null);
  const [usageForm, setUsageForm] = useState({ product_id: '', amount_used: '', notes: '' });
  const [inventoryChanges, setInventoryChanges] = useState({});
  const [inventorySaving, setInventorySaving] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [barcodeLookup, setBarcodeLookup] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', brand: '', quantity: '', unit: 'oz', category: 'cleaner', size: '', url: '', image_url: '' });
  const [scraping, setScraping] = useState(false);

  // Equipment state
  const [equipment, setEquipment] = useState([]);
  const [issueForm, setIssueForm] = useState({ equipment_id: '', issue: '' });

  // Job materials state (products & equipment needed for selected job)
  const [jobMaterials, setJobMaterials] = useState(null);
  const [jobMaterialsLoading, setJobMaterialsLoading] = useState(false);
  const [checkedProducts, setCheckedProducts] = useState({});
  const [checkedEquipment, setCheckedEquipment] = useState({});
  const [missingReport, setMissingReport] = useState({ type: '', item_id: '', item_name: '', notes: '' });

  // Schedule state
  const [scheduleJobs, setScheduleJobs] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleWeekOffset, setScheduleWeekOffset] = useState(0);
  const [scheduleVisibility, setScheduleVisibility] = useState(7);

  // Issue report state
  const [showIssueReport, setShowIssueReport] = useState(false);
  const [issueDescription, setIssueDescription] = useState('');
  const [issuePhoto, setIssuePhoto] = useState(null);
  const [issueSending, setIssueSending] = useState(false);

  // Notes state (read-only for crew)
  const [standingNotes, setStandingNotes] = useState([]);
  const [jobCrewNotes, setJobCrewNotes] = useState('');

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

  // Fetch assignments (pending + accepted job assignments)
  const fetchAssignments = useCallback(async () => {
    if (!token) return;
    const data = await API('/api/crew/assignments', token);
    if (data.assignments) {
      setAssignments(data.assignments);
      setPendingAssignments(data.assignments.filter(a => a.status === 'pending').length);
    }
  }, [token]);

  // Handle accept/decline of an assignment
  const handleAssignmentAction = async (assignmentId, action) => {
    setAssignmentActioning(assignmentId);

    // Optimistic: immediately remove from pending list
    setAssignments(prev => prev.map(a =>
      a.id === assignmentId ? { ...a, status: action === 'accept' ? 'accepted' : 'declined' } : a
    ));
    setPendingAssignments(prev => Math.max(0, prev - 1));

    const data = await API('/api/crew/assignments', token, {
      method: 'PATCH',
      body: JSON.stringify({ assignment_id: assignmentId, action }),
    });
    if (data.success) {
      showMsg(action === 'accept' ? 'Assignment accepted!' : 'Assignment declined');
      // Refetch real data (removes declined assignments entirely)
      await Promise.all([fetchAssignments(), fetchJobs()]);
    } else {
      showMsg(data.error || 'Failed', 'error');
      // Revert optimistic update
      await fetchAssignments();
    }
    setAssignmentActioning(null);
  };

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

  // Fetch schedule
  const fetchSchedule = useCallback(async () => {
    if (!token) return;
    setScheduleLoading(true);
    try {
      const data = await API('/api/crew/schedule', token);
      if (data.jobs) setScheduleJobs(data.jobs);
      if (data.visibility_days) setScheduleVisibility(data.visibility_days);
    } catch { /* ignore */ }
    setScheduleLoading(false);
  }, [token]);

  // Initial load
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([fetchJobs(), fetchClock(), fetchAssignments()]).finally(() => setLoading(false));
  }, [token, fetchJobs, fetchClock, fetchAssignments]);

  // Poll assignments every 30s
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => { fetchAssignments(); }, 30000);
    return () => clearInterval(interval);
  }, [token, fetchAssignments]);

  // Load tab data
  useEffect(() => {
    if (tab === 'products') fetchProducts();
    if (tab === 'equipment') fetchEquipment();
    if (tab === 'schedule') fetchSchedule();
  }, [tab, fetchProducts, fetchEquipment, fetchSchedule]);

  // Load photos, materials, and notes when job selected
  useEffect(() => {
    if (selectedJob) {
      fetchPhotos();
      fetchJobMaterials(selectedJob.id);
      // Fetch standing notes for this aircraft
      setStandingNotes([]);
      setJobCrewNotes(selectedJob.crew_notes || '');
      if (selectedJob.tail_number && token) {
        fetch(`/api/aircraft-notes?tail_number=${encodeURIComponent(selectedJob.tail_number)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.ok ? r.json() : { notes: [] })
          .then(d => setStandingNotes(d.notes || []))
          .catch(() => {});
      }
    } else {
      setJobMaterials(null);
      setCheckedProducts({});
      setCheckedEquipment({});
      setStandingNotes([]);
      setJobCrewNotes('');
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

  // Clock in/out/switch — action takes optional job object
  const handleClock = async (action, job = null) => {
    setClockLoading(true);
    // jobs list uses quote_id for quote-based jobs, but manual jobs from /api/crew/jobs use the jobs table id
    // The /api/crew/jobs route returns both in the same list; we pass both and let the API choose
    const body = { action };
    if (job) {
      // If this came from the jobs table (has _source flag), use job_id; otherwise quote_id
      if (job._source === 'jobs_table') body.job_id = job.id;
      else body.quote_id = job.id;
    }
    const data = await API('/api/crew/clock', token, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (data.success) {
      if (action === 'clock_in') {
        showMsg(`Clocked in${data.job_label ? ' · ' + data.job_label : ''}`);
      } else if (action === 'switch') {
        showMsg(`Switched to ${data.job_label || 'new job'} (${data.closed_hours || 0}h logged)`);
      } else {
        showMsg(`Clocked out · ${data.hours_worked || 0}h on ${data.job_label || 'job'}`);
      }
      fetchClock();
      setShowJobPicker(false);
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

  // Compress image client-side before upload
  const compressImage = (file, maxDim = 2000, quality = 0.85) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Compression failed')), 'image/jpeg', quality);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  };

  // Photo upload with client-side compression
  const handlePhotoUpload = async (e, mediaType) => {
    const file = e.target.files?.[0];
    if (!file || !selectedJob) return;
    setPhotoUploading(true);
    try {
      // Compress if image is over 3MB
      let processedFile = file;
      if (file.size > 3 * 1024 * 1024 && file.type.startsWith('image/')) {
        try {
          processedFile = await compressImage(file);
        } catch {
          // Fall back to original file
        }
      }

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const data = await API('/api/crew/photos', token, {
            method: 'POST',
            body: JSON.stringify({
              job_id: selectedJob.id,
              media_type: mediaType,
              photo_type: mediaType.startsWith('before') ? 'pre_job' : mediaType.startsWith('after') ? 'post_job' : 'in_progress',
              url: reader.result,
            }),
          });
          if (data.success) {
            showMsg('Photo uploaded!');
            fetchPhotos();
          } else {
            showMsg(data.error || 'Failed to upload photo', 'error');
          }
        } catch (err) {
          showMsg('Upload failed — photo may be too large. Try a smaller image.', 'error');
        }
        setPhotoUploading(false);
      };
      reader.onerror = () => {
        showMsg('Failed to read photo file', 'error');
        setPhotoUploading(false);
      };
      reader.readAsDataURL(processedFile);
    } catch (err) {
      showMsg('Failed to process photo: ' + (err.message || 'Unknown error'), 'error');
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
        job_id: selectedJob.id,
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
    { id: 'jobs', label: t('crew.jobs') || 'Jobs', icon: '📋' },
    ...(user.can_clock !== false ? [{ id: 'clock', label: t('crew.timeClock') || 'Time Clock', icon: '⏱️' }] : []),
    ...(user.type === 'contractor' ? [{ id: 'earnings', label: t('crew.earnings') || 'Earnings', icon: '💰' }] : []),
    ...(user.can_see_inventory ? [{ id: 'products', label: t('crew.inventory') || 'Inventory', icon: '🧴' }] : []),
    ...(user.can_see_equipment ? [{ id: 'equipment', label: t('crew.equipment') || 'Equipment', icon: '🔧' }] : []),
    { id: 'schedule', label: 'Schedule', icon: '📅' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f]">
      {/* Header */}
      <div className="bg-[#0f172a]/80 border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg flex items-center gap-2">
            <span>✈️</span> {'Shiny Jets Crew'}
          </h1>
          <p className="text-white/60 text-sm flex items-center gap-1.5">
            {clockStatus?.clocked_in && <span className="dot-pulse" />}
            {user.name}
            {user.title && <span className="text-v-gold text-xs ml-1">{user.title}</span>}
            {!user.title && user.is_lead_tech && <span className="text-v-gold text-xs ml-1">Lead Tech</span>}
            {clockStatus?.clocked_in && clockStatus?.clock_in_time && (
              <span className="text-green-400 text-[10px] ml-1">
                &middot; Clocked in {(() => {
                  const mins = Math.floor((Date.now() - new Date(clockStatus.clock_in_time).getTime()) / 60000);
                  return mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`;
                })()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSelector />
          <button onClick={logout} className="text-white/60 hover:text-white text-sm px-3 py-1 rounded border border-white/20">
            {'Logout'}
          </button>
        </div>
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
            {/* Pending assignments banner */}
            {pendingAssignments > 0 && (
              <button
                onClick={() => {
                  const el = document.getElementById('pending-assignments-list');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="w-full bg-amber-500/20 border border-amber-400/40 hover:bg-amber-500/25 rounded-xl p-4 text-left transition-colors flex items-center gap-3"
              >
                <span className="text-2xl">🔔</span>
                <div className="flex-1">
                  <p className="text-amber-200 font-semibold text-sm">
                    {`You have ${pendingAssignments} pending job assignment${pendingAssignments === 1 ? '' : 's'}`}
                  </p>
                  <p className="text-amber-200/70 text-xs">{'Tap to review and respond'}</p>
                </div>
                <span className="text-amber-200 text-xl">→</span>
              </button>
            )}

            {/* Pending assignment cards */}
            {pendingAssignments > 0 && (
              <div id="pending-assignments-list" className="space-y-3">
                <h2 className="text-white font-semibold text-lg mb-1">{'Pending Assignments'}</h2>
                {assignments.filter(a => a.status === 'pending').map(a => (
                  <div
                    key={a.id}
                    className="bg-white/10 backdrop-blur border border-amber-400/30 rounded-xl p-4"
                  >
                    <div className="mb-3">
                      <p className="text-white font-semibold text-base">
                        {a.aircraft || 'Aircraft'}{a.tail_number ? ` · ${a.tail_number}` : ''}
                      </p>
                      {a.customer_name && (
                        <p className="text-white/70 text-sm">{a.customer_name}</p>
                      )}
                      <p className="text-white/60 text-sm">{a.airport || 'Location TBD'}</p>
                      {a.scheduled_date && (
                        <p className="text-white/50 text-xs mt-1">
                          {new Date(a.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                      )}
                      {a.services?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {a.services.slice(0, 3).map((s, i) => (
                            <span key={i} className="bg-white/10 text-white/60 text-[10px] px-2 py-0.5 rounded">{s}</span>
                          ))}
                          {a.services.length > 3 && <span className="text-white/40 text-[10px]">+{a.services.length - 3}</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAssignmentAction(a.id, 'accept')}
                        disabled={assignmentActioning === a.id}
                        className="flex-1 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
                      >
                        {assignmentActioning === a.id ? '...' : 'Accept'}
                      </button>
                      <button
                        onClick={() => handleAssignmentAction(a.id, 'decline')}
                        disabled={assignmentActioning === a.id}
                        className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
                      >
                        {assignmentActioning === a.id ? '...' : 'Decline'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h2 className="text-white font-semibold text-lg mb-3">{'Active Jobs'}</h2>
            {jobs.length === 0 && pendingAssignments === 0 && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center">
                <p className="text-white/60 text-sm mb-1">No jobs assigned to you today</p>
                <p className="text-white/40 text-xs">When your team lead dispatches a job, it will appear here.</p>
              </div>
            )}
            {jobs.map(job => (
              <button
                key={job.id}
                onClick={() => setSelectedJob(job)}
                className="w-full bg-white/10 backdrop-blur rounded-xl p-4 text-left hover:bg-white/15 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-white font-medium">{job.aircraft}{job.tail_number ? ` · ${job.tail_number}` : ''}</p>
                    <p className="text-white/60 text-sm">{job.airport || ''}</p>
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
                  <p className="text-white/60">{selectedJob.airport || ''}</p>
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

              {/* Standing Notes + Crew Notes */}
              {(standingNotes.length > 0 || jobCrewNotes) && (
                <div className="bg-white/5 rounded-lg p-3 mb-3 space-y-3">
                  {standingNotes.length > 0 && (
                    <div>
                      <p className="text-white/50 text-xs uppercase tracking-wide mb-1.5">Aircraft Notes</p>
                      <ul className="space-y-1">
                        {standingNotes.map(n => (
                          <li key={n.id} className="text-white/80 text-sm flex items-start gap-2">
                            <span className="text-white/30 mt-0.5">&#8226;</span>
                            <span>{n.note}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {jobCrewNotes && (
                    <div>
                      <p className="text-white/50 text-xs uppercase tracking-wide mb-1.5">Job Notes</p>
                      <p className="text-white/80 text-sm">{jobCrewNotes}</p>
                    </div>
                  )}
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
            <h2 className="text-white font-semibold text-lg">Time Clock</h2>

            <div className="bg-white/10 backdrop-blur rounded-xl p-6 text-center">
              {clockStatus?.clocked_in ? (
                <>
                  <div className="text-green-400 text-[10px] uppercase tracking-wider font-semibold mb-2">On the Clock</div>
                  {clockStatus.current_job_label && (
                    <div className="text-white/90 text-base font-medium mb-3 px-3 py-2 bg-white/5 border border-white/10 rounded-lg">
                      {clockStatus.current_job_label}
                    </div>
                  )}
                  <div className="text-white text-5xl font-mono font-bold mb-2">{clockElapsed}</div>
                  <p className="text-white/40 text-xs mb-5">
                    Since {new Date(clockStatus.clock_in_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => { setPickerMode('switch'); setShowJobPicker(true); }}
                      disabled={clockLoading}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-4 rounded-xl font-semibold text-sm transition-colors"
                    >
                      Switch Job
                    </button>
                    <button
                      onClick={() => handleClock('clock_out')}
                      disabled={clockLoading}
                      className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-4 rounded-xl font-semibold text-sm transition-colors"
                    >
                      {clockLoading ? '...' : 'Clock Out'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-white/50 text-sm mb-5">Not clocked in</div>
                  <button
                    onClick={() => { setPickerMode('clock_in'); setShowJobPicker(true); }}
                    disabled={clockLoading}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-5 rounded-xl font-bold text-xl transition-colors"
                  >
                    {clockLoading ? 'Processing...' : 'Clock In'}
                  </button>
                </>
              )}

              {clockStatus?.today_hours > 0 && (
                <p className="text-white/50 text-xs mt-5 pt-5 border-t border-white/10">
                  Today: <span className="text-white font-semibold">{clockStatus.today_hours.toFixed(2)}h</span>
                </p>
              )}
            </div>

            {/* Adjust + Manual entry links */}
            <div className="flex justify-center gap-4 text-xs">
              {clockStatus?.clocked_in && clockStatus.entry_id && (
                <button
                  onClick={() => {
                    const newTime = prompt('Adjust clock-in time (HH:MM, 24h format):', new Date(clockStatus.clock_in_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
                    if (!newTime || !/^\d{1,2}:\d{2}$/.test(newTime)) return;
                    const [h, m] = newTime.split(':').map(Number);
                    const d = new Date(clockStatus.clock_in_time);
                    d.setHours(h, m, 0, 0);
                    const tk = localStorage.getItem('crew_token');
                    fetch('/api/crew/clock', {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'adjust_clock_in', entry_id: clockStatus.entry_id, new_clock_in: d.toISOString() }),
                    }).then(r => { if (r.ok) { showMsg('Start time adjusted'); fetchClock(); } else { showMsg('Failed to adjust', 'error'); } });
                  }}
                  className="text-white/40 hover:text-white/70 transition-colors"
                >
                  Adjust start time
                </button>
              )}
              <button
                onClick={() => {
                  const dateStr = prompt('Date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
                  if (!dateStr) return;
                  const startStr = prompt('Start time (HH:MM):', '06:00');
                  if (!startStr) return;
                  const endStr = prompt('End time (HH:MM):', '12:00');
                  if (!endStr) return;
                  const clockIn = new Date(`${dateStr}T${startStr}:00`);
                  const clockOut = new Date(`${dateStr}T${endStr}:00`);
                  if (isNaN(clockIn.getTime()) || isNaN(clockOut.getTime())) { showMsg('Invalid time', 'error'); return; }
                  const tk = localStorage.getItem('crew_token');
                  fetch('/api/crew/clock', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'manual_entry', clock_in: clockIn.toISOString(), clock_out: clockOut.toISOString(), date: dateStr }),
                  }).then(r => r.json()).then(d => {
                    if (d.success) { showMsg(`Logged ${d.hours_worked}h`); fetchClock(); } else { showMsg(d.error || 'Failed', 'error'); }
                  });
                }}
                className="text-white/40 hover:text-white/70 transition-colors"
              >
                + Add missed entry
              </button>
            </div>
          </div>
        )}

        {/* ===== JOB PICKER MODAL (for clock_in / switch) ===== */}
        {showJobPicker && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={() => !clockLoading && setShowJobPicker(false)}>
            <div onClick={e => e.stopPropagation()} className="bg-[#0f1623] border border-white/10 rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
              <div className="sticky top-0 bg-[#0f1623] border-b border-white/10 px-5 py-4 flex items-center justify-between">
                <h3 className="text-white font-semibold text-lg">
                  {pickerMode === 'switch' ? 'Switch Job' : 'Select Aircraft'}
                </h3>
                <button
                  onClick={() => !clockLoading && setShowJobPicker(false)}
                  disabled={clockLoading}
                  className="text-white/50 hover:text-white text-2xl leading-none disabled:opacity-50"
                >
                  &times;
                </button>
              </div>
              <div className="p-5 space-y-2">
                {jobs.length === 0 ? (
                  <p className="text-white/50 text-sm text-center py-6">No active jobs assigned to you</p>
                ) : (
                  jobs
                    .filter(j => {
                      // In switch mode, hide the job we're currently clocked into
                      if (pickerMode !== 'switch') return true;
                      const currentId = clockStatus?.current_job_id || clockStatus?.current_quote_id;
                      return j.id !== currentId;
                    })
                    .map(j => (
                      <button
                        key={j.id}
                        onClick={() => handleClock(pickerMode === 'switch' ? 'switch' : 'clock_in', j)}
                        disabled={clockLoading}
                        className="w-full text-left p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors disabled:opacity-50"
                      >
                        <p className="text-white font-medium text-sm">{j.aircraft || 'Aircraft'}</p>
                        {j.airport && <p className="text-white/50 text-xs mt-0.5">{j.airport}</p>}
                        {j.scheduled_date && (
                          <p className="text-white/40 text-[10px] mt-1">
                            {new Date(j.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        )}
                      </button>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== PRODUCTS TAB ===== */}
        {tab === 'products' && (() => {
          const sortedProducts = [...products].sort((a, b) => {
            const aQty = inventoryChanges[a.id] !== undefined ? inventoryChanges[a.id] : a.quantity;
            const bQty = inventoryChanges[b.id] !== undefined ? inventoryChanges[b.id] : b.quantity;
            const aLow = aQty < 2;
            const bLow = bQty < 2;
            if (aLow && !bLow) return -1;
            if (!aLow && bLow) return 1;
            return 0;
          });
          const lowStockCount = sortedProducts.filter(p => {
            const qty = inventoryChanges[p.id] !== undefined ? inventoryChanges[p.id] : p.quantity;
            return qty < 2;
          }).length;
          return (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-semibold text-lg">{t('crew.inventory')}</h2>
              <button onClick={() => setShowAddProduct(true)} className="px-3 py-1.5 text-xs bg-white/10 text-white border border-white/20 rounded-lg">
                + {t('crew.addProduct')}
              </button>
            </div>

            {/* Low stock summary */}
            {lowStockCount > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center gap-2">
                <span className="text-amber-400 text-lg">&#9888;</span>
                <p className="text-amber-400 text-sm font-medium">
                  {lowStockCount} {lowStockCount !== 1 ? t('crew.items') || 'items' : t('crew.item') || 'item'} {t('crew.runningLowOn')}
                </p>
              </div>
            )}

            {/* Product list with +/- controls */}
            {sortedProducts.length === 0 && <div className="text-white/50 text-center py-8">{t('crew.noProductsYet')}</div>}
            {sortedProducts.map(p => {
              const currentQty = inventoryChanges[p.id] !== undefined ? inventoryChanges[p.id] : p.quantity;
              const isLow = currentQty < 2;
              const changed = inventoryChanges[p.id] !== undefined && inventoryChanges[p.id] !== p.quantity;
              const sizeLabel = p.size ? `${p.size} ${p.unit || 'oz'}` : (p.unit || 'units');
              const removing = removingProductId === p.id;
              return (
                <div key={p.id} className={`bg-white/10 backdrop-blur rounded-xl p-4 transition-all duration-300 ${isLow ? 'border border-amber-500/50' : ''} ${removing ? 'opacity-0 scale-95' : 'opacity-100'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {p.image_url && (
                        <img src={p.image_url} alt="" className="w-10 h-10 rounded-lg object-cover bg-white/5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">{p.name}</p>
                        <p className="text-white/50 text-sm truncate">{p.brand || p.category}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => setInventoryChanges(prev => ({...prev, [p.id]: Math.max(0, (prev[p.id] !== undefined ? prev[p.id] : p.quantity) - 1)}))}
                        className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center text-lg font-bold hover:bg-white/20">&minus;</button>
                      <span className={`w-8 text-center font-semibold ${isLow ? 'text-amber-400' : 'text-white'} ${changed ? 'text-blue-400' : ''}`}>
                        {currentQty}
                      </span>
                      <button onClick={() => setInventoryChanges(prev => ({...prev, [p.id]: (prev[p.id] !== undefined ? prev[p.id] : p.quantity) + 1}))}
                        className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center text-lg font-bold hover:bg-white/20">+</button>
                      <span className="text-white/40 text-xs ml-1">{p.size ? `× ${sizeLabel}` : sizeLabel}</span>
                      <button onClick={() => setConfirmDeleteProduct({ id: p.id, name: p.name })}
                        aria-label="Remove product"
                        className="ml-1 w-8 h-8 rounded-full text-red-400/70 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  {isLow && (
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-semibold uppercase tracking-wider">
                      &#9888; Low Stock
                    </div>
                  )}
                </div>
              );
            })}

            {/* Delete confirmation modal */}
            {confirmDeleteProduct && (
              <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setConfirmDeleteProduct(null)}>
                <div className="bg-[#0f1623] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
                    </div>
                    <h3 className="text-white font-semibold text-base">Remove Product</h3>
                  </div>
                  <p className="text-white/70 text-sm mb-5">
                    Remove <span className="text-white font-medium">{confirmDeleteProduct.name}</span> from inventory?
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmDeleteProduct(null)}
                      className="flex-1 px-4 py-2.5 text-sm text-white/70 border border-white/10 rounded-lg hover:bg-white/5 transition-colors">
                      Cancel
                    </button>
                    <button onClick={async () => {
                      const productId = confirmDeleteProduct.id;
                      setRemovingProductId(productId);
                      setConfirmDeleteProduct(null);
                      const tk = localStorage.getItem('crew_token');
                      try {
                        await fetch('/api/crew/inventory', {
                          method: 'DELETE',
                          headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
                          body: JSON.stringify({ product_id: productId }),
                        });
                        // Wait for fade animation
                        setTimeout(() => {
                          setProducts(prev => prev.filter(x => x.id !== productId));
                          setInventoryChanges(prev => {
                            const next = { ...prev };
                            delete next[productId];
                            return next;
                          });
                          setRemovingProductId(null);
                        }, 300);
                      } catch {
                        setRemovingProductId(null);
                      }
                    }}
                      className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors">
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )}

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
          );
        })()}

        {/* Add Product Modal */}
        {showAddProduct && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={() => setShowAddProduct(false)}>
            <div onClick={e => e.stopPropagation()} className="bg-[#0f1623] border border-white/10 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-[#0f1623] border-b border-white/10 px-5 py-4 flex items-center justify-between">
                <h3 className="text-white font-semibold text-lg">{t('crew.addProduct')}</h3>
                <button onClick={() => setShowAddProduct(false)} className="text-white/50 hover:text-white text-2xl leading-none">&times;</button>
              </div>
              <div className="p-5 space-y-3">
                {/* Scan Barcode */}
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500/15 border border-blue-500/30 text-blue-300 text-sm font-semibold rounded-lg hover:bg-blue-500/25 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z"/>
                  </svg>
                  {barcodeLookup ? 'Looking up...' : 'Scan Barcode'}
                </button>

                {/* URL + Auto-fill */}
                <div>
                  <label className="block text-white/60 text-xs uppercase tracking-wider mb-1">Product URL (optional)</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={newProduct.url}
                      onChange={e => setNewProduct(p => ({...p, url: e.target.value}))}
                      placeholder="https://flyshiny.com/..."
                      className="flex-1 bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm placeholder-white/40"
                    />
                    <button
                      disabled={!newProduct.url || scraping}
                      onClick={async () => {
                        if (!newProduct.url) return;
                        setScraping(true);
                        try {
                          const tk = localStorage.getItem('crew_token');
                          const res = await fetch('/api/products/scrape', {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: newProduct.url }),
                          });
                          if (res.ok) {
                            const d = await res.json();
                            setNewProduct(p => ({
                              ...p,
                              name: d.name || p.name,
                              brand: d.brand || d.supplier || p.brand,
                              size: d.size ? String(d.size).replace(/[^0-9.]/g, '') : p.size,
                              category: d.category || p.category,
                              image_url: d.image || p.image_url,
                            }));
                          }
                        } catch {}
                        finally { setScraping(false); }
                      }}
                      className="px-3 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs font-semibold rounded-lg disabled:opacity-50 whitespace-nowrap">
                      {scraping ? 'Loading...' : 'Auto-fill'}
                    </button>
                  </div>
                </div>

                {/* Image preview */}
                {newProduct.image_url && (
                  <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-lg">
                    <img src={newProduct.image_url} alt="" className="w-16 h-16 rounded-lg object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{newProduct.name}</p>
                      <p className="text-white/50 text-xs truncate">{newProduct.brand}</p>
                    </div>
                  </div>
                )}

                {/* Product name */}
                <div>
                  <label className="block text-white/60 text-xs uppercase tracking-wider mb-1">Name *</label>
                  <input
                    value={newProduct.name}
                    onChange={e => setNewProduct(p => ({...p, name: e.target.value}))}
                    placeholder="Product name"
                    className="w-full bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm placeholder-white/40"
                  />
                </div>

                {/* Brand/Supplier */}
                <div>
                  <label className="block text-white/60 text-xs uppercase tracking-wider mb-1">Brand / Supplier</label>
                  <input
                    value={newProduct.brand}
                    onChange={e => setNewProduct(p => ({...p, brand: e.target.value}))}
                    placeholder="e.g. Fly Shiny"
                    className="w-full bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm placeholder-white/40"
                  />
                </div>

                {/* Container size + unit */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-white/60 text-xs uppercase tracking-wider mb-1">Container Size</label>
                    <input
                      type="number"
                      value={newProduct.size}
                      onChange={e => setNewProduct(p => ({...p, size: e.target.value}))}
                      placeholder="16"
                      className="w-full bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm placeholder-white/40"
                    />
                  </div>
                  <div>
                    <label className="block text-white/60 text-xs uppercase tracking-wider mb-1">Unit</label>
                    <select value={newProduct.unit} onChange={e => setNewProduct(p => ({...p, unit: e.target.value}))} className="w-full bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm">
                      <option value="oz">oz</option>
                      <option value="gallon">gallon</option>
                      <option value="ml">ml</option>
                      <option value="lb">lb</option>
                      <option value="count">count</option>
                    </select>
                  </div>
                </div>

                {/* Quantity + category */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-white/60 text-xs uppercase tracking-wider mb-1">Quantity on Hand</label>
                    <input
                      type="number"
                      value={newProduct.quantity}
                      onChange={e => setNewProduct(p => ({...p, quantity: e.target.value}))}
                      placeholder="# of containers"
                      className="w-full bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm placeholder-white/40"
                    />
                  </div>
                  <div>
                    <label className="block text-white/60 text-xs uppercase tracking-wider mb-1">Category</label>
                    <select value={newProduct.category} onChange={e => setNewProduct(p => ({...p, category: e.target.value}))} className="w-full bg-white/10 text-white border border-white/20 rounded-lg p-2 text-sm">
                      <option value="cleaner">Cleaner</option>
                      <option value="polish">Polish</option>
                      <option value="coating">Coating</option>
                      <option value="wax">Wax</option>
                      <option value="solvent">Solvent</option>
                      <option value="tool">Tool</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Submit */}
                <button
                  disabled={!newProduct.name}
                  onClick={async () => {
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
                      setNewProduct({ name: '', brand: '', quantity: '', unit: 'oz', category: 'cleaner', size: '', url: '', image_url: '' });
                      setShowAddProduct(false);
                    }
                  }}
                  className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors">
                  {t('crew.addProduct')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Barcode Scanner */}
        <BarcodeScanner
          isOpen={showScanner}
          onClose={() => setShowScanner(false)}
          onDetected={async (upc) => {
            setShowScanner(false);
            setBarcodeLookup(true);
            const safetyTimer = setTimeout(() => setBarcodeLookup(false), 10000);
            try {
              const tk = localStorage.getItem('crew_token');
              const res = await fetch(`/api/products/barcode?upc=${encodeURIComponent(upc)}`, {
                headers: { Authorization: `Bearer ${tk}` },
                signal: AbortSignal.timeout(8000),
              });
              if (res.ok) {
                const d = await res.json();
                if (d.found && d.product) {
                  setNewProduct(p => ({
                    ...p,
                    name: d.product.name || p.name,
                    brand: d.product.brand || p.brand,
                    size: d.product.size != null ? String(d.product.size) : p.size,
                    unit: d.product.unit || p.unit,
                    category: d.product.category || p.category,
                    image_url: d.product.image_url || p.image_url,
                    url: d.product.product_url || p.url,
                  }));
                  showMsg(d.product.product_url ? 'Product found — reorder link saved' : 'Product found');
                } else {
                  // Not found — populate with barcode hint so user knows it scanned
                  setNewProduct(p => ({ ...p, name: d.hint || upc }));
                  showMsg('Product not found — enter details manually');
                }
              } else {
                const e = await res.json().catch(() => ({}));
                // Lookup failed — silently let user type manually
              }
            } catch (e) {
              // Lookup exception — silently let user type manually
            } finally {
              setBarcodeLookup(false);
            }
          }}
        />
        {/* End Add Product modal */}

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

        {/* ===== SCHEDULE TAB ===== */}
        {tab === 'schedule' && (() => {
          const getWeekDates = (offset) => {
            const now = new Date();
            const dayOfWeek = now.getDay();
            const monday = new Date(now);
            monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + (offset * 7));
            monday.setHours(0, 0, 0, 0);
            const days = [];
            for (let i = 0; i < 7; i++) {
              const d = new Date(monday);
              d.setDate(monday.getDate() + i);
              days.push(d);
            }
            return days;
          };

          const weekDates = getWeekDates(scheduleWeekOffset);
          const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
          const todayStr = new Date().toISOString().split('T')[0];

          const getJobsForDate = (date) => {
            const dateStr = date.toISOString().split('T')[0];
            return scheduleJobs.filter(j => j.scheduled_date === dateStr);
          };

          const statusColors = {
            accepted: 'bg-blue-500/20 border-blue-400/40 text-blue-200',
            paid: 'bg-green-500/20 border-green-400/40 text-green-200',
            scheduled: 'bg-purple-500/20 border-purple-400/40 text-purple-200',
            in_progress: 'bg-amber-500/20 border-amber-400/40 text-amber-200',
          };

          const weekLabel = `${weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

          return (
            <div className="space-y-4">
              {/* Week navigation */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setScheduleWeekOffset(prev => prev - 1)}
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded transition-colors"
                >
                  &larr; Prev
                </button>
                <div className="text-center">
                  <p className="text-white font-semibold text-sm">{weekLabel}</p>
                  {scheduleWeekOffset !== 0 && (
                    <button
                      onClick={() => setScheduleWeekOffset(0)}
                      className="text-v-gold text-xs hover:underline mt-0.5"
                    >
                      Current Week
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setScheduleWeekOffset(prev => prev + 1)}
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded transition-colors"
                >
                  Next &rarr;
                </button>
              </div>

              {scheduleLoading ? (
                <div className="text-white/50 text-center py-8">Loading schedule...</div>
              ) : (
                <>
                  {/* Desktop: 7-column grid */}
                  <div className="hidden sm:grid grid-cols-7 gap-1">
                    {weekDates.map((date, i) => {
                      const dateStr = date.toISOString().split('T')[0];
                      const isToday = dateStr === todayStr;
                      const dayJobs = getJobsForDate(date);
                      return (
                        <div key={i} className={`rounded-lg p-2 min-h-[120px] ${isToday ? 'bg-v-gold/10 border border-v-gold/30' : 'bg-white/5 border border-white/10'}`}>
                          <div className="text-center mb-2">
                            <p className={`text-[10px] uppercase tracking-wider ${isToday ? 'text-v-gold font-bold' : 'text-white/50'}`}>{dayNames[i]}</p>
                            <p className={`text-lg font-bold ${isToday ? 'text-v-gold' : 'text-white/80'}`}>{date.getDate()}</p>
                          </div>
                          <div className="space-y-1">
                            {dayJobs.map(job => (
                              <div key={job.id} className={`rounded p-1.5 border text-[10px] leading-tight ${statusColors[job.status] || 'bg-white/10 border-white/20 text-white/70'}`}>
                                <p className="font-semibold truncate">{job.aircraft_model || job.title}</p>
                                {job.tail_number && <p className="opacity-70">{job.tail_number}</p>}
                                {job.scheduled_time && <p className="opacity-70">{job.scheduled_time}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Mobile: stacked day view */}
                  <div className="sm:hidden space-y-2">
                    {weekDates.map((date, i) => {
                      const dateStr = date.toISOString().split('T')[0];
                      const isToday = dateStr === todayStr;
                      const dayJobs = getJobsForDate(date);
                      return (
                        <div key={i} className={`rounded-lg overflow-hidden ${isToday ? 'border border-v-gold/30' : 'border border-white/10'}`}>
                          <div className={`px-3 py-2 flex items-center justify-between ${isToday ? 'bg-v-gold/15' : 'bg-white/5'}`}>
                            <span className={`text-xs font-semibold ${isToday ? 'text-v-gold' : 'text-white/60'}`}>
                              {dayNames[i]} {date.getDate()}
                            </span>
                            {dayJobs.length > 0 && (
                              <span className="text-[10px] text-white/40">{dayJobs.length} job{dayJobs.length > 1 ? 's' : ''}</span>
                            )}
                          </div>
                          {dayJobs.length > 0 && (
                            <div className="px-3 py-2 space-y-1.5 bg-white/[0.02]">
                              {dayJobs.map(job => (
                                <div key={job.id} className={`rounded-lg p-2.5 border ${statusColors[job.status] || 'bg-white/10 border-white/20 text-white/70'}`}>
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold">{job.aircraft_model || job.title}</p>
                                    {job.scheduled_time && <span className="text-[10px] opacity-70">{job.scheduled_time}</span>}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {job.tail_number && <span className="text-[10px] opacity-70">{job.tail_number}</span>}
                                    {job.airport && <span className="text-[10px] opacity-70">{job.airport}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {scheduleJobs.length === 0 && (
                    <div className="text-white/50 text-center py-8">
                      <p className="text-2xl mb-2">📅</p>
                      <p className="text-sm">No jobs scheduled in your visibility window ({scheduleVisibility} days)</p>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
