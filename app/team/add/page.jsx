"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AddTeamMemberPage() {
  const router = useRouter();
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
      if (!res.ok) throw new Error(data.error || 'Failed to create');

      router.push('/team');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-transition min-h-screen bg-v-charcoal p-4">
      {/* Header */}
      <header className="flex items-center space-x-3 mb-6">
        <a href="/team" className="text-white text-2xl">&#8592;</a>
        <h1 className="text-2xl font-bold text-white">{'Add Your First Team Member'}</h1>
      </header>

      <div className="max-w-lg mx-auto">
        <form onSubmit={handleSubmit} className="bg-v-surface rounded-lg p-6 space-y-4">
          {error && (
            <div className="bg-red-900/20 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Name'} *</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold focus:border-v-gold outline-none"
              placeholder={'Full name'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Type'} *</label>
            <select
              name="type"
              value={form.type}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold focus:border-v-gold outline-none"
            >
              <option value="employee">{'Employee'}</option>
              <option value="contractor">{'Contractor'}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Role'} *</label>
            <select
              name="role"
              value={form.role}
              onChange={(e) => {
                const role = e.target.value;
                const type = ['employee', 'owner', 'manager', 'lead_tech'].includes(role) ? 'employee' : 'contractor';
                setForm({ ...form, role, type });
              }}
              className="w-full px-3 py-2 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold focus:border-v-gold outline-none"
            >
              <option value="manager">{'Manager'}</option>
              <option value="lead_tech">{'Lead Tech'}</option>
              <option value="employee">{'Employee'}</option>
              <option value="contractor">{'Contractor'}</option>
            </select>
            <p className="text-xs text-v-text-secondary mt-1">{'Role determines default permissions. Owner can customize in Team Permissions.'}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Email'}</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold focus:border-v-gold outline-none"
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Phone'}</label>
            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold focus:border-v-gold outline-none"
              placeholder="(555) 123-4567"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-v-text-secondary mb-1">{'Hourly Pay Rate'}</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-v-text-secondary">$</span>
              <input
                type="number"
                name="hourly_pay"
                value={form.hourly_pay}
                onChange={handleChange}
                step="0.01"
                min="0"
                className="w-full pl-7 pr-3 py-2 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold focus:border-v-gold outline-none"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-v-text-secondary mb-1">{'PIN Code'}</label>
            <input
              type="text"
              name="pin_code"
              value={form.pin_code}
              onChange={handleChange}
              maxLength={6}
              className="w-full px-3 py-2 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold focus:border-v-gold outline-none"
              placeholder={'4-6 digit PIN for time logging'}
            />
            <p className="text-xs text-v-text-secondary mt-1">{'Workers use this PIN to log their hours at /time-log'}</p>
          </div>

          <div className="flex space-x-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-v-gold-muted/200 text-white rounded-lg hover:bg-v-gold-dim transition-colors font-medium disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Add Your First Team Member'}
            </button>
            <a
              href="/team"
              className="px-4 py-2 bg-v-charcoal text-v-text-secondary rounded-lg hover:bg-v-charcoal transition-colors text-center"
            >
              {'Cancel'}
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
