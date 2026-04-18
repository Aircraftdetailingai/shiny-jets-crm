"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';

function toISODate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDateColumns() {
  const cols = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = toISODate(d);
    let label;
    if (i === 0) label = 'Today';
    else if (i === 1) label = 'Tomorrow';
    else {
      label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
    cols.push({ iso, label });
  }
  return cols;
}

function groupJobsByDate(jobs) {
  const groups = { unassigned: [] };
  for (const job of jobs || []) {
    if (!job.scheduled_date) {
      groups.unassigned.push(job);
      continue;
    }
    const iso = String(job.scheduled_date).slice(0, 10);
    if (!groups[iso]) groups[iso] = [];
    groups[iso].push(job);
  }
  return groups;
}

function initialsOf(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function jobStatusFromAssignments(job) {
  const assignments = job.assignments || [];
  if (assignments.length === 0) return { label: 'Unassigned', tone: 'muted' };
  const allAccepted = assignments.every(a => a.status === 'accepted');
  if (allAccepted) return { label: 'Accepted', tone: 'accepted' };
  const anyAccepted = assignments.some(a => a.status === 'accepted');
  if (anyAccepted) return { label: 'Partial', tone: 'partial' };
  return { label: 'Pending', tone: 'pending' };
}

function JobCard({ job, onOpen, onDragStart }) {
  const assignments = job.assignments || [];
  const status = jobStatusFromAssignments(job);
  const shown = assignments.slice(0, 3);
  const extra = assignments.length - shown.length;

  const toneClass =
    status.tone === 'accepted'
      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
      : status.tone === 'partial'
      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
      : status.tone === 'pending'
      ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
      : 'bg-v-surface-light/30 text-v-text-secondary border border-v-border';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, job)}
      onClick={() => onOpen(job)}
      className="bg-v-surface border border-v-border rounded p-3 mb-2 cursor-pointer hover:border-v-gold/50 transition-colors select-none"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-v-text-primary text-sm font-medium truncate">
              {job.aircraft_model || 'Aircraft'}
            </p>
            {job.schedule_override && (
              <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-400 border border-amber-400/40 px-1.5 py-0.5 rounded whitespace-nowrap">After Hours</span>
            )}
          </div>
          <p className="text-v-text-secondary text-xs truncate">
            {job.tail_number || ''}
          </p>
        </div>
        <span className={`text-[9px] uppercase px-2 py-0.5 rounded tracking-widest whitespace-nowrap ${toneClass}`}>
          {status.label}
        </span>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-v-text-secondary mb-2">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="truncate">{job.airport || job.location || '—'}</span>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-v-text-secondary mb-2">
        <span>{(job.services || []).length} svc</span>
        <span>&middot;</span>
        <span>{job.estimated_hours ? `${job.estimated_hours}h` : '—'}</span>
      </div>

      {assignments.length > 0 && (
        <div className="flex items-center gap-1 pt-2 border-t border-v-border">
          {shown.map((a, i) => (
            <div
              key={a.id || i}
              title={a.team_member_name || ''}
              className="w-6 h-6 rounded-full border border-v-gold/50 flex items-center justify-center text-v-gold text-[9px] font-medium bg-v-charcoal"
            >
              {initialsOf(a.team_member_name)}
            </div>
          ))}
          {extra > 0 && (
            <span className="text-[10px] text-v-text-secondary ml-1">+{extra} more</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function DispatchPage() {
  const router = useRouter();

  const [jobs, setJobs] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [planRequired, setPlanRequired] = useState(false);
  const [userPlan, setUserPlan] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState({});
  const [toast, setToast] = useState('');
  const [dispatching, setDispatching] = useState(false);

  const getToken = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('vector_token');
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadBoard = useCallback(async () => {
    const token = getToken();
    if (!token) {
      router.push('/login');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/dispatch/board', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        if (data?.error === 'plan_required') {
          setPlanRequired(true);
          setUserPlan(data.plan || '');
          setLoading(false);
          return;
        }
      }
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      setJobs(data.jobs || []);
      setTeamMembers(data.team_members || []);
      setUserPlan(data.plan || '');
      setPlanRequired(false);
    } catch (err) {
      console.error('Failed to load dispatch board', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  // Fetch suggestions when a job is selected
  useEffect(() => {
    if (!selectedJob) {
      setSuggestions([]);
      setSelectedMemberIds([]);
      return;
    }
    // Pre-select currently assigned members
    const existing = (selectedJob.assignments || []).map(a => a.team_member_id);
    setSelectedMemberIds(existing);

    const token = getToken();
    if (!token) return;
    const date = selectedJob.scheduled_date
      ? String(selectedJob.scheduled_date).slice(0, 10)
      : toISODate(new Date());
    fetch(`/api/dispatch/suggest?job_id=${selectedJob.id}&date=${date}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : { suggestions: [] }))
      .then(data => setSuggestions(data.suggestions || []))
      .catch(() => setSuggestions([]));
  }, [selectedJob]);

  const dateColumns = useMemo(() => getDateColumns(), []);
  const jobsByDate = useMemo(() => groupJobsByDate(jobs), [jobs]);
  const unassigned = jobsByDate.unassigned || [];

  const handleDragStart = (e, job) => {
    try {
      e.dataTransfer.setData('text/plain', String(job.id));
      e.dataTransfer.effectAllowed = 'move';
    } catch {}
  };

  const handleDropOnDate = async (e, iso) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData('text/plain');
    if (!jobId) return;

    const token = getToken();
    if (!token) return;

    setAssignmentsLoading(prev => ({ ...prev, [jobId]: true }));
    try {
      const res = await fetch('/api/dispatch/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ job_id: jobId, scheduled_date: iso }),
      });
      if (res.ok) {
        setJobs(prev =>
          prev.map(j => (String(j.id) === String(jobId) ? { ...j, scheduled_date: iso } : j))
        );
        showToast('Job scheduled');
      } else {
        showToast('Failed to schedule job');
      }
    } catch (err) {
      showToast('Failed to schedule job');
    } finally {
      setAssignmentsLoading(prev => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
    }
  };

  const toggleMember = (memberId) => {
    setSelectedMemberIds(prev =>
      prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId]
    );
  };

  const handleUnassign = async (memberId) => {
    if (!selectedJob) return;
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch('/api/dispatch/assign', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ job_id: selectedJob.id, team_member_id: memberId }),
      });
      if (res.ok) {
        const updatedAssignments = (selectedJob.assignments || []).filter(
          a => a.team_member_id !== memberId
        );
        const updated = { ...selectedJob, assignments: updatedAssignments };
        setSelectedJob(updated);
        setJobs(prev => prev.map(j => (j.id === selectedJob.id ? updated : j)));
        setSelectedMemberIds(prev => prev.filter(id => id !== memberId));
        showToast('Unassigned');
      }
    } catch {
      showToast('Failed to unassign');
    }
  };

  const handleDispatch = async () => {
    if (!selectedJob) return;
    const token = getToken();
    if (!token) return;
    setDispatching(true);
    try {
      const res = await fetch('/api/dispatch/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          job_id: selectedJob.id,
          team_member_ids: selectedMemberIds,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const newAssignments =
          data.assignments ||
          selectedMemberIds.map(id => {
            const m = teamMembers.find(tm => tm.id === id);
            return {
              team_member_id: id,
              team_member_name: m?.name,
              status: 'pending',
            };
          });
        const updated = { ...selectedJob, assignments: newAssignments };
        setSelectedJob(updated);
        setJobs(prev => prev.map(j => (j.id === selectedJob.id ? updated : j)));
        showToast('Dispatched — notifications sent');
      } else {
        showToast('Failed to dispatch');
      }
    } catch {
      showToast('Failed to dispatch');
    } finally {
      setDispatching(false);
    }
  };

  // Build list: suggested first, then alphabetical
  const sortedTeam = useMemo(() => {
    const suggestionMap = new Map();
    (suggestions || []).forEach((s, idx) => {
      suggestionMap.set(s.team_member_id || s.id, { ...s, order: idx });
    });
    const active = (teamMembers || []).filter(m => m.active !== false);
    return [...active].sort((a, b) => {
      const sa = suggestionMap.get(a.id);
      const sb = suggestionMap.get(b.id);
      if (sa && !sb) return -1;
      if (!sa && sb) return 1;
      if (sa && sb) return (sa.order || 0) - (sb.order || 0);
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [teamMembers, suggestions]);

  const isSuggested = (memberId) =>
    (suggestions || []).some(s => (s.team_member_id || s.id) === memberId);

  const getSuggestion = (memberId) =>
    (suggestions || []).find(s => (s.team_member_id || s.id) === memberId);

  const totalAssignedHours = useMemo(() => {
    if (!selectedJob) return 0;
    const est = Number(selectedJob.estimated_hours || 0);
    const crewCount = Math.max(selectedMemberIds.length, 1);
    return Math.round((est / crewCount) * 10) / 10;
  }, [selectedJob, selectedMemberIds]);

  if (loading) {
    return (
      <AppShell title="Dispatch">
        <div className="flex items-center justify-center h-[calc(100vh-72px)]">
          <div className="text-v-text-secondary text-xs uppercase tracking-widest">Loading...</div>
        </div>
      </AppShell>
    );
  }

  if (planRequired) {
    return (
      <AppShell title="Dispatch">
        <div className="max-w-md mx-auto mt-20 text-center p-8 border border-v-border bg-v-surface rounded">
          <h2 className="text-xl text-v-text-primary mb-2">Dispatch Module</h2>
          <p className="text-v-text-secondary text-sm mb-4">Available on Business and Enterprise plans</p>
          <p className="text-xs text-v-text-secondary mb-6">Assign jobs to crew, schedule by date, get smart suggestions, and notify your team automatically.</p>
          <a
            href="https://shinyjets.com/products/aircraft-detailing-crm-business"
            className="inline-block px-6 py-3 bg-v-gold text-v-charcoal font-semibold uppercase tracking-wider text-xs"
          >
            Upgrade to Business
          </a>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Dispatch">
      <div className="flex h-[calc(100vh-72px)] relative">
        {/* Unassigned sidebar */}
        <aside className="w-72 shrink-0 border-r border-v-border bg-v-surface overflow-y-auto p-3">
          <h3 className="text-xs uppercase tracking-widest text-v-text-secondary mb-3">
            Unassigned ({unassigned.length})
          </h3>
          {unassigned.length === 0 ? (
            <p className="text-[11px] text-v-text-secondary/60">No unassigned jobs.</p>
          ) : (
            unassigned.map(job => (
              <JobCard
                key={job.id}
                job={job}
                onOpen={setSelectedJob}
                onDragStart={handleDragStart}
              />
            ))
          )}
        </aside>

        {/* Date columns */}
        <div className="flex-1 overflow-x-auto flex">
          {dateColumns.map(col => (
            <div
              key={col.iso}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => handleDropOnDate(e, col.iso)}
              className="w-72 shrink-0 border-r border-v-border p-3 bg-v-charcoal"
            >
              <h3 className="text-xs uppercase tracking-widest text-v-text-secondary mb-3">
                {col.label}
                <span className="text-v-text-secondary/50 ml-2">
                  {(jobsByDate[col.iso] || []).length}
                </span>
              </h3>
              {(jobsByDate[col.iso] || []).map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  onOpen={setSelectedJob}
                  onDragStart={handleDragStart}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Assignment Panel */}
        {selectedJob && (
          <aside
            className="fixed right-0 top-[72px] bottom-0 w-96 border-l border-v-border z-40 flex flex-col"
            style={{ background: '#0f1623' }}
          >
            {/* Header */}
            <div className="flex items-start justify-between p-4 border-b border-v-border">
              <div className="min-w-0">
                <h3 className="text-v-text-primary text-sm font-medium truncate">
                  {selectedJob.aircraft_model || 'Aircraft'}
                </h3>
                <p className="text-v-text-secondary text-xs">{selectedJob.tail_number || ''}</p>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-v-text-secondary hover:text-v-text-primary p-1"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Job details */}
              <div>
                <div className="flex items-center gap-2 text-xs text-v-text-secondary mb-2">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{selectedJob.airport || selectedJob.location || '—'}</span>
                </div>
                {(selectedJob.services || []).length > 0 && (
                  <ul className="text-xs text-v-text-primary space-y-1 mb-2">
                    {(selectedJob.services || []).map((s, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-v-gold" />
                        <span className="truncate">{s.name || s.title || s}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-v-text-secondary">
                  Estimated total: {selectedJob.estimated_hours ? `${selectedJob.estimated_hours}h` : '—'}
                </p>
              </div>

              {/* Assigned crew */}
              <div>
                <h4 className="text-[10px] uppercase tracking-widest text-v-text-secondary mb-2">
                  Assigned Crew
                </h4>
                {(selectedJob.assignments || []).length === 0 ? (
                  <p className="text-[11px] text-v-text-secondary/60">No crew assigned yet.</p>
                ) : (
                  <div className="space-y-1">
                    {(selectedJob.assignments || []).map((a) => (
                      <div
                        key={a.team_member_id}
                        className="flex items-center justify-between bg-v-surface border border-v-border rounded px-3 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full border border-v-gold/50 flex items-center justify-center text-v-gold text-[9px] font-medium">
                            {initialsOf(a.team_member_name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-v-text-primary truncate">{a.team_member_name}</p>
                            <p className="text-[10px] text-v-text-secondary capitalize">{a.status || 'pending'}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleUnassign(a.team_member_id)}
                          className="text-v-text-secondary hover:text-red-400 p-1"
                          title="Unassign"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Team list */}
              <div>
                <h4 className="text-[10px] uppercase tracking-widest text-v-text-secondary mb-2">
                  Team
                </h4>
                <div className="space-y-1">
                  {sortedTeam.map(member => {
                    const suggestion = getSuggestion(member.id);
                    const suggested = !!suggestion;
                    const hoursToday = Number(member.hours_today || 0);
                    const hoursPerDay = Number(member.hours_per_day || 8);
                    const overbooked = hoursToday >= hoursPerDay;
                    const checked = selectedMemberIds.includes(member.id);
                    const specialtyMatch =
                      suggestion?.specialty_match ||
                      (member.specialties || []).some(sp =>
                        String(selectedJob.aircraft_model || '').toLowerCase().includes(String(sp).toLowerCase())
                      );

                    return (
                      <label
                        key={member.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded border cursor-pointer transition-colors ${
                          suggested
                            ? 'bg-blue-500/10 border-blue-500/40'
                            : 'bg-v-surface border-v-border hover:border-v-gold/30'
                        } ${overbooked ? 'opacity-50' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMember(member.id)}
                          disabled={overbooked && !checked}
                          className="accent-v-gold"
                        />
                        <div className="w-6 h-6 rounded-full border border-v-gold/50 flex items-center justify-center text-v-gold text-[9px] font-medium shrink-0">
                          {initialsOf(member.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-v-text-primary truncate">{member.name}</p>
                            {specialtyMatch && (
                              <span className="text-[8px] uppercase tracking-widest px-1.5 py-0.5 bg-v-gold/15 text-v-gold rounded">
                                Specialty
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-v-text-secondary">
                            {hoursToday > 0 ? `${hoursToday}h today` : 'Available'}
                            {overbooked && ' · Overbooked'}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                  {sortedTeam.length === 0 && (
                    <p className="text-[11px] text-v-text-secondary/60">No team members available.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer: totals + dispatch */}
            <div className="border-t border-v-border p-4">
              <div className="flex items-center justify-between text-[11px] text-v-text-secondary mb-3">
                <span>{selectedMemberIds.length} selected</span>
                <span>
                  {totalAssignedHours}h per crew / {selectedJob.estimated_hours || 0}h total
                </span>
              </div>
              <button
                onClick={handleDispatch}
                disabled={dispatching || selectedMemberIds.length === 0}
                className="w-full py-3 bg-v-gold text-v-charcoal font-semibold uppercase tracking-widest text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {dispatching ? 'Dispatching...' : 'Dispatch'}
              </button>
            </div>
          </aside>
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-v-surface border border-v-gold text-v-text-primary text-xs px-4 py-2 rounded shadow-lg z-50">
            {toast}
          </div>
        )}
      </div>
    </AppShell>
  );
}
