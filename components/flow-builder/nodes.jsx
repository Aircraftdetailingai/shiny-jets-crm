"use client";
import { memo, useState } from 'react';
import { Handle, Position } from 'reactflow';

// Pulsing handle that shows "Drag to connect" tooltip on hover
function FlowHandle({ type, position, id, color, style: extra }) {
  const [hover, setHover] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Handle
        type={type}
        position={position}
        id={id}
        style={{
          width: 14,
          height: 14,
          border: '2px solid #1A2236',
          background: color,
          transition: 'box-shadow 0.2s',
          boxShadow: hover ? `0 0 0 4px ${color}40` : 'none',
          ...extra,
        }}
      />
      {hover && type === 'source' && (
        <div className="absolute left-1/2 -translate-x-1/2 top-5 bg-black/90 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap z-50 pointer-events-none">
          Drag to connect
        </div>
      )}
    </div>
  );
}

const ActionButtons = ({ onEdit, onDelete }) => (
  <div className="flex items-center gap-1">
    {onEdit && (
      <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1 text-white/30 hover:text-blue-300">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
      </button>
    )}
    {onDelete && (
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1 text-white/30 hover:text-red-400">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
      </button>
    )}
  </div>
);

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
    <FlowHandle type="source" position={Position.Bottom} color="#fff" />
  </div>
));
StartNode.displayName = 'StartNode';

// Answer type labels for display
const TYPE_LABELS = {
  single_select: 'Single Select', multi_select: 'Multi Select', yes_no: 'Yes / No',
  text: 'Short Text', long_text: 'Long Text', photo_upload: 'Photo Upload',
  number: 'Number', date: 'Date',
};

// ─── QUESTION NODE ───
export const QuestionNode = memo(({ data, selected }) => {
  const typeLabel = TYPE_LABELS[data.answerType] || data.answerType || 'text';
  const isSelect = ['single_select', 'multi_select'].includes(data.answerType);
  const isMulti = data.answerType === 'multi_select';
  const hasBranching = data.answerType === 'single_select' && data.allowBranching;
  const isYesNo = data.answerType === 'yes_no';

  return (
    <div className={`rounded-xl border-2 shadow-lg w-[260px] transition-colors ${selected ? 'border-blue-400' : 'border-blue-500/30'} bg-[#111827]`}>
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-blue-500/10">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0" />
          <span className="text-[10px] uppercase tracking-wider text-blue-300/80 font-medium">Question</span>
        </div>
        <ActionButtons onEdit={data.onEdit} onDelete={data.onDelete} />
      </div>
      <FlowHandle type="target" position={Position.Top} color="#60a5fa" />
      <div className="px-4 py-3">
        <p className="text-white text-xs leading-relaxed">{data.label || 'New question'}</p>
        {/* Answer type badge row */}
        <div className="flex flex-wrap gap-1 mt-1.5">
          <span className="text-[9px] bg-blue-500/15 text-blue-300/70 px-1.5 py-0.5 rounded uppercase tracking-wider">{typeLabel}</span>
          {isSelect && data.options?.length > 0 && (
            <span className="text-[9px] bg-blue-500/10 text-blue-300/50 px-1.5 py-0.5 rounded">{data.options.length} options</span>
          )}
          {isMulti && <span className="text-[9px] bg-purple-500/15 text-purple-300/70 px-1.5 py-0.5 rounded">Multi</span>}
          {hasBranching && <span className="text-[9px] bg-amber-500/15 text-amber-300/70 px-1.5 py-0.5 rounded">Branches</span>}
        </div>
        {isSelect && data.options?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {data.options.slice(0, 3).map((o, i) => (
              <span key={i} className="text-[9px] bg-blue-500/10 text-blue-300/60 px-1.5 py-0.5 rounded">{o}</span>
            ))}
            {data.options.length > 3 && <span className="text-[9px] text-blue-300/40">+{data.options.length - 3}</span>}
          </div>
        )}
      </div>
      {/* Output handles based on type */}
      {isYesNo ? (
        <>
          <div className="flex justify-between px-4 pb-1">
            <span className="text-[9px] text-green-400/60">Yes</span>
            <span className="text-[9px] text-red-400/60">No</span>
          </div>
          <FlowHandle type="source" position={Position.Bottom} id="yes" color="#4ade80" style={{ left: '30%' }} />
          <FlowHandle type="source" position={Position.Bottom} id="no" color="#f87171" style={{ left: '70%' }} />
        </>
      ) : hasBranching && data.options?.length > 0 ? (
        <>
          <div className="flex justify-between px-4 pb-1">
            {data.options.slice(0, 4).map((o, i) => (
              <span key={i} className="text-[8px] text-blue-300/40 truncate max-w-[60px]">{o}</span>
            ))}
          </div>
          {data.options.slice(0, 4).map((o, i) => {
            const pct = (i + 1) / (Math.min(data.options.length, 4) + 1);
            return <FlowHandle key={i} type="source" position={Position.Bottom} id={`opt-${i}`} color="#60a5fa" style={{ left: `${pct * 100}%` }} />;
          })}
        </>
      ) : (
        <FlowHandle type="source" position={Position.Bottom} color="#60a5fa" />
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
      <ActionButtons onEdit={data.onEdit} onDelete={data.onDelete} />
    </div>
    <FlowHandle type="target" position={Position.Top} color="#2dd4bf" />
    <div className="px-4 py-3">
      <p className="text-white text-xs leading-relaxed">{data.label || 'Select services'}</p>
      {data.serviceNames?.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.serviceNames.slice(0, 4).map((s, i) => (
            <span key={i} className="text-[9px] bg-teal-500/10 text-teal-300/60 px-1.5 py-0.5 rounded">{s}</span>
          ))}
          {data.serviceNames.length > 4 && <span className="text-[9px] text-teal-300/40">+{data.serviceNames.length - 4}</span>}
        </div>
      ) : (
        <span className="text-teal-300/50 text-[10px] mt-1 block">From your services</span>
      )}
      {data.warnings?.length > 0 && (
        <div className="mt-2">
          {data.warnings.map((w, i) => (
            <p key={i} className="text-[9px] text-red-400 bg-red-500/10 px-2 py-1 rounded mt-1">{w}</p>
          ))}
        </div>
      )}
    </div>
    <FlowHandle type="source" position={Position.Bottom} color="#2dd4bf" />
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
      <ActionButtons onEdit={data.onEdit} onDelete={data.onDelete} />
    </div>
    <FlowHandle type="target" position={Position.Top} color="#fbbf24" />
    <div className="px-4 py-3">
      <p className="text-white text-xs leading-relaxed">{data.label || 'If condition...'}</p>
      {data.field && data.value && (
        <span className="text-amber-300/50 text-[10px] mt-1 block">If "{data.field}" includes "{data.value}"</span>
      )}
    </div>
    <div className="flex justify-between px-4 pb-1">
      <span className="text-[9px] text-green-400/60">Yes</span>
      <span className="text-[9px] text-red-400/60">No</span>
    </div>
    <FlowHandle type="source" position={Position.Bottom} id="yes" color="#4ade80" style={{ left: '30%' }} />
    <FlowHandle type="source" position={Position.Bottom} id="no" color="#f87171" style={{ left: '70%' }} />
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
    <FlowHandle type="target" position={Position.Top} color="#4ade80" />
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
