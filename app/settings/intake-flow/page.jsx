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
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { nodeTypes } from '@/components/flow-builder/nodes';
import SidePanel from '@/components/flow-builder/SidePanel';
import FlowPreview from '@/components/flow-builder/FlowPreview';

// ─── Node type definitions for toolbar ───
const NODE_PALETTE = [
  { type: 'question', label: 'Question', desc: 'Ask the customer something', color: 'blue', dot: 'bg-blue-400', border: 'border-blue-500/30', hover: 'hover:border-blue-400/60' },
  { type: 'condition', label: 'Condition', desc: 'Branch based on an answer', color: 'amber', dot: 'bg-amber-400', border: 'border-amber-500/30', hover: 'hover:border-amber-400/60' },
  { type: 'serviceSelect', label: 'Service Select', desc: 'Pick from your services', color: 'teal', dot: 'bg-teal-400', border: 'border-teal-500/30', hover: 'hover:border-teal-400/60' },
  { type: 'end', label: 'End', desc: 'Submit the request', color: 'green', dot: 'bg-green-400', border: 'border-green-500/30', hover: 'hover:border-green-400/60' },
];

// ─── Default edge style ───
const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: true,
  style: { stroke: '#4a5568', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#4a5568' },
};

// ─── Build default flow — two-path branching ───
function buildDefaultFlow(services) {
  const svcNames = services.map(s => s.name);
  const branchStyle = { type: 'smoothstep', animated: true, style: { stroke: '#60a5fa', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#60a5fa' } };

  const nodes = [
    { id: 'start-1', type: 'start', position: { x: 400, y: 0 }, data: { label: 'Customer starts here' }, deletable: false },
    { id: 'q-situation', type: 'question', position: { x: 350, y: 160 }, data: { label: 'What best describes your situation?', answerType: 'single_select', allowBranching: true, required: true, options: ['I know what I want', 'Help me figure it out'] } },
    // Path A: I know what I want
    { id: 'svc-1', type: 'serviceSelect', position: { x: 100, y: 360 }, data: { label: 'What services do you need?', required: true, serviceNames: svcNames } },
    { id: 'q-notes-a', type: 'question', position: { x: 100, y: 540 }, data: { label: 'Any specific instructions?', answerType: 'long_text', required: false, placeholder: 'Special requests, access details, timing...' } },
    { id: 'q-photos-a', type: 'question', position: { x: 100, y: 720 }, data: { label: 'Upload photos of your aircraft', answerType: 'photo_upload', required: false } },
    { id: 'end-a', type: 'end', position: { x: 130, y: 900 }, data: { label: 'Submit request' } },
    // Path B: Help me figure it out
    { id: 'q-surfaces', type: 'question', position: { x: 600, y: 360 }, data: { label: 'What surfaces need attention?', answerType: 'multi_select', required: true, options: ['Exterior', 'Interior', 'Both'] } },
    { id: 'q-paint-goal', type: 'question', position: { x: 600, y: 540 }, data: { label: 'What is your goal for the paint?', answerType: 'single_select', required: true, options: ['Maximum gloss & protection', 'Clean and protected', 'Just clean'] } },
    { id: 'q-notes-b', type: 'question', position: { x: 600, y: 720 }, data: { label: 'Any specific instructions?', answerType: 'long_text', required: false, placeholder: 'Special requests, access details, timing...' } },
    { id: 'q-photos-b', type: 'question', position: { x: 600, y: 900 }, data: { label: 'Upload photos of your aircraft', answerType: 'photo_upload', required: false } },
    { id: 'end-b', type: 'end', position: { x: 630, y: 1080 }, data: { label: 'Submit request' } },
  ];

  const edges = [
    { id: 'e-start-situation', source: 'start-1', target: 'q-situation', ...defaultEdgeOptions },
    { id: 'e-situation-svc', source: 'q-situation', sourceHandle: 'opt-0', target: 'svc-1', ...branchStyle, label: 'I know what I want', labelStyle: { fill: '#60a5fa', fontSize: 10 } },
    { id: 'e-svc-notes-a', source: 'svc-1', target: 'q-notes-a', ...defaultEdgeOptions },
    { id: 'e-notes-a-photos-a', source: 'q-notes-a', target: 'q-photos-a', ...defaultEdgeOptions },
    { id: 'e-photos-a-end-a', source: 'q-photos-a', target: 'end-a', ...defaultEdgeOptions },
    { id: 'e-situation-surfaces', source: 'q-situation', sourceHandle: 'opt-1', target: 'q-surfaces', ...branchStyle, label: 'Help me figure it out', labelStyle: { fill: '#60a5fa', fontSize: 10 } },
    { id: 'e-surfaces-paint', source: 'q-surfaces', target: 'q-paint-goal', ...defaultEdgeOptions },
    { id: 'e-paint-notes-b', source: 'q-paint-goal', target: 'q-notes-b', ...defaultEdgeOptions },
    { id: 'e-notes-b-photos-b', source: 'q-notes-b', target: 'q-photos-b', ...defaultEdgeOptions },
    { id: 'e-photos-b-end-b', source: 'q-photos-b', target: 'end-b', ...defaultEdgeOptions },
  ];

  return { nodes, edges };
}

// ─── Dagre auto-layout ───
function autoLayout(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 160, marginx: 40, marginy: 40 });

  nodes.forEach(n => {
    const w = n.type === 'start' || n.type === 'end' ? 220 : 260;
    g.setNode(n.id, { width: w, height: 120 });
  });
  edges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return nodes.map(n => {
    const pos = g.node(n.id);
    const w = n.type === 'start' || n.type === 'end' ? 220 : 260;
    return { ...n, position: { x: pos.x - w / 2, y: pos.y - 60 } };
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
        const svcRes = await fetch('/api/services', { headers: { Authorization: `Bearer ${token}` } });
        const svcData = svcRes.ok ? await svcRes.json() : { services: [] };
        const svcList = Array.isArray(svcData.services || svcData) ? (svcData.services || svcData) : [];
        setServices(svcList);

        const flowRes = await fetch('/api/intake-flow', { headers: { Authorization: `Bearer ${token}` } });
        const flowData = flowRes.ok ? await flowRes.json() : {};

        if (flowData.flow_nodes?.length > 0 && flowData.flow_edges) {
          setNodes(flowData.flow_nodes);
          setEdges(flowData.flow_edges);
        } else {
          const def = buildDefaultFlow(svcList);
          setNodes(def.nodes);
          setEdges(def.edges);
        }
      } catch {
        const def = buildDefaultFlow([]);
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
  const onNodeClick = useCallback((_, node) => { if (node.type !== 'start') setEditingNode(node); }, []);

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
  const nodesWithCallbacks = useMemo(() =>
    nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        onEdit: node.type !== 'start' ? () => setEditingNode(node) : undefined,
        onDelete: node.type !== 'start' ? () => {
          setNodes(nds => nds.filter(n => n.id !== node.id));
          setEdges(eds => eds.filter(e => e.source !== node.id && e.target !== node.id));
          if (editingNode?.id === node.id) setEditingNode(null);
        } : undefined,
      },
    })),
  [nodes, editingNode]);

  // ─── Update node data from side panel ───
  const updateNodeData = useCallback((nodeId, newData) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n));
    setEditingNode(prev => prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...newData } } : prev);
  }, []);

  // ─── Auto-arrange ───
  const handleCleanUp = useCallback(() => {
    setNodes(nds => {
      const laid = autoLayout(nds, edges);
      setTimeout(() => reactFlowInstance?.fitView({ padding: 0.3 }), 50);
      return laid;
    });
    showToast('Layout cleaned up');
  }, [edges, reactFlowInstance]);

  // ─── Save ───
  const handleSave = async () => {
    setSaving(true);
    const cleanNodes = nodes.map(({ data, ...rest }) => {
      const { onEdit, onDelete, ...cleanData } = data;
      return { ...rest, data: cleanData };
    });
    const res = await fetch('/api/intake-flow', {
      method: 'POST',
      headers,
      body: JSON.stringify({ flow_nodes: cleanNodes, flow_edges: edges }),
    });
    if (res.ok) showToast('Flow saved');
    else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Failed to save');
    }
    setSaving(false);
  };

  // ─── Reset ───
  const handleReset = async () => {
    await fetch('/api/intake-flow', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    const def = buildDefaultFlow(services);
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
          <div className="mt-6 p-3 bg-white/[0.03] border border-v-border-subtle rounded-lg">
            <p className="text-[10px] uppercase tracking-wider text-v-text-secondary/60 mb-2">Connecting nodes</p>
            <p className="text-[10px] text-v-text-secondary leading-relaxed">
              Drag from the dot at the bottom of a node to the dot at the top of the next node.
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
        <ReactFlow
          nodes={nodesWithCallbacks}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.2}
          maxZoom={2}
          deleteKeyCode={['Backspace', 'Delete']}
          connectionLineStyle={{ stroke: '#4ade80', strokeWidth: 2, strokeDasharray: '5 5' }}
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
            onUpdate={updateNodeData}
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
