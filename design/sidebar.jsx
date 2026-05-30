// ============================================================
// src/sidebar.jsx — Vertical nav with 6 sections
// ============================================================
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Cluster Overview',  icon: 'LayoutDashboard', hint: 'global state' },
  { id: 'nodes',     label: 'Nodes & Network',   icon: 'Network',         hint: '3 online',     badge: '3' },
  { id: 'chat',      label: 'Chat Playground',   icon: 'MessageSquare',   hint: 'sharded inference' },
  { id: 'models',    label: 'Model Hub',         icon: 'Boxes',           hint: 'library',      badge: '5' },
  { id: 'knowledge', label: 'Knowledge Base',    icon: 'Library',         hint: 'rag context' },
  { id: 'settings',  label: 'Settings',          icon: 'Settings',        hint: 'tune' },
];

function Sidebar({ active, setActive, cluster }) {
  const { nodes, totals, model } = cluster;
  return (
    <aside className="w-[252px] shrink-0 border-r flex flex-col"
           style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--bg) 92%, transparent)' }}>
      {/* Section: navigation */}
      <div className="px-3 pt-5">
        <div className="text-[10px] uppercase tracking-[0.20em] text-mute px-3 mb-2.5 font-medium">Workspace</div>
        <nav className="space-y-1">
          {NAV_ITEMS.map(item => {
            const Icon = L[item.icon];
            const isActive = active === item.id;
            return (
              <NavButton key={item.id} item={item} Icon={Icon} active={isActive} onClick={() => setActive(item.id)} />
            );
          })}
        </nav>
      </div>

      {/* Section: active model */}
      <div className="px-3 pt-6">
        <div className="text-[10px] uppercase tracking-[0.20em] text-mute px-3 mb-2.5 font-medium">Sharded model</div>
        <div className="mx-1 p-3.5 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-7 h-7 rounded-md flex items-center justify-center"
                 style={{ background: 'rgba(var(--accent-rgb),0.10)' }}>
              <L.Sparkles size={13} style={{ color: 'var(--accent)' }} />
            </div>
            <div className="text-[12.5px] font-medium mono">{model.name}</div>
            <span className="ml-auto w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--accent)' }} />
          </div>
          <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 text-[10.5px] mono">
            <div className="text-mute">params</div><div className="text-right text-dim tnum">{model.params}</div>
            <div className="text-mute">layers</div><div className="text-right text-dim tnum">{model.totalLayers}</div>
            <div className="text-mute">ctx</div><div className="text-right text-dim tnum">{model.contextWindow.toLocaleString()}</div>
            <div className="text-mute">tok/s</div><div className="text-right tnum" style={{ color: 'var(--accent)' }}>{totals.tps.toFixed(0)}</div>
          </div>
        </div>
      </div>

      {/* Section: cluster summary */}
      <div className="px-3 pt-6">
        <div className="text-[10px] uppercase tracking-[0.20em] text-mute px-3 mb-2.5 font-medium">Cluster</div>
        <div className="mx-1 px-3.5 py-3 rounded-xl border space-y-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          {nodes.map(n => {
            const Icon = L[n.icon] || L.Server;
            const tone = n.status === 'processing' ? 'var(--warn)' : n.status === 'online' ? 'var(--accent)' : 'var(--text-mute)';
            return (
              <div key={n.id} className="flex items-center gap-2">
                <Icon size={11} className="shrink-0" style={{ color: 'var(--text-dim)' }} />
                <span className="text-[11px] mono truncate flex-1" style={{ color: 'var(--text-dim)' }}>{n.name.split('.')[0]}</span>
                <span className="text-[10px] mono tnum text-mute">{n.latency === 0 ? '—' : `${n.latency.toFixed(0)}ms`}</span>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone, boxShadow: `0 0 6px ${tone}` }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom user block */}
      <div className="mt-auto p-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <button className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-[var(--surface-2)]">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold mono shrink-0"
               style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: 'var(--bg)' }}>K</div>
          <div className="min-w-0 flex-1 text-left">
            <div className="text-[12px] truncate">kernel@cluster</div>
            <div className="text-[10px] text-mute mono truncate">3 nodes · ray-2.34</div>
          </div>
          <L.ChevronUp size={14} className="text-mute" />
        </button>
      </div>
    </aside>
  );
}

function NavButton({ item, Icon, active, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] relative group"
      style={{
        background: active ? 'var(--surface-3)' : (hover ? 'color-mix(in srgb, var(--surface-2) 60%, transparent)' : 'transparent'),
        color: active ? 'var(--text)' : 'var(--text-dim)',
        boxShadow: active ? 'inset 0 0 0 1px var(--border-strong)' : 'none',
      }}>
      {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" style={{ background: 'var(--accent)', boxShadow: `0 0 10px var(--accent)` }} />}
      <Icon size={15} strokeWidth={2} style={{ color: active ? 'var(--accent)' : 'currentColor' }} />
      <div className="flex-1 text-left min-w-0">
        <div className="leading-none">{item.label}</div>
        {item.hint && <div className="text-[10px] mono mt-1 leading-none uppercase tracking-wider text-mute">{item.hint}</div>}
      </div>
      {item.badge && (
        <span className="text-[10px] mono px-1.5 py-0.5 rounded shrink-0"
              style={{
                background: active ? 'rgba(var(--accent-rgb),0.14)' : 'var(--surface-2)',
                color: active ? 'var(--accent)' : 'var(--text-mute)',
              }}>{item.badge}</span>
      )}
    </button>
  );
}

Object.assign(window, { Sidebar, NAV_ITEMS });
