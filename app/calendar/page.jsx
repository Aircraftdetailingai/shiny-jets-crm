"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice } from '@/lib/formatPrice';

const statusColors = {
  scheduled: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  paid: 'bg-green-500',
  completed: 'bg-purple-500',
};

export default function CalendarPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('month'); // 'month', 'week', 'day'
  const [selectedJob, setSelectedJob] = useState(null);
  const [scheduleModal, setScheduleModal] = useState(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    const stored = localStorage.getItem('vector_user');
    if (!token || !stored) {
      router.push('/login');
      return;
    }
    try { setUser(JSON.parse(stored)); } catch { localStorage.removeItem('vector_user'); router.push('/login'); return; }
    fetchJobs(token);
  }, [router]);

  const fetchJobs = async (token) => {
    try {
      const res = await fetch('/api/quotes?include_scheduled=true', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const allQuotes = data.quotes || data || [];
        // Filter to paid/scheduled/in_progress jobs
        const scheduledJobs = allQuotes.filter(q =>
          ['paid', 'scheduled', 'in_progress', 'completed'].includes(q.status)
        );
        setJobs(scheduledJobs);
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();

    const days = [];

    // Previous month days
    const prevMonth = new Date(year, month, 0);
    for (let i = startingDay - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonth.getDate() - i),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }

    // Next month days
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  };

  const getJobsForDate = (date) => {
    return jobs.filter(job => {
      const jobDate = job.scheduled_date ? new Date(job.scheduled_date) : null;
      if (!jobDate) return false;
      return (
        jobDate.getFullYear() === date.getFullYear() &&
        jobDate.getMonth() === date.getMonth() &&
        jobDate.getDate() === date.getDate()
      );
    });
  };

  const getUnscheduledJobs = () => {
    return jobs.filter(job => !job.scheduled_date && job.status === 'paid');
  };

  const navigateMonth = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + direction);
    setCurrentDate(newDate);
  };

  const handleScheduleJob = async () => {
    if (!scheduleModal || !scheduleDate) return;

    try {
      const token = localStorage.getItem('vector_token');
      const scheduledDateTime = new Date(`${scheduleDate}T${scheduleTime}`);

      const res = await fetch(`/api/quotes/${scheduleModal.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scheduled_date: scheduledDateTime.toISOString(),
          status: 'scheduled',
        }),
      });

      if (res.ok) {
        // Update local state
        setJobs(jobs.map(j =>
          j.id === scheduleModal.id
            ? { ...j, scheduled_date: scheduledDateTime.toISOString(), status: 'scheduled' }
            : j
        ));
        setScheduleModal(null);
        setScheduleDate('');
      }
    } catch (err) {
      console.error('Failed to schedule job:', err);
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const days = getDaysInMonth(currentDate);
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const today = new Date();
  const unscheduledJobs = getUnscheduledJobs();

  if (loading) {
    return (
      <div className="page-transition min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] flex items-center justify-center">
        <div className="text-white text-xl">{'Loading calendar...'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      {/* Header */}
      <header className="flex justify-between items-center mb-6 text-white">
        <div className="flex items-center space-x-4">
          <a href="/dashboard" className="text-2xl hover:text-amber-400">&larr;</a>
          <h1 className="text-2xl font-bold">{'Calendar'}</h1>
        </div>
        <div className="flex items-center space-x-4">
          <a href="/quotes" className="text-amber-400 hover:underline">{'Quotes'}</a>
          <a href="/dashboard" className="hover:underline">{'Dashboard'}</a>
        </div>
      </header>

      <div className="flex gap-4">
        {/* Main Calendar */}
        <div className="flex-1 bg-white rounded-lg shadow overflow-hidden">
          {/* Calendar Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigateMonth(-1)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                &larr;
              </button>
              <h2 className="text-xl font-semibold">{monthName}</h2>
              <button
                onClick={() => navigateMonth(1)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                &rarr;
              </button>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
              >
                {'Today'}
              </button>
            </div>
          </div>

          {/* Week Days Header */}
          <div className="grid grid-cols-7 border-b">
            {weekDays.map((day) => (
              <div key={day} className="p-2 text-center text-sm font-medium text-gray-500 border-r last:border-r-0">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7">
            {days.map((day, idx) => {
              const dayJobs = getJobsForDate(day.date);
              const isToday =
                day.date.getDate() === today.getDate() &&
                day.date.getMonth() === today.getMonth() &&
                day.date.getFullYear() === today.getFullYear();

              return (
                <div
                  key={idx}
                  className={`min-h-[100px] p-1 border-r border-b last:border-r-0 ${
                    day.isCurrentMonth ? 'bg-white' : 'bg-gray-50'
                  }`}
                >
                  <div className={`text-sm font-medium mb-1 ${
                    isToday
                      ? 'bg-amber-500 text-white w-6 h-6 rounded-full flex items-center justify-center'
                      : day.isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
                  }`}>
                    {day.date.getDate()}
                  </div>
                  <div className="space-y-1">
                    {dayJobs.slice(0, 3).map((job) => (
                      <div
                        key={job.id}
                        onClick={() => setSelectedJob(job)}
                        className={`text-xs p-1 rounded text-white cursor-pointer truncate ${statusColors[job.status] || 'bg-gray-500'}`}
                        title={`${job.aircraft_model || job.aircraft_type} - ${job.client_name || 'No name'}`}
                      >
                        {formatTime(job.scheduled_date)} {job.client_name || job.aircraft_model}
                      </div>
                    ))}
                    {dayJobs.length > 3 && (
                      <div className="text-xs text-gray-500">{`+${dayJobs.length - 3} more`}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar - Unscheduled Jobs */}
        <div className="w-80 bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-3">{'Unscheduled Jobs'} ({unscheduledJobs.length})</h3>
          <p className="text-sm text-gray-500 mb-4">{'Drag to calendar or click to schedule'}</p>

          {unscheduledJobs.length === 0 ? (
            <p className="text-gray-400 text-sm">{'No unscheduled jobs'}</p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {unscheduledJobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => {
                    setScheduleModal(job);
                    setScheduleDate('');
                  }}
                  className="p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                >
                  <div className="font-medium text-sm">{job.client_name || 'No name'}</div>
                  <div className="text-xs text-gray-500">
                    {job.aircraft_model || job.aircraft_type}
                  </div>
                  <div className="text-xs text-green-600 font-medium mt-1">
                    ${formatPrice(job.total_price)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Legend */}
          <div className="mt-6 pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">{'Status Legend'}</h4>
            <div className="space-y-1">
              {Object.entries(statusColors).map(([status, color]) => (
                <div key={status} className="flex items-center text-xs">
                  <div className={`w-3 h-3 rounded mr-2 ${color}`}></div>
                  <span className="capitalize">{t('status.' + status.replace(/_([a-z])/g, (_, c) => c.toUpperCase()))}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-lg p-5 sm:p-6 w-full sm:max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold">{'Job Details'}</h3>
              <button onClick={() => setSelectedJob(null)} className="text-gray-400 hover:text-gray-600">
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-500">{'Customer'}</label>
                <p className="font-medium">{selectedJob.client_name || 'No name'}</p>
              </div>

              <div>
                <label className="text-sm text-gray-500">{'Aircraft'}</label>
                <p className="font-medium">{selectedJob.aircraft_model || selectedJob.aircraft_type}</p>
              </div>

              {selectedJob.tail_number && (
                <div>
                  <label className="text-sm text-gray-500">{'Tail Number'}</label>
                  <p className="font-medium">{selectedJob.tail_number}</p>
                </div>
              )}

              <div>
                <label className="text-sm text-gray-500">{'Scheduled'}</label>
                <p className="font-medium">
                  {selectedJob.scheduled_date
                    ? new Date(selectedJob.scheduled_date).toLocaleString()
                    : 'Not scheduled'}
                </p>
              </div>

              <div>
                <label className="text-sm text-gray-500">{'Status'}</label>
                <p className={`inline-block px-2 py-1 rounded text-sm text-white ${statusColors[selectedJob.status] || 'bg-gray-500'}`}>
                  {selectedJob.status}
                </p>
              </div>

              <div>
                <label className="text-sm text-gray-500">{'Total'}</label>
                <p className="font-semibold text-lg text-green-600">
                  ${formatPrice(selectedJob.total_price)}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-6">
              <a
                href={`/jobs/${selectedJob.id}/photos`}
                className="w-full py-2 bg-blue-500 text-white rounded text-center hover:bg-blue-600 flex items-center justify-center gap-2"
              >
                <span>&#128247;</span> {'Document Job'}
              </a>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setScheduleModal(selectedJob);
                    setSelectedJob(null);
                  }}
                  className="flex-1 py-2 border border-amber-500 text-amber-500 rounded hover:bg-amber-50"
                >
                  {'Reschedule'}
                </button>
                <a
                  href={`/q/${selectedJob.share_link}`}
                  target="_blank"
                  className="flex-1 py-2 bg-amber-500 text-white rounded text-center hover:bg-amber-600"
                >
                  {'View Quote'}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {scheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-lg p-5 sm:p-6 w-full sm:max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">{'Schedule Job'}</h3>

            <div className="mb-4">
              <p className="font-medium">{scheduleModal.client_name || 'No name'}</p>
              <p className="text-sm text-gray-500">{scheduleModal.aircraft_model || scheduleModal.aircraft_type}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{'Date'}</label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{'Time'}</label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setScheduleModal(null)}
                className="flex-1 py-2 border rounded hover:bg-gray-50"
              >
                {'Cancel'}
              </button>
              <button
                onClick={handleScheduleJob}
                disabled={!scheduleDate}
                className="flex-1 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50"
              >
                {'Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
