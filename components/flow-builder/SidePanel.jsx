"use client";
import { useState, useEffect } from 'react';
import { QUESTION_TYPES } from '@/lib/default-intake-flow';

export default function SidePanel({ node, nodes, onUpdate, onClose }) {
  const [localData, setLocalData] = useState({});

  useEffect(() => {
    if (node) setLocalData({ ...node.data });
  }, [node?.id]);

  if (!node) return null;

  const update = (changes) => {
    const updated = { ...localData, ...changes };
    setLocalData(updated);
    onUpdate(node.id, updated);
  };

  const nodeType = node.type;

  // Find nodes that can be referenced in conditions (service select and question nodes)
  const referencableNodes = nodes.filter(
    n => n.id !== node.id && (n.type === 'serviceSelect' || n.type === 'question')
  );

  return (
    <div className="fixed top-0 right-0 w-[360px] h-full bg-v-surface border-l border-v-border z-40 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-v-border">
        <h2 className="text-white text-sm font-medium">Edit Node</h2>
        <button onClick={onClose} className="text-v-text-secondary hover:text-white text-lg">&times;</button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Label / Question Text */}
        {(nodeType === 'question' || nodeType === 'serviceSelect' || nodeType === 'end') && (
          <div>
            <label className="block text-[10px] text-v-text-secondary uppercase tracking-wider mb-1.5">
              {nodeType === 'end' ? 'Button Label' : 'Question Text'}
            </label>
            <input
              type="text"
              value={localData.label || ''}
              onChange={e => update({ label: e.target.value })}
              className="w-full bg-v-charcoal border border-v-border text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-v-gold"
            />
          </div>
        )}

        {/* Answer Type (question only) */}
        {nodeType === 'question' && (
          <div>
            <label className="block text-[10px] text-v-text-secondary uppercase tracking-wider mb-1.5">Answer Type</label>
            <select
              value={localData.answerType || 'text'}
              onChange={e => {
                const type = e.target.value;
                const changes = { answerType: type };
                if (['single_select', 'multi_select'].includes(type) && !localData.options?.length) {
                  changes.options = ['Option 1', 'Option 2'];
                }
                if (!['single_select', 'multi_select'].includes(type)) {
                  changes.options = undefined;
                }
                update(changes);
              }}
              className="w-full bg-v-charcoal border border-v-border text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-v-gold"
            >
              {QUESTION_TYPES.map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Options (for select types) */}
        {nodeType === 'question' && ['single_select', 'multi_select'].includes(localData.answerType) && (
          <div>
            <label className="block text-[10px] text-v-text-secondary uppercase tracking-wider mb-1.5">Options</label>
            <div className="space-y-1.5">
              {(localData.options || []).map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={e => {
                      const opts = [...(localData.options || [])];
                      opts[i] = e.target.value;
                      update({ options: opts });
                    }}
                    className="flex-1 bg-v-charcoal border border-v-border text-white rounded px-2 py-1.5 text-xs outline-none focus:border-v-gold"
                  />
                  <button
                    onClick={() => update({ options: (localData.options || []).filter((_, j) => j !== i) })}
                    className="text-red-400/60 hover:text-red-400 text-xs px-1"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => update({ options: [...(localData.options || []), `Option ${(localData.options?.length || 0) + 1}`] })}
              className="text-v-gold text-[10px] mt-2 hover:text-v-gold-dim"
            >
              + Add option
            </button>
          </div>
        )}

        {/* Placeholder (for text types) */}
        {nodeType === 'question' && ['text', 'long_text'].includes(localData.answerType) && (
          <div>
            <label className="block text-[10px] text-v-text-secondary uppercase tracking-wider mb-1.5">Placeholder</label>
            <input
              type="text"
              value={localData.placeholder || ''}
              onChange={e => update({ placeholder: e.target.value })}
              className="w-full bg-v-charcoal border border-v-border text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-v-gold"
            />
          </div>
        )}

        {/* Condition Fields */}
        {nodeType === 'condition' && (
          <>
            <div>
              <label className="block text-[10px] text-v-text-secondary uppercase tracking-wider mb-1.5">Condition Label</label>
              <input
                type="text"
                value={localData.label || ''}
                onChange={e => update({ label: e.target.value })}
                className="w-full bg-v-charcoal border border-v-border text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-v-gold"
              />
            </div>
            <div>
              <label className="block text-[10px] text-v-text-secondary uppercase tracking-wider mb-1.5">Check Answer From</label>
              <select
                value={localData.sourceNodeId || ''}
                onChange={e => update({ sourceNodeId: e.target.value, field: '', value: '' })}
                className="w-full bg-v-charcoal border border-v-border text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-v-gold"
              >
                <option value="">Select a node...</option>
                {referencableNodes.map(n => (
                  <option key={n.id} value={n.id}>{n.data.label || n.id}</option>
                ))}
              </select>
            </div>
            {localData.sourceNodeId && (
              <div>
                <label className="block text-[10px] text-v-text-secondary uppercase tracking-wider mb-1.5">Value Contains</label>
                <input
                  type="text"
                  value={localData.value || ''}
                  onChange={e => update({ value: e.target.value })}
                  placeholder="e.g. Ceramic Coating"
                  className="w-full bg-v-charcoal border border-v-border text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-v-gold"
                />
              </div>
            )}
          </>
        )}

        {/* Required toggle */}
        {(nodeType === 'question' || nodeType === 'serviceSelect') && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={localData.required || false}
              onChange={e => update({ required: e.target.checked })}
              className="w-3.5 h-3.5 rounded accent-[var(--v-gold)]"
            />
            <span className="text-v-text-secondary text-xs">Required</span>
          </label>
        )}
      </div>
    </div>
  );
}
