// ============================================================
// src/topbar.jsx — Global cluster overview + theme switcher
// ============================================================
const { useState: tbUseState, useContext: tbUseContext, useEffect: tbUseEffect } = React;

const THEMES = [
  { id: 'deepsea',   label: 'Deep Sea',      hint: 'Cyan · navy',     icon: 'Waves' },
  { id: 'forest',    label: 'Forest Hacker', hint: 'Matrix green',    icon: 'Terminal' },
  { id: 'arctic',    label: 'Arctic Tech',   hint: 'Light · blue',    icon: 'Sun' },
  { id: 'synthwave', label: 'Synthwave',     hint: 'Pink · cyan',     icon: 'Disc' },
  { id: 'sandstone', label: 'Sandstone',     hint: 'Cream · burnt',   icon: 'Sunset' },
];

function ThemeSwitcher() {
  const { theme, setTheme } = tbUseContext(ThemeContext);
  return (
    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border"
         style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
      {THEMES.map(t => {
        const Icon = L[t.icon];
        const active = theme === t.id;
        return (
          <button key={t.id} onClick={() => setTheme(t.id)}
            title={`${t.label} — ${t.hint}`}
            className="w-8 h-8 rounded-md flex items-center justify-center transition"
            style={{
              background: active ? 'var(--surface-3)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-mute)',
              boxShadow: active ? 'inset 0 0 0 1px var(--border-strong)' : 'none',
            }}
          >
            <Icon size={14} strokeWidth={active ? 2.4 : 2} />
          </button>
        );
      })}
    </div>
  );
}

// ---------- Unified pool meter ----------
function PoolMeter({ totals }) {
  const pct = (totals.memUsed / totals.memTotal) * 100;
  const tone = pct > 90 ? 'crit' : pct > 70 ? 'warn' : 'accent';
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline gap-2 mb-1.5">
        <L.HardDrive size={13} style={{ color: 'var(--accent)' }} />
        <span className="text-[10.5px] uppercase tracking-[0.16em] text-dim font-medium">Unified memory pool</span>
        <span className="text-[10.5px] mono text-mute">across 3 nodes</span>
        <div className="ml-auto flex items-baseline gap-1.5 mono tnum">
          <span className="text-[16px] font-semibold" style={{ color: tone === 'crit' ? 'var(--crit)' : tone === 'warn' ? 'var(--warn)' : 'var(--accent)' }}>
            {totals.memUsed.toFixed(1)}
          </span>
          <span className="text-[11px] text-mute">/ {totals.memTotal.toFixed(0)} GB</span>
        </div>
      </div>
      <ProgressBar pct={pct} tone={tone} height={6} />
    </div>
  );
}

// ---------- Global throughput display ----------
function ThroughputCard({ totals }) {
  // 30-pt history sparkline
  const [hist, setHist] = tbUseState(() => Array.from({length: 32}, () => 80 + Math.random() * 60));
  tbUseEffect(() => {
    const id = setInterval(() => {
      setHist(h => [...h.slice(1), totals.tps]);
    }, 1300);
    return () => clearInterval(id);
  }, [totals.tps]);

  const max = Math.max(...hist, 1);
  const pts = hist.map((v, i) => `${(i / (hist.length - 1)) * 100},${100 - (v / max) * 90}`).join(' ');

  return (
    <div className="flex items-center gap-3 pr-5 border-r" style={{ borderColor: 'var(--border)' }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center relative shrink-0"
           style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <L.Zap size={15} style={{ color: 'var(--accent)' }} />
      </div>
      <div className="min-w-0">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-dim leading-none">Global inference</div>
        <div className="flex items-baseline gap-1 mt-1.5">
          <span className="text-[18px] font-semibold mono tnum" style={{ color: 'var(--accent)' }}>{totals.tps.toFixed(0)}</span>
          <span className="text-[11px] text-mute mono">tok/s</span>
        </div>
      </div>
      <svg width="64" height="34" viewBox="0 0 100 100" preserveAspectRatio="none" className="shrink-0">
        <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <polyline points={`0,100 ${pts} 100,100`} fill="var(--accent)" fillOpacity="0.08" stroke="none" />
      </svg>
    </div>
  );
}

// ---------- Active model split badge ----------
function ModelSplitBadge({ nodes, model, onDeploy }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={() => onDeploy && onDeploy()}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className="flex items-center gap-3 px-4 h-12 rounded-lg border transition group"
      style={{
        borderColor: hover ? 'rgba(var(--accent-rgb),0.40)' : 'var(--border)',
        background: hover ? 'var(--surface-3)' : 'var(--surface-2)',
        boxShadow: hover ? '0 0 0 3px rgba(var(--accent-rgb),0.08)' : 'none',
        cursor: 'pointer',
      }}
      title="Change deployment"
    >
      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
           style={{ background: 'rgba(var(--accent-rgb),0.10)' }}>
        <L.Sparkles size={13} style={{ color: 'var(--accent)' }} />
      </div>
      <div className="min-w-0 text-left">
        <div className="flex items-center gap-2">
          <div className="text-[12.5px] mono leading-none">{model.name}</div>
          <Pill tone="accent" pulse>sharded</Pill>
        </div>
        <div className="text-[10.5px] mono text-mute mt-1.5 leading-none">
          {nodes.map((n, i) => (
            <span key={n.id}>
              <span style={{ color: 'var(--text-dim)' }}>{n.layersHosted}L</span>
              <span className="mx-1">·</span>
              <span>{n.name.split('.')[0]}</span>
              {i < nodes.length - 1 && <span className="mx-1.5 text-mute">+</span>}
            </span>
          ))}
        </div>
      </div>
      <L.SlidersHorizontal size={12} className="shrink-0 ml-1" style={{ color: hover ? 'var(--accent)' : 'var(--text-mute)' }} />
    </button>
  );
}

// ---------- TopBar ----------
const NOTIFICATIONS = [
  { id: 'n1', kind: 'warn',   icon: 'TriangleAlert', title: 'n1 VRAM near limit',         body: 'workstation.local at 95% (7.6/8.0 GB) — consider rebalancing 2 layers onto studio.local.', time: 'just now', unread: true },
  { id: 'n2', kind: 'ok',     icon: 'CircleCheck',   title: 'Layer rebalance complete',    body: 'Migrated layers 18–19 from n1 → n2. Cluster throughput up 8.4%.',                  time: '2 min ago', unread: true },
  { id: 'n3', kind: 'info',   icon: 'Download',      title: 'Model pull finished',         body: 'qwen2.5-coder-32b-instruct downloaded · 18.6 GB · synced to all 3 nodes.',         time: '14 min ago', unread: true },
  { id: 'n4', kind: 'info',   icon: 'GitFork',       title: 'n3 rejoined ring',            body: 'rack-01.dc came back online after 4ms heartbeat dropout. No retries needed.',     time: '38 min ago' },
  { id: 'n5', kind: 'crit',   icon: 'PowerOff',      title: 'Sandbox OOM',                 body: 'openclaw executor terminated at chunk 14/32. Bump --sandbox-mem to 4G.',          time: '1 h ago' },
  { id: 'n6', kind: 'info',   icon: 'Bot',           title: 'New agent registered',        body: 'reviewer-v2 attached to gateway:7878. Auto-scaling to 3 replicas.',               time: '3 h ago' },
];
const NOTIF_TONE = {
  ok:   { fg: 'var(--accent)', bg: 'rgba(var(--accent-rgb),0.10)', bd: 'rgba(var(--accent-rgb),0.25)' },
  warn: { fg: 'var(--warn)',   bg: 'rgba(var(--warn-rgb),0.10)',   bd: 'rgba(var(--warn-rgb),0.25)' },
  crit: { fg: 'var(--crit)',   bg: 'rgba(var(--crit-rgb),0.10)',   bd: 'rgba(var(--crit-rgb),0.25)' },
  info: { fg: 'var(--text-dim)', bg: 'var(--surface-2)',           bd: 'var(--border)' },
};

function NotificationsBell() {
  const [open, setOpen] = tbUseState(false);
  const [items, setItems] = tbUseState(NOTIFICATIONS);
  const ref = React.useRef(null);
  const unread = items.filter(i => i.unread).length;

  tbUseEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey   = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onClick); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const markAllRead = () => setItems(its => its.map(i => ({ ...i, unread: false })));
  const clearAll    = () => setItems([]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-9 h-9 rounded-lg border flex items-center justify-center transition"
        style={{
          borderColor: open ? 'var(--border-strong)' : 'var(--border)',
          background: open ? 'var(--surface-2)' : 'transparent',
          color: 'var(--text-dim)',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'var(--surface-2)'; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent'; }}
      >
        <L.Bell size={15} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full text-[9.5px] mono font-semibold flex items-center justify-center"
                style={{ background: 'var(--crit)', color: 'var(--bg)', boxShadow: '0 0 8px rgba(var(--crit-rgb),0.55)' }}>
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-[380px] rounded-xl border overflow-hidden fade-up"
             style={{ background: 'var(--surface)', borderColor: 'var(--border-strong)', boxShadow: 'var(--shadow-elev)', zIndex: 30 }}>
          {/* header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <L.Bell size={13} style={{ color: 'var(--accent)' }} />
            <div className="text-[12.5px] font-medium">Cluster activity</div>
            <span className="text-[10.5px] mono text-mute">· {items.length} events</span>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={markAllRead} className="text-[10.5px] mono px-2 py-1 rounded hover:bg-[var(--surface-3)]"
                      style={{ color: 'var(--text-dim)' }}>mark read</button>
              <button onClick={clearAll} className="text-[10.5px] mono px-2 py-1 rounded hover:bg-[var(--surface-3)]"
                      style={{ color: 'var(--text-mute)' }}>clear</button>
            </div>
          </div>

          {/* list */}
          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
                     style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <L.BellOff size={18} className="text-mute" />
                </div>
                <div className="text-[12.5px] text-dim">No activity</div>
                <div className="text-[11px] mono text-mute mt-1">cluster is quiet — nothing to report</div>
              </div>
            ) : items.map(item => {
              const Icon = L[item.icon];
              const tone = NOTIF_TONE[item.kind] || NOTIF_TONE.info;
              return (
                <div key={item.id} className="flex gap-3 px-4 py-3 border-b last:border-0 transition relative"
                     style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}
                     onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                     onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {item.unread && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />}
                  <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                       style={{ background: tone.bg, border: `1px solid ${tone.bd}` }}>
                    <Icon size={13} style={{ color: tone.fg }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <div className="text-[12.5px] font-medium truncate" style={{ color: 'var(--text)' }}>{item.title}</div>
                      <span className="text-[10px] mono text-mute shrink-0 ml-auto">{item.time}</span>
                    </div>
                    <div className="text-[11.5px] text-dim mt-0.5 leading-relaxed">{item.body}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div className="px-4 py-2.5 border-t flex items-center justify-between text-[10.5px] mono"
               style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <span className="text-mute">openclaw.gateway · :7878</span>
            <button className="text-mute hover:text-text flex items-center gap-1">
              all events <L.ArrowRight size={11} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TopBar({ cluster, sectionTitle, sectionSub, onSelectNode, onDeploy }) {
  const { nodes, totals, model } = cluster;
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  return (
    <header
      className="border-b shrink-0 sticky top-0 z-20"
      style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--bg) 75%, transparent)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
    >
      {/* Row 1 — brand + cluster identity */}
      <div className="flex items-center gap-5 px-6 h-[64px]">
        {/* Brand */}
        <div className="flex items-center gap-3 pr-5 border-r" style={{ borderColor: 'var(--border)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center relative"
               style={{ background: 'linear-gradient(135deg, var(--surface-2) 0%, var(--surface) 100%)', border: '1px solid var(--border-strong)' }}>
            <div className="absolute inset-0 rounded-xl" style={{ background: `radial-gradient(circle at 30% 30%, rgba(var(--accent-rgb),0.30), transparent 60%)` }} />
            <L.Network size={18} style={{ color: 'var(--accent)' }} strokeWidth={2} className="relative" />
          </div>
          <div>
            <div className="text-[14px] font-semibold tracking-tight leading-none">openclaw<span style={{ color: 'var(--accent)' }}>.</span>cluster</div>
            <div className="text-[10px] text-mute mono mt-1.5 uppercase tracking-[0.18em] leading-none">v3.0 · 3 nodes · ray</div>
          </div>
        </div>

        {/* Section title */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[16px] font-semibold tracking-tight leading-none">{sectionTitle}</h1>
            <Pill tone="accent" pulse>cluster online</Pill>
          </div>
          {sectionSub && <div className="text-[12px] text-mute mt-1.5 leading-none truncate">{sectionSub}</div>}
        </div>

        {/* Right cluster ops */}
        <div className="flex items-center gap-3">
          <ModelSplitBadge nodes={nodes} model={model} onDeploy={onDeploy} />
          <ThemeSwitcher />
          <div className="text-right pr-1 pl-1">
            <div className="text-[10px] text-mute uppercase tracking-[0.14em] leading-none">cluster time</div>
            <div className="text-[12px] mono mt-1.5 leading-none tnum">{time}</div>
          </div>
          <NotificationsBell />
        </div>
      </div>

      {/* Row 2 — global metrics strip */}
      <div className="flex items-center gap-6 px-6 h-[68px]" style={{ borderTop: '1px solid var(--border)', background: 'color-mix(in srgb, var(--bg-elev) 60%, transparent)' }}>
        <ThroughputCard totals={totals} />
        <PoolMeter totals={totals} />
        <div className="w-px h-9 self-center" style={{ background: 'var(--border)' }} />
        <div className="flex items-center gap-4">
          <NodeBlip n={nodes[0]} onClick={onSelectNode} />
          <NodeBlip n={nodes[1]} onClick={onSelectNode} />
          <NodeBlip n={nodes[2]} onClick={onSelectNode} />
        </div>
      </div>
    </header>
  );
}

function NodeBlip({ n, onClick }) {
  const Icon = L[n.icon] || L.Server;
  const pct = (n.unifiedUsed / n.unifiedTotal) * 100;
  const tone = pct > 90 ? 'var(--crit)' : pct > 70 ? 'var(--warn)' : 'var(--accent)';
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={() => onClick && onClick(n.id)}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className="flex items-center gap-2.5 pr-3 pl-2 py-1.5 rounded-lg"
      style={{
        background: hover ? 'var(--surface-2)' : 'transparent',
        border: `1px solid ${hover ? 'var(--border)' : 'transparent'}`,
      }}
      title={`Open ${n.name}`}
    >
      <div className="w-8 h-8 rounded-md flex items-center justify-center relative shrink-0"
           style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <Icon size={13} style={{ color: 'var(--text-dim)' }} />
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: tone, boxShadow: `0 0 6px ${tone}` }} />
      </div>
      <div className="text-left">
        <div className="text-[11px] mono leading-none" style={{ color: 'var(--text)' }}>{n.name.split('.')[0]}</div>
        <div className="text-[10px] mono text-mute mt-1 leading-none tnum">
          {n.unifiedUsed.toFixed(1)}/{n.unifiedTotal}gb · {n.latency === 0 ? 'host' : `${n.latency.toFixed(0)}ms`}
        </div>
      </div>
    </button>
  );
}

Object.assign(window, { TopBar, ThemeSwitcher, THEMES });
