// ============================================================
// src/topbar.jsx — Global cluster overview + theme switcher
// ============================================================
const { useState: tbUseState, useContext: tbUseContext, useEffect: tbUseEffect } = React;

const THEMES = [
  { id: 'deepsea', label: 'Deep Sea',      hint: 'Cyan · navy',   icon: 'Waves' },
  { id: 'forest',  label: 'Forest Hacker', hint: 'Matrix green',  icon: 'Terminal' },
  { id: 'arctic',  label: 'Arctic Tech',   hint: 'Light · blue',  icon: 'Sun' },
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
function ModelSplitBadge({ nodes, model }) {
  return (
    <div className="flex items-center gap-3 px-4 h-12 rounded-lg border"
         style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
           style={{ background: 'rgba(var(--accent-rgb),0.10)' }}>
        <L.Sparkles size={13} style={{ color: 'var(--accent)' }} />
      </div>
      <div className="min-w-0">
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
    </div>
  );
}

// ---------- TopBar ----------
function TopBar({ cluster, sectionTitle, sectionSub }) {
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
          <ModelSplitBadge nodes={nodes} model={model} />
          <ThemeSwitcher />
          <div className="text-right pr-1 pl-1">
            <div className="text-[10px] text-mute uppercase tracking-[0.14em] leading-none">cluster time</div>
            <div className="text-[12px] mono mt-1.5 leading-none tnum">{time}</div>
          </div>
          <button className="w-9 h-9 rounded-lg border flex items-center justify-center hover:bg-[var(--surface-2)]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}>
            <L.Bell size={15} />
          </button>
        </div>
      </div>

      {/* Row 2 — global metrics strip */}
      <div className="flex items-center gap-6 px-6 h-[68px]" style={{ borderTop: '1px solid var(--border)', background: 'color-mix(in srgb, var(--bg-elev) 60%, transparent)' }}>
        <ThroughputCard totals={totals} />
        <PoolMeter totals={totals} />
        <div className="w-px h-9 self-center" style={{ background: 'var(--border)' }} />
        <div className="flex items-center gap-4">
          <NodeBlip n={nodes[0]} />
          <NodeBlip n={nodes[1]} />
          <NodeBlip n={nodes[2]} />
        </div>
      </div>
    </header>
  );
}

function NodeBlip({ n }) {
  const Icon = L[n.icon] || L.Server;
  const pct = (n.unifiedUsed / n.unifiedTotal) * 100;
  const tone = pct > 90 ? 'var(--crit)' : pct > 70 ? 'var(--warn)' : 'var(--accent)';
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-md flex items-center justify-center relative shrink-0"
           style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <Icon size={13} style={{ color: 'var(--text-dim)' }} />
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: tone, boxShadow: `0 0 6px ${tone}` }} />
      </div>
      <div>
        <div className="text-[11px] mono leading-none">{n.name.split('.')[0]}</div>
        <div className="text-[10px] mono text-mute mt-1 leading-none tnum">
          {n.unifiedUsed.toFixed(1)}/{n.unifiedTotal}gb · {n.latency === 0 ? 'host' : `${n.latency.toFixed(0)}ms`}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { TopBar, ThemeSwitcher, THEMES });
