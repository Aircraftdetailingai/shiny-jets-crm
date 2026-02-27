"use client";
import { useState } from 'react';

export default function AddCustomerModal({ isOpen, onClose, onSuccess, tags = [] }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', company_name: '', airport: '', notes: '', contactPref: 'email', tags: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const resetForm = () => {
    setForm({ name: '', email: '', phone: '', company_name: '', airport: '', notes: '', contactPref: 'email', tags: [] });
    setError('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Customer name is required'); return; }
    if (!form.email.trim()) { setError('Email is required'); return; }
    setSaving(true);
    setError('');
    const token = localStorage.getItem('vector_token');
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          company_name: form.company_name.trim() || null,
          notes: [form.airport ? `Airport: ${form.airport.trim()}` : '', form.notes.trim()].filter(Boolean).join('\n') || null,
          tags: form.tags.length > 0 ? form.tags : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save customer');
        return;
      }
      if (!data.customer) {
        setError(data.error || 'Customer was not saved. Please try again.');
        return;
      }
      resetForm();
      if (onSuccess) onSuccess(data);
      onClose();
    } catch (e) {
      setError('Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-lg p-5 sm:p-6 w-full sm:max-w-md overflow-y-auto max-h-[95vh] sm:max-h-[90vh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Add Customer</h2>
          <button onClick={() => { resetForm(); onClose(); }} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
            <input
              type="text"
              value={form.company_name}
              onChange={(e) => setForm(p => ({ ...p, company_name: e.target.value }))}
              placeholder="e.g. Shiny Jets LLC"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Full name"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
              placeholder="customer@email.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))}
              placeholder="(555) 123-4567"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Airport / Location</label>
            <input
              type="text"
              value={form.airport}
              onChange={(e) => setForm(p => ({ ...p, airport: e.target.value }))}
              placeholder="KSDL, KVNY, etc."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Any notes about this customer..."
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Preference</label>
            <div className="flex gap-2">
              {['email', 'sms', 'both'].map((pref) => (
                <button
                  key={pref}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, contactPref: pref }))}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border ${
                    form.contactPref === pref
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {pref === 'email' ? 'Email' : pref === 'sms' ? 'SMS' : 'Both'}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => {
                  const selected = form.tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setForm(p => ({
                        ...p,
                        tags: selected ? p.tags.filter(t => t !== tag) : [...p.tags, tag],
                      }))}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                        selected
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-gray-100 text-gray-700 border-gray-300 hover:opacity-80'
                      }`}
                    >
                      {selected ? '\u2713 ' : ''}{tag}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={() => { resetForm(); onClose(); }}
            className="px-4 py-3 border rounded-lg text-gray-700 min-h-[44px] font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white disabled:opacity-50 min-h-[44px] font-semibold"
          >
            {saving ? 'Saving...' : 'Save Customer'}
          </button>
        </div>
      </div>
    </div>
  );
}
