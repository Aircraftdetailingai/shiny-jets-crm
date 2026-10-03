"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice } from '@/lib/formatPrice';
import AppShell from '@/components/AppShell';

// Chip backgrounds are dark enough for white text (WCAG AA 4.5:1);
// dots use the brighter shade so they stand out on the dark surface.
const statusColors = {
  scheduled: 'bg-blue-600',
  in_progress: 'bg-v-gold',
  paid: 'bg-green-700',
  completed: 'bg-purple-600',
};
const statusDots = {
  scheduled: 'bg-blue-400',
  in_progress: 'bg-sky-400',
  paid: 'bg-green-400',
  completed: 'bg-purple-400',
};

// White or near-black text, whichever reads better on a custom hex color.
function textOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return (1.05 / (L + 0.05)) >= 4.5 ? '#ffffff' : '#0F1117';
}

const STATUS_LABELS = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  paid: 'Paid',
  completed: 'Completed',
};

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Phones get a compact month grid (dots + tap a day) and a list-style week.
function useIsMobile(query = '(max-width: 767px)') {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const update = () => setMatch(mq.matches);
    update();
    mq.addEventListener ? mq.addEventListener('change', update) : mq.addListener(update);
    return () => { mq.removeEventListener ? mq.removeEventListener('change', update) : mq.removeListener(update); };
  }, [query]);
  return match;
}

const EVENT_TYPES = {
  job: { label: 'Jobs', color: 'bg-blue-400' },
  google: { label: 'Google Calendar', color: 'bg-indigo-300' },
  blocked: { label: 'Blocked', color: 'bg-red-400' },
  team: { label: 'Team', color: 'bg-teal-400' },
};

export default function CalendarPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('month');
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const isMobile = useIsMobile();
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
    // Day 1 avoids month overflow (Jan 31 + 1 month = Mar 3).
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + dir, 1);
    setCurrentDate(newDate);
    const now = new Date();
    setSelectedDate(newDate.getFullYear() === now.getFullYear() && newDate.getMonth() === now.getMonth() ? now : newDate);
  };

  const navigateWeek = (dir) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (dir * 7));
    setCurrentDate(newDate);
    setSelectedDate(newDate);
  };

  const goToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(now);
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
      getJobsForDate(date).forEach(j => events.push({ type: 'job', data: j, label: `${formatTime(j.scheduled_date)} ${j.client_name || j.aircraft_model}`, color: statusColors[j.status] || 'bg-blue-600', dot: statusDots[j.status] || 'bg-blue-400' }));
    }
    if (filters.google) {
      getGoogleEventsForDate(date).forEach(e => events.push({ type: 'google', data: e, label: e.summary || '(Busy)', color: 'bg-indigo-600', dot: 'bg-indigo-300' }));
    }
    if (filters.team) {
      getTeamForDate(date).forEach(s => events.push({ type: 'team', data: s, label: s.member_name, color: 'bg-teal-700', dot: 'bg-teal-400', customColor: s.color }));
    }
    return events;
  };

  const isSameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const weekRange = getWeekDays();
  const headerLabel = view === 'month'
    ? monthName
    : `${weekRange[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekRange[6].toLocaleDateString('en-US', { month: weekRange[0].getMonth() === weekRange[6].getMonth() ? undefined : 'short', day: 'numeric', year: 'numeric' })}`;
  const selectedEvents = getCellEvents(selectedDate);
  const selectedBlocked = filters.blocked && isBlockedDate(selectedDate);
  const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  const longDate = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const eventTypeLabel = (evt) => evt.type === 'job'
    ? (STATUS_LABELS[evt.data?.status] || 'Job')
    : evt.type === 'google' ? 'Google Calendar' : evt.type === 'team' ? 'On duty' : '';

  // A readable list row for one event (day agenda on all sizes, week view on phones).
  const agendaRow = (evt, key) => {
    const job = evt.type === 'job' ? evt.data : null;
    const inner = (
      <>
        <span aria-hidden="true" className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${evt.customColor ? '' : evt.dot}`} style={evt.customColor ? { backgroundColor: evt.customColor } : undefined} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 flex-wrap">
            {job && <span className="text-xs text-v-text-secondary tabular-nums">{formatTime(job.scheduled_date)}</span>}
            <span className="text-sm font-medium text-v-text-primary break-words">
              {job ? (job.client_name || job.aircraft_model || 'Job') : evt.label}
            </span>
            {job?.schedule_override && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-300 bg-amber-900/40 border border-amber-400/40 px-1 rounded">After Hours</span>
            )}
          </span>
          {job && (job.aircraft_model || job.aircraft_type || job.tail_number) && (
            <span className="block text-xs text-v-text-secondary break-words">
              {[job.aircraft_model || job.aircraft_type, job.tail_number].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        <span className="text-[11px] text-v-text-secondary shrink-0 mt-0.5">{eventTypeLabel(evt)}</span>
      </>
    );
    return job ? (
      <li key={key}>
        <button type="button" onClick={() => setSelectedJob(job)}
          className="w-full text-left flex items-start gap-3 px-3 py-2.5 min-h-[44px] rounded-lg hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-v-gold"
          aria-label={`${job.client_name || 'Job'}, ${job.aircraft_model || job.aircraft_type || ''} at ${formatTime(job.scheduled_date)}, ${STATUS_LABELS[job.status] || job.status}. Open job details`}>
          {inner}
        </button>
      </li>
    ) : (
      <li key={key} className="flex items-start gap-3 px-3 py-2.5">{inner}</li>
    );
  };

  const legend = (className = '') => (
    <section aria-labelledby="cal-legend" className={`bg-v-surface rounded-lg shadow p-4 ${className}`}>
      <h3 id="cal-legend" className="font-semibold text-v-text-primary mb-2 text-sm">Legend</h3>
      <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
        {[...Object.entries(statusDots).map(([s, c]) => [STATUS_LABELS[s] || s, c]), ['Google Calendar', 'bg-indigo-300'], ['Blocked', 'bg-red-400'], ['Team member', 'bg-teal-400']].map(([label, color]) => (
          <li key={label} className="inline-flex items-center gap-1.5 text-xs text-v-text-secondary">
            <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full ${color}`} />
            {label}
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <AppShell title="Calendar">
    <div className="px-4 sm:px-6 md:px-10 py-6 md:py-8 pb-40">
      {savedFlash && (
        <div role="status" className="fixed top-4 right-4 z-[100] bg-emerald-500/10 border border-emerald-500/30 text-green-400 text-xs px-3 py-2 rounded shadow-lg">{`✓ ${savedFlash}`}</div>
      )}
      {/* Header */}
      <header className="flex justify-between items-center gap-3 mb-4 text-white">
        <h1 className="font-heading text-[1.6rem] sm:text-[2rem] font-light text-v-text-primary" style={{ letterSpacing: '0.15em' }}>CALENDAR</h1>
        <div className="flex bg-v-surface rounded overflow-hidden border border-v-border" role="group" aria-label="Calendar view">
          {['month', 'week'].map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`px-3 py-2 min-h-[40px] text-xs font-medium capitalize ${view === v ? 'bg-v-gold text-white' : 'text-v-text-secondary hover:bg-white/5'}`}
            >
              {v}
            </button>
          ))}
        </div>
      </header>

      {/* Phones/tablets: calendar first (full width), panels stacked below.
          Desktop (lg+): large calendar with a narrower sidebar beside it. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_15rem] xl:grid-cols-[minmax(0,1fr)_16rem] gap-4 items-start">
        <div className="min-w-0 space-y-4">
        {/* Main Calendar */}
        <section aria-label="Calendar" className="bg-v-surface rounded-lg shadow overflow-hidden">
          {/* Calendar Header */}
          <div className="flex items-center justify-between gap-2 p-2 sm:p-4 border-b border-v-border">
            <div className="flex items-center gap-1 sm:gap-3 min-w-0">
              <button type="button" onClick={() => view === 'month' ? navigateMonth(-1) : navigateWeek(-1)}
                aria-label={view === 'month' ? 'Previous month' : 'Previous week'}
                className="w-10 h-10 flex items-center justify-center hover:bg-white/5 rounded text-v-text-secondary shrink-0">&larr;</button>
              <h2 className="text-base sm:text-xl font-semibold text-v-text-primary truncate" aria-live="polite">{headerLabel}</h2>
              <button type="button" onClick={() => view === 'month' ? navigateMonth(1) : navigateWeek(1)}
                aria-label={view === 'month' ? 'Next month' : 'Next week'}
                className="w-10 h-10 flex items-center justify-center hover:bg-white/5 rounded text-v-text-secondary shrink-0">&rarr;</button>
            </div>
            <button type="button" onClick={goToday} className="px-3 py-2 min-h-[40px] text-sm border border-v-border rounded hover:bg-white/5 text-v-text-secondary shrink-0">
              Today
            </button>
          </div>

          {view === 'month' ? (
            <div role="grid" aria-label={monthName}>
              {/* Week Days Header — single letters on phones */}
              <div role="row" className="grid grid-cols-7 border-b border-v-border">
                {WEEKDAY_NAMES.map((day) => (
                  <div role="columnheader" key={day} aria-label={day} className="py-2 text-center text-xs sm:text-sm font-medium text-v-text-secondary md:border-r border-v-border last:border-r-0">
                    <span className="md:hidden" aria-hidden="true">{day[0]}</span>
                    <span className="hidden md:inline" aria-hidden="true">{day.slice(0, 3)}</span>
                  </div>
                ))}
              </div>

              {/* Month Grid */}
              <div className="grid grid-cols-7">
                {days.map((day, idx) => {
                  const cellEvents = getCellEvents(day.date);
                  const blocked = filters.blocked && isBlockedDate(day.date);
                  const isToday = isSameDay(day.date, today);
                  const isSelected = isSameDay(day.date, selectedDate);
                  const jobCount = cellEvents.filter(e => e.type === 'job').length;
                  const dotEvents = cellEvents.filter(e => e.type !== 'team');
                  const cellLabel = `${longDate(day.date)}${blocked ? ', blocked' : ''}, ${jobCount} job${jobCount === 1 ? '' : 's'}${dotEvents.length > jobCount ? `, ${dotEvents.length - jobCount} other event${dotEvents.length - jobCount === 1 ? '' : 's'}` : ''}`;

                  if (isMobile) {
                    // Compact cell: date + colored dots; tap to see that day's list below.
                    return (
                      <button
                        type="button"
                        key={idx}
                        role="gridcell"
                        onClick={() => setSelectedDate(day.date)}
                        aria-selected={isSelected}
                        aria-label={cellLabel}
                        className={`h-14 flex flex-col items-center justify-start pt-1.5 gap-1 border-b border-v-border/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-v-gold ${
                          isSelected ? 'bg-v-gold/20' : blocked ? 'bg-red-900/20' : day.isCurrentMonth ? 'bg-v-surface' : 'bg-v-charcoal'
                        }`}
                      >
                        <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${
                          isToday ? 'bg-v-gold text-white' : isSelected ? 'text-white' : day.isCurrentMonth ? 'text-v-text-primary' : 'text-v-text-secondary/50'
                        }`}>
                          {day.date.getDate()}
                        </span>
                        <span className="flex items-center gap-0.5 h-1.5" aria-hidden="true">
                          {blocked && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
                          {dotEvents.slice(0, 3).map((evt, i) => (
                            <span key={i} className={`w-1.5 h-1.5 rounded-full ${evt.dot}`} />
                          ))}
                          {dotEvents.length > 3 && <span className="text-[9px] leading-none text-v-text-secondary">+</span>}
                        </span>
                      </button>
                    );
                  }

                  return (
                    <div
                      key={idx}
                      role="gridcell"
                      aria-selected={isSelected}
                      className={`min-h-[110px] p-1.5 border-r border-b border-v-border [&:nth-child(7n)]:border-r-0 ${
                        isSelected ? 'ring-1 ring-inset ring-v-gold/60' : ''
                      } ${blocked ? 'bg-red-900/10' : day.isCurrentMonth ? 'bg-v-surface' : 'bg-v-charcoal'}`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedDate(day.date)}
                        aria-label={`${cellLabel}. Show day list`}
                        className={`text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 ${
                          isToday ? 'bg-v-gold text-white hover:bg-v-gold' : day.isCurrentMonth ? 'text-v-text-primary' : 'text-v-text-secondary/50'
                        }`}
                      >
                        {day.date.getDate()}
                      </button>
                      {blocked && <div className="text-[11px] text-red-300 mb-0.5">Blocked</div>}
                      <div className="space-y-0.5">
                        {dotEvents.slice(0, 3).map((evt, i) => {
                          const cls = `block w-full text-left text-[11px] leading-tight px-1.5 py-0.5 rounded text-white ${evt.customColor ? '' : evt.color}`;
                          const style = evt.customColor ? { backgroundColor: evt.customColor, color: textOn(evt.customColor) } : undefined;
                          const job = evt.type === 'job' ? evt.data : null;
                          const content = job ? (
                            <>
                              <span className="flex items-center gap-1 opacity-90 tabular-nums">
                                {job.schedule_override && (
                                  <span className="inline-block text-[8px] font-semibold uppercase tracking-wider text-amber-300 bg-amber-900/40 border border-amber-400/40 px-1 rounded">AH</span>
                                )}
                                {formatTime(job.scheduled_date)}
                              </span>
                              <span className="block font-medium line-clamp-2 break-words">{job.client_name || job.aircraft_model || 'Job'}</span>
                            </>
                          ) : (
                            <span className="block truncate">{evt.label}</span>
                          );
                          return evt.type === 'job' ? (
                            <button type="button" key={i} onClick={() => setSelectedJob(evt.data)} className={`${cls} hover:brightness-110`} style={style} title={evt.label}>{content}</button>
                          ) : (
                            <div key={i} className={cls} style={style} title={evt.label}>{content}</div>
                          );
                        })}
                        {dotEvents.length > 3 && (
                          <button type="button" onClick={() => setSelectedDate(day.date)} className="text-[11px] text-v-text-secondary hover:text-v-text-primary">
                            +{dotEvents.length - 3} more
                          </button>
                        )}
                      </div>
                      {/* Team on duty as compact initials so job names keep the room */}
                      {cellEvents.some(e => e.type === 'team') && (
                        <div className="flex flex-wrap gap-0.5 mt-1" aria-label={`On duty: ${cellEvents.filter(e => e.type === 'team').map(e => e.label).join(', ')}`} role="note">
                          {cellEvents.filter(e => e.type === 'team').map((evt, i) => (
                            <span key={i} title={evt.label} aria-hidden="true"
                              className={`text-[10px] leading-none font-semibold text-white px-1 py-0.5 rounded ${evt.customColor ? '' : evt.color}`}
                              style={evt.customColor ? { backgroundColor: evt.customColor, color: textOn(evt.customColor) } : undefined}>
                              {initials(evt.label)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : isMobile ? (
            /* Week View on phones: one readable list per day */
            <ol className="divide-y divide-v-border">
              {weekRange.map((d, i) => {
                const cellEvents = getCellEvents(d);
                const blocked = filters.blocked && isBlockedDate(d);
                const isToday = isSameDay(d, today);
                const visible = cellEvents.filter(e => e.type !== 'team');
                const onDuty = cellEvents.filter(e => e.type === 'team');
                return (
                  <li key={i} className={`py-2 ${blocked ? 'bg-red-900/10' : ''}`}>
                    <h3 className={`px-3 text-sm font-semibold ${isToday ? 'text-v-gold' : 'text-v-text-primary'}`}>
                      {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {isToday && <span className="ml-2 text-[11px] font-normal">Today</span>}
                      {blocked && <span className="ml-2 text-[11px] font-normal text-red-300">Blocked</span>}
                    </h3>
                    {visible.length === 0 ? (
                      <p className="px-3 py-1 text-xs text-v-text-secondary">No jobs</p>
                    ) : (
                      <ul>{visible.map((evt, j) => agendaRow(evt, j))}</ul>
                    )}
                    {onDuty.length > 0 && (
                      <p className="px-3 text-[11px] text-v-text-secondary">On duty: {onDuty.map(e => e.label).join(', ')}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            /* Week View (desktop) */
            <>
              <div className="grid grid-cols-7 border-b border-v-border">
                {weekRange.map((d, i) => {
                  const isToday = isSameDay(d, today);
                  return (
                    <div key={i} className="p-2 text-center border-r border-v-border last:border-r-0">
                      <div className="text-xs text-v-text-secondary">{WEEKDAY_NAMES[i].slice(0, 3)}</div>
                      <div className={`text-lg font-medium ${isToday ? 'text-v-gold' : 'text-v-text-primary'}`}>{d.getDate()}</div>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-7 min-h-[500px]">
                {weekRange.map((d, i) => {
                  const cellEvents = getCellEvents(d);
                  const blocked = filters.blocked && isBlockedDate(d);
                  return (
                    <div key={i} className={`p-2 border-r border-v-border last:border-r-0 min-w-0 ${blocked ? 'bg-red-900/10' : ''}`}>
                      {blocked && <div className="text-[11px] text-red-300 mb-1">Blocked</div>}
                      <div className="space-y-1">
                        {cellEvents.map((evt, j) => {
                          const cls = `block w-full text-left text-xs p-1.5 rounded text-white ${evt.customColor ? '' : evt.color}`;
                          const style = evt.customColor ? { backgroundColor: evt.customColor, color: textOn(evt.customColor) } : undefined;
                          const content = (
                            <>
                              <span className="font-medium flex items-center gap-1 min-w-0">
                                {evt.type === 'job' && evt.data?.schedule_override && (
                                  <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-300 bg-amber-900/40 border border-amber-400/40 px-1 rounded shrink-0">After Hours</span>
                                )}
                                <span className="truncate">{evt.label}</span>
                              </span>
                              {evt.type === 'job' && <span className="block text-[11px] opacity-90 truncate">{evt.data.aircraft_model || evt.data.aircraft_type}</span>}
                            </>
                          );
                          return evt.type === 'job' ? (
                            <button type="button" key={j} onClick={() => setSelectedJob(evt.data)} className={`${cls} hover:brightness-110`} style={style} title={evt.label}>{content}</button>
                          ) : (
                            <div key={j} className={cls} style={style} title={evt.label}>{content}</div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* Selected day: readable list of that day's jobs (month view) */}
        {view === 'month' && (
          <section aria-labelledby="cal-day-heading" className="bg-v-surface rounded-lg shadow p-3 sm:p-4">
            <h3 id="cal-day-heading" className="text-sm font-semibold text-v-text-primary px-1 mb-1" aria-live="polite">
              {longDate(selectedDate)}
              {selectedBlocked && <span className="ml-2 text-xs font-normal text-red-300">Blocked</span>}
            </h3>
            {selectedEvents.filter(e => e.type !== 'team').length === 0 ? (
              <p className="px-1 py-2 text-sm text-v-text-secondary">No jobs scheduled this day.</p>
            ) : (
              <ul className="-mx-1">{selectedEvents.filter(e => e.type !== 'team').map((evt, i) => agendaRow(evt, i))}</ul>
            )}
            {selectedEvents.some(e => e.type === 'team') && (
              <p className="px-1 pt-1 text-xs text-v-text-secondary">On duty: {selectedEvents.filter(e => e.type === 'team').map(e => e.label).join(', ')}</p>
            )}
          </section>
        )}
        </div>

        {/* Side panels — below the calendar on phones, beside it on desktop */}
        <aside aria-label="Calendar filters and details" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
          {/* Filters */}
          <fieldset className="bg-v-surface rounded-lg shadow p-4">
            <legend className="sr-only">Filters</legend>
            <h3 aria-hidden="true" className="font-semibold text-v-text-primary mb-3 text-sm">Filters</h3>
            <div className="flex flex-wrap lg:flex-col gap-2">
              {Object.entries(EVENT_TYPES).map(([key, { label, color }]) => (
                <label key={key} className="inline-flex items-center gap-2 cursor-pointer min-h-[36px] px-2.5 lg:px-0 rounded-full lg:rounded-none border border-v-border lg:border-0">
                  <input
                    type="checkbox"
                    checked={filters[key]}
                    onChange={() => setFilters(f => ({ ...f, [key]: !f[key] }))}
                    className="w-4 h-4 rounded border-v-border accent-v-gold"
                  />
                  <span aria-hidden="true" className={`w-3 h-3 rounded ${color}`} />
                  <span className="text-sm text-v-text-secondary">{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Unscheduled Jobs */}
          <section aria-labelledby="cal-unscheduled" className="bg-v-surface rounded-lg shadow p-4">
            <h3 id="cal-unscheduled" className="font-semibold text-v-text-primary mb-2 text-sm">Unscheduled Jobs ({unscheduledJobs.length})</h3>
            {unscheduledJobs.length === 0 ? (
              <p className="text-v-text-secondary text-xs">No unscheduled jobs</p>
            ) : (
              <ul className="space-y-2 max-h-[300px] overflow-y-auto">
                {unscheduledJobs.map((job) => (
                  <li key={job.id}>
                    <button type="button" onClick={() => { setScheduleModal(job); setScheduleDate(''); }}
                      aria-label={`Schedule ${job.client_name || 'job'}`}
                      className="w-full text-left p-2 border border-v-border rounded hover:bg-white/5">
                      <span className="block font-medium text-sm text-v-text-primary">{job.client_name || 'No name'}</span>
                      <span className="block text-xs text-v-text-secondary">{job.aircraft_model || job.aircraft_type}</span>
                      <span className="block text-xs text-green-400 font-medium">${formatPrice(job.total_price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Team On Duty (if any team schedules) */}
          {teamSchedules.length > 0 && (
            <div className="bg-v-surface rounded-lg shadow p-4">
              <h3 className="font-semibold text-v-text-primary mb-2 text-sm">Team</h3>
              <div className="space-y-1">
                {teamSchedules.map(s => (
                  <div key={s.member_id} className="flex items-center gap-2">
                    <div aria-hidden="true" className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-sm text-v-text-secondary">{s.member_name}</span>
                    <span className="text-xs text-v-text-secondary/80 capitalize">{s.role}</span>
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

          {/* Legend — compact chips, last panel */}
          {legend('sm:col-span-2 lg:col-span-1')}
        </aside>
      </div>

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={() => setSelectedJob(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="cal-job-title" className="bg-v-surface rounded-t-2xl sm:rounded-lg p-5 sm:p-6 w-full sm:max-w-md max-h-[90dvh] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h3 id="cal-job-title" className="text-lg font-semibold text-v-text-primary">Job Details</h3>
              <button type="button" onClick={() => setSelectedJob(null)} aria-label="Close job details" className="w-10 h-10 -mr-2 -mt-2 flex items-center justify-center text-v-text-secondary hover:text-v-text-primary text-2xl">&times;</button>
            </div>
            <div className="space-y-3">
              <div><p className="text-xs text-v-text-secondary">Customer</p><p className="font-medium text-v-text-primary">{selectedJob.client_name || 'No name'}</p></div>
              <div><p className="text-xs text-v-text-secondary">Aircraft</p><p className="font-medium text-v-text-primary">{selectedJob.aircraft_model || selectedJob.aircraft_type}</p></div>
              {selectedJob.tail_number && <div><p className="text-xs text-v-text-secondary">Tail Number</p><p className="font-medium text-v-text-primary">{selectedJob.tail_number}</p></div>}
              <div><p className="text-xs text-v-text-secondary">Scheduled</p><p className="font-medium text-v-text-primary">{selectedJob.scheduled_date ? new Date(selectedJob.scheduled_date).toLocaleString() : 'Not scheduled'}</p></div>
              <div><p className="text-xs text-v-text-secondary">Status</p><span className={`inline-block px-2 py-1 rounded text-xs text-white ${statusColors[selectedJob.status] || 'bg-gray-600'}`}>{STATUS_LABELS[selectedJob.status] || selectedJob.status}</span></div>
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
          <div role="dialog" aria-modal="true" aria-labelledby="cal-schedule-title" className="bg-v-surface rounded-t-2xl sm:rounded-lg p-5 sm:p-6 w-full sm:max-w-md max-h-[90dvh] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 id="cal-schedule-title" className="text-lg font-semibold text-v-text-primary mb-4">Schedule Job</h3>
            <div className="mb-4">
              <p className="font-medium text-v-text-primary">{scheduleModal.client_name || 'No name'}</p>
              <p className="text-sm text-v-text-secondary">{scheduleModal.aircraft_model || scheduleModal.aircraft_type}</p>
            </div>
            <div className="space-y-4">
              <div>
                <label htmlFor="cal-schedule-date" className="block text-sm font-medium text-v-text-secondary mb-1">Date</label>
                <input id="cal-schedule-date" type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded px-3 py-2" />
              </div>
              <div>
                <label htmlFor="cal-schedule-time" className="block text-sm font-medium text-v-text-secondary mb-1">Time</label>
                <input id="cal-schedule-time" type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="w-full border border-v-border bg-v-charcoal text-v-text-primary rounded px-3 py-2" />
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
