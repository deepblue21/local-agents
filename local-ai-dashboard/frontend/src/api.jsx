// ============================================================
// src/api.jsx — Real backend client (replaces lib.jsx's mock useCluster).
// Loaded BEFORE lib.jsx; exposes window.useCluster which lib.jsx re-exports.
// ============================================================

const API_BASE = window.location.origin;       // FastAPI serves both UI + API
const WS_BASE  = API_BASE.replace(/^http/, 'ws');

// ── Thin REST helpers ────────────────────────────────────────────────────
const api = {
  async getJSON(path) {
    const r = await fetch(`${API_BASE}${path}`);
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  },
  async patch(path, body) {
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  },
  async del(path) {
    const r = await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  },
  async upload(path, file) {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(`${API_BASE}${path}`, { method: 'POST', body: fd });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  },
  ws(path, onMessage, onClose) {
    const ws = new WebSocket(`${WS_BASE}${path}`);
    ws.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)); } catch {}
    };
    ws.onclose = () => onClose && onClose();
    return ws;
  },
};

// ── Stream chat — yields {type:'delta'|'metrics'|'done', ...} ────────────
async function* streamChat({ messages, template_id, max_tokens, temperature, top_p, session_id }) {
  const r = await fetch(`${API_BASE}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, template_id, max_tokens, temperature, top_p, session_id }),
  });
  if (!r.ok) throw new Error(`chat: ${r.status}`);
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop();
    for (const part of parts) {
      if (!part.startsWith('data:')) continue;
      try {
        yield JSON.parse(part.slice(5).trim());
      } catch {}
    }
  }
}

// ── Real useCluster hook ─────────────────────────────────────────────────
function useClusterFromAPI() {
  const [state, setState] = React.useState({
    nodes: [],
    totals: { memTotal: 0, memUsed: 0, ramTotal: 0, ramUsed: 0, tps: 0, online: 0 },
    model: null,
    installedModels: [],
    deployment: { activeModelId: null, strategy: 'shard', pinnedNodeId: null, perNode: {} },
  });

  React.useEffect(() => {
    let cancelled = false;
    let ws;
    // Hydrate immediately.
    api.getJSON('/api/cluster/state').then(s => { if (!cancelled) setState(s); }).catch(() => {});
    // Then subscribe.
    const connect = () => {
      ws = api.ws('/ws/cluster', (data) => { if (!cancelled) setState(data); }, () => {
        if (!cancelled) setTimeout(connect, 1500);
      });
    };
    connect();
    return () => { cancelled = true; if (ws) ws.close(); };
  }, []);

  const installedById = React.useMemo(
    () => Object.fromEntries((state.installedModels || []).map(m => [m.id, m])),
    [state.installedModels],
  );

  const applyDeployment = async (cfg) => {
    const next = {
      activeModelId: cfg.activeModelId ?? state.deployment.activeModelId,
      strategy:      cfg.strategy      ?? state.deployment.strategy,
      pinnedNodeId:  cfg.pinnedNodeId  ?? state.deployment.pinnedNodeId,
      perNode:       cfg.perNode       ?? state.deployment.perNode,
    };
    await api.post('/api/deployment', next);
  };

  const addInstalled = async (m) => {
    await api.post('/api/models/pull', { name: m.name });
  };

  const removeInstalled = async (id) => {
    const m = installedById[id];
    if (m) await api.del(`/api/models/${encodeURIComponent(m.name)}`);
  };

  return {
    nodes: state.nodes || [],
    totals: state.totals || { memTotal: 0, memUsed: 0, ramTotal: 0, ramUsed: 0, tps: 0, online: 0 },
    model: state.model,
    installedModels: state.installedModels || [],
    installedById,
    deployment: state.deployment || { activeModelId: null, strategy: 'shard', pinnedNodeId: null, perNode: {} },
    applyDeployment,
    addInstalled,
    removeInstalled,
  };
}

// Expose globally — lib.jsx will pick this up.
window.api = api;
window.streamChat = streamChat;
window.useClusterFromAPI = useClusterFromAPI;
