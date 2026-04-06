"use client";
import { memo } from 'react';
import { Handle, Position } from 'reactflow';

const handleStyle = {
  width: 12,
  height: 12,
  border: '2px solid #1A2236',
};

// ─── START NODE ───
export const StartNode = memo(({ data }) => (
  <div className="rounded-xl border-2 border-white/20 bg-[#111318] shadow-lg w-[220px]">
    <div className="px-4 py-3 flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full bg-white/80 shrink-0" />
      <span className="text-[10px] uppercase tracking-wider text-white/60 font-medium">Start</span>
    </div>
    <div className="px-4 pb-3">
      <p className="text-white text-xs">Customer starts here</p>
    </div>
    <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, background: '#fff' }} />
  </div>
));
StartNode.displayName = 'StartNode';

// ─── QUESTION NODE ───
export const QuestionNode = memo(({ data, selected }) => {
  const typeLabel = data.answerType || 'text';
  return (
    <div className={`rounded-xl border-2 shadow-lg w-[260px] transition-colors ${selected ? 'border-blue-400' : 'border-blue-500/30'} bg-[#111827]`}>
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-blue-500/10">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0" />
          <span className="text-[10px] uppercase tracking-wider text-blue-300/80 font-medium">Question</span>
        </div>
        <div className="flex items-center gap-1">
          {data.onEdit && (
            <button onClick={(e) => { e.stopPropagation(); data.onEdit(); }} className="p-1 text-white/30 hover:text-blue-300">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
            </button>
          )}
          {data.onDelete && (
            <button onClick={(e) => { e.stopPropagation(); data.onDelete(); }} className="p-1 text-white/30 hover:text-red-400">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
            </button>
          )}
        </div>
      </div>
      <Handle type="target" position={Position.Top} style={{ ...handleStyle, background: '#60a5fa' }} />
      <div className="px-4 py-3">
        <p className="text-white text-xs leading-relaxed">{data.label || 'New question'}</p>
        <span className="text-blue-300/50 text-[10px] uppercase tracking-wider mt-1 block">{typeLabel}</span>
        {data.options && data.options.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {data.options.slice(0, 3).map((o, i) => (
              <span key={i} className="text-[9px] bg-blue-500/10 text-blue-300/60 px-1.5 py-0.5 rounded">{o}</span>
            ))}
            {data.options.length > 3 && <span className="text-[9px] text-blue-300/40">+{data.options.length - 3}</span>}
          </div>
        )}
      </div>
      {data.answerType === 'yes_no' ? (
        <>
          <div className="flex justify-between px-4 pb-1">
            <span className="text-[9px] text-green-400/60">Yes</span>
            <span className="text-[9px] text-red-400/60">No</span>
          </div>
          <Handle type="source" position={Position.Bottom} id="yes" style={{ ...handleStyle, background: '#4ade80', left: '30%' }} />
          <Handle type="source" position={Position.Bottom} id="no" style={{ ...handleStyle, background: '#f87171', left: '70%' }} />
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, background: '#60a5fa' }} />
      )}
    </div>
  );
});
QuestionNode.displayName = 'QuestionNode';

// ─── SERVICE SELECT NODE ───
export const ServiceSelectNode = memo(({ data, selected }) => (
  <div className={`rounded-xl border-2 shadow-lg w-[260px] transition-colors ${selected ? 'border-teal-400' : 'border-teal-500/30'} bg-[#0f1d1d]`}>
    <div className="px-4 py-2.5 flex items-center justify-between border-b border-teal-500/10">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-teal-400 shrink-0" />
        <span className="text-[10px] uppercase tracking-wider text-teal-300/80 font-medium">Service Select</span>
      </div>
      <div className="flex items-center gap-1">
        {data.onEdit && (
          <button onClick={(e) => { e.stopPropagation(); data.onEdit(); }} className="p-1 text-white/30 hover:text-teal-300">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
          </button>
        )}
        {data.onDelete && (
          <button onClick={(e) => { e.stopPropagation(); data.onDelete(); }} className="p-1 text-white/30 hover:text-red-400">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
          </button>
        )}
      </div>
    </div>
    <Handle type="target" position={Position.Top} style={{ ...handleStyle, background: '#2dd4bf' }} />
    <div className="px-4 py-3">
      <p className="text-white text-xs leading-relaxed">{data.label || 'Select services'}</p>
      <span className="text-teal-300/50 text-[10px] mt-1 block">From your services dashboard</span>
    </div>
    <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, background: '#2dd4bf' }} />
  </div>
));
ServiceSelectNode.displayName = 'ServiceSelectNode';

// ─── CONDITION NODE ───
export const ConditionNode = memo(({ data, selected }) => (
  <div className={`rounded-xl border-2 shadow-lg w-[260px] transition-colors ${selected ? 'border-amber-400' : 'border-amber-500/30'} bg-[#1a1708]`}>
    <div className="px-4 py-2.5 flex items-center justify-between border-b border-amber-500/10">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
        <span className="text-[10px] uppercase tracking-wider text-amber-300/80 font-medium">Condition</span>
      </div>
      <div className="flex items-center gap-1">
        {data.onEdit && (
          <button onClick={(e) => { e.stopPropagation(); data.onEdit(); }} className="p-1 text-white/30 hover:text-amber-300">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
          </button>
        )}
        {data.onDelete && (
          <button onClick={(e) => { e.stopPropagation(); data.onDelete(); }} className="p-1 text-white/30 hover:text-red-400">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
          </button>
        )}
      </div>
    </div>
    <Handle type="target" position={Position.Top} style={{ ...handleStyle, background: '#fbbf24' }} />
    <div className="px-4 py-3">
      <p className="text-white text-xs leading-relaxed">{data.label || 'If condition...'}</p>
      {data.field && data.value && (
        <span className="text-amber-300/50 text-[10px] mt-1 block">
          If "{data.field}" includes "{data.value}"
        </span>
      )}
    </div>
    <div className="flex justify-between px-4 pb-1">
      <span className="text-[9px] text-green-400/60">Yes</span>
      <span className="text-[9px] text-red-400/60">No</span>
    </div>
    <Handle type="source" position={Position.Bottom} id="yes" style={{ ...handleStyle, background: '#4ade80', left: '30%' }} />
    <Handle type="source" position={Position.Bottom} id="no" style={{ ...handleStyle, background: '#f87171', left: '70%' }} />
  </div>
));
ConditionNode.displayName = 'ConditionNode';

// ─── END NODE ───
export const EndNode = memo(({ data, selected }) => (
  <div className={`rounded-xl border-2 shadow-lg w-[220px] transition-colors ${selected ? 'border-green-400' : 'border-green-500/30'} bg-[#0a1a0f]`}>
    <div className="px-4 py-2.5 flex items-center justify-between border-b border-green-500/10">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-green-400 shrink-0" />
        <span className="text-[10px] uppercase tracking-wider text-green-300/80 font-medium">End</span>
      </div>
      {data.onDelete && (
        <button onClick={(e) => { e.stopPropagation(); data.onDelete(); }} className="p-1 text-white/30 hover:text-red-400">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
        </button>
      )}
    </div>
    <Handle type="target" position={Position.Top} style={{ ...handleStyle, background: '#4ade80' }} />
    <div className="px-4 py-3">
      <p className="text-white text-xs">{data.label || 'Submit request'}</p>
    </div>
  </div>
));
EndNode.displayName = 'EndNode';

export const nodeTypes = {
  start: StartNode,
  question: QuestionNode,
  serviceSelect: ServiceSelectNode,
  condition: ConditionNode,
  end: EndNode,
};
