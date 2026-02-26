"use client";
import { useState } from 'react';
import { useTranslation } from '@/lib/i18n';

export default function TimeLogPage() {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [worker, setWorker] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    hours_worked: '',
    service_type: '',
    notes: '',
  });

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
        throw new Error(data.error === 'Invalid PIN' ? t('timeLog.invalidPin') : data.error);
      }

      setWorker({ pin_code: pin, name: data.name, type: data.type });
      setSuccess('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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
      if (!res.ok) throw new Error(data.error || t('timeLog.failedToLogTime'));

      setSuccess(t('timeLog.loggedHours', { hours: form.hours_worked, date: form.date }));
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
  };

  return (
    <div className="page-transition min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-white text-3xl font-bold flex items-center justify-center space-x-2">
            <span>&#9992;</span>
            <span>{t('timeLog.vectorTimeLog')}</span>
          </div>
          <p className="text-white/60 mt-2">{t('timeLog.logYourWorkHours')}</p>
        </div>

        {!worker ? (
          /* PIN Entry */
          <form onSubmit={handlePinSubmit} className="bg-white rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 text-center">{t('timeLog.enterYourPin')}</h2>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm text-center">
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
                className="text-center text-3xl tracking-[0.5em] w-48 px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                placeholder="----"
                autoFocus
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || pin.length < 4}
              className="w-full py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium text-lg disabled:opacity-50"
            >
              {loading ? t('timeLog.checking') : t('timeLog.continue')}
            </button>
          </form>
        ) : (
          /* Time Entry Form */
          <form onSubmit={handleLogTime} className="bg-white rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{t('timeLog.logHours')}</h2>
                <p className="text-sm text-gray-500">{t('timeLog.welcome', { name: worker.name })}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                {t('timeLog.switchUser')}
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm">
                {success}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.date')}</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('timeLog.hoursWorked')}</label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                value={form.hours_worked}
                onChange={(e) => setForm({ ...form, hours_worked: e.target.value })}
                required
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-lg"
                placeholder="0.00"
              />
              <div className="flex gap-2 mt-2">
                {[2, 4, 6, 8].map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setForm({ ...form, hours_worked: h.toString() })}
                    className="flex-1 py-1.5 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200 transition-colors"
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('timeLog.serviceType')}</label>
              <select
                value={form.service_type}
                onChange={(e) => setForm({ ...form, service_type: e.target.value })}
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              >
                <option value="">{t('timeLog.selectService')}</option>
                <option value="Exterior Wash">{t('serviceTypes.extWash')}</option>
                <option value="Interior Detail">{t('serviceTypes.intDetail')}</option>
                <option value="Full Detail">{t('timeLog.fullDetail')}</option>
                <option value="Ceramic Coating">{t('serviceTypes.ceramic')}</option>
                <option value="Leather Treatment">{t('serviceTypes.leather')}</option>
                <option value="Brightwork">{t('serviceTypes.brightwork')}</option>
                <option value="Other">{t('timeLog.other')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.notes')}</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                placeholder={t('timeLog.optionalNotes')}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium text-lg disabled:opacity-50"
            >
              {loading ? t('timeLog.logging') : t('timeLog.logTime')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
