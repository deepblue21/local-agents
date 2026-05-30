// ============================================================
// src/nodes.jsx — Nodes & Network detail view + full topology
// ============================================================

// ---------- Full topology canvas ----------
function Topology({ nodes, selected, onSelect }) {
  // Layout: master on left, workers on right
  // We render in an aspect box and scale via SVG
  const W = 600, H = 380;
  const master = nodes.find(n => n.role === 'master');
  const workers = nodes.filter(n => n.role !== 'master');
  const positions = {
    [master.id]: { x: 120, y: H / 2, master: true },
    [workers[0].id]: { x: W - 120, y: 90,  master: false },
    [workers[1].id]: { x: W - 120, y: H - 90, master: false },
  };

  return (
    <div className="card p-5 relative overflow-hidden">
      <div className="flex items-center gap-2 mb-4">
        <L.GitFork size={14} style={{ color: 'var(--accent)' }} />
        <div className="text-[13px] font-medium">Cluster topology</div>
        <span className="text-[11px] mono text-mute">tensor-parallel + pipeline-parallel · ring-allreduce</span>
        <div className="ml-auto flex items-center gap-3 text-[10.5px] mono">
          <span className="flex items-center gap-1.5 text-mute"><span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} /> online</span>
          <span className="flex items-center gap-1.5 text-mute"><span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--warn)' }} /> processing</span>
          <span className="flex items-center gap-1.5 text-mute"><span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--crit)' }} /> vram pressure</span>
        </div>
      </div>

      <div className="relative" style={{ height: 380 }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <marker id="arrowAccent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
            </marker>
            <linearGradient id="edgeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(var(--accent-rgb),0.5)" />
              <stop offset="100%" stopColor="rgba(var(--accent-rgb),0.2)" />
            </linearGradient>
          </defs>

          {/* Edges from master to workers */}
          {workers.map((w) => {
            const a = positions[master.id], b = positions[w.id];
            const cx1 = a.x + 140, cx2 = b.x - 140;
            const isSel = selected === w.id || selected === master.id;
            return (
              <g key={w.id}>
                <path d={`M ${a.x},${a.y} C ${cx1},${a.y} ${cx2},${b.y} ${b.x},${b.y}`}
                      fill="none" stroke="url(#edgeGrad)" strokeWidth={isSel ? 2.4 : 1.6}
                      strokeDasharray="4 4" opacity={isSel ? 1 : 0.7}>
                  <animate attributeName="stroke-dashoffset" from="16" to="0" dur={`${1.4 + Math.random()*0.6}s`} repeatCount="indefinite" />
                </path>
                {/* latency badge midway */}
                <g transform={`translate(${(a.x + b.x) / 2 - 28} ${(a.y + b.y) / 2 - 12})`}>
                  <rect width="56" height="24" rx="12" fill="var(--surface-2)" stroke="var(--border)" />
                  <text x="28" y="16" textAnchor="middle" fontSize="11" fill="var(--text-dim)" fontFamily="JetBrains Mono">
                    {w.latency.toFixed(0)}ms
                  </text>
                </g>
              </g>
            );
          })}
        </svg>

        {/* Node cards positioned absolutely */}
        {nodes.map(n => {
          const p = positions[n.id];
          const xPct = (p.x / W) * 100, yPct = (p.y / H) * 100;
          return (
            <div key={n.id} className="absolute" style={{ left: `${xPct}%`, top: `${yPct}%`, transform: 'translate(-50%, -50%)' }}>
              <TopologyNode n={n} selected={selected === n.id} onClick={() => onSelect(n.id)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopologyNode({ n, selected, onClick }) {
  const Icon = L[n.icon] || L.Server;
  const pct = (n.unifiedUsed / n.unifiedTotal) * 100;
  const tone = pct > 90 ? 'crit' : pct > 70 ? 'warn' : 'accent';
  const toneVar = tone === 'crit' ? '--crit-rgb' : tone === 'warn' ? '--warn-rgb' : '--accent-rgb';
  const statusColor = n.status === 'processing' ? 'var(--warn)' : 'var(--accent)';
  return (
    <button onClick={onClick}
      className="rounded-xl p-3.5 transition relative w-[200px] text-left"
      style={{
        background: 'var(--surface-2)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        boxShadow: selected ? `0 0 0 3px rgba(var(--accent-rgb),0.15), var(--shadow-elev)` : 'var(--shadow-card)',
      }}>
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="w-8 h-8 rounded-md flex items-center justify-center relative shrink-0"
             style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Icon size={14} style={{ color: n.role === 'master' ? 'var(--accent)' : 'var(--text-dim)' }} />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full pulse-dot" style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] mono font-medium truncate">{n.name.split('.')[0]}</div>
          <div className="text-[9.5px] mono text-mute uppercase tracking-wider mt-0.5">
            {n.role === 'master' ? 'master' : 'worker'} · {n.layersHosted}L
          </div>
        </div>
      </div>
      <ProgressBar pct={pct} tone={tone} height={4} animated />
      <div className="flex items-baseline justify-between mt-1.5 mono tnum">
        <span className="text-[10px] text-mute">memory</span>
        <span className="text-[10.5px]" style={{ color: `rgba(var(${toneVar}),1)` }}>
          {n.unifiedUsed.toFixed(1)} / {n.unifiedTotal} GB
        </span>
      </div>
      <div className="flex items-baseline justify-between mt-0.5 mono tnum">
        <span className="text-[10px] text-mute">throughput</span>
        <span className="text-[10.5px]" style={{ color: 'var(--accent)' }}>{n.throughput.toFixed(0)} tok/s</span>
      </div>
    </button>
  );
}

// ---------- Detailed node card ----------
function NodeDetailCard({ n, selected, onSelect }) {
  const Icon = L[n.icon] || L.Server;
  const pct = (n.unifiedUsed / n.unifiedTotal) * 100;
  const tone = pct > 90 ? 'crit' : pct > 70 ? 'warn' : 'accent';
  const statusColor = n.status === 'processing' ? 'var(--warn)' : n.status === 'online' ? 'var(--accent)' : 'var(--text-mute)';

  return (
    <div onClick={() => onSelect(n.id)}
      className="card card-hover p-5 cursor-pointer relative"
      style={{
        borderColor: selected ? 'rgba(var(--accent-rgb),0.40)' : 'var(--border)',
        boxShadow: selected ? `0 0 0 3px rgba(var(--accent-rgb),0.10), var(--shadow-elev)` : 'var(--shadow-card)',
      }}>
      {/* Top edge accent if selected */}
      {selected && <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl" style={{ background: 'var(--accent)', boxShadow: '0 0 12px var(--accent)' }} />}

      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 relative"
             style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <Icon size={18} style={{ color: n.role === 'master' ? 'var(--accent)' : 'var(--text-dim)' }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-[14.5px] font-semibold tracking-tight mono">{n.name}</div>
            {n.role === 'master'
              ? <Pill tone="accent" pulse>master</Pill>
              : <Pill tone={n.status === 'processing' ? 'warn' : 'default'} pulse>worker</Pill>}
          </div>
          <div className="text-[11px] text-mute mono">{n.os} · {n.host}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] text-mute uppercase tracking-wider mono">latency</div>
          <div className="mono tnum mt-1" style={{ color: n.latency === 0 ? 'var(--text-dim)' : 'var(--accent)' }}>
            {n.latency === 0 ? <span className="text-[11px]">— host —</span> : `${n.latency.toFixed(1)}ms`}
          </div>
        </div>
      </div>

      {/* Task line */}
      <div className="mb-4 px-3 py-2.5 rounded-md text-[11.5px] mono flex items-center gap-2"
           style={{ background: 'var(--surface-2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
        <span className="w-1.5 h-1.5 rounded-full pulse-dot shrink-0" style={{ background: statusColor }} />
        <span className="truncate">{n.task}</span>
      </div>

      {/* CPU + Temp row */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <L.Cpu size={11} className="text-mute" />
              <span className="text-[10.5px] uppercase tracking-[0.12em] text-mute mono">CPU</span>
            </div>
            <span className="text-[11px] mono tnum" style={{ color: 'var(--text)' }}>{n.cpu.pct.toFixed(0)}%</span>
          </div>
          <ProgressBar pct={n.cpu.pct} tone="accent" height={3} animated={false} />
          <div className="text-[10px] mono text-mute mt-1 truncate">{n.cpu.name} · {n.cpu.cores}</div>
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <L.Thermometer size={11} className="text-mute" />
              <span className="text-[10.5px] uppercase tracking-[0.12em] text-mute mono">Temp</span>
            </div>
            <span className="text-[11px] mono tnum" style={{ color: n.cpu.temp > 75 ? 'var(--warn)' : 'var(--text)' }}>{n.cpu.temp.toFixed(0)}°C</span>
          </div>
          <ProgressBar pct={((n.cpu.temp - 40) / 50) * 100} tone={n.cpu.temp > 75 ? 'warn' : 'accent'} height={3} animated={false} />
          <div className="text-[10px] mono text-mute mt-1">target {'<'} 80°C</div>
        </div>
      </div>

      {/* Accelerators */}
      <div className="space-y-3 mb-4">
        {n.accelerators.map((a, i) => {
          const apct = (a.vramUsed / a.vramTotal) * 100;
          const atone = apct > 90 ? 'crit' : apct > 70 ? 'warn' : 'accent';
          return (
            <div key={i} className="px-3.5 py-3 rounded-md" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <L.Zap size={11} style={{ color: 'var(--accent)' }} />
                  <span className="text-[11.5px] mono truncate">{a.name}</span>
                </div>
                {a.isVramTight && <Pill tone="crit">vram 92%</Pill>}
              </div>
              <ProgressBar pct={apct} tone={atone} height={4} animated valueLabel={`${a.vramUsed.toFixed(1)} / ${a.vramTotal} GB`} label="vram" />
              <div className="flex items-baseline justify-between mt-2 mono tnum">
                <span className="text-[10px] text-mute">load</span>
                <span className="text-[10.5px]" style={{ color: 'var(--text-dim)' }}>{a.pct.toFixed(0)}% · {a.temp.toFixed(0)}°C</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* RAM + Layers row */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.12em] text-mute mono mb-1.5">System RAM</div>
          <div className="text-[14px] mono tnum">{n.ram.used.toFixed(1)} <span className="text-[11px] text-mute">/ {n.ram.total} GB</span></div>
          <div className="text-[10px] mono text-mute mt-0.5">{n.ram.name}</div>
        </div>
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.12em] text-mute mono mb-1.5">Hosts layers</div>
          <div className="text-[14px] mono tnum">{n.layersHosted} <span className="text-[11px] text-mute">/ 80</span></div>
          <div className="text-[10px] mono text-mute mt-0.5">{n.throughput.toFixed(0)} tok/s share</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button tone="default" size="sm" icon={L.Terminal} className="flex-1 justify-center">ssh</Button>
        <Button tone="default" size="sm" icon={L.LineChart} className="flex-1 justify-center">metrics</Button>
        <Button tone="default" size="sm" icon={L.RefreshCw} className="flex-1 justify-center">restart</Button>
        {n.role !== 'master' && (
          <Button tone="crit" size="sm" icon={L.PowerOff}>drain</Button>
        )}
      </div>
    </div>
  );
}

// ---------- Layer split bar (visualization of where each layer lives) ----------
function LayerSplitBar({ nodes, model }) {
  let cursor = 0;
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <L.Layers size={14} style={{ color: 'var(--accent)' }} />
        <div className="text-[13px] font-medium">Layer placement · {model.name}</div>
        <span className="text-[11px] mono text-mute">{model.totalLayers} layers · {model.vramFootprint.toFixed(1)} GB total</span>
      </div>
      <div className="flex w-full h-9 rounded-md overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
        {nodes.map((n, i) => {
          const w = (n.layersHosted / model.totalLayers) * 100;
          const start = cursor;
          cursor += n.layersHosted;
          const isFirst = i === 0;
          const isLast = i === nodes.length - 1;
          return (
            <div key={n.id} className="relative flex items-center justify-center mono text-[10.5px]"
              style={{
                width: `${w}%`,
                background: `linear-gradient(180deg, color-mix(in srgb, var(--accent) ${20 + i*10}%, var(--surface-2)) 0%, var(--surface-2) 100%)`,
                borderRight: isLast ? 'none' : '1px dashed var(--border-strong)',
                color: 'var(--text)',
              }}>
              <span className="font-medium">{n.name.split('.')[0]}</span>
              <span className="ml-1.5 text-mute">L{start}-{start + n.layersHosted - 1}</span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] mono text-mute tnum mt-2">
        <span>L0</span>
        <span>L{Math.floor(model.totalLayers / 2)}</span>
        <span>L{model.totalLayers - 1}</span>
      </div>
    </div>
  );
}

// ---------- Network metric strip ----------
function NetworkStrip({ nodes }) {
  const lanLatency = (nodes.filter(n => n.role !== 'master').reduce((s, n) => s + n.latency, 0) / 2);
  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard label="LAN latency mean" value={lanLatency.toFixed(1)} sub="ms · across workers" icon={L.Activity} accent="var(--accent)" />
      <StatCard label="Bandwidth" value="9.4" sub="Gbit/s · 10G fiber" icon={L.Cable} />
      <StatCard label="Allreduce" value="ring" sub="NCCL fallback: TCP" icon={L.Repeat} />
      <StatCard label="Heartbeat" value="120" sub="ms · gossip protocol" icon={L.HeartPulse} accent="var(--accent)" />
    </div>
  );
}

// ---------- Main view ----------
function NodesNetwork({ cluster }) {
  const { nodes, model } = cluster;
  const [selected, setSelected] = React.useState(nodes[0].id);

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="space-y-6">
        {/* Header row with actions */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-semibold tracking-tight">Distributed cluster</h2>
            <div className="text-[13px] text-dim mt-1">
              3 nodes participating · ray head <span className="mono">workstation.local:6379</span> · openclaw gateway <span className="mono">:7878</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button tone="default" size="md" icon={L.RefreshCw}>resync topology</Button>
            <Button tone="accent" size="md" icon={L.Plus}>add node</Button>
          </div>
        </div>

        <NetworkStrip nodes={nodes} />
        <Topology nodes={nodes} selected={selected} onSelect={setSelected} />
        <LayerSplitBar nodes={nodes} model={model} />

        {/* Detail grid */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <L.Server size={14} style={{ color: 'var(--accent)' }} />
            <h3 className="text-[14px] font-semibold tracking-tight">Node detail</h3>
            <span className="text-[11px] mono text-mute">click a node above or a card below to focus</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {nodes.map(n => (
              <NodeDetailCard key={n.id} n={n} selected={selected === n.id} onSelect={setSelected} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NodesNetwork, Topology });
