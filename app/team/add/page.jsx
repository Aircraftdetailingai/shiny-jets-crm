"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n';

export default function AddTeamMemberPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    type: 'employee',
    role: 'employee',
    hourly_pay: '',
    pin_code: '',
  });

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('errors.failedToCreate'));

      router.push('/team');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      {/* Header */}
      <header className="flex items-center space-x-3 mb-6">
        <a href="/team" className="text-white text-2xl">&#8592;</a>
        <h1 className="text-2xl font-bold text-white">{t('team.addFirst')}</h1>
      </header>

      <div className="max-w-lg mx-auto">
        <form onSubmit={handleSubmit} className="bg-white rounded-lg p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.name')} *</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              placeholder={t('teamExtra.fullNamePlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.type')} *</label>
            <select
              name="type"
              value={form.type}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            >
              <option value="employee">{t('team.employee')}</option>
              <option value="contractor">{t('team.contractor')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('team.role')} *</label>
            <select
              name="role"
              value={form.role}
              onChange={(e) => {
                const role = e.target.value;
                const type = ['employee', 'owner', 'manager', 'lead_tech'].includes(role) ? 'employee' : 'contractor';
                setForm({ ...form, role, type });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            >
              <option value="manager">{t('team.manager')}</option>
              <option value="lead_tech">{t('team.leadTech')}</option>
              <option value="employee">{t('team.employee')}</option>
              <option value="contractor">{t('team.contractor')}</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">{t('teamExtra.rolePermissionNote')}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.email')}</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.phone')}</label>
            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              placeholder="(555) 123-4567"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('teamExtra.hourlyPayRate')}</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="number"
                name="hourly_pay"
                value={form.hourly_pay}
                onChange={handleChange}
                step="0.01"
                min="0"
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('teamExtra.pinCode')}</label>
            <input
              type="text"
              name="pin_code"
              value={form.pin_code}
              onChange={handleChange}
              maxLength={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              placeholder={t('teamExtra.pinPlaceholder')}
            />
            <p className="text-xs text-gray-500 mt-1">{t('teamExtra.pinNote')}</p>
          </div>

          <div className="flex space-x-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium disabled:opacity-50"
            >
              {loading ? t('common.creating') : t('team.addFirst')}
            </button>
            <a
              href="/team"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-center"
            >
              {t('common.cancel')}
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
