import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { DEFAULT_QUESTIONS } from '@/lib/default-intake-flow';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET — fetch detailer's intake flow (or default)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const detailerId = searchParams.get('detailer_id');

  // Public access for quote request form (by detailer_id)
  if (detailerId) {
    const supabase = getSupabase();
    const { data } = await supabase.from('intake_flows').select('questions, flow_nodes, flow_edges, updated_at').eq('detailer_id', detailerId).single();
    return Response.json({
      questions: data?.questions || DEFAULT_QUESTIONS,
      flow_nodes: data?.flow_nodes || null,
      flow_edges: data?.flow_edges || null,
      updatedAt: data?.updated_at || null,
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  }

  // Authenticated access for settings
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  const { data } = await supabase.from('intake_flows').select('questions, flow_nodes, flow_edges, updated_at').eq('detailer_id', user.id).single();

  return Response.json({
    questions: data?.questions || DEFAULT_QUESTIONS,
    flow_nodes: data?.flow_nodes || null,
    flow_edges: data?.flow_edges || null,
    isDefault: !data,
    updatedAt: data?.updated_at || null,
  }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}

// POST — save detailer's intake flow
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const supabase = getSupabase();

  const upsertData = {
    detailer_id: user.id,
    updated_at: new Date().toISOString(),
  };

  // Support both old format (questions array) and new format (flow_nodes + flow_edges)
  if (body.flow_nodes && body.flow_edges) {
    upsertData.flow_nodes = body.flow_nodes;
    upsertData.flow_edges = body.flow_edges;
    // Also generate a flat questions array from the flow for backward compatibility
    upsertData.questions = flowToQuestions(body.flow_nodes, body.flow_edges);
  } else if (body.questions) {
    upsertData.questions = body.questions;
  } else {
    return Response.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { error } = await supabase.from('intake_flows').upsert(upsertData, { onConflict: 'detailer_id' });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true, savedAt: upsertData.updated_at });
}

// DELETE — reset to default
export async function DELETE(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  await supabase.from('intake_flows').delete().eq('detailer_id', user.id);

  return Response.json({ success: true, questions: DEFAULT_QUESTIONS });
}

// Convert flow nodes/edges into a flat questions array for backward compat with QuoteRequestFlow
function flowToQuestions(flowNodes, flowEdges) {
  const questions = [];

  for (const node of flowNodes) {
    if (node.type === 'question') {
      const q = {
        id: node.id,
        type: node.data.answerType || 'text',
        text: node.data.label || 'Question',
        required: node.data.required || false,
      };
      if (node.data.options) q.options = node.data.options;
      if (node.data.placeholder) q.placeholder = node.data.placeholder;

      // Check if this node is behind a condition
      const incomingEdge = flowEdges.find(e => e.target === node.id);
      if (incomingEdge) {
        const sourceNode = flowNodes.find(n => n.id === incomingEdge.source);
        if (sourceNode?.type === 'condition' && sourceNode.data.sourceNodeId) {
          q.showIf = {
            questionId: sourceNode.data.sourceNodeId,
            hasAny: sourceNode.data.value ? [sourceNode.data.value] : [],
          };
          // If this is the "no" branch, negate
          if (incomingEdge.sourceHandle === 'no') {
            q.showIfNot = true;
          }
        }
      }
      questions.push(q);
    } else if (node.type === 'serviceSelect') {
      questions.push({
        id: node.id,
        type: 'multi_select',
        text: node.data.label || 'Select services',
        required: node.data.required || false,
        isServiceSelect: true,
      });
    }
  }

  return questions;
}
