"use client";
import { useState, useMemo, useCallback } from 'react';

export default function FlowPreview({ nodes, edges, services, onClose }) {
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [selectedOptions, setSelectedOptions] = useState({});

  // Find start node
  const startNode = useMemo(() => nodes.find(n => n.type === 'start'), [nodes]);

  // Get the first node after start
  const firstEdge = useMemo(() => edges.find(e => e.source === startNode?.id), [edges, startNode]);

  // Initialize to first node after start
  const activeNodeId = currentNodeId || firstEdge?.target;
  const activeNode = nodes.find(n => n.id === activeNodeId);

  const getNextNodeId = useCallback((nodeId, answer) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return null;

    if (node.type === 'condition') {
      // Check condition
      const sourceAnswer = answers[node.data.sourceNodeId];
      const val = node.data.value || '';
      let match = false;
      if (Array.isArray(sourceAnswer)) {
        match = sourceAnswer.some(a => a.toLowerCase().includes(val.toLowerCase()));
      } else if (typeof sourceAnswer === 'string') {
        match = sourceAnswer.toLowerCase().includes(val.toLowerCase());
      }
      const handleId = match ? 'yes' : 'no';
      const edge = edges.find(e => e.source === nodeId && e.sourceHandle === handleId);
      return edge?.target || null;
    }

    if (node.type === 'question' && node.data.answerType === 'yes_no') {
      const handleId = answer === 'Yes' ? 'yes' : 'no';
      const edge = edges.find(e => e.source === nodeId && e.sourceHandle === handleId);
      return edge?.target || null;
    }

    // Default: follow the single output edge
    const edge = edges.find(e => e.source === nodeId && !e.sourceHandle);
    return edge?.target || null;
  }, [nodes, edges, answers]);

  const handleNext = (answer) => {
    if (!activeNode) return;

    // Save answer
    const newAnswers = { ...answers, [activeNodeId]: answer };
    setAnswers(newAnswers);

    // Navigate
    let nextId = getNextNodeId(activeNodeId, answer);

    // If next is a condition node, auto-evaluate it
    while (nextId) {
      const nextNode = nodes.find(n => n.id === nextId);
      if (nextNode?.type === 'condition') {
        const srcAnswer = newAnswers[nextNode.data.sourceNodeId];
        const val = nextNode.data.value || '';
        let match = false;
        if (Array.isArray(srcAnswer)) {
          match = srcAnswer.some(a => a.toLowerCase().includes(val.toLowerCase()));
        } else if (typeof srcAnswer === 'string') {
          match = srcAnswer.toLowerCase().includes(val.toLowerCase());
        }
        const handleId = match ? 'yes' : 'no';
        const edge = edges.find(e => e.source === nextId && e.sourceHandle === handleId);
        nextId = edge?.target || null;
      } else {
        break;
      }
    }

    setCurrentNodeId(nextId);
  };

  const handleReset = () => {
    setCurrentNodeId(null);
    setAnswers({});
    setSelectedOptions({});
  };

  if (!activeNode) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="relative">
          <button onClick={onClose} className="absolute -top-10 right-0 text-white/60 hover:text-white text-sm">Close</button>
          <div className="w-[375px] h-[700px] bg-white rounded-[40px] border-4 border-gray-800 shadow-2xl flex flex-col overflow-hidden">
            <div className="h-10 bg-gray-800 flex items-center justify-center">
              <div className="w-20 h-5 bg-gray-900 rounded-full" />
            </div>
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div>
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <p className="text-gray-900 font-medium mb-1">Request Submitted</p>
                <p className="text-gray-500 text-sm">Thank you! We'll be in touch soon.</p>
                <button onClick={handleReset} className="mt-6 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">
                  Preview Again
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderNodeContent = () => {
    const d = activeNode.data;

    if (activeNode.type === 'serviceSelect') {
      const opts = services.length > 0 ? services.map(s => s.name) : ['No services configured'];
      const selected = selectedOptions[activeNodeId] || [];
      return (
        <div>
          <p className="text-gray-900 font-medium text-base mb-4">{d.label || 'Select services'}</p>
          <div className="space-y-2">
            {opts.map((opt, i) => {
              const isSelected = selected.includes(opt);
              return (
                <button key={i} onClick={() => {
                  const newSel = isSelected ? selected.filter(s => s !== opt) : [...selected, opt];
                  setSelectedOptions({ ...selectedOptions, [activeNodeId]: newSel });
                }}
                  className={`w-full p-3 rounded-xl border text-left text-sm transition-all ${isSelected ? 'border-blue-500 bg-blue-50 text-gray-900' : 'border-gray-200 bg-white text-gray-700'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                      {isSelected && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    {opt}
                  </div>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => handleNext(selectedOptions[activeNodeId] || [])}
            disabled={d.required && !(selectedOptions[activeNodeId]?.length > 0)}
            className="w-full mt-4 py-3 bg-gray-900 text-white rounded-xl text-sm font-medium disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      );
    }

    if (activeNode.type === 'question') {
      if (d.answerType === 'yes_no') {
        return (
          <div>
            <p className="text-gray-900 font-medium text-base mb-4">{d.label}</p>
            <div className="flex gap-3">
              <button onClick={() => handleNext('Yes')} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 text-sm hover:border-blue-500 hover:bg-blue-50">Yes</button>
              <button onClick={() => handleNext('No')} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 text-sm hover:border-blue-500 hover:bg-blue-50">No</button>
            </div>
          </div>
        );
      }

      if (['single_select', 'multi_select'].includes(d.answerType)) {
        const isMulti = d.answerType === 'multi_select';
        const selected = selectedOptions[activeNodeId] || [];
        return (
          <div>
            <p className="text-gray-900 font-medium text-base mb-4">{d.label}</p>
            <div className="space-y-2">
              {(d.options || []).map((opt, i) => {
                const isSelected = isMulti ? selected.includes(opt) : selected[0] === opt;
                return (
                  <button key={i} onClick={() => {
                    if (isMulti) {
                      const newSel = isSelected ? selected.filter(s => s !== opt) : [...selected, opt];
                      setSelectedOptions({ ...selectedOptions, [activeNodeId]: newSel });
                    } else {
                      setSelectedOptions({ ...selectedOptions, [activeNodeId]: [opt] });
                      if (!isMulti) handleNext(opt);
                    }
                  }}
                    className={`w-full p-3 rounded-xl border text-left text-sm transition-all ${isSelected ? 'border-blue-500 bg-blue-50 text-gray-900' : 'border-gray-200 bg-white text-gray-700'}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {isMulti && (
              <button
                onClick={() => handleNext(selectedOptions[activeNodeId] || [])}
                disabled={d.required && !(selectedOptions[activeNodeId]?.length > 0)}
                className="w-full mt-4 py-3 bg-gray-900 text-white rounded-xl text-sm font-medium disabled:opacity-40"
              >
                Continue
              </button>
            )}
          </div>
        );
      }

      if (d.answerType === 'photo_upload') {
        return (
          <div>
            <p className="text-gray-900 font-medium text-base mb-4">{d.label}</p>
            <div className="w-full p-8 rounded-xl border-2 border-dashed border-gray-300 text-center text-gray-400 text-sm mb-4">
              Tap to upload photos
            </div>
            <button onClick={() => handleNext('[photos]')} className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-medium">
              {d.required ? 'Upload & Continue' : 'Continue'}
            </button>
          </div>
        );
      }

      // Text, number, date, long_text
      return (
        <div>
          <p className="text-gray-900 font-medium text-base mb-4">{d.label}{d.required ? ' *' : ''}</p>
          {d.answerType === 'long_text' ? (
            <textarea rows={4} placeholder={d.placeholder || 'Type here...'} className="w-full p-3 rounded-xl border border-gray-200 text-sm text-gray-700 outline-none focus:border-blue-500 resize-none" />
          ) : d.answerType === 'date' ? (
            <input type="date" className="w-full p-3 rounded-xl border border-gray-200 text-sm text-gray-700 outline-none focus:border-blue-500" />
          ) : d.answerType === 'number' ? (
            <input type="number" placeholder="0" className="w-full p-3 rounded-xl border border-gray-200 text-sm text-gray-700 outline-none focus:border-blue-500" />
          ) : (
            <input type="text" placeholder={d.placeholder || 'Type here...'} className="w-full p-3 rounded-xl border border-gray-200 text-sm text-gray-700 outline-none focus:border-blue-500" />
          )}
          <button onClick={() => handleNext('(preview answer)')} className="w-full mt-4 py-3 bg-gray-900 text-white rounded-xl text-sm font-medium">
            Continue
          </button>
        </div>
      );
    }

    if (activeNode.type === 'end') {
      return (
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </div>
          <p className="text-gray-900 font-medium mb-1">{d.label || 'Submit request'}</p>
          <p className="text-gray-500 text-sm">End of flow</p>
        </div>
      );
    }

    return <p className="text-gray-500 text-sm">Unknown node type</p>;
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="relative">
        <button onClick={onClose} className="absolute -top-10 right-0 text-white/60 hover:text-white text-sm">Close Preview</button>
        <button onClick={handleReset} className="absolute -top-10 left-0 text-white/60 hover:text-white text-sm">Restart</button>
        {/* Phone Frame */}
        <div className="w-[375px] h-[700px] bg-white rounded-[40px] border-4 border-gray-800 shadow-2xl flex flex-col overflow-hidden">
          {/* Notch */}
          <div className="h-10 bg-gray-800 flex items-center justify-center">
            <div className="w-20 h-5 bg-gray-900 rounded-full" />
          </div>
          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {renderNodeContent()}
          </div>
          {/* Home bar */}
          <div className="h-8 flex items-center justify-center">
            <div className="w-32 h-1 bg-gray-300 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
