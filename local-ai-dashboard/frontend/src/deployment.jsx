// ============================================================
// src/deployment.jsx — Deploy / change which model runs on the cluster
// ============================================================

const STRATEGIES = [
  {
    id: 'shard',
    label: 'Auto-shard',
    sub: 'Split layers across all nodes proportionally to memory.',
    icon: 'GitFork',
    fit: 'Best for big models that don\'t fit on a single GPU.',
  },
  {
    id: 'pin',
    label: 'Pin to one node',
    sub: 'Run the whole model on a single chosen node.',
    icon: 'Pin',
    fit: 'Best for small models or low-latency single-host inference.',
  },
  {
    id: 'per-node',
    label: 'Per-node models',
    sub: 'Different model on each node. Agents route per task.',
    icon: 'LayoutGrid',
    fit: 'Advanced. Powers specialised agent pipelines.',
  },
];

function previewAssignment(nodes, model, strategy, pinnedNodeId, perNode, installedById) {
  if (!model && strategy !== 'per-node') return [];
  if (strategy === 'shard') {
    const weights = nodes.map(n => n.unifiedTotal);
    const totalW = weights.reduce((a,b)=>a+b,0);
    let cursor = 0;
    return nodes.map((n, i) => {
      const isLast = i === nodes.length - 1;
      const target = isLast ? (model.totalLayers - cursor) : Math.round((weights[i] / totalW) * model.totalLayers);
      const row = { node: n, layers: Math.max(0, target), range: target > 0 ? `L${cursor}–L${cursor + target - 1}` : '—', modelName: model.name };
      cursor += target;
      return row;
    });
  }
  if (strategy === 'pin') {
    return nodes.map(n => n.id === pinnedNodeId
      ? { node: n, layers: model.totalLayers, range: `L0–L${model.totalLayers - 1}`, modelName: model.name }
      : { node: n, layers: 0, range: '—', modelName: 'idle' }
    );
  }
  return nodes.map(n => {
    const m = installedById[perNode[n.id]];
    return m
      ? { node: n, layers: m.totalLayers, range: `L0–L${m.totalLayers - 1}`, modelName: m.name }
      : { node: n, layers: 0, range: '—', modelName: 'idle' };
  });
}

function vramFitForNode(node, model, strategy, share /* 0..1 */) {
  // crude estimate: vram needed = footprint * share
  if (!model) return { fits: true, projected: 0 };
  const projected = (model.vramFootprint || model.size || 8) * (share || 0);
  return { fits: projected <= node.unifiedTotal * 0.96, projected };
}

function DeploymentDialog({ open, cluster, initialModelId, onClose }) {
  const { nodes, installedModels, installedById, deployment, applyDeployment } = cluster;

  const [modelId, setModelId]   = React.useState(initialModelId || deployment.activeModelId);
  const [strategy, setStrategy] = React.useState(deployment.strategy);
  const [pinnedNodeId, setPinned] = React.useState(deployment.pinnedNodeId || nodes[0].id);
  const [perNode, setPerNode]   = React.useState(deployment.perNode || {});
  const [deploying, setDeploying] = React.useState(false);
  const [progress, setProgress]   = React.useState(0);
  const [stage, setStage] = React.useState('');

  // Reset state every time the dialog opens
  React.useEffect(() => {
    if (open) {
      setModelId(initialModelId || deployment.activeModelId);
      setStrategy(deployment.strategy);
      setPinned(deployment.pinnedNodeId || nodes[0].id);
      setPerNode(deployment.perNode || {});
      setDeploying(false);
      setProgress(0);
      setStage('');
    }
  }, [open, initialModelId]);

  React.useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape' && !deploying) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose, deploying]);

  if (!open) return null;

  const model = installedById[modelId];
  const preview = previewAssignment(nodes, model, strategy, pinnedNodeId, perNode, installedById);

  const startDeploy = () => {
    setDeploying(true);
    setProgress(0);
    const stages = [
      { p: 8,   s: 'evicting current shards…' },
      { p: 22,  s: 'allocating placement group…' },
      { p: 40,  s: 'streaming weights to nodes…' },
      { p: 68,  s: 'warming KV cache…' },
      { p: 88,  s: 'verifying ring-allreduce…' },
      { p: 100, s: 'deployment ready' },
    ];
    let i = 0;
    const tick = () => {
      const target = stages[i];
      setProgress(target.p);
      setStage(target.s);
      i++;
      if (i < stages.length) setTimeout(tick, 480 + Math.random() * 280);
      else setTimeout(() => {
        applyDeployment({ activeModelId: modelId, strategy, pinnedNodeId, perNode });
        setDeploying(false);
        onClose();
      }, 520);
    };
    tick();
  };

  // disable deploy when invalid
  const valid =
    (strategy === 'shard' && !!model) ||
    (strategy === 'pin' && !!model && !!pinnedNodeId) ||
    (strategy === 'per-node' && Object.values(perNode).some(v => !!installedById[v]));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center fade-up"
      style={{ background: 'color-mix(in srgb, var(--bg) 70%, transparent)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={() => { if (!deploying) onClose(); }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-[860px] max-w-[94vw] max-h-[92vh] flex flex-col rounded-2xl border overflow-hidden"
        style={{ background: 'var(--surface)', borderColor: 'var(--border-strong)', boxShadow: 'var(--shadow-elev), 0 0 0 1px rgba(var(--accent-rgb),0.06)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center"
               style={{ background: 'rgba(var(--accent-rgb),0.10)', border: '1px solid rgba(var(--accent-rgb),0.20)' }}>
            <L.Rocket size={17} style={{ color: 'var(--accent)' }} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold tracking-tight">Deploy a model to the cluster</h2>
            <div className="text-[12px] text-mute mt-0.5">Choose what runs and how it's distributed across your 3 nodes.</div>
          </div>
          <button onClick={onClose} disabled={deploying}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-mute hover:bg-[var(--surface-2)] hover:text-text disabled:opacity-50">
            <L.X size={15} />
          </button>
        </div>

        {/* Body — disable interaction during deploying */}
        <div className="flex-1 overflow-y-auto" style={{ pointerEvents: deploying ? 'none' : 'auto', opacity: deploying ? 0.45 : 1, transition: 'opacity .25s ease' }}>
          <div className="grid grid-cols-[1fr_320px] gap-0">
            {/* Left: form */}
            <div className="px-6 py-5 space-y-5 border-r" style={{ borderColor: 'var(--border)' }}>
              {/* Step 1 — Model */}
              <Section step="1" title="Model" hint="Pick one of your installed weights.">
                <div className="grid grid-cols-1 gap-1.5 max-h-[260px] overflow-y-auto pr-1">
                  {installedModels.map(m => {
                    const active = modelId === m.id;
                    return (
                      <button key={m.id} onClick={() => setModelId(m.id)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition"
                        style={{
                          background: active ? 'rgba(var(--accent-rgb),0.08)' : 'var(--surface-2)',
                          border: `1px solid ${active ? 'rgba(var(--accent-rgb),0.40)' : 'var(--border)'}`,
                          boxShadow: active ? '0 0 0 3px rgba(var(--accent-rgb),0.08)' : 'none',
                        }}>
                        <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                             style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                          <L.Boxes size={14} style={{ color: active ? 'var(--accent)' : 'var(--text-dim)' }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="text-[12.5px] mono truncate">{m.name}</div>
                            {active && deployment.activeModelId === m.id && <Pill tone="accent" pulse>current</Pill>}
                          </div>
                          <div className="text-[10.5px] mono text-mute mt-0.5 tnum">
                            {m.family} · {m.params} · {m.size.toFixed(1)} GB · {m.totalLayers}L
                          </div>
                        </div>
                        <div className="text-[10.5px] mono text-mute shrink-0 tnum">{m.quant}</div>
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* Step 2 — Strategy */}
              <Section step="2" title="Strategy" hint="How layers spread across the cluster.">
                <div className="grid grid-cols-3 gap-2">
                  {STRATEGIES.map(s => {
                    const Icon = L[s.icon];
                    const active = strategy === s.id;
                    return (
                      <button key={s.id} onClick={() => setStrategy(s.id)}
                        className="text-left rounded-lg p-3 border transition"
                        style={{
                          background: active ? 'rgba(var(--accent-rgb),0.08)' : 'var(--surface-2)',
                          borderColor: active ? 'rgba(var(--accent-rgb),0.40)' : 'var(--border)',
                          boxShadow: active ? '0 0 0 3px rgba(var(--accent-rgb),0.08)' : 'none',
                        }}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <Icon size={14} style={{ color: active ? 'var(--accent)' : 'var(--text-dim)' }} />
                          <span className="text-[12.5px] font-medium">{s.label}</span>
                        </div>
                        <div className="text-[11px] text-dim leading-relaxed">{s.sub}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] text-mute mt-2.5 flex items-start gap-2">
                  <L.Info size={11} className="shrink-0 mt-0.5" />
                  <span>{STRATEGIES.find(s => s.id === strategy)?.fit}</span>
                </div>
              </Section>

              {/* Step 3 — Strategy-specific config */}
              {strategy === 'pin' && (
                <Section step="3" title="Target node" hint="Which single node hosts the model.">
                  <div className="grid grid-cols-3 gap-2">
                    {nodes.map(n => {
                      const active = pinnedNodeId === n.id;
                      const fit = vramFitForNode(n, model, 'pin', 1);
                      const Icon = L[n.icon] || L.Server;
                      return (
                        <button key={n.id} onClick={() => setPinned(n.id)}
                          className="text-left rounded-lg p-3 border transition"
                          style={{
                            background: active ? 'rgba(var(--accent-rgb),0.08)' : 'var(--surface-2)',
                            borderColor: active ? 'rgba(var(--accent-rgb),0.40)' : 'var(--border)',
                            boxShadow: active ? '0 0 0 3px rgba(var(--accent-rgb),0.08)' : 'none',
                          }}>
                          <div className="flex items-center gap-2 mb-2">
                            <Icon size={13} style={{ color: active ? 'var(--accent)' : 'var(--text-dim)' }} />
                            <span className="text-[12px] mono font-medium truncate">{n.name.split('.')[0]}</span>
                          </div>
                          <div className="text-[10.5px] mono text-mute mb-1.5">{n.unifiedTotal} GB unified</div>
                          {!fit.fits && (
                            <Pill tone="crit">won't fit</Pill>
                          )}
                          {fit.fits && (
                            <Pill tone={active ? 'accent' : 'default'}>{fit.projected.toFixed(1)} GB est.</Pill>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </Section>
              )}

              {strategy === 'per-node' && (
                <Section step="3" title="Assignments" hint="Pick a different model for each node.">
                  <div className="space-y-2">
                    {nodes.map(n => {
                      const Icon = L[n.icon] || L.Server;
                      return (
                        <div key={n.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                          <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                            <Icon size={12} style={{ color: 'var(--text-dim)' }} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[12.5px] mono">{n.name.split('.')[0]}</div>
                            <div className="text-[10.5px] mono text-mute tnum">{n.unifiedTotal} GB unified</div>
                          </div>
                          <select
                            value={perNode[n.id] || ''}
                            onChange={e => setPerNode({ ...perNode, [n.id]: e.target.value })}
                            className="h-9 rounded-md border px-2.5 text-[12px] mono outline-none"
                            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
                          >
                            <option value="" style={{ background: 'var(--surface)', color: 'var(--text-mute)' }}>— idle —</option>
                            {installedModels.map(m => (
                              <option key={m.id} value={m.id} style={{ background: 'var(--surface)', color: 'var(--text)' }}>
                                {m.name} ({m.size.toFixed(1)} GB)
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}
            </div>

            {/* Right: live preview */}
            <div className="px-5 py-5">
              <div className="text-[10.5px] uppercase tracking-[0.16em] text-mute mono mb-3 font-medium">Live preview</div>
              {model && strategy !== 'per-node' && (
                <div className="mb-3 px-3 py-2.5 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div className="text-[12.5px] mono">{model.name}</div>
                  <div className="text-[10.5px] mono text-mute mt-0.5 tnum">{model.totalLayers} layers · {model.vramFootprint.toFixed(1)} GB total</div>
                </div>
              )}

              {/* Per-node preview rows */}
              <div className="space-y-2">
                {preview.map(row => {
                  const Icon = L[row.node.icon] || L.Server;
                  const idle = row.layers === 0;
                  return (
                    <div key={row.node.id} className="px-3 py-2.5 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', opacity: idle ? 0.55 : 1 }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Icon size={12} style={{ color: 'var(--text-dim)' }} />
                        <span className="text-[11.5px] mono font-medium truncate">{row.node.name.split('.')[0]}</span>
                        <span className="ml-auto text-[10.5px] mono text-mute tnum">{row.range}</span>
                      </div>
                      <div className="text-[10.5px] mono truncate" style={{ color: idle ? 'var(--text-mute)' : 'var(--text)' }}>
                        {row.modelName}
                      </div>
                      {row.layers > 0 && model && (
                        <div className="mt-2"><ProgressBar pct={(row.layers / model.totalLayers) * 100} tone="accent" height={3} animated={false} /></div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footprint hint */}
              {model && strategy === 'shard' && (
                <div className="mt-3 px-3 py-2 rounded-md text-[10.5px] mono text-mute flex items-start gap-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <L.HardDrive size={11} className="mt-0.5 shrink-0" />
                  <span>Total ≈ {model.vramFootprint.toFixed(1)} GB · spread across all 3 nodes proportionally to memory.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Deployment progress overlay (inline at the bottom for feedback) */}
        {deploying && (
          <div className="px-6 py-4 border-t" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <div className="flex items-center gap-3 mb-2">
              <L.Loader size={13} style={{ color: 'var(--accent)' }} className="animate-spin" />
              <span className="text-[12.5px] mono">{stage}</span>
              <span className="ml-auto text-[12px] mono tnum" style={{ color: 'var(--accent)' }}>{progress}%</span>
            </div>
            <ProgressBar pct={progress} tone="accent" height={4} animated />
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 px-6 py-3.5 border-t" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <div className="text-[11px] mono text-mute">
            Applies live · existing chat sessions will reconnect to the new placement group.
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button tone="default" size="md" onClick={onClose} disabled={deploying}>cancel</Button>
            <Button tone="solid" size="md" icon={L.Rocket} onClick={startDeploy} disabled={!valid || deploying}>
              {deploying ? 'deploying…' : 'deploy to cluster'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ step, title, hint, children }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2.5">
        <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10.5px] mono font-semibold"
              style={{ background: 'rgba(var(--accent-rgb),0.10)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}>{step}</span>
        <h3 className="text-[13.5px] font-semibold tracking-tight">{title}</h3>
        {hint && <span className="text-[11px] text-mute">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

Object.assign(window, { DeploymentDialog });
