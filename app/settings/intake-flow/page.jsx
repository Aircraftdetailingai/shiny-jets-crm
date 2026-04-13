"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ReactFlow, {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { nodeTypes } from '@/components/flow-builder/nodes';
import SidePanel from '@/components/flow-builder/SidePanel';
import FlowPreview from '@/components/flow-builder/FlowPreview';

// ─── Deletable edge with hover ✕ button ───
function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, label, labelStyle, selected, data }) {
  const [hovered, setHovered] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });

  const activeStyle = {
    ...style,
    stroke: selected ? '#f87171' : (hovered ? '#60a5fa' : (style?.stroke || '#0ea5e9')),
    strokeWidth: selected ? 3 : (hovered ? 2.5 : (style?.strokeWidth || 2)),
    strokeDasharray: style?.strokeDasharray || '6 4',
  };

  return (
    <>
      {/* Invisible fat hit area for hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <BaseEdge path={edgePath} style={activeStyle} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - 16}px)`, pointerEvents: 'none', zIndex: 999 }}>
            <span style={{ fontSize: 10, ...labelStyle }}>{label}</span>
          </div>
        </EdgeLabelRenderer>
      )}
      {(hovered || selected) && (
        <EdgeLabelRenderer>
          <button
            style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, zIndex: 1000 }}
            className="w-6 h-6 bg-red-600 hover:bg-red-500 text-white rounded-full text-sm flex items-center justify-center shadow-lg cursor-pointer leading-none pointer-events-auto"
            onClick={(e) => { e.stopPropagation(); data?.onDelete?.(id); }}
          >
            &times;
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { deletable: DeletableEdge };

// ─── Node type definitions for toolbar ───
const NODE_PALETTE = [
  { type: 'question', label: 'Question', desc: 'Ask the customer something', color: 'blue', dot: 'bg-blue-400', border: 'border-blue-500/30', hover: 'hover:border-blue-400/60' },
  { type: 'condition', label: 'Condition', desc: 'Branch based on an answer', color: 'amber', dot: 'bg-amber-400', border: 'border-amber-500/30', hover: 'hover:border-amber-400/60' },
  { type: 'serviceSelect', label: 'Service Select', desc: 'Pick from your services', color: 'teal', dot: 'bg-teal-400', border: 'border-teal-500/30', hover: 'hover:border-teal-400/60' },
  { type: 'end', label: 'End', desc: 'Submit the request', color: 'green', dot: 'bg-green-400', border: 'border-green-500/30', hover: 'hover:border-green-400/60' },
];

// ─── Default edge style ───
const defaultEdgeOptions = {
  type: 'deletable',
  animated: false,
  style: { stroke: '#0ea5e9', strokeWidth: 2, strokeDasharray: '6 4' },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#0ea5e9', width: 14, height: 14 },
};

// ─── Standard default flow — linear, clean ───
// Service Select fetches live from the detailer's services at render time
function buildDefaultFlow() {
  const nodes = [
    { id: 'start-1', type: 'start', position: { x: 300, y: 0 }, data: { label: 'Customer starts here' }, deletable: false },
    { id: 'aircraft-info', type: 'aircraftInfo', position: { x: 270, y: 160 }, data: { label: 'Aircraft Info' }, deletable: false },
    { id: 'svc-1', type: 'serviceSelect', position: { x: 270, y: 340 }, data: { label: 'What services do you need?', required: true } },
    { id: 'q-notes', type: 'question', position: { x: 270, y: 520 }, data: { label: 'Any specific instructions?', answerType: 'long_text', required: false, placeholder: 'Special requests, access details, timing...' } },
    { id: 'q-photos', type: 'question', position: { x: 270, y: 700 }, data: { label: 'Upload photos of your aircraft', answerType: 'photo_upload', required: false } },
    { id: 'end-1', type: 'end', position: { x: 300, y: 880 }, data: { label: 'Submit request' } },
  ];

  const edges = [
    { id: 'e-start-aircraft', source: 'start-1', target: 'aircraft-info', ...defaultEdgeOptions },
    { id: 'e-aircraft-svc', source: 'aircraft-info', target: 'svc-1', ...defaultEdgeOptions },
    { id: 'e-svc-notes', source: 'svc-1', target: 'q-notes', ...defaultEdgeOptions },
    { id: 'e-notes-photos', source: 'q-notes', target: 'q-photos', ...defaultEdgeOptions },
    { id: 'e-photos-end', source: 'q-photos', target: 'end-1', ...defaultEdgeOptions },
  ];

  return { nodes, edges };
}

// Exportable for use in signup route
export { buildDefaultFlow };

// ─── Dagre auto-layout ───
function autoLayout(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 200, ranksep: 180, marginx: 60, marginy: 60 });

  nodes.forEach(n => {
    const w = n.type === 'start' || n.type === 'end' ? 220 : 280;
    // Wider allocation for branching nodes
    const isBranching = n.data?.answerType === 'single_select' && n.data?.allowBranching;
    const isYesNo = n.data?.answerType === 'yes_no';
    const branchCount = (isBranching && n.data?.options?.length) || (isYesNo ? 2 : 0);
    const effectiveWidth = branchCount > 2 ? w + branchCount * 60 : w;
    g.setNode(n.id, { width: effectiveWidth, height: 140 });
  });
  edges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return nodes.map(n => {
    const pos = g.node(n.id);
    const w = n.type === 'start' || n.type === 'end' ? 220 : 280;
    return { ...n, position: { x: pos.x - w / 2, y: pos.y - 70 } };
  });
}

// ─── Inner component (needs useReactFlow) ───
function FlowBuilderInner() {
  const router = useRouter();
  const reactFlowInstance = useReactFlow();
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [editingNode, setEditingNode] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [toast, setToast] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : null;
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  // ─── Load data ───
  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    const loadData = async () => {
      try {
        const [svcRes, pkgRes] = await Promise.all([
          fetch('/api/services', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/packages', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const svcData = svcRes.ok ? await svcRes.json() : { services: [] };
        const svcList = Array.isArray(svcData.services || svcData) ? (svcData.services || svcData) : [];
        setServices(svcList);
        if (pkgRes.ok) {
          const pkgData = await pkgRes.json();
          setPackages(pkgData.packages || []);
        }

        const flowRes = await fetch('/api/intake-flow', { headers: { Authorization: `Bearer ${token}` } });
        const flowData = flowRes.ok ? await flowRes.json() : {};

        if (flowData.flow_nodes?.length > 0 && flowData.flow_edges) {
          // Ensure locked aircraft-info node exists in saved flows
          let loadedNodes = flowData.flow_nodes;
          let loadedEdges = flowData.flow_edges;
          if (!loadedNodes.find(n => n.type === 'aircraftInfo')) {
            const startNode = loadedNodes.find(n => n.type === 'start');
            const startEdge = loadedEdges.find(e => e.source === startNode?.id);
            const firstTarget = startEdge?.target;
            const aiNode = { id: 'aircraft-info', type: 'aircraftInfo', position: { x: (startNode?.position?.x || 400) - 30, y: (startNode?.position?.y || 0) + 160 }, data: { label: 'Aircraft Info (always first)' }, deletable: false, draggable: false };
            loadedNodes = [loadedNodes[0], aiNode, ...loadedNodes.slice(1)];
            // Rewire: start → aircraft-info → first target
            if (startEdge && firstTarget) {
              loadedEdges = loadedEdges.filter(e => e.id !== startEdge.id);
              loadedEdges = [
                { id: 'e-start-aircraft', source: startNode.id, target: 'aircraft-info', ...defaultEdgeOptions },
                { id: 'e-aircraft-first', source: 'aircraft-info', target: firstTarget, ...defaultEdgeOptions },
                ...loadedEdges,
              ];
            }
          }
          // Ensure locked nodes have correct flags
          loadedNodes = loadedNodes.map(n => {
            if (n.type === 'start' || n.type === 'aircraftInfo') return { ...n, deletable: false, draggable: false };
            return n;
          });
          setNodes(loadedNodes);
          setEdges(loadedEdges);
        } else {
          const def = buildDefaultFlow();
          setNodes(def.nodes);
          setEdges(def.edges);
        }
      } catch {
        const def = buildDefaultFlow();
        setNodes(def.nodes);
        setEdges(def.edges);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  // ─── React Flow callbacks ───
  const onNodesChange = useCallback((changes) => setNodes(nds => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges(eds => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((conn) => setEdges(eds => addEdge({ ...conn, ...defaultEdgeOptions, id: `e-${Date.now()}` }, eds)), []);
  const onNodeClick = useCallback((_, node) => { if (node.type !== 'start' && node.type !== 'aircraftInfo') setEditingNode(node); }, []);

  // ─── Drag from toolbar ───
  const onDragOver = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/reactflow');
    if (!type || !reactFlowInstance) return;

    const bounds = reactFlowWrapper.current?.getBoundingClientRect();
    const position = reactFlowInstance.screenToFlowPosition({
      x: e.clientX - (bounds?.left || 0),
      y: e.clientY - (bounds?.top || 0),
    });

    const id = `${type}-${Date.now()}`;
    const nodeConfig = {
      question: { label: 'New question', answerType: 'text' },
      condition: { label: 'New condition', sourceNodeId: '', field: '', value: '' },
      serviceSelect: { label: 'Select services', required: true, serviceNames: services.map(s => s.name) },
      end: { label: 'Submit request' },
    };

    const newNode = { id, type, position, data: nodeConfig[type] || {} };
    setNodes(nds => [...nds, newNode]);
    if (type !== 'end') setEditingNode(newNode);
  }, [reactFlowInstance, services]);

  // ─── Attach callbacks to nodes ───
  // Do NOT include editingNode in deps — changing editingNode must not re-create node objects
  // (that causes React Flow to re-measure/reposition nodes)
  const LOCKED_TYPES = ['start', 'aircraftInfo'];
  const nodesWithCallbacks = useMemo(() =>
    nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        onEdit: !LOCKED_TYPES.includes(node.type) ? () => setEditingNode(node) : undefined,
        onDelete: !LOCKED_TYPES.includes(node.type) ? () => {
          setNodes(nds => nds.filter(n => n.id !== node.id));
          setEdges(eds => eds.filter(e => e.source !== node.id && e.target !== node.id));
          setEditingNode(prev => prev?.id === node.id ? null : prev);
        } : undefined,
      },
    })),
  [nodes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Attach delete callback to edges ───
  const deleteEdge = useCallback((edgeId) => {
    setEdges(eds => eds.filter(e => e.id !== edgeId));
  }, []);

  const edgesWithCallbacks = useMemo(() =>
    edges.map(edge => ({
      ...edge,
      type: 'deletable',
      data: { ...edge.data, onDelete: deleteEdge },
    })),
  [edges, deleteEdge]);

  // ─── Update node data from side panel ───
  const updateNodeData = useCallback((nodeId, newData) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n));
    setEditingNode(prev => prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...newData } } : prev);
  }, []);

  // ─── Remap edges when branching options are reordered ───
  const handleReorderOptions = useCallback((nodeId, oldOptions, newOptions) => {
    // Build a map: oldIndex → newIndex
    const indexMap = {};
    oldOptions.forEach((opt, oldIdx) => {
      const newIdx = newOptions.indexOf(opt);
      if (newIdx !== -1 && newIdx !== oldIdx) indexMap[oldIdx] = newIdx;
    });
    if (Object.keys(indexMap).length === 0) return;

    setEdges(eds => eds.map(e => {
      if (e.source !== nodeId) return e;
      const match = e.sourceHandle?.match(/^opt-(\d+)$/);
      if (!match) return e;
      const oldIdx = parseInt(match[1]);
      // Find which new index this old target should have
      const oldOpt = oldOptions[oldIdx];
      const newIdx = newOptions.indexOf(oldOpt);
      if (newIdx === -1 || newIdx === oldIdx) return e;
      return { ...e, sourceHandle: `opt-${newIdx}` };
    }));
  }, []);

  // ─── Auto-arrange ───
  const handleCleanUp = useCallback(() => {
    setNodes(nds => {
      const laid = autoLayout(nds, edges);
      setTimeout(() => reactFlowInstance?.fitView({ padding: 0.15, duration: 300 }), 100);
      return laid;
    });
    // Ensure all edges use the deletable type and proper styling
    setEdges(eds => eds.map(e => ({
      ...e,
      type: 'deletable',
      animated: false,
      style: { stroke: '#0ea5e9', strokeWidth: 2, strokeDasharray: '6 4' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#0ea5e9', width: 14, height: 14 },
    })));
    showToast('Layout cleaned up');
  }, [edges, reactFlowInstance]);

  // ─── Save ───
  const handleSave = async () => {
    setSaving(true);
    const cleanNodes = nodes.map(({ data, ...rest }) => {
      const { onEdit, onDelete, ...cleanData } = data;
      return { ...rest, data: cleanData };
    });

    // Stamp branching edges with the option label they correspond to.
    // This makes routing resilient to option reordering — the consumer
    // matches by optionLabel instead of positional opt-N index.
    const stampedEdges = edges.map(e => {
      const match = e.sourceHandle?.match(/^opt-(\d+)$/);
      if (!match) return e;
      const sourceNode = cleanNodes.find(n => n.id === e.source);
      if (!sourceNode?.data?.allowBranching || !sourceNode.data.options) return e;
      const idx = parseInt(match[1]);
      const optionLabel = sourceNode.data.options[idx];
      if (!optionLabel) return e;
      return { ...e, data: { ...e.data, optionLabel } };
    });

    const res = await fetch('/api/intake-flow', {
      method: 'POST',
      headers,
      body: JSON.stringify({ flow_nodes: cleanNodes, flow_edges: stampedEdges }),
    });
    if (res.ok) showToast('Flow saved — your quote request page has been updated');
    else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Failed to save');
    }
    setSaving(false);
  };

  // ─── Reset ───
  const handleReset = async () => {
    await fetch('/api/intake-flow', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    const def = buildDefaultFlow();
    setNodes(def.nodes);
    setEdges(def.edges);
    setEditingNode(null);
    showToast('Reset to default');
  };

  if (loading) {
    return <div className="min-h-screen bg-v-charcoal flex items-center justify-center text-white">Loading...</div>;
  }

  return (
    <div className="h-screen bg-v-charcoal flex overflow-hidden">
      {toast && <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg z-50 text-sm">{toast}</div>}

      {/* ─── Left Sidebar Toolbar ─── */}
      <div className="w-56 flex-shrink-0 border-r border-v-border bg-v-surface/50 flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-v-border">
          <div className="flex items-center gap-2 mb-1">
            <a href="/settings" className="text-v-text-secondary text-xs hover:text-white">&larr;</a>
            <h1 className="text-white text-sm font-medium">Intake Flow</h1>
          </div>
        </div>

        {/* Draggable node cards */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <p className="text-[10px] uppercase tracking-wider text-v-text-secondary/60 mb-3 px-1">Drag nodes onto canvas</p>
          <div className="space-y-2">
            {NODE_PALETTE.map(item => (
              <div
                key={item.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/reactflow', item.type);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                className={`p-3 rounded-lg border ${item.border} ${item.hover} bg-white/[0.02] cursor-grab active:cursor-grabbing transition-colors`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${item.dot}`} />
                  <span className="text-white text-xs font-medium">{item.label}</span>
                </div>
                <p className="text-v-text-secondary text-[10px] pl-4">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* Connection help */}
          <div className="mt-6 p-3 bg-white/[0.03] border border-v-border-subtle rounded-lg space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-v-text-secondary/60">Connections</p>
            <p className="text-[10px] text-v-text-secondary leading-relaxed">
              <span className="text-white/60">Connect:</span> Drag from the dot at the bottom of a node to the dot at the top of another.
            </p>
            <p className="text-[10px] text-v-text-secondary leading-relaxed">
              <span className="text-white/60">Delete:</span> Click a line then press Delete, or hover the line and click the red <span className="text-red-400">&times;</span> button.
            </p>
          </div>

          {/* No services warning */}
          {services.length === 0 && (
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <p className="text-amber-400 text-[10px] font-medium mb-1">No services configured</p>
              <p className="text-amber-400/60 text-[10px]">
                <a href="/settings/services" className="underline">Add services</a> in Settings first.
              </p>
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div className="px-3 py-3 border-t border-v-border space-y-2">
          <button onClick={handleCleanUp}
            className="w-full px-3 py-2 text-[10px] uppercase tracking-wider text-v-text-secondary border border-v-border rounded-lg hover:text-white hover:border-white/30 transition-colors">
            Clean Up Layout
          </button>
          <div className="flex gap-2">
            <button onClick={() => setShowPreview(true)}
              className="flex-1 px-3 py-2 text-[10px] uppercase tracking-wider text-v-gold border border-v-gold/30 rounded-lg hover:bg-v-gold/5 transition-colors">
              Preview
            </button>
            <button onClick={handleReset}
              className="px-3 py-2 text-[10px] uppercase tracking-wider text-v-text-secondary border border-v-border rounded-lg hover:text-red-400 hover:border-red-400/30 transition-colors">
              Reset
            </button>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="w-full px-3 py-2.5 text-[10px] uppercase tracking-wider bg-v-gold text-v-charcoal font-semibold rounded-lg hover:bg-v-gold-dim disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'Save Flow'}
          </button>
        </div>
      </div>

      {/* ─── Canvas ─── */}
      <div className="flex-1 relative" ref={reactFlowWrapper}>
        {/* Top toolbar with Save button */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-8H7v8M7 3v5h8"/>
            </svg>
            {saving ? 'Saving...' : 'Save Flow'}
          </button>
        </div>
        <ReactFlow
          nodes={nodesWithCallbacks}
          edges={edgesWithCallbacks}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          edgesFocusable={true}
          edgesUpdatable={true}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.2}
          maxZoom={2}
          deleteKeyCode={['Backspace', 'Delete']}
          connectionLineStyle={{ stroke: '#0ea5e9', strokeWidth: 2, strokeDasharray: '5 5' }}
          connectionLineType="bezier"
          className="bg-v-charcoal"
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#2A3A50" gap={20} size={1} />
          <Controls
            position="bottom-left"
            style={{ background: '#1A2236', border: '1px solid #2A3A50', borderRadius: 8 }}
            showInteractive={false}
          />
          <MiniMap
            position="bottom-right"
            style={{ background: '#0F1117', border: '1px solid #2A3A50', borderRadius: 8 }}
            nodeColor={(node) => {
              const colors = { start: '#fff', question: '#60a5fa', serviceSelect: '#2dd4bf', condition: '#fbbf24', end: '#4ade80' };
              return colors[node.type] || '#4a5568';
            }}
            maskColor="rgba(15, 17, 23, 0.8)"
          />
        </ReactFlow>

        {/* Side Panel */}
        {editingNode && (
          <SidePanel
            node={editingNode}
            nodes={nodes}
            services={services}
            packages={packages}
            onUpdate={updateNodeData}
            onReorderOptions={handleReorderOptions}
            onClose={() => setEditingNode(null)}
          />
        )}
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <FlowPreview
          nodes={nodes}
          edges={edges}
          services={services}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}

// ─── Wrap with ReactFlowProvider ───
export default function IntakeFlowBuilder() {
  return (
    <ReactFlowProvider>
      <FlowBuilderInner />
    </ReactFlowProvider>
  );
}
