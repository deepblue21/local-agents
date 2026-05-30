// ============================================================
// src/dashboard.jsx — Cluster Overview (stats + topology preview + terminal + agents)
// ============================================================

// ---------- Terminal logs ----------
const LOG_TEMPLATES = [
  { lvl: 'INFO ', c: 'var(--info)',     src: 'ray.head ', m: 'task placement → node[{n}] · shard[{s}] · req={id}' },
  { lvl: 'DEBUG', c: 'var(--text-mute)',src: 'shard.io ', m: 'tensor xfer {n1}→{n2} · 2.4MB · 1.{r}ms · ring-allreduce' },
  { lvl: 'INFO ', c: 'var(--info)',     src: 'qwen-mux', m: 'kv-cache hit ratio=0.{r}{r} · layers split [n1:20|n2:36|n3:24]' },
  { lvl: 'OK   ', c: 'var(--accent)',   src: 'openclaw', m: 'agent[coder] task#{id} completed in {t}ms ({tps} tok/s aggregate)' },
  { lvl: 'WARN ', c: 'var(--warn)',     src: 'cuda     ', m: 'n1 vram 7.8/8.0 GB — consider moving layers 18-19 to n2' },
  { lvl: 'INFO ', c: 'var(--info)',     src: 'inference',m: 'batch=1 prompt_tok={p} gen_tok={g} t={t}ms · n1:{nt1}ms n2:{nt2}ms n3:{nt3}ms' },
  { lvl: 'DEBUG', c: 'var(--text-mute)',src: 'gossip  ', m: 'node[n{n}] heartbeat · rtt {l}ms · load {ld}%' },
  { lvl: 'OK   ', c: 'var(--accent)',   src: 'ray.head ', m: 'placement group reconciled · {p} pending → 0' },
  { lvl: 'INFO ', c: 'var(--info)',     src: 'memory  ', m: 'vector index synced · 18,442 chunks · embeddings=bge-large' },
  { lvl: 'WARN ', c: 'var(--warn)',     src: 'openclaw', m: 'rate-limit on agent[researcher] — backoff 1.{r}s' },
];

function randLog(seq) {
  const t = LOG_TEMPLATES[Math.floor(Math.random() * LOG_TEMPLATES.length)];
  const r = () => Math.floor(Math.random() * 10);
  const nodes = ['n1','n2','n3'];
  const nidx = () => Math.floor(Math.random() * 3) + 1;
  const msg = t.m
    .replace(/\{id\}/g, (1000 + Math.floor(Math.random()*9000)).toString(16))
    .replace(/\{r\}/g, () => r())
    .replace(/\{n\}/g, () => nidx())
    .replace(/\{s\}/g, () => Math.floor(Math.random()*4))
    .replace(/\{n1\}/g, () => nodes[Math.floor(Math.random()*3)])
    .replace(/\{n2\}/g, () => nodes[Math.floor(Math.random()*3)])
    .replace(/\{t\}/g, () => (200 + Math.floor(Math.random()*1800)).toString())
    .replace(/\{p\}/g, () => (120 + Math.floor(Math.random()*800)).toString())
    .replace(/\{g\}/g, () => (40 + Math.floor(Math.random()*400)).toString())
    .replace(/\{tps\}/g, () => (60 + Math.floor(Math.random()*80)).toString())
    .replace(/\{nt1\}/g, () => (40 + Math.floor(Math.random()*120)).toString())
    .replace(/\{nt2\}/g, () => (40 + Math.floor(Math.random()*120)).toString())
    .replace(/\{nt3\}/g, () => (40 + Math.floor(Math.random()*120)).toString())
    .replace(/\{l\}/g, () => (1 + Math.floor(Math.random()*20)).toString())
    .replace(/\{ld\}/g, () => (10 + Math.floor(Math.random()*70)).toString())
    .replace(/\{p\}/g, () => Math.floor(Math.random()*5).toString());
  const now = new Date();
  const t2 = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}.${String(now.getMilliseconds()).padStart(3,'0')}`;
  return { id: seq, time: t2, level: t.lvl, color: t.c, src: t.src, msg };
}

function TerminalLog({ paused, filter }) {
  const [lines, setLines] = React.useState(() => {
    const init = []; for (let i = 0; i < 14; i++) init.push(randLog(i)); return init;
  });
  const seq = React.useRef(14);
  const scrollRef = React.useRef(null);
  const [autoscroll, setAutoscroll] = React.useState(true);

  React.useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setLines(prev => {
        const next = [...prev, randLog(seq.current++)];
        if (next.length > 200) next.shift();
        return next;
      });
    }, 900 + Math.random() * 700);
    return () => clearInterval(id);
  }, [paused]);

  React.useEffect(() => {
    if (autoscroll && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines, autoscroll]);

  const filtered = filter === 'all' ? lines : lines.filter(l => l.level.trim().toLowerCase() === filter);

  return (
    <div className="flex-1 flex flex-col card overflow-hidden min-h-0"
         style={{ background: 'var(--terminal-bg)' }}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--surface) 80%, transparent)' }}>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--crit) 35%, transparent)' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--warn) 35%, transparent)' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--accent) 35%, transparent)' }} />
        </div>
        <div className="mx-3 h-3 w-px" style={{ background: 'var(--border)' }} />
        <L.Terminal size={12} className="text-mute" />
        <span className="text-[11px] mono text-dim">cluster — deepseek-v3:67b · ray + openclaw</span>
        <div className="ml-auto flex items-center gap-3 text-[11px] mono text-mute">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: paused ? 'var(--warn)' : 'var(--accent)' }} />
            {paused ? 'paused' : 'streaming'}
          </span>
          <span>{filtered.length} lines</span>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={e => {
          const el = e.currentTarget;
          setAutoscroll(el.scrollHeight - el.scrollTop - el.clientHeight < 12);
        }}
        className="flex-1 overflow-y-auto mono text-[12px] leading-[1.6] px-4 py-3"
        style={{ color: 'var(--text)' }}
      >
        {filtered.map(l => (
          <div key={l.id} className="log-line flex gap-3 whitespace-pre">
            <span className="text-mute shrink-0">{l.time}</span>
            <span className="shrink-0 font-semibold" style={{ color: l.color }}>{l.level}</span>
            <span className="text-mute shrink-0">{l.src}</span>
            <span className="truncate">{l.msg}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-2">
          <span style={{ color: 'var(--accent)' }}>›</span>
          <span className="caret w-[7px] h-[14px] inline-block" style={{ background: 'var(--accent)' }} />
        </div>
      </div>
    </div>
  );
}

// ---------- Agents panel ----------
const AGENT_LIST = [
  { name: 'planner',    on: 'n1', status: 'idle',     task: 'awaiting dispatch',                       calls: 142, ms: 0    },
  { name: 'researcher', on: 'n2', status: 'running',  task: 'web.search · "ray placement groups"',     calls: 387, ms: 1240 },
  { name: 'coder',      on: 'n2', status: 'running',  task: 'edit /src/runtime/scheduler.rs',          calls: 612, ms: 2840 },
  { name: 'reviewer',   on: 'n3', status: 'queued',   task: 'PR #284 diff (892 lines)',                calls: 84,  ms: 0    },
  { name: 'executor',   on: 'n1', status: 'error',    task: 'sandbox: ENOMEM at chunk 14/32',          calls: 51,  ms: 0    },
];
const STATUS_COLOR = { idle: 'var(--text-mute)', running: 'var(--accent)', queued: 'var(--info)', error: 'var(--crit)', processing: 'var(--warn)' };

function AgentsPanel() {
  return (
    <div className="card flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <L.Bot size={14} style={{ color: 'var(--accent)' }} />
        <div className="text-[13px] font-medium">OpenClaw agents</div>
        <span className="text-[11px] mono text-mute ml-1">· 2 running</span>
        <button className="ml-auto text-[11px] mono text-dim hover:text-text flex items-center gap-1">
          <L.Plus size={12} /> dispatch
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {AGENT_LIST.map(a => (
          <div key={a.name} className="flex items-center gap-3 px-4 py-3 border-b last:border-0"
               style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATUS_COLOR[a.status], boxShadow: a.status === 'running' ? `0 0 8px ${STATUS_COLOR[a.status]}` : 'none' }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[12.5px] mono">{a.name}</span>
                <span className="text-[10px] mono uppercase tracking-wider" style={{ color: STATUS_COLOR[a.status] }}>{a.status}</span>
                <span className="text-[10px] mono text-mute">on {a.on}</span>
              </div>
              <div className="text-[11px] text-mute mono truncate mt-0.5">{a.task}</div>
            </div>
            <div className="text-right shrink-0 mono tnum">
              <div className="text-[11px] text-dim">{a.calls} calls</div>
              {a.ms > 0 && <div className="text-[10px] text-mute">{a.ms}ms</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Mini topology preview ----------
function TopologyMini({ nodes }) {
  // master in left, workers stacked on right with curved connecting lines
  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <L.GitFork size={14} style={{ color: 'var(--accent)' }} />
        <div className="text-[13px] font-medium">Topology</div>
        <span className="text-[11px] mono text-mute">deepseek-v3 split across 3 nodes</span>
      </div>
      <div className="relative flex-1 min-h-[180px]">
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 200">
          <path d="M 90,100 C 200,100 220,52 308,52" fill="none" stroke="rgba(var(--accent-rgb),0.35)" strokeWidth="1.5" strokeDasharray="3 4">
            <animate attributeName="stroke-dashoffset" from="14" to="0" dur="1.4s" repeatCount="indefinite" />
          </path>
          <path d="M 90,100 C 200,100 220,100 308,100" fill="none" stroke="rgba(var(--accent-rgb),0.35)" strokeWidth="1.5" strokeDasharray="3 4">
            <animate attributeName="stroke-dashoffset" from="14" to="0" dur="1.8s" repeatCount="indefinite" />
          </path>
          <path d="M 90,100 C 200,100 220,148 308,148" fill="none" stroke="rgba(var(--accent-rgb),0.35)" strokeWidth="1.5" strokeDasharray="3 4">
            <animate attributeName="stroke-dashoffset" from="14" to="0" dur="2.2s" repeatCount="indefinite" />
          </path>
        </svg>
        {/* master node */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[88px]">
          <NodePip n={nodes[0]} master />
        </div>
        {/* workers */}
        <div className="absolute right-0 top-0 w-[100px]"><NodePip n={nodes[1]} /></div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[100px]"><NodePip n={nodes[2]} /></div>
      </div>
    </div>
  );
}

function NodePip({ n, master }) {
  const Icon = L[n.icon] || L.Server;
  const pct = (n.unifiedUsed / n.unifiedTotal) * 100;
  const tone = pct > 90 ? 'crit' : pct > 70 ? 'warn' : 'accent';
  const toneVar = tone === 'crit' ? '--crit-rgb' : tone === 'warn' ? '--warn-rgb' : '--accent-rgb';
  return (
    <div className="rounded-xl p-3 border relative"
         style={{ background: 'var(--surface-2)', borderColor: master ? 'rgba(var(--accent-rgb),0.35)' : 'var(--border)' }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} style={{ color: master ? 'var(--accent)' : 'var(--text-dim)' }} />
        <span className="text-[11px] mono font-medium truncate">{n.name.split('.')[0]}</span>
        <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: `rgba(var(${toneVar}),1)`, boxShadow: `0 0 6px rgba(var(${toneVar}),1)` }} />
      </div>
      <div className="text-[9.5px] mono text-mute uppercase tracking-wider mb-1.5">{master ? 'master' : `${n.latency.toFixed(0)}ms`}</div>
      <ProgressBar pct={pct} tone={tone} height={3} animated={false} />
      <div className="text-[10px] mono tnum mt-1.5" style={{ color: `rgba(var(${toneVar}),1)` }}>{n.unifiedUsed.toFixed(0)}/{n.unifiedTotal}GB</div>
    </div>
  );
}

// ---------- Dashboard view ----------
function Dashboard({ cluster, onJumpTo }) {
  const { nodes, totals, model } = cluster;
  const [paused, setPaused] = React.useState(false);
  const [filter, setFilter] = React.useState('all');

  const tokSpark = React.useMemo(() => Array.from({length: 30}, () => 0.4 + Math.random() * 0.6), []);
  const latSpark = React.useMemo(() => Array.from({length: 30}, () => 0.2 + Math.random() * 0.5), []);
  const meanLatency = (nodes.filter(n => n.role !== 'master').reduce((s, n) => s + n.latency, 0) / 2).toFixed(1);

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 gap-6 overflow-auto">
      {/* Stat strip */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Aggregate throughput"
          value={totals.tps.toFixed(0)}
          sub="tok/s · sharded"
          accent="var(--accent)"
          icon={L.Zap}
          trend={{ up: true, label: '+12 vs single-node' }}
          spark={tokSpark}
        />
        <StatCard
          label="Pool utilization"
          value={`${((totals.memUsed / totals.memTotal) * 100).toFixed(0)}%`}
          sub={`${totals.memUsed.toFixed(0)}/${totals.memTotal.toFixed(0)} GB`}
          accent="var(--warn)"
          icon={L.HardDrive}
        />
        <StatCard
          label="Mean network latency"
          value={meanLatency}
          sub="ms · worker → master"
          icon={L.Activity}
          spark={latSpark}
        />
        <StatCard
          label="Active nodes"
          value={`${totals.online}/3`}
          sub="all healthy"
          accent="var(--accent)"
          icon={L.Network}
          trend={{ up: true, label: 'uptime 14d 6h' }}
        />
      </div>

      {/* Topology + agents row */}
      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        <TopologyMini nodes={nodes} />
        <AgentsPanel />
      </div>

      {/* Header for terminal + controls */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight flex items-center gap-2">
            <L.Terminal size={14} style={{ color: 'var(--accent)' }} /> Cluster log stream
          </h2>
          <div className="text-[12px] text-mute mt-1">Merged event stream from ray.head and openclaw agents across all 3 nodes.</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center p-0.5 rounded-md border"
               style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            {['all','info','warn','ok','debug'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="px-2.5 py-1 text-[10.5px] mono uppercase tracking-wider rounded transition"
                style={{
                  background: filter === f ? 'var(--surface-3)' : 'transparent',
                  color: filter === f ? 'var(--text)' : 'var(--text-mute)',
                }}>{f}</button>
            ))}
          </div>
          <Button tone="default" size="sm" icon={paused ? L.Play : L.Pause} onClick={() => setPaused(p => !p)}>
            {paused ? 'resume' : 'pause'}
          </Button>
          <Button tone="accent" size="sm" icon={L.SendHorizontal} onClick={() => onJumpTo && onJumpTo('chat')}>
            chat playground
          </Button>
        </div>
      </div>

      {/* Terminal — minimum height so it always reads */}
      <div className="h-[340px] flex">
        <TerminalLog paused={paused} filter={filter} />
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard });
