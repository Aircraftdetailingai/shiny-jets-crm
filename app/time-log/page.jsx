"use client";
import { useState, useEffect } from 'react';

export default function TimeLogPage() {
  const [pin, setPin] = useState('');
  const [worker, setWorker] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Clock state
  const [clockedIn, setClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState(null);
  const [todayHours, setTodayHours] = useState(0);
  const [clockLoading, setClockLoading] = useState(false);
  const [elapsed, setElapsed] = useState('00:00:00');

  // Manual entry form
  const [showManual, setShowManual] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    hours_worked: '',
    service_type: '',
    notes: '',
  });

  // Elapsed time counter
  useEffect(() => {
    if (!clockedIn || !clockInTime) return;
    const interval = setInterval(() => {
      const diff = Date.now() - new Date(clockInTime).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [clockedIn, clockInTime]);

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/time-entries/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin_code: pin }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error === 'Invalid PIN' ? 'Invalid PIN. Please try again.' : data.error);
      }

      setWorker({ pin_code: pin, name: data.name, type: data.type });
      setSuccess('');

      // Check clock status
      const statusRes = await fetch('/api/time-entries/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin_code: pin, action: 'status' }),
      });
      const statusData = await statusRes.json();
      if (statusRes.ok) {
        setClockedIn(statusData.clocked_in);
        setClockInTime(statusData.clock_in_time);
        setTodayHours(statusData.today_hours || 0);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClock = async (action) => {
    setClockLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/time-entries/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin_code: worker.pin_code, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setClockedIn(data.clocked_in);
      if (action === 'clock_in') {
        setClockInTime(data.clock_in);
        setSuccess('Clocked in!');
      } else {
        setClockInTime(null);
        setElapsed('00:00:00');
        setTodayHours(prev => prev + (data.hours_worked || 0));
        setSuccess(`Clocked out. ${data.hours_worked?.toFixed(2)} hours logged.`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setClockLoading(false);
    }
  };

  const handleLogTime = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch('/api/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin_code: worker.pin_code,
          date: form.date,
          hours_worked: form.hours_worked,
          service_type: form.service_type || null,
          notes: form.notes || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to log time');

      setSuccess(`Logged ${form.hours_worked} hours for ${form.date}`);
      setForm({
        date: new Date().toISOString().split('T')[0],
        hours_worked: '',
        service_type: '',
        notes: '',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setWorker(null);
    setPin('');
    setError('');
    setSuccess('');
    setClockedIn(false);
    setClockInTime(null);
    setTodayHours(0);
    setShowManual(false);
  };

  return (
    <div className="page-transition min-h-screen bg-v-charcoal flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-white text-3xl font-bold flex items-center justify-center space-x-2">
            <span>&#9992;</span>
            <span>Vector Time Log</span>
          </div>
          <p className="text-white/60 mt-2">Clock in/out & log your work hours</p>
        </div>

        {!worker ? (
          /* PIN Entry */
          <form onSubmit={handlePinSubmit} className="bg-v-surface rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-semibold text-v-text-primary text-center">Enter Your PIN</h2>

            {error && (
              <div className="bg-red-900/20 border border-red-200 rounded-lg p-3 text-red-700 text-sm text-center">
                {error}
              </div>
            )}

            <div className="flex justify-center">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center text-3xl tracking-[0.5em] w-48 px-4 py-3 border-2 border-v-border rounded-lg focus:ring-2 focus:ring-v-gold focus:border-v-gold outline-none"
                placeholder="----"
                autoFocus
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || pin.length < 4}
              className="w-full py-3 bg-v-gold text-white rounded-lg hover:bg-v-gold-dim transition-colors font-medium text-lg disabled:opacity-50"
            >
              {loading ? 'Checking...' : 'Continue'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            {/* Worker header */}
            <div className="bg-v-surface rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="text-v-text-primary font-semibold">{worker.name}</p>
                <p className="text-v-text-secondary text-sm capitalize">{worker.type}</p>
              </div>
              <button onClick={handleLogout} className="text-sm text-v-text-secondary hover:text-v-text-primary">
                Switch User
              </button>
            </div>

            {/* Messages */}
            {error && (
              <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">{error}</div>
            )}
            {success && (
              <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm">{success}</div>
            )}

            {/* Clock In/Out */}
            <div className="bg-v-surface rounded-lg p-6 text-center">
              <p className="text-v-text-secondary text-xs uppercase tracking-wider mb-2">
                {clockedIn ? 'Clocked In' : 'Not Clocked In'}
              </p>

              {clockedIn && (
                <p className="text-4xl font-mono text-v-text-primary mb-4">{elapsed}</p>
              )}

              <button
                onClick={() => handleClock(clockedIn ? 'clock_out' : 'clock_in')}
                disabled={clockLoading}
                className={`w-full py-4 rounded-lg font-bold text-lg transition-colors disabled:opacity-50 ${
                  clockedIn
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
              >
                {clockLoading
                  ? (clockedIn ? 'Clocking Out...' : 'Clocking In...')
                  : (clockedIn ? 'Clock Out' : 'Clock In')
                }
              </button>

              {todayHours > 0 && (
                <p className="text-v-text-secondary text-sm mt-3">
                  Today: {todayHours.toFixed(2)} hours logged
                </p>
              )}
            </div>

            {/* Manual Entry Toggle */}
            <button
              onClick={() => setShowManual(!showManual)}
              className="w-full text-center text-sm text-v-text-secondary hover:text-v-text-primary py-2"
            >
              {showManual ? 'Hide Manual Entry' : 'Manual Time Entry'}
            </button>

            {/* Manual Entry Form */}
            {showManual && (
              <form onSubmit={handleLogTime} className="bg-v-surface rounded-lg p-6 space-y-4">
                <h3 className="text-lg font-semibold text-v-text-primary">Manual Entry</h3>

                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    required
                    className="w-full px-3 py-3 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold focus:border-v-gold outline-none text-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">Hours Worked</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    max="24"
                    value={form.hours_worked}
                    onChange={(e) => setForm({ ...form, hours_worked: e.target.value })}
                    required
                    className="w-full px-3 py-3 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold focus:border-v-gold outline-none text-lg"
                    placeholder="0.00"
                  />
                  <div className="flex gap-2 mt-2">
                    {[2, 4, 6, 8].map(h => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setForm({ ...form, hours_worked: h.toString() })}
                        className="flex-1 py-1.5 bg-v-charcoal text-v-text-secondary rounded text-sm hover:bg-v-charcoal transition-colors"
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">Service Type</label>
                  <select
                    value={form.service_type}
                    onChange={(e) => setForm({ ...form, service_type: e.target.value })}
                    className="w-full px-3 py-3 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold focus:border-v-gold outline-none"
                  >
                    <option value="">Select service...</option>
                    <option value="Exterior Wash">Exterior Wash</option>
                    <option value="Interior Detail">Interior Detail</option>
                    <option value="Full Detail">Full Detail</option>
                    <option value="Ceramic Coating">Ceramic Coating</option>
                    <option value="Leather Treatment">Leather Treatment</option>
                    <option value="Brightwork">Brightwork</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-v-text-secondary mb-1">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold focus:border-v-gold outline-none"
                    placeholder="Optional notes about the work"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-v-gold text-white rounded-lg hover:bg-v-gold-dim transition-colors font-medium text-lg disabled:opacity-50"
                >
                  {loading ? 'Logging...' : 'Log Time'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
