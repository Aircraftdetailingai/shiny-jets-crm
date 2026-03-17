'use client';
import { useMemo, useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { WIDGET_COMPONENTS } from './widgets';
import { WIDGET_REGISTRY } from './widgetRegistry';

const ResponsiveGridLayout = dynamic(
  () => import('react-grid-layout').then(mod => mod.ResponsiveGridLayout || mod.Responsive),
  { ssr: false, loading: () => <div className="animate-pulse h-96 bg-v-surface rounded-xl" /> }
);

export default function DashboardGrid({ layouts, activeWidgets, data, editMode, onLayoutChange, onRemoveWidget }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(1200);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    ro.observe(containerRef.current);
    setWidth(containerRef.current.offsetWidth);
    return () => ro.disconnect();
  }, []);

  const filteredLayouts = useMemo(() => {
    if (!layouts) return {};
    const result = {};
    for (const bp of Object.keys(layouts)) {
      result[bp] = layouts[bp].filter(item => activeWidgets.includes(item.i));
    }
    return result;
  }, [layouts, activeWidgets]);

  return (
    <div ref={containerRef}>
    <ResponsiveGridLayout
      className="layout"
      width={width}
      layouts={filteredLayouts}
      breakpoints={{ lg: 1200, md: 768, sm: 0 }}
      cols={{ lg: 12, md: 6, sm: 1 }}
      rowHeight={60}
      isDraggable={editMode}
      isResizable={editMode}
      onLayoutChange={(currentLayout, allLayouts) => onLayoutChange(allLayouts)}
      draggableHandle=".widget-drag-handle"
      margin={[16, 16]}
      containerPadding={[0, 0]}
    >
      {activeWidgets.map(widgetId => {
        const WidgetComponent = WIDGET_COMPONENTS[widgetId];
        const meta = WIDGET_REGISTRY[widgetId];
        if (!WidgetComponent || !meta) return null;
        return (
          <div key={widgetId} className="bg-v-surface border border-v-border-subtle rounded-xl overflow-hidden">
            {editMode && (
              <div className="widget-drag-handle flex justify-between items-center px-3 py-1.5 bg-v-charcoal border-b border-v-border-subtle cursor-move">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-v-text-secondary" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="8" cy="6" r="1.5" /><circle cx="16" cy="6" r="1.5" />
                    <circle cx="8" cy="12" r="1.5" /><circle cx="16" cy="12" r="1.5" />
                    <circle cx="8" cy="18" r="1.5" /><circle cx="16" cy="18" r="1.5" />
                  </svg>
                  <span className="text-[10px] text-v-text-secondary tracking-wider uppercase">{meta.name}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveWidget(widgetId); }}
                  className="text-v-text-secondary hover:text-red-400 transition-colors p-0.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            <div className={`p-4 h-full ${editMode ? 'pt-2' : ''}`} style={{ height: editMode ? 'calc(100% - 32px)' : '100%' }}>
              <WidgetComponent data={data} />
            </div>
          </div>
        );
      })}
    </ResponsiveGridLayout>
    </div>
  );
}
