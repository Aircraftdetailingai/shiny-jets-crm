"use client";
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DashboardGrid from './DashboardGrid';
import AddWidgetModal from './AddWidgetModal';
import { WIDGET_REGISTRY, DEFAULT_ACTIVE_WIDGETS, DEFAULT_LAYOUTS } from './widgetRegistry';

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(90);
  const [editMode, setEditMode] = useState(false);
  const [layouts, setLayouts] = useState(DEFAULT_LAYOUTS);
  const [activeWidgets, setActiveWidgets] = useState(DEFAULT_ACTIVE_WIDGETS);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }

    // Fetch analytics data + saved layout in parallel (each wrapped so one failure doesn't block the other)
    Promise.all([
      fetch(`/api/analytics?days=${days}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => null),
      fetch('/api/user/dashboard-layout', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([analyticsData, layoutData]) => {
      if (analyticsData) setData(analyticsData);
      if (layoutData?.layout) {
        setLayouts(layoutData.layout.layouts || DEFAULT_LAYOUTS);
        setActiveWidgets(layoutData.layout.activeWidgets || DEFAULT_ACTIVE_WIDGETS);
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [router, days]);

  const handleLayoutChange = useCallback((newLayouts) => {
    setLayouts(newLayouts);
  }, []);

  const handleRemoveWidget = useCallback((widgetId) => {
    setActiveWidgets(prev => prev.filter(w => w !== widgetId));
  }, []);

  const handleAddWidget = useCallback((widgetId) => {
    setActiveWidgets(prev => [...prev, widgetId]);
    // Add to layouts at bottom
    const meta = WIDGET_REGISTRY[widgetId];
    if (meta) {
      setLayouts(prev => {
        const updated = { ...prev };
        for (const bp of Object.keys(updated)) {
          const maxY = updated[bp].reduce((max, item) => Math.max(max, item.y + item.h), 0);
          const size = bp === 'sm' ? { w: 1, h: meta.defaultSize.h } : bp === 'md' ? { w: 6, h: meta.defaultSize.h } : meta.defaultSize;
          updated[bp] = [...updated[bp], { i: widgetId, x: 0, y: maxY, ...size }];
        }
        return updated;
      });
    }
    setShowAddWidget(false);
  }, []);

  const handleSaveLayout = async () => {
    setSaving(true);
    const token = localStorage.getItem('vector_token');
    try {
      await fetch('/api/user/dashboard-layout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ layouts, activeWidgets }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleResetLayout = async () => {
    setLayouts(DEFAULT_LAYOUTS);
    setActiveWidgets(DEFAULT_ACTIVE_WIDGETS);
    const token = localStorage.getItem('vector_token');
    try {
      await fetch('/api/user/dashboard-layout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ layouts: DEFAULT_LAYOUTS, activeWidgets: DEFAULT_ACTIVE_WIDGETS }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="page-transition min-h-screen bg-v-charcoal">
      <div className="px-6 md:px-10 py-8 pb-40 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="font-heading text-[2rem] font-light text-v-text-primary" style={{ letterSpacing: '0.15em' }}>
              ANALYTICS
            </h1>
            <p className="text-v-text-secondary text-xs mt-1">Command center for your business</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Date range */}
            <div className="flex border border-v-border-subtle rounded-lg overflow-hidden">
              {[
                { val: 30, label: '30d' },
                { val: 90, label: '90d' },
                { val: 180, label: '6mo' },
                { val: 365, label: '1yr' },
              ].map(p => (
                <button
                  key={p.val}
                  onClick={() => { setDays(p.val); setLoading(true); }}
                  className={`px-3 py-1.5 text-[10px] tracking-[0.15em] uppercase transition-colors ${
                    days === p.val
                      ? 'bg-v-gold/10 text-v-gold'
                      : 'text-v-text-secondary hover:text-v-text-primary hover:bg-white/[0.02]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {/* Customize */}
            <button
              onClick={() => setEditMode(!editMode)}
              className={`px-4 py-1.5 text-[10px] tracking-[0.15em] uppercase border rounded-lg transition-colors ${
                editMode
                  ? 'border-v-gold text-v-gold bg-v-gold/5'
                  : 'border-v-border-subtle text-v-text-secondary hover:border-v-gold hover:text-v-gold'
              }`}
            >
              {editMode ? 'Done Editing' : 'Customize'}
            </button>
          </div>
        </div>

        {/* Edit mode toolbar */}
        {editMode && (
          <div className="flex items-center gap-3 mb-6 py-3 px-4 bg-v-surface border border-v-gold/20 rounded-xl">
            <button
              onClick={() => setShowAddWidget(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-[0.15em] uppercase text-v-gold border border-v-gold/30 rounded-lg hover:bg-v-gold/5 transition-colors"
            >
              <span className="text-sm">+</span> Add Widget
            </button>
            <button
              onClick={handleResetLayout}
              className="px-3 py-1.5 text-[10px] tracking-[0.15em] uppercase text-v-text-secondary border border-v-border-subtle rounded-lg hover:border-v-text-secondary transition-colors"
            >
              Reset Default
            </button>
            <div className="flex-1" />
            <button
              onClick={handleSaveLayout}
              disabled={saving}
              className="px-4 py-1.5 text-[10px] tracking-[0.15em] uppercase bg-v-gold text-v-charcoal font-medium rounded-lg hover:brightness-110 disabled:opacity-50 transition-all"
            >
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Layout'}
            </button>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-v-text-secondary text-xs tracking-widest uppercase">Loading analytics</p>
            </div>
          </div>
        ) : (
          <DashboardGrid
            layouts={layouts}
            activeWidgets={activeWidgets}
            data={data}
            editMode={editMode}
            onLayoutChange={handleLayoutChange}
            onRemoveWidget={handleRemoveWidget}
          />
        )}

        {/* Add Widget Modal */}
        {showAddWidget && (
          <AddWidgetModal
            activeWidgets={activeWidgets}
            onAdd={handleAddWidget}
            onClose={() => setShowAddWidget(false)}
          />
        )}
      </div>
    </div>
  );
}
