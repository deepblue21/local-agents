// ============================================================
// src/nodes.jsx — Nodes & Network detail view + full topology
// ============================================================

// ---------- Full topology canvas ----------
function Topology({ nodes, selected, onSelect, model, totals }) {
  // Triangle layout: master top-center, workers bottom-left + bottom-right
  const W = 800, H = 460;
  const master = nodes.find(n => n.role === 'master');
  const workers = nodes.filter(n => n.role !== 'master');
  const positions = {
    [master.id]:     { x: W / 2,     y: 92  },
    [workers[0].id]: { x: 132,       y: H - 130 },
    [workers[1].id]: { x: W - 132,   y: H - 130 },
  };
  // mock bandwidth per edge
  const bandwidth = { [workers[0].id]: '9.4', [workers[1].id]: '10.0' };

  return (
    <div className="card p-5 relative overflow-hidden">
      <div className="flex items-center gap-2 mb-4">
        <L.GitFork size={14} style={{ color: 'var(--accent)' }} />
        <div className="text-[13.5px] font-semibold tracking-tight">Cluster topology</div>
        <span className="text-[11px] mono text-mute">tensor + pipeline parallel · ring-allreduce</span>
        <div className="ml-auto flex items-center gap-3 text-[10.5px] mono">
          <span className="flex items-center gap-1.5 text-mute"><span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} /> online</span>
          <span className="flex items-center gap-1.5 text-mute"><span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--warn)' }} /> processing</span>
          <span className="flex items-center gap-1.5 text-mute"><span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--crit)' }} /> vram pressure</span>
        </div>
      </div>

      <div className="relative rounded-lg overflow-hidden"
           style={{ height: H, background: 'radial-gradient(circle at 50% 18%, rgba(var(--accent-rgb), 0.06) 0%, transparent 55%), var(--surface)' }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="edgeGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="rgba(var(--accent-rgb),0.65)" />
              <stop offset="100%" stopColor="rgba(var(--accent-rgb),0.18)" />
            </linearGradient>
            <radialGradient id="nodeBg" cx="50%" cy="40%" r="60%">
              <stop offset="0%"  stopColor="var(--surface-3)" />
              <stop offset="100%" stopColor="var(--surface-2)" />
            </radialGradient>
            <filter id="edgeBlur" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3.5" />
            </filter>
          </defs>

          {/* Concentric rings around master — decorative */}
          {[55, 100, 160, 230].map((r, i) => (
            <circle key={r} cx={positions[master.id].x} cy={positions[master.id].y} r={r}
                    fill="none" stroke="rgba(var(--accent-rgb), 0.07)" strokeWidth="1"
                    strokeDasharray={i % 2 ? '2 6' : '0'} />
          ))}

          {/* Edges + animated packets */}
          {workers.map((w, idx) => {
            const a = positions[master.id], b = positions[w.id];
            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2 - 20;
            const pathD = `M ${a.x},${a.y} Q ${midX},${midY} ${b.x},${b.y}`;
            const isSel = selected === w.id || selected === master.id;
            const dur = `${1.6 + idx * 0.5}s`;
            return (
              <g key={w.id}>
                {/* glow */}
                <path d={pathD} fill="none" stroke="rgba(var(--accent-rgb),0.18)" strokeWidth={isSel ? 10 : 6} filter="url(#edgeBlur)" />
                {/* main edge */}
                <path id={`edge-${w.id}`} d={pathD} fill="none" stroke="url(#edgeGrad)"
                      strokeWidth={isSel ? 2 : 1.4} strokeDasharray="6 6" opacity={isSel ? 1 : 0.78}>
                  <animate attributeName="stroke-dashoffset" from="24" to="0" dur={dur} repeatCount="indefinite" />
                </path>
                {/* outbound packet (master → worker) */}
                <circle r="2.6" fill="var(--accent)">
                  <animateMotion dur={`${2 + idx * 0.5}s`} repeatCount="indefinite" path={pathD} />
                </circle>
                {/* inbound packet (worker → master) */}
                <circle r="2" fill="var(--accent-2)" opacity="0.85">
                  <animateMotion dur={`${2.6 + idx * 0.4}s`} repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear" path={pathD} />
                </circle>

                {/* latency + bandwidth badge — anchored to mid */}
                <g transform={`translate(${midX - 76} ${midY - 12})`}>
                  <rect width="152" height="26" rx="13" fill="var(--surface-2)" stroke="var(--border)" />
                  <text x="76" y="17" textAnchor="middle" fontSize="10.5" fontFamily="JetBrains Mono">
                    <tspan fill="var(--text-mute)">RTT</tspan>
                    <tspan fill="var(--text)" dx="6">{w.latency.toFixed(0)}ms</tspan>
                    <tspan fill="var(--border-strong)" dx="8">|</tspan>
                    <tspan fill="var(--text-mute)" dx="8">BW</tspan>
                    <tspan fill="var(--accent)" dx="6">{bandwidth[w.id]} Gb/s</tspan>
                  </text>
                </g>
              </g>
            );
          })}

          {/* Ring between workers (peer link) */}
          <path d={`M ${positions[workers[0].id].x},${positions[workers[0].id].y} Q ${W/2},${H - 60} ${positions[workers[1].id].x},${positions[workers[1].id].y}`}
                fill="none" stroke="rgba(var(--accent-rgb),0.18)" strokeWidth="1.2" strokeDasharray="2 6">
            <animate attributeName="stroke-dashoffset" from="16" to="0" dur="3s" repeatCount="indefinite" />
          </path>

          {/* Node visuals */}
          {nodes.map(n => {
            const p = positions[n.id];
            return <TopologyNode key={n.id} n={n} x={p.x} y={p.y} selected={selected === n.id} onClick={() => onSelect(n.id)} />;
          })}
        </svg>
      </div>
    </div>
  );
}

function TopologyNode({ n, x, y, selected, onClick }) {
  const Icon = L[n.icon] || L.Server;
  const pct = clamp((n.unifiedUsed / n.unifiedTotal) * 100, 0, 100);
  const tone = pct > 90 ? 'crit' : pct > 70 ? 'warn' : 'accent';
  const toneVar = tone === 'crit' ? '--crit-rgb' : tone === 'warn' ? '--warn-rgb' : '--accent-rgb';
  const r = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  const statusColor = n.status === 'processing' ? 'var(--warn)' : n.status === 'idle' ? 'var(--text-mute)' : 'var(--accent)';

  return (
    <g style={{ cursor: 'pointer' }} onClick={onClick}>
      {/* Hit area */}
      <rect x={x - 70} y={y - r - 8} width="140" height={r * 2 + 80} fill="transparent" />

      {/* Selection halo */}
      {selected && (
        <g>
          <circle cx={x} cy={y} r={r + 12} fill="none" stroke="var(--accent)" strokeWidth="2" opacity="0.45">
            <animate attributeName="r" from={r + 6} to={r + 16} dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.5" to="0.05" dur="1.8s" repeatCount="indefinite" />
          </circle>
        </g>
      )}

      {/* Background circle */}
      <circle cx={x} cy={y} r={r} fill="url(#nodeBg)" stroke="var(--border-strong)" strokeWidth="1.5" />

      {/* Memory utilization ring (donut) */}
      <circle cx={x} cy={y} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="3" />
      <circle cx={x} cy={y} r={r} fill="none"
              stroke={`rgba(var(${toneVar}),1)`} strokeWidth="3"
              strokeDasharray={circ} strokeDashoffset={offset}
              strokeLinecap="round"
              transform={`rotate(-90 ${x} ${y})`}
              style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.4,0,.2,1)', filter: `drop-shadow(0 0 6px rgba(var(${toneVar}),0.45))` }} />

      {/* Icon (foreignObject so we get Lucide inside SVG) */}
      <foreignObject x={x - 14} y={y - 14} width="28" height="28">
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={20} style={{ color: n.role === 'master' ? 'var(--accent)' : 'var(--text)' }} strokeWidth={1.8} />
        </div>
      </foreignObject>

      {/* Status pulse dot — top right of circle */}
      <circle cx={x + r - 4} cy={y - r + 4} r="4.5" fill="var(--surface)" stroke={statusColor} strokeWidth="1.5" />
      <circle cx={x + r - 4} cy={y - r + 4} r="2.5" fill={statusColor}>
        <animate attributeName="opacity" from="1" to="0.4" dur="1.6s" repeatCount="indefinite" />
      </circle>

      {/* VRAM percent text inside circle (small, above icon) */}
      <text x={x} y={y + 24} textAnchor="middle" fontSize="9.5" fontFamily="JetBrains Mono" fill={`rgba(var(${toneVar}),1)`} fontWeight="600">
        {pct.toFixed(0)}%
      </text>

      {/* Name + role + memory text below */}
      <g transform={`translate(${x} ${y + r + 22})`}>
        <text textAnchor="middle" fontSize="13" fontFamily="JetBrains Mono" fontWeight="600" fill="var(--text)">
          {n.name.split('.')[0]}
        </text>
        <text textAnchor="middle" y="15" fontSize="9.5" fontFamily="JetBrains Mono" fill="var(--text-mute)" letterSpacing="0.06em">
          {n.role === 'master' ? 'MASTER' : 'WORKER'} · {n.layersHosted}L · {n.latency === 0 ? 'host' : `${n.latency.toFixed(0)}ms`}
        </text>
        <text textAnchor="middle" y="32" fontSize="11" fontFamily="JetBrains Mono" fill={`rgba(var(${toneVar}),1)`}>
          {n.unifiedUsed.toFixed(1)} / {n.unifiedTotal} GB
        </text>
      </g>
    </g>
  );
}

// ---------- Action panels (ssh / metrics / restart / drain) ----------
function NodeActionPanel({ node, action, onClose }) {
  if (action === 'ssh')     return <SshPanel node={node} onClose={onClose} />;
  if (action === 'metrics') return <MetricsPanel node={node} onClose={onClose} />;
  if (action === 'restart') return <RestartPanel node={node} onClose={onClose} />;
  if (action === 'drain')   return <DrainPanel node={node} onClose={onClose} />;
  return null;
}

function PanelChrome({ icon: Icon, title, tone = 'accent', onClose, children }) {
  const toneVar = tone === 'warn' ? '--warn-rgb' : tone === 'crit' ? '--crit-rgb' : '--accent-rgb';
  return (
    <div className="mt-4 rounded-lg overflow-hidden fade-up"
         style={{ background: 'var(--surface-2)', border: `1px solid rgba(var(${toneVar}),0.25)` }}>
      <div className="flex items-center gap-2 px-3.5 py-2 border-b"
           style={{ borderColor: `rgba(var(${toneVar}),0.20)`, background: `rgba(var(${toneVar}),0.05)` }}>
        <Icon size={12} style={{ color: `rgba(var(${toneVar}),1)` }} />
        <span className="text-[11.5px] mono" style={{ color: 'var(--text)' }}>{title}</span>
        <button onClick={onClose} className="ml-auto w-6 h-6 rounded flex items-center justify-center"
                style={{ color: 'var(--text-mute)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-mute)'}>
          <L.X size={12} />
        </button>
      </div>
      <div className="px-3.5 py-3">{children}</div>
    </div>
  );
}

function SshPanel({ node, onClose }) {
  const [lines, setLines] = React.useState([
    { fg: 'var(--text-mute)', text: `$ ssh -i ~/.ssh/cluster_ed25519 kernel@${node.name}` },
    { fg: 'var(--text)',      text: `Connecting to ${node.host} on port 22…` },
  ]);
  React.useEffect(() => {
    const queue = [
      { fg: 'var(--accent)',   text: '✓  Authenticated (ed25519, key SHA256:9aR…)' },
      { fg: 'var(--text-dim)', text: `Last login: ${new Date().toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })} from 10.0.4.21` },
      { fg: 'var(--text-dim)', text: ` ${node.layersHosted > 0 ? `Ollama: serving ${node.layersHosted} layer shard` : 'Ollama: idle'} · OpenClaw agent: attached` },
      { fg: 'var(--text-mute)',text: `[kernel@${node.name.split('.')[0]} ~]$ uptime` },
      { fg: 'var(--text)',     text: `  ${new Date().toLocaleTimeString('en-US', { hour12: false })} up 14 days, 6:42, 2 users, load 0.41 0.38 0.42` },
      { fg: 'var(--text-mute)',text: `[kernel@${node.name.split('.')[0]} ~]$ ` },
    ];
    let i = 0;
    const id = setInterval(() => {
      if (i >= queue.length) { clearInterval(id); return; }
      setLines(ls => [...ls, queue[i++]]);
    }, 360);
    return () => clearInterval(id);
  }, []);

  return (
    <PanelChrome icon={L.Terminal} title={`ssh · ${node.name}`} onClose={onClose}>
      <div className="rounded-md mono text-[11.5px] leading-[1.65] px-3 py-2.5"
           style={{ background: 'var(--terminal-bg)', border: '1px solid var(--border)' }}>
        {lines.map((l, i) => (
          <div key={i} style={{ color: l.fg }} className="whitespace-pre">{l.text}</div>
        ))}
        <span className="caret w-[6px] h-[10px] inline-block ml-1 align-middle" style={{ background: 'var(--accent)' }} />
      </div>
    </PanelChrome>
  );
}

function MetricsPanel({ node, onClose }) {
  const accel = node.accelerators[0];
  const stats = [
    { l: 'net rx',    v: `${(110 + Math.random() * 60).toFixed(1)} MB/s`, t: 'accent' },
    { l: 'net tx',    v: `${(60  + Math.random() * 50).toFixed(1)} MB/s`, t: 'accent' },
    { l: 'disk r/w',  v: `${(280 + Math.random() * 200).toFixed(0)} / ${(60 + Math.random() * 40).toFixed(0)} MB/s`, t: 'default' },
    { l: 'processes', v: `${280 + Math.floor(Math.random() * 12)}`, t: 'default' },
    { l: 'open fds',  v: `${1700 + Math.floor(Math.random() * 200)}`, t: 'default' },
    { l: 'gpu clock', v: accel ? `${(2400 + Math.floor(Math.random() * 240))} MHz` : '—', t: accel ? 'warn' : 'default' },
    { l: 'power',     v: accel ? `${(160 + Math.floor(Math.random() * 80))} W / 220 W` : '—', t: 'warn' },
    { l: 'pid 1842',  v: 'ollama serve', t: 'default' },
  ];
  return (
    <PanelChrome icon={L.LineChart} title={`extended metrics · ${node.name}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 mono text-[11px]">
        {stats.map((s, i) => (
          <div key={i} className="flex items-baseline justify-between">
            <span className="text-mute uppercase tracking-wider text-[9.5px]">{s.l}</span>
            <span className="tnum" style={{ color: s.t === 'accent' ? 'var(--accent)' : s.t === 'warn' ? 'var(--warn)' : 'var(--text)' }}>{s.v}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t flex items-center justify-between text-[10.5px] mono"
           style={{ borderColor: 'var(--border)', color: 'var(--text-mute)' }}>
        <span>scrape interval 5s · prometheus :{9100 + parseInt(node.id.slice(1)) - 1}</span>
        <span>uptime 14d 6h 42m</span>
      </div>
    </PanelChrome>
  );
}

function RestartPanel({ node, onClose }) {
  const [stage, setStage] = React.useState('confirm');
  const [progress, setProgress] = React.useState(0);
  const [step, setStep] = React.useState('');

  const start = () => {
    setStage('progress');
    const stages = [
      { p: 12, s: 'flushing kv cache…' },
      { p: 28, s: 'draining placement group…' },
      { p: 48, s: 'unloading model weights…' },
      { p: 72, s: 'restarting ollama service…' },
      { p: 92, s: 'reloading weights…' },
      { p: 100, s: 'node back online' },
    ];
    let i = 0;
    const tick = () => {
      const t = stages[i++];
      setProgress(t.p); setStep(t.s);
      if (i < stages.length) setTimeout(tick, 460);
      else setTimeout(() => setStage('done'), 240);
    };
    tick();
  };

  return (
    <PanelChrome icon={L.RefreshCw} title={`restart · ${node.name}`} tone="warn" onClose={onClose}>
      {stage === 'confirm' && (
        <>
          <div className="text-[12px] mb-3 leading-relaxed" style={{ color: 'var(--text-dim)' }}>
            This will evict the shard hosted here (<span className="mono" style={{ color: 'var(--text)' }}>{node.layersHosted} layers</span>) and reload after restart.
            Estimated downtime <span className="mono" style={{ color: 'var(--warn)' }}>~18s</span>. Other nodes will continue serving.
          </div>
          <div className="flex gap-2">
            <Button tone="default" size="sm" onClick={onClose}>cancel</Button>
            <Button tone="accent"  size="sm" icon={L.RefreshCw} onClick={start}>confirm restart</Button>
          </div>
        </>
      )}
      {stage === 'progress' && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <L.Loader size={12} style={{ color: 'var(--warn)' }} className="animate-spin" />
            <span className="text-[11.5px] mono">{step}</span>
            <span className="ml-auto text-[11px] mono tnum" style={{ color: 'var(--warn)' }}>{progress}%</span>
          </div>
          <ProgressBar pct={progress} tone="warn" height={4} animated />
        </>
      )}
      {stage === 'done' && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] mono" style={{ color: 'var(--accent)' }}>
            <L.CircleCheck size={13} /> restarted successfully · shard rebalanced
          </div>
          <Button tone="default" size="sm" onClick={onClose}>close</Button>
        </div>
      )}
    </PanelChrome>
  );
}

function DrainPanel({ node, onClose }) {
  const [stage, setStage] = React.useState('confirm');
  const [progress, setProgress] = React.useState(0);
  const [step, setStep] = React.useState('');

  const start = () => {
    setStage('progress');
    const stages = [
      { p: 10, s: `marking ${node.name.split('.')[0]} unschedulable…` },
      { p: 28, s: 'migrating active sessions to peers…' },
      { p: 52, s: `evicting ${node.layersHosted}L shard to surviving nodes…` },
      { p: 78, s: 'awaiting in-flight tokens to finish…' },
      { p: 100, s: 'node drained' },
    ];
    let i = 0;
    const tick = () => {
      const t = stages[i++];
      setProgress(t.p); setStep(t.s);
      if (i < stages.length) setTimeout(tick, 520);
      else setTimeout(() => setStage('done'), 240);
    };
    tick();
  };

  return (
    <PanelChrome icon={L.PowerOff} title={`drain · ${node.name}`} tone="crit" onClose={onClose}>
      {stage === 'confirm' && (
        <>
          <div className="text-[12px] mb-3 leading-relaxed" style={{ color: 'var(--text-dim)' }}>
            Draining safely evicts this worker. Active inference sessions will reconnect to the remaining nodes; the layer shard (<span className="mono" style={{ color: 'var(--text)' }}>{node.layersHosted}L</span>) will be redistributed.
            Throughput will dip <span className="mono" style={{ color: 'var(--crit)' }}>~38%</span> until rebalance completes.
          </div>
          <div className="flex gap-2">
            <Button tone="default" size="sm" onClick={onClose}>cancel</Button>
            <Button tone="crit"    size="sm" icon={L.PowerOff} onClick={start}>drain node</Button>
          </div>
        </>
      )}
      {stage === 'progress' && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <L.Loader size={12} style={{ color: 'var(--crit)' }} className="animate-spin" />
            <span className="text-[11.5px] mono">{step}</span>
            <span className="ml-auto text-[11px] mono tnum" style={{ color: 'var(--crit)' }}>{progress}%</span>
          </div>
          <ProgressBar pct={progress} tone="crit" height={4} animated />
        </>
      )}
      {stage === 'done' && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] mono" style={{ color: 'var(--accent)' }}>
            <L.CircleCheck size={13} /> drained · safe to power off
          </div>
          <Button tone="default" size="sm" onClick={onClose}>close</Button>
        </div>
      )}
    </PanelChrome>
  );
}

// ---------- Detailed node card ----------
function NodeDetailCard({ n, selected, onSelect }) {
  const [action, setAction] = React.useState(null);
  const Icon = L[n.icon] || L.Server;
  const pct = (n.unifiedUsed / n.unifiedTotal) * 100;
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
        <Button tone={action === 'ssh' ? 'accent' : 'default'} size="sm" icon={L.Terminal} className="flex-1 justify-center"
                onClick={(e) => { e.stopPropagation(); setAction(a => a === 'ssh' ? null : 'ssh'); }}>ssh</Button>
        <Button tone={action === 'metrics' ? 'accent' : 'default'} size="sm" icon={L.LineChart} className="flex-1 justify-center"
                onClick={(e) => { e.stopPropagation(); setAction(a => a === 'metrics' ? null : 'metrics'); }}>metrics</Button>
        <Button tone={action === 'restart' ? 'accent' : 'default'} size="sm" icon={L.RefreshCw} className="flex-1 justify-center"
                onClick={(e) => { e.stopPropagation(); setAction(a => a === 'restart' ? null : 'restart'); }}>restart</Button>
        {n.role !== 'master' && (
          <Button tone={action === 'drain' ? 'crit' : 'default'} size="sm" icon={L.PowerOff}
                  onClick={(e) => { e.stopPropagation(); setAction(a => a === 'drain' ? null : 'drain'); }}>drain</Button>
        )}
      </div>

      {/* Inline action panel */}
      <div onClick={e => e.stopPropagation()}>
        <NodeActionPanel node={n} action={action} onClose={() => setAction(null)} />
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
function NodesNetwork({ cluster, selectedNodeId, setSelectedNodeId }) {
  const { nodes, model } = cluster;
  const [internalSelected, setInternalSelected] = React.useState(nodes[0].id);
  const selected = selectedNodeId ?? internalSelected;
  const setSelected = setSelectedNodeId ?? setInternalSelected;

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
        <Topology nodes={nodes} selected={selected} onSelect={setSelected} model={model} />
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
