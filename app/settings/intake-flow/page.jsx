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
} from 'reactflow';
import 'reactflow/dist/style.css';
import { nodeTypes } from '@/components/flow-builder/nodes';
import SidePanel from '@/components/flow-builder/SidePanel';
import FlowPreview from '@/components/flow-builder/FlowPreview';

// ─── Default flow (nodes + edges) ───
function buildDefaultFlow(services) {
  const serviceNames = services.length > 0
    ? services.map(s => s.name)
    : ['Exterior Wash', 'Interior Detail', 'Ceramic Coating'];

  const nodes = [
    { id: 'start-1', type: 'start', position: { x: 250, y: 0 }, data: { label: 'Customer starts here' }, deletable: false },
    { id: 'svc-1', type: 'serviceSelect', position: { x: 230, y: 140 }, data: { label: 'What services do you need?', required: true } },
    { id: 'cond-1', type: 'condition', position: { x: 230, y: 310 }, data: { label: 'Ceramic selected?', sourceNodeId: 'svc-1', field: 'services', value: 'Ceramic' } },
    { id: 'q-paint', type: 'question', position: { x: 60, y: 500 }, data: { label: 'What is your goal for the paint?', answerType: 'single_select', options: ['Maximum gloss & protection', 'Clean and protected', 'Just clean'] } },
    { id: 'q-notes', type: 'question', position: { x: 400, y: 500 }, data: { label: 'Any additional notes?', answerType: 'long_text', placeholder: 'Special instructions...' } },
    { id: 'end-1', type: 'end', position: { x: 100, y: 700 }, data: { label: 'Submit request' } },
    { id: 'end-2', type: 'end', position: { x: 440, y: 700 }, data: { label: 'Submit request' } },
  ];

  const edges = [
    { id: 'e-start-svc', source: 'start-1', target: 'svc-1', type: 'smoothstep', animated: true, style: { stroke: '#4a5568', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#4a5568' } },
    { id: 'e-svc-cond', source: 'svc-1', target: 'cond-1', type: 'smoothstep', animated: true, style: { stroke: '#4a5568', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#4a5568' } },
    { id: 'e-cond-yes', source: 'cond-1', sourceHandle: 'yes', target: 'q-paint', type: 'smoothstep', style: { stroke: '#4ade80', strokeWidth: 2 }, label: 'Yes', labelStyle: { fill: '#4ade80', fontSize: 10 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#4ade80' } },
    { id: 'e-cond-no', source: 'cond-1', sourceHandle: 'no', target: 'q-notes', type: 'smoothstep', style: { stroke: '#f87171', strokeWidth: 2 }, label: 'No', labelStyle: { fill: '#f87171', fontSize: 10 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#f87171' } },
    { id: 'e-paint-end', source: 'q-paint', target: 'end-1', type: 'smoothstep', style: { stroke: '#4a5568', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#4a5568' } },
    { id: 'e-notes-end', source: 'q-notes', target: 'end-2', type: 'smoothstep', style: { stroke: '#4a5568', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#4a5568' } },
  ];

  return { nodes, edges };
}

const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: true,
  style: { stroke: '#4a5568', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#4a5568' },
};

export default function IntakeFlowBuilder() {
  const router = useRouter();
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState([]);
  const [editingNode, setEditingNode] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [toast, setToast] = useState('');
  const idCounter = useRef(1);

  const token = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : null;
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  // ─── Load services + existing flow ───
  useEffect(() => {
    if (!token) { router.push('/login'); return; }

    const loadData = async () => {
      try {
        // Fetch services
        const svcRes = await fetch('/api/services', { headers: { Authorization: `Bearer ${token}` } });
        const svcData = svcRes.ok ? await svcRes.json() : { services: [] };
        const svcList = svcData.services || svcData || [];
        setServices(Array.isArray(svcList) ? svcList : []);

        // Fetch existing flow
        const flowRes = await fetch('/api/intake-flow', { headers: { Authorization: `Bearer ${token}` } });
        const flowData = flowRes.ok ? await flowRes.json() : {};

        if (flowData.flow_nodes && flowData.flow_edges) {
          // Saved node-based flow
          setNodes(flowData.flow_nodes);
          setEdges(flowData.flow_edges);
        } else {
          // No saved flow or old format — use default
          const def = buildDefaultFlow(Array.isArray(svcList) ? svcList : []);
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
  const onNodesChange = useCallback((changes) => {
    setNodes(nds => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes) => {
    setEdges(eds => applyEdgeChanges(changes, eds));
  }, []);

  const onConnect = useCallback((connection) => {
    setEdges(eds => addEdge({ ...connection, ...defaultEdgeOptions, id: `e-${Date.now()}` }, eds));
  }, []);

  const onNodeClick = useCallback((_, node) => {
    if (node.type !== 'start') {
      setEditingNode(node);
    }
  }, []);

  // ─── Attach callbacks to node data ───
  const nodesWithCallbacks = useMemo(() => {
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        onEdit: node.type !== 'start' ? () => setEditingNode(node) : undefined,
        onDelete: (node.type !== 'start') ? () => {
          setNodes(nds => nds.filter(n => n.id !== node.id));
          setEdges(eds => eds.filter(e => e.source !== node.id && e.target !== node.id));
          if (editingNode?.id === node.id) setEditingNode(null);
        } : undefined,
      },
    }));
  }, [nodes, editingNode]);

  // ─── Update node data from side panel ───
  const updateNodeData = useCallback((nodeId, newData) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n));
    setEditingNode(prev => prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...newData } } : prev);
  }, []);

  // ─── Add nodes ───
  const addNode = useCallback((type) => {
    const id = `${type}-${Date.now()}`;
    const centerX = 250;
    // Place new node below existing ones
    const maxY = nodes.reduce((max, n) => Math.max(max, n.position.y), 0);
    const y = maxY + 180;

    const nodeConfig = {
      question: { label: 'New question', answerType: 'text' },
      condition: { label: 'New condition', sourceNodeId: '', field: '', value: '' },
      serviceSelect: { label: 'Select services', required: true },
      end: { label: 'Submit request' },
    };

    const newNode = {
      id,
      type,
      position: { x: centerX, y },
      data: nodeConfig[type] || {},
    };

    setNodes(nds => [...nds, newNode]);
    if (type !== 'end') setEditingNode(newNode);
  }, [nodes]);

  // ─── Save ───
  const handleSave = async () => {
    setSaving(true);
    // Strip callbacks from node data before saving
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
    <div className="h-screen bg-v-charcoal flex flex-col overflow-hidden">
      {toast && <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg z-50 text-sm">{toast}</div>}

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-v-border bg-v-surface/50 backdrop-blur-sm z-10 shrink-0">
        <div className="flex items-center gap-4">
          <a href="/settings" className="text-v-text-secondary text-xs hover:text-white">&larr; Settings</a>
          <h1 className="text-white text-sm font-medium">Intake Flow Builder</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Add buttons */}
          <button onClick={() => addNode('question')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Question
          </button>
          <button onClick={() => addNode('condition')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider text-amber-300 border border-amber-500/30 rounded-lg hover:bg-amber-500/10 transition-colors">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Condition
          </button>
          <button onClick={() => addNode('serviceSelect')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider text-teal-300 border border-teal-500/30 rounded-lg hover:bg-teal-500/10 transition-colors">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />Service Select
          </button>
          <button onClick={() => addNode('end')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider text-green-300 border border-green-500/30 rounded-lg hover:bg-green-500/10 transition-colors">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />End
          </button>

          <div className="w-px h-6 bg-v-border mx-1" />

          <button onClick={() => setShowPreview(true)}
            className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-v-gold border border-v-gold/30 rounded-lg hover:bg-v-gold/5 transition-colors">
            Preview
          </button>
          <button onClick={handleReset}
            className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-v-text-secondary border border-v-border rounded-lg hover:text-red-400 hover:border-red-400/30 transition-colors">
            Reset
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-1.5 text-[10px] uppercase tracking-wider bg-v-gold text-v-charcoal font-semibold rounded-lg hover:bg-v-gold-dim disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodesWithCallbacks}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.2}
          maxZoom={2}
          deleteKeyCode={['Backspace', 'Delete']}
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
              switch (node.type) {
                case 'start': return '#fff';
                case 'question': return '#60a5fa';
                case 'serviceSelect': return '#2dd4bf';
                case 'condition': return '#fbbf24';
                case 'end': return '#4ade80';
                default: return '#4a5568';
              }
            }}
            maskColor="rgba(15, 17, 23, 0.8)"
          />
        </ReactFlow>

        {/* Side Panel */}
        {editingNode && (
          <SidePanel
            node={editingNode}
            nodes={nodes}
            onUpdate={updateNodeData}
            onClose={() => setEditingNode(null)}
          />
        )}
      </div>

      {/* Preview */}
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
