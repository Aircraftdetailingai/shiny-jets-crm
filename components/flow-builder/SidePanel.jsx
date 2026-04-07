"use client";
import { useState, useEffect } from 'react';

const ANSWER_TYPES = [
  { key: 'single_select', label: 'Single Select', desc: 'Choose one option' },
  { key: 'multi_select', label: 'Multi Select', desc: 'Choose multiple options' },
  { key: 'yes_no', label: 'Yes / No', desc: 'Two-button choice' },
  { key: 'text', label: 'Short Text', desc: 'Single line input' },
  { key: 'long_text', label: 'Long Text', desc: 'Multi-line textarea' },
  { key: 'photo_upload', label: 'Photo Upload', desc: 'File upload' },
  { key: 'number', label: 'Number', desc: 'Numeric input' },
  { key: 'date', label: 'Date', desc: 'Date picker' },
];

export default function SidePanel({ node, nodes, services = [], packages = [], onUpdate, onReorderOptions, onClose }) {
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
  const isSelect = ['single_select', 'multi_select'].includes(localData.answerType);

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

        {/* Answer Type dropdown (question only) */}
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
                  changes.allowBranching = undefined;
                }
                update(changes);
              }}
              className="w-full bg-v-charcoal border border-v-border text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-v-gold"
            >
              {ANSWER_TYPES.map(t => (
                <option key={t.key} value={t.key}>{t.label} — {t.desc}</option>
              ))}
            </select>
          </div>
        )}

        {/* Select type toggles */}
        {nodeType === 'question' && isSelect && (
          <div className="space-y-3">
            {/* Allow multiple selections toggle */}
            <label className="flex items-center justify-between cursor-pointer p-3 bg-v-charcoal rounded-lg border border-v-border">
              <div>
                <span className="text-white text-xs">Allow multiple selections</span>
                <p className="text-v-text-secondary text-[10px] mt-0.5">
                  {localData.answerType === 'multi_select' ? 'Checkbox style — pick many' : 'Radio style — pick one'}
                </p>
              </div>
              <input
                type="checkbox"
                checked={localData.answerType === 'multi_select'}
                onChange={e => update({ answerType: e.target.checked ? 'multi_select' : 'single_select' })}
                className="w-4 h-4 rounded accent-[var(--v-gold)]"
              />
            </label>

            {/* Allow branching toggle (single select only) */}
            {localData.answerType === 'single_select' && (
              <label className="flex items-center justify-between cursor-pointer p-3 bg-v-charcoal rounded-lg border border-v-border">
                <div>
                  <span className="text-white text-xs">Branch per option</span>
                  <p className="text-v-text-secondary text-[10px] mt-0.5">Each answer goes to a different next node</p>
                </div>
                <input
                  type="checkbox"
                  checked={localData.allowBranching || false}
                  onChange={e => update({ allowBranching: e.target.checked })}
                  className="w-4 h-4 rounded accent-[var(--v-gold)]"
                />
              </label>
            )}
          </div>
        )}

        {/* Options list (for select types) — drag to reorder */}
        {nodeType === 'question' && isSelect && (
          <div>
            <label className="block text-[10px] text-v-text-secondary uppercase tracking-wider mb-1.5">Options</label>
            <div className="space-y-1.5">
              {(localData.options || []).map((opt, i) => (
                <div key={i} className="flex items-center gap-1.5"
                  draggable
                  onDragStart={e => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={e => {
                    e.preventDefault();
                    const from = parseInt(e.dataTransfer.getData('text/plain'));
                    if (isNaN(from) || from === i) return;
                    const oldOpts = [...(localData.options || [])];
                    const opts = [...oldOpts];
                    const [moved] = opts.splice(from, 1);
                    opts.splice(i, 0, moved);
                    // Remap branching edges when options are reordered
                    if (localData.allowBranching && onReorderOptions) {
                      onReorderOptions(node.id, oldOpts, opts);
                    }
                    update({ options: opts });
                  }}
                >
                  <span className="cursor-grab active:cursor-grabbing text-v-text-secondary/40 hover:text-v-text-secondary text-xs select-none px-0.5">&#9776;</span>
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
                    onClick={() => {
                      const oldOpts = [...(localData.options || [])];
                      const newOpts = oldOpts.filter((_, j) => j !== i);
                      if (localData.allowBranching && onReorderOptions) {
                        onReorderOptions(node.id, oldOpts, newOpts);
                      }
                      update({ options: newOpts });
                    }}
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

        {/* Packages + Services (serviceSelect nodes) */}
        {nodeType === 'serviceSelect' && (
          <div className="space-y-4">
            {/* Packages */}
            {packages.length > 0 && (
              <div>
                <label className="block text-[10px] text-v-text-secondary uppercase tracking-wider mb-1.5">Packages</label>
                <div className="space-y-1">
                  {packages.map((pkg) => {
                    const name = pkg.name;
                    const included = (localData.packageNames || []).includes(name);
                    return (
                      <label key={pkg.id || name} className="flex items-center gap-2 p-2 bg-v-charcoal rounded border border-v-border cursor-pointer hover:border-v-border-subtle">
                        <input
                          type="checkbox"
                          checked={included}
                          onChange={() => {
                            const current = localData.packageNames || [];
                            const updated = included
                              ? current.filter(n => n !== name)
                              : [...current, name];
                            update({ packageNames: updated });
                          }}
                          className="w-3.5 h-3.5 rounded accent-[var(--v-gold)]"
                        />
                        <div className="min-w-0">
                          <span className="text-white text-xs block">{name}</span>
                          {pkg.description && <span className="text-v-text-secondary text-[10px] block truncate">{pkg.description}</span>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Individual services */}
            {services.length > 0 && (
              <div>
                <label className="block text-[10px] text-v-text-secondary uppercase tracking-wider mb-1.5">Individual Services</label>
                <div className="space-y-1">
                  {services.map((svc) => {
                    const name = typeof svc === 'string' ? svc : svc.name;
                    const included = (localData.serviceNames || []).includes(name);
                    return (
                      <label key={name} className="flex items-center gap-2 p-2 bg-v-charcoal rounded border border-v-border cursor-pointer hover:border-v-border-subtle">
                        <input
                          type="checkbox"
                          checked={included}
                          onChange={() => {
                            const current = localData.serviceNames || [];
                            const updated = included
                              ? current.filter(n => n !== name)
                              : [...current, name];
                            update({ serviceNames: updated });
                          }}
                          className="w-3.5 h-3.5 rounded accent-[var(--v-gold)]"
                        />
                        <span className="text-white text-xs">{name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {services.length === 0 && packages.length === 0 && (
              <p className="text-v-text-secondary text-[10px]">
                No services or packages configured. <a href="/settings/services" className="text-v-gold underline">Add services</a> first.
              </p>
            )}
          </div>
        )}

        {/* Required toggle */}
        {(nodeType === 'question' || nodeType === 'serviceSelect') && (
          <label className="flex items-center justify-between cursor-pointer p-3 bg-v-charcoal rounded-lg border border-v-border">
            <span className="text-white text-xs">Required</span>
            <input
              type="checkbox"
              checked={localData.required || false}
              onChange={e => update({ required: e.target.checked })}
              className="w-4 h-4 rounded accent-[var(--v-gold)]"
            />
          </label>
        )}
      </div>
    </div>
  );
}
