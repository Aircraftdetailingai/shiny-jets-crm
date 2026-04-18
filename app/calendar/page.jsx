"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice } from '@/lib/formatPrice';
import AppShell from '@/components/AppShell';

const statusColors = {
  scheduled: 'bg-blue-500',
  in_progress: 'bg-v-gold',
  paid: 'bg-green-500',
  completed: 'bg-purple-500',
};

const EVENT_TYPES = {
  job: { label: 'Jobs', color: 'bg-blue-500' },
  google: { label: 'Google Calendar', color: 'bg-indigo-400' },
  blocked: { label: 'Blocked', color: 'bg-red-500/40' },
  team: { label: 'Team', color: 'bg-teal-500' },
};

export default function CalendarPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('month');
  const [selectedJob, setSelectedJob] = useState(null);
  const [scheduleModal, setScheduleModal] = useState(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');

  // Inventory forecast
  const [forecast, setForecast] = useState(null);
  const [forecastAlerts, setForecastAlerts] = useState([]);
  const [showForecast, setShowForecast] = useState(false);

  // Unified data
  const [jobs, setJobs] = useState([]);
  const [googleEvents, setGoogleEvents] = useState([]);
  const [blockedDates, setBlockedDates] = useState([]);
  const [teamSchedules, setTeamSchedules] = useState([]);

  // Filters
  const [filters, setFilters] = useState({ job: true, google: true, blocked: true, team: true });

  // Success flash
  const [savedFlash, setSavedFlash] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    const stored = localStorage.getItem('vector_user');
    if (!token || !stored) { router.push('/login'); return; }
    try { setUser(JSON.parse(stored)); } catch { router.push('/login'); return; }
    fetchData(token);
  }, [router]);

  // Refetch when month changes
  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (token && user) fetchCalendarEvents(token);
  }, [currentDate]);

  const fetchData = async (token) => {
    try {
      // Fetch base jobs
      const res = await fetch('/api/quotes?include_scheduled=true', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const allQuotes = data.quotes || data || [];
        setJobs(allQuotes.filter(q => ['paid', 'scheduled', 'in_progress', 'completed'].includes(q.status)));
      }
    } catch {}

    await fetchCalendarEvents(token);
    fetchForecast(token);
    setLoading(false);
  };

  const fetchForecast = async (token) => {
    try {
      const res = await fetch('/api/inventory/forecast?days=14', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setForecast(data.forecast || []);
        setForecastAlerts(data.alerts || []);
      }
    } catch {}
  };

  const fetchCalendarEvents = async (token) => {
    try {
      const start = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1).toISOString();
      const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0).toISOString();

      const res = await fetch(`/api/calendar/events?start=${start}&end=${end}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGoogleEvents(data.googleEvents || []);
        setBlockedDates(data.blockedDates || []);
        setTeamSchedules(data.teamSchedules || []);
      }
    } catch {}
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    const days = [];

    const prevMonth = new Date(year, month, 0);
    for (let i = startingDay - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, prevMonth.getDate() - i), isCurrentMonth: false });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
    return days;
  };

  const getWeekDays = () => {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const dateStr = (date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const getJobsForDate = (date) => {
    return jobs.filter(job => {
      if (!job.scheduled_date) return false;
      const jd = new Date(job.scheduled_date);
      return jd.getFullYear() === date.getFullYear() && jd.getMonth() === date.getMonth() && jd.getDate() === date.getDate();
    });
  };

  const getGoogleEventsForDate = (date) => {
    const ds = dateStr(date);
    return googleEvents.filter(e => {
      const start = e.start_time.split('T')[0];
      return start === ds;
    });
  };

  const isBlockedDate = (date) => blockedDates.includes(dateStr(date));

  const getTeamForDate = (date) => {
    const ds = dateStr(date);
    return teamSchedules.filter(s => {
      const avail = s.availability?.weeklySchedule?.[String(date.getDay())];
      const hasEntry = s.entries?.some(e => e.date === ds);
      return avail || hasEntry;
    });
  };

  const getUnscheduledJobs = () => jobs.filter(job => !job.scheduled_date && job.status === 'paid');

  const navigateMonth = (dir) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + dir);
    setCurrentDate(newDate);
  };

  const navigateWeek = (dir) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (dir * 7));
    setCurrentDate(newDate);
  };

  const handleScheduleJob = async () => {
    if (!scheduleModal || !scheduleDate) return;
    try {
      const token = localStorage.getItem('vector_token');
      const scheduledDateTime = new Date(`${scheduleDate}T${scheduleTime}`);
      const res = await fetch(`/api/quotes/${scheduleModal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scheduled_date: scheduledDateTime.toISOString(), status: 'scheduled' }),
      });
      if (res.ok) {
        setJobs(jobs.map(j => j.id === scheduleModal.id ? { ...j, scheduled_date: scheduledDateTime.toISOString(), status: 'scheduled' } : j));
        setScheduleModal(null);
        setScheduleDate('');
        setSavedFlash('Scheduled');
        setTimeout(() => setSavedFlash(''), 2000);
      }
    } catch {}
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const days = getDaysInMonth(currentDate);
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const today = new Date();
  const unscheduledJobs = getUnscheduledJobs();

  if (loading) {
    return (
      <AppShell title="Calendar">
        <div className="flex items-center justify-center py-32">
          <div className="text-white text-xl">Loading calendar...</div>
        </div>
      </AppShell>
    );
  }

  // Get events for a date cell
  const getCellEvents = (date) => {
    const events = [];
    if (filters.job) {
      getJobsForDate(date).forEach(j => events.push({ type: 'job', data: j, label: `${formatTime(j.scheduled_date)} ${j.client_name || j.aircraft_model}`, color: statusColors[j.status] || 'bg-blue-500' }));
    }
    if (filters.google) {
      getGoogleEventsForDate(date).forEach(e => events.push({ type: 'google', data: e, label: e.summary || '(Busy)', color: 'bg-indigo-400' }));
    }
    if (filters.team) {
      getTeamForDate(date).forEach(s => events.push({ type: 'team', data: s, label: s.member_name, color: 'bg-teal-500', customColor: s.color }));
    }
    return events;
  };

  return (
    <AppShell title="Calendar">
    <div className="px-6 md:px-10 py-8 pb-40">
      {savedFlash && (
        <div className="fixed top-4 right-4 z-[100] bg-emerald-500/10 border border-emerald-500/30 text-green-400 text-xs px-3 py-2 rounded shadow-lg">{`✓ ${savedFlash}`}</div>
      )}
      {/* Header */}
      <header className="flex justify-between items-center mb-4 text-white">
        <h1 className="font-heading text-[2rem] font-light text-v-text-primary" style={{ letterSpacing: '0.15em' }}>CALENDAR</h1>
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex bg-v-surface rounded overflow-hidden border border-v-border">
            {['month', 'week'].map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium capitalize ${view === v ? 'bg-v-gold text-white' : 'text-v-text-secondary hover:bg-white/5'}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex gap-4">
        {/* Main Calendar */}
        <div className="flex-1 bg-v-surface rounded-lg shadow overflow-hidden">
          {/* Calendar Header */}
          <div className="flex items-center justify-between p-4 border-b border-v-border">
            <div className="flex items-center space-x-4">
              <button onClick={() => view === 'month' ? navigateMonth(-1) : navigateWeek(-1)} className="p-2 hover:bg-white/5 rounded text-v-text-secondary">&larr;</button>
              <h2 className="text-xl font-semibold text-v-text-primary">{monthName}</h2>
              <button onClick={() => view === 'month' ? navigateMonth(1) : navigateWeek(1)} className="p-2 hover:bg-white/5 rounded text-v-text-secondary">&rarr;</button>
            </div>
            <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-sm border border-v-border rounded hover:bg-white/5 text-v-text-secondary">
              Today
            </button>
          </div>

          {view === 'month' ? (
            <>
              {/* Week Days Header */}
              <div className="grid grid-cols-7 border-b border-v-border">
                {weekDays.map((day) => (
                  <div key={day} className="p-2 text-center text-sm font-medium text-v-text-secondary border-r border-v-border last:border-r-0">
                    {day}
                  </div>
                ))}
              </div>

              {/* Month Grid */}
              <div className="grid grid-cols-7">
                {days.map((day, idx) => {
                  const cellEvents = getCellEvents(day.date);
                  const blocked = filters.blocked && isBlockedDate(day.date);
                  const isToday = day.date.getDate() === today.getDate() && day.date.getMonth() === today.getMonth() && day.date.getFullYear() === today.getFullYear();

                  return (
                    <div
                      key={idx}
                      className={`min-h-[100px] p-1 border-r border-b border-v-border last:border-r-0 ${
                        blocked ? 'bg-red-900/10' : day.isCurrentMonth ? 'bg-v-surface' : 'bg-v-charcoal'
                      }`}
                    >
                      <div className={`text-sm font-medium mb-1 ${
                        isToday ? 'bg-v-gold text-white w-6 h-6 rounded-full flex items-center justify-center'
                          : day.isCurrentMonth ? 'text-v-text-primary' : 'text-v-text-secondary/40'
                      }`}>
                        {day.date.getDate()}
                      </div>
                      {blocked && <div className="text-[10px] text-red-400 mb-0.5">Blocked</div>}
                      <div className="space-y-0.5">
                        {cellEvents.slice(0, 3).map((evt, i) => (
                          <div
                            key={i}
                            onClick={() => evt.type === 'job' ? setSelectedJob(evt.data) : null}
                            className={`text-[10px] px-1 py-0.5 rounded text-white truncate ${evt.customColor ? '' : evt.color} ${evt.type === 'job' ? 'cursor-pointer' : ''}`}
                            style={evt.customColor ? { backgroundColor: evt.customColor } : undefined}
                            title={evt.label}
                          >
                            {evt.type === 'job' && evt.data?.schedule_override && (
                              <span className="inline-block text-[8px] font-semibold uppercase tracking-wider text-amber-300 bg-amber-900/40 border border-amber-400/40 px-1 mr-1 rounded">AH</span>
                            )}
                            {evt.label}
                          </div>
                        ))}
                        {cellEvents.length > 3 && (
                          <div className="text-[10px] text-v-text-secondary">+{cellEvents.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            /* Week View */
            <>
              <div className="grid grid-cols-7 border-b border-v-border">
                {getWeekDays().map((d, i) => {
                  const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
                  return (
                    <div key={i} className="p-2 text-center border-r border-v-border last:border-r-0">
                      <div className="text-xs text-v-text-secondary">{weekDays[i]}</div>
                      <div className={`text-lg font-medium ${isToday ? 'text-v-gold' : 'text-v-text-primary'}`}>{d.getDate()}</div>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-7 min-h-[500px]">
                {getWeekDays().map((d, i) => {
                  const cellEvents = getCellEvents(d);
                  const blocked = filters.blocked && isBlockedDate(d);
                  return (
                    <div key={i} className={`p-2 border-r border-v-border last:border-r-0 ${blocked ? 'bg-red-900/10' : ''}`}>
                      {blocked && <div className="text-[10px] text-red-400 mb-1">Blocked</div>}
                      <div className="space-y-1">
                        {cellEvents.map((evt, j) => (
                          <div
                            key={j}
                            onClick={() => evt.type === 'job' ? setSelectedJob(evt.data) : null}
                            className={`text-xs p-1.5 rounded text-white ${evt.customColor ? '' : evt.color} ${evt.type === 'job' ? 'cursor-pointer' : ''}`}
                            style={evt.customColor ? { backgroundColor: evt.customColor } : undefined}
                          >
                            <div className="font-medium truncate flex items-center gap-1">
                              {evt.type === 'job' && evt.data?.schedule_override && (
                                <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-300 bg-amber-900/40 border border-amber-400/40 px-1 rounded shrink-0">After Hours</span>
                              )}
                              <span className="truncate">{evt.label}</span>
                            </div>
                            {evt.type === 'job' && <div className="text-[10px] opacity-80">{evt.data.aircraft_model || evt.data.aircraft_type}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-72 space-y-4">
          {/* Filters */}
          <div className="bg-v-surface rounded-lg shadow p-4">
            <h3 className="font-semibold text-v-text-primary mb-3 text-sm">Filters</h3>
            <div className="space-y-2">
              {Object.entries(EVENT_TYPES).map(([key, { label, color }]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters[key]}
                    onChange={() => setFilters(f => ({ ...f, [key]: !f[key] }))}
                    className="rounded border-v-border"
                  />
                  <div className={`w-3 h-3 rounded ${color}`} />
                  <span className="text-sm text-v-text-secondary">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Unscheduled Jobs */}
          <div className="bg-v-surface rounded-lg shadow p-4">
            <h3 className="font-semibold text-v-text-primary mb-2 text-sm">Unscheduled Jobs ({unscheduledJobs.length})</h3>
            {unscheduledJobs.length === 0 ? (
              <p className="text-v-text-secondary text-xs">No unscheduled jobs</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {unscheduledJobs.map((job) => (
                  <div key={job.id} onClick={() => { setScheduleModal(job); setScheduleDate(''); }} className="p-2 border border-v-border rounded cursor-pointer hover:bg-white/5">
                    <div className="font-medium text-xs text-v-text-primary">{job.client_name || 'No name'}</div>
                    <div className="text-[10px] text-v-text-secondary">{job.aircraft_model || job.aircraft_type}</div>
                    <div className="text-[10px] text-green-400 font-medium">${formatPrice(job.total_price)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Team On Duty (if any team schedules) */}
          {teamSchedules.length > 0 && (
            <div className="bg-v-surface rounded-lg shadow p-4">
              <h3 className="font-semibold text-v-text-primary mb-2 text-sm">Team</h3>
              <div className="space-y-1">
                {teamSchedules.map(s => (
                  <div key={s.member_id} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-xs text-v-text-secondary">{s.member_name}</span>
                    <span className="text-[10px] text-v-text-secondary/60 capitalize">{s.role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inventory Forecast */}
          {forecast && forecast.length > 0 && (
            <div className="bg-v-surface rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-v-text-primary text-sm">Inventory Forecast</h3>
                <button onClick={() => setShowForecast(!showForecast)} className="text-[10px] text-v-gold hover:text-v-gold-dim">
                  {showForecast ? 'Hide' : `${forecastAlerts.length > 0 ? `${forecastAlerts.length} alert${forecastAlerts.length > 1 ? 's' : ''}` : 'View'}`}
                </button>
              </div>
              {/* Alert summary */}
              {forecastAlerts.length > 0 && !showForecast && (
                <div className="space-y-1">
                  {forecastAlerts.slice(0, 3).map(a => (
                    <div key={a.product_id} className="flex items-center gap-1.5 text-[10px]">
                      <span>{a.status === 'out_of_stock' ? '\u274C' : '\u26A0\uFE0F'}</span>
                      <span className={a.status === 'out_of_stock' ? 'text-red-400' : 'text-amber-400'}>
                        {a.product_name} — need {a.deficit}{a.unit}
                      </span>
                    </div>
                  ))}
                  {forecastAlerts.length > 3 && (
                    <p className="text-[10px] text-v-text-secondary">+{forecastAlerts.length - 3} more</p>
                  )}
                </div>
              )}
              {/* Full forecast */}
              {showForecast && (
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {forecast.filter(f => f.status !== 'not_needed').map(f => (
                    <div key={f.product_id} className="flex items-start gap-1.5 text-[10px]">
                      <span className="flex-shrink-0 mt-0.5">
                        {f.status === 'out_of_stock' ? '\u274C' : f.status === 'low' ? '\u26A0\uFE0F' : '\u2705'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className={`font-medium ${
                          f.status === 'out_of_stock' ? 'text-red-400' :
                          f.status === 'low' ? 'text-amber-400' : 'text-green-400'
                        }`}>
                          {f.product_name}
                        </span>
                        <span className="text-v-text-secondary ml-1">
                          need {f.needed}{f.unit}, have {f.have}{f.unit}
                          {f.deficit > 0 && <span className={f.status === 'out_of_stock' ? ' text-red-400' : ' text-amber-400'}> (ORDER {f.deficit}{f.unit})</span>}
                          {f.status === 'ok' && ' (OK)'}
                        </span>
                        {f.confidence && f.confidence.level !== 'estimated' && (
                          <span className={`ml-1 ${
                            f.confidence.color === 'green' ? 'text-green-400' :
                            f.confidence.color === 'gold' ? 'text-amber-400' : 'text-yellow-400'
                          }`}>
                            {'✦'.repeat(f.confidence.stars)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {forecastAlerts.length === 0 && !showForecast && (
                <p className="text-green-400 text-[10px]">All stocked for the next 14 days</p>
              )}
            </div>
          )}

          {/* Legend */}
          <div className="bg-v-surface rounded-lg shadow p-4">
            <h3 className="font-semibold text-v-text-primary mb-2 text-sm">Legend</h3>
            <div className="space-y-1">
              {Object.entries(statusColors).map(([status, color]) => (
                <div key={status} className="flex items-center text-xs gap-2">
                  <div className={`w-3 h-3 rounded ${color}`} />
                  <span className="capitalize text-v-text-secondary">{status.replace('_', ' ')}</span>
                </div>
              ))}
              <div className="flex items-center text-xs gap-2">
                <div className="w-3 h-3 rounded bg-indigo-400" />
                <span className="text-v-text-secondary">Google Calendar</span>
              </div>
              <div className="flex items-center text-xs gap-2">
                <div className="w-3 h-3 rounded bg-red-500/40" />
                <span className="text-v-text-secondary">Blocked</span>
              </div>
              <div className="flex items-center text-xs gap-2">
                <div className="w-3 h-3 rounded bg-teal-500" />
                <span className="text-v-text-secondary">Team Member</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={() => setSelectedJob(null)}>
          <div className="bg-v-surface rounded-t-2xl sm:rounded-lg p-5 sm:p-6 w-full sm:max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-v-text-primary">Job Details</h3>
              <button onClick={() => setSelectedJob(null)} className="text-v-text-secondary hover:text-v-text-primary text-xl">&times;</button>
            </div>
            <div className="space-y-3">
              <div><p className="text-xs text-v-text-secondary">Customer</p><p className="font-medium text-v-text-primary">{selectedJob.client_name || 'No name'}</p></div>
              <div><p className="text-xs text-v-text-secondary">Aircraft</p><p className="font-medium text-v-text-primary">{selectedJob.aircraft_model || selectedJob.aircraft_type}</p></div>
              {selectedJob.tail_number && <div><p className="text-xs text-v-text-secondary">Tail Number</p><p className="font-medium text-v-text-primary">{selectedJob.tail_number}</p></div>}
              <div><p className="text-xs text-v-text-secondary">Scheduled</p><p className="font-medium text-v-text-primary">{selectedJob.scheduled_date ? new Date(selectedJob.scheduled_date).toLocaleString() : 'Not scheduled'}</p></div>
              <div><p className="text-xs text-v-text-secondary">Status</p><span className={`inline-block px-2 py-1 rounded text-xs text-white ${statusColors[selectedJob.status] || 'bg-gray-500'}`}>{selectedJob.status}</span></div>
              <div><p className="text-xs text-v-text-secondary">Total</p><p className="font-semibold text-lg text-green-400">${formatPrice(selectedJob.total_price)}</p></div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => { setScheduleModal(selectedJob); setSelectedJob(null); }} className="flex-1 py-2 border border-v-gold text-v-gold rounded hover:bg-v-gold-muted/20 text-sm">Reschedule</button>
              <a href={`/q/${selectedJob.share_link}`} target="_blank" className="flex-1 py-2 bg-v-gold text-white rounded text-center hover:bg-v-gold-dim text-sm">View Quote</a>
            </div>
            {['in_progress', 'completed', 'scheduled'].includes(selectedJob.status) && (
              <a
                href={`/jobs/${selectedJob.id}/log-products`}
                className="block w-full mt-2 py-2 text-center border border-v-border rounded hover:bg-white/5 text-v-text-secondary text-sm"
              >
                Log Products Used
              </a>
            )}
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {scheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={() => setScheduleModal(null)}>
          <div className="bg-v-surface rounded-t-2xl sm:rounded-lg p-5 sm:p-6 w-full sm:max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-v-text-primary mb-4">Schedule Job</h3>
            <div className="mb-4">
              <p className="font-medium text-v-text-primary">{scheduleModal.client_name || 'No name'}</p>
              <p className="text-sm text-v-text-secondary">{scheduleModal.aircraft_model || scheduleModal.aircraft_type}</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">Date</label>
                <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-v-text-secondary mb-1">Time</label>
                <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded px-3 py-2" />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setScheduleModal(null)} className="flex-1 py-2 border border-v-border rounded hover:bg-white/5 text-v-text-secondary text-sm">Cancel</button>
              <button onClick={handleScheduleJob} disabled={!scheduleDate} className="flex-1 py-2 bg-v-gold text-white rounded hover:bg-v-gold-dim disabled:opacity-50 text-sm">Schedule</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AppShell>
  );
}
