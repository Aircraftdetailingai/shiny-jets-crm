"use client";
import { useState, useEffect } from 'react';

const CHECKLIST_ITEMS = [
  { id: 'create_quote', category: 'Quoting', label: 'Create quote', description: 'Build a new quote with aircraft, services, and pricing' },
  { id: 'send_email', category: 'Quoting', label: 'Send quote via email', description: 'Send a quote to a customer via email delivery' },
  { id: 'send_sms', category: 'Quoting', label: 'Send quote via SMS', description: 'Send a quote to a customer via text message (Business plan)' },
  { id: 'customer_receives', category: 'Quoting', label: 'Customer receives quote', description: 'Verify customer sees branded quote page with correct pricing' },
  { id: 'customer_pays', category: 'Payments', label: 'Customer pays via Stripe', description: 'Customer completes payment through Stripe checkout' },
  { id: 'payment_notification', category: 'Payments', label: 'Payment notification received', description: 'Detailer receives email/SMS notification of payment' },
  { id: 'add_team', category: 'Team', label: 'Add team member', description: 'Add a new team member and assign them to a job' },
  { id: 'log_time', category: 'Team', label: 'Log time entry', description: 'Log hours worked on a job via time tracker' },
  { id: 'recurring_service', category: 'Features', label: 'Recurring service created', description: 'Set up a recurring service with auto-generation' },
  { id: 'ai_assistant', category: 'Features', label: 'AI Sales Assistant works', description: 'Test the AI sales assistant chat on lead intake page' },
  { id: 'promo_code', category: 'Billing', label: 'Promo code system works', description: 'Apply a promo code during upgrade and verify discount' },
  { id: 'pwa_install', category: 'Mobile', label: 'PWA install works', description: 'Install Vector as a Progressive Web App on mobile device' },
  { id: 'mobile_pages', category: 'Mobile', label: 'All pages load on mobile', description: 'Verify every page renders correctly on mobile viewport' },
];

const STORAGE_KEY = 'vector_test_checklist';

export default function TestChecklistPage() {
  const [checked, setChecked] = useState({});
  const [notes, setNotes] = useState({});
  const [expandedItem, setExpandedItem] = useState(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setChecked(parsed.checked || {});
        setNotes(parsed.notes || {});
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ checked, notes }));
    } catch {}
  }, [checked, notes]);

  const toggle = (id) => {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const totalDone = CHECKLIST_ITEMS.filter(i => checked[i.id]).length;
  const totalItems = CHECKLIST_ITEMS.length;
  const pct = Math.round((totalDone / totalItems) * 100);

  const grouped = {};
  for (const item of CHECKLIST_ITEMS) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  const resetAll = () => {
    if (!confirm('Reset all checklist progress?')) return;
    setChecked({});
    setNotes({});
  };

  return (
    <div className="min-h-screen bg-v-charcoal p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a href="/dashboard" className="text-2xl text-v-text-secondary hover:text-v-text-primary">&larr;</a>
              <h1 className="text-2xl font-bold">Launch Checklist</h1>
            </div>
            <button
              onClick={resetAll}
              className="text-xs text-v-text-secondary hover:text-red-500 transition-colors"
            >
              Reset
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-4 bg-v-surface rounded-sm shadow p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-v-text-secondary">
                {totalDone} of {totalItems} complete
              </span>
              <span className={`text-sm font-bold ${pct === 100 ? 'text-green-600' : 'text-v-gold-dim'}`}>
                {pct}%
              </span>
            </div>
            <div className="w-full bg-v-charcoal rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${pct === 100 ? 'bg-green-500' : 'bg-v-gold'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {pct === 100 && (
              <p className="text-green-600 text-sm font-medium mt-2 text-center">
                All tests passed — ready to launch!
              </p>
            )}
          </div>
        </div>

        {/* Checklist by category */}
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, items]) => {
            const catDone = items.filter(i => checked[i.id]).length;
            return (
              <div key={category} className="bg-v-surface rounded-sm shadow overflow-hidden">
                <div className="px-4 py-3 bg-v-charcoal border-b flex justify-between items-center">
                  <h2 className="text-sm font-semibold text-v-text-secondary uppercase tracking-wide">{category}</h2>
                  <span className="text-xs text-v-text-secondary">{catDone}/{items.length}</span>
                </div>
                <div className="divide-y">
                  {items.map(item => (
                    <div key={item.id}>
                      <div
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                          checked[item.id] ? 'bg-green-50' : 'hover:bg-white/5'
                        }`}
                        onClick={() => toggle(item.id)}
                      >
                        <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          checked[item.id]
                            ? 'bg-green-500 border-green-500'
                            : 'border-v-border'
                        }`}>
                          {checked[item.id] && (
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-medium ${checked[item.id] ? 'text-green-700 line-through' : 'text-v-text-primary'}`}>
                            {item.label}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedItem(expandedItem === item.id ? null : item.id);
                          }}
                          className="text-v-text-secondary hover:text-v-text-secondary p-1"
                        >
                          <svg className={`w-4 h-4 transition-transform ${expandedItem === item.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                      {expandedItem === item.id && (
                        <div className="px-4 pb-3 pl-13 bg-v-charcoal border-t border-gray-100">
                          <p className="text-xs text-v-text-secondary mb-2 ml-9">{item.description}</p>
                          <textarea
                            value={notes[item.id] || ''}
                            onChange={(e) => setNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Add notes..."
                            className="w-full ml-9 text-xs border rounded px-2 py-1.5 resize-none"
                            rows={2}
                            style={{ maxWidth: 'calc(100% - 2.25rem)' }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Timestamp */}
        <p className="text-center text-xs text-v-text-secondary mt-6">
          Progress saved to this browser
        </p>
      </div>
    </div>
  );
}
