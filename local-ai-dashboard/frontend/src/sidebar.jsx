// ============================================================
// src/sidebar.jsx — Vertical nav with 6 sections
// ============================================================
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Cluster Overview',  icon: 'LayoutDashboard', hint: 'global state' },
  { id: 'nodes',     label: 'Nodes & Network',   icon: 'Network',         hint: '3 online',     badge: '3' },
  { id: 'chat',      label: 'Chat Playground',   icon: 'MessageSquare',   hint: 'sharded inference' },
  { id: 'models',    label: 'Model Hub',         icon: 'Boxes',           hint: 'library',      badge: '5' },
  { id: 'knowledge', label: 'Knowledge Base',    icon: 'Library',         hint: 'rag context' },
  { id: 'energy',    label: 'Energy & Cost',     icon: 'BatteryCharging', hint: 'kWh · USD' },
  { id: 'settings',  label: 'Settings',          icon: 'Settings',        hint: 'tune' },
];

function Sidebar({ active, setActive, cluster, onDeploy }) {
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
        <button
          onClick={() => onDeploy && onDeploy()}
          className="w-full mx-0 p-3.5 rounded-xl border text-left transition group"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb),0.30)'; e.currentTarget.style.background = 'var(--surface-3)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
          title="Change deployment"
        >
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-7 h-7 rounded-md flex items-center justify-center"
                 style={{ background: 'rgba(var(--accent-rgb),0.10)' }}>
              <L.Sparkles size={13} style={{ color: 'var(--accent)' }} />
            </div>
            <div className="text-[12.5px] font-medium mono truncate">{model.name}</div>
            <span className="ml-auto w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--accent)' }} />
          </div>
          <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 text-[10.5px] mono">
            <div className="text-mute">params</div><div className="text-right text-dim tnum">{model.params}</div>
            <div className="text-mute">layers</div><div className="text-right text-dim tnum">{model.totalLayers}</div>
            <div className="text-mute">ctx</div><div className="text-right text-dim tnum">{model.contextWindow.toLocaleString()}</div>
            <div className="text-mute">tok/s</div><div className="text-right tnum" style={{ color: 'var(--accent)' }}>{totals.tps.toFixed(0)}</div>
          </div>
          <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t text-[10.5px] mono opacity-70 group-hover:opacity-100 transition"
               style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}>
            <L.SlidersHorizontal size={10} />
            <span>change deployment</span>
          </div>
        </button>
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
        <UserMenu setActive={setActive} />
      </div>
    </aside>
  );
}

function UserMenu({ setActive }) {
  const { theme, setTheme } = React.useContext(ThemeContext);
  const [open, setOpen] = React.useState(false);
  const [dialog, setDialog] = React.useState(null);
  const ref = React.useRef(null);

  // Close on outside click + Escape
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onClick); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const cycleTheme = () => {
    const order = ['deepsea','forest','arctic','synthwave','sandstone'];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
  };
  const currentThemeLabel = { deepsea: 'Deep Sea', forest: 'Forest Hacker', arctic: 'Arctic Tech', synthwave: 'Synthwave', sandstone: 'Sandstone' }[theme];

  const groups = [
    [
      { id: 'profile',  label: 'Account preferences', hint: 'name, avatar, shells', icon: 'UserCog',  onClick: () => setDialog('profile') },
      { id: 'tokens',   label: 'API tokens',          hint: '2 active',             icon: 'KeyRound', onClick: () => setDialog('tokens') },
      { id: 'keymap',   label: 'Keyboard shortcuts',  hint: '⌘ K',                 icon: 'Keyboard', onClick: () => setDialog('shortcuts') },
    ],
    [
      { id: 'theme',    label: 'Theme',               hint: currentThemeLabel,       icon: 'Palette', onClick: cycleTheme },
      { id: 'settings', label: 'Cluster settings',    hint: 'all sections',          icon: 'Settings', onClick: () => setActive('settings') },
      { id: 'docs',     label: 'Documentation',       hint: 'docs.openclaw.local',   icon: 'BookOpen', onClick: () => setDialog('docs') },
    ],
    [
      { id: 'switch',   label: 'Switch cluster',      hint: '2 saved',               icon: 'Repeat',  onClick: () => setDialog('switch') },
      { id: 'signout',  label: 'Sign out',            hint: 'lock all nodes',        icon: 'LogOut',  tone: 'crit', onClick: () => setDialog('signout') },
    ],
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg transition"
        style={{
          background: open ? 'var(--surface-2)' : 'transparent',
          boxShadow: open ? 'inset 0 0 0 1px var(--border)' : 'none',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'color-mix(in srgb, var(--surface-2) 70%, transparent)'; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent'; }}
      >
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold mono shrink-0"
             style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: 'var(--bg)' }}>K</div>
        <div className="min-w-0 flex-1 text-left">
          <div className="text-[12px] truncate">kernel@cluster</div>
          <div className="text-[10px] text-mute mono truncate">3 nodes · ray-2.34</div>
        </div>
        <L.ChevronUp size={14} className="text-mute transition-transform" style={{ transform: open ? 'rotate(0deg)' : 'rotate(180deg)' }} />
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border overflow-hidden fade-up"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border-strong)',
            boxShadow: 'var(--shadow-elev), 0 0 0 1px rgba(var(--accent-rgb),0.04)',
            zIndex: 30,
          }}
        >
          {/* Header */}
          <div className="px-3.5 py-3 border-b flex items-center gap-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-semibold mono shrink-0"
                 style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: 'var(--bg)' }}>K</div>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium" style={{ color: 'var(--text)' }}>Kernel Hayashi</div>
              <div className="text-[10.5px] mono text-mute truncate">kernel@openclaw.local</div>
            </div>
            <Pill tone="accent" pulse>admin</Pill>
          </div>

          {/* Cluster identity row */}
          <div className="px-3.5 py-2.5 border-b flex items-center justify-between text-[10.5px] mono" style={{ borderColor: 'var(--border)' }}>
            <span className="text-mute uppercase tracking-wider">cluster</span>
            <span style={{ color: 'var(--text-dim)' }}>workstation·local <span className="text-mute">:6379</span></span>
          </div>

          {/* Menu groups */}
          <div className="py-1.5">
            {groups.map((grp, gi) => (
              <React.Fragment key={gi}>
                {grp.map(item => {
                  const Icon = L[item.icon];
                  const isCrit = item.tone === 'crit';
                  return (
                    <button key={item.id}
                      onClick={() => {
                        if (item.onClick) item.onClick();
                        setOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3.5 py-2 text-left"
                      style={{ color: isCrit ? 'var(--crit)' : 'var(--text-dim)', transition: 'background .15s ease, color .15s ease' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; if (!isCrit) e.currentTarget.style.color = 'var(--text)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = isCrit ? 'var(--crit)' : 'var(--text-dim)'; }}
                    >
                      <Icon size={13} strokeWidth={2} style={{ color: 'currentColor' }} className="shrink-0" />
                      <span className="text-[12.5px] flex-1">{item.label}</span>
                      {item.hint && <span className="text-[10px] mono text-mute shrink-0">{item.hint}</span>}
                    </button>
                  );
                })}
                {gi < groups.length - 1 && (
                  <div className="my-1.5 mx-3 h-px" style={{ background: 'var(--border)' }} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Footer with version */}
          <div className="px-3.5 py-2 border-t flex items-center justify-between text-[10px] mono" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <span className="text-mute">openclaw.cluster v3.0</span>
            <span className="text-mute">build 2026.05.17</span>
          </div>
        </div>
      )}

      <AccountDialog section={dialog} onClose={() => setDialog(null)} theme={theme} setTheme={setTheme} />
    </div>
  );
}

// ============================================================
// Account / system dialog — covers every user-menu action
// ============================================================
function AccountDialog({ section, onClose, theme, setTheme }) {
  React.useEffect(() => {
    if (!section) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [section, onClose]);

  if (!section) return null;
  const meta = {
    profile:   { title: 'Account preferences',   icon: 'UserCog',  body: <ProfileSection /> },
    tokens:    { title: 'API tokens',            icon: 'KeyRound', body: <TokensSection /> },
    shortcuts: { title: 'Keyboard shortcuts',    icon: 'Keyboard', body: <ShortcutsSection /> },
    docs:      { title: 'Documentation',         icon: 'BookOpen', body: <DocsSection /> },
    switch:    { title: 'Switch cluster',        icon: 'Repeat',   body: <SwitchSection onClose={onClose} /> },
    signout:   { title: 'Sign out',              icon: 'LogOut',   body: <SignOutSection onClose={onClose} />, tone: 'crit' },
  }[section];
  const Icon = L[meta.icon];
  const isCrit = meta.tone === 'crit';
  const ringColor = isCrit ? 'var(--crit)' : 'var(--accent)';
  const tintRgb   = isCrit ? '--crit-rgb' : '--accent-rgb';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center fade-up"
      style={{ background: 'color-mix(in srgb, var(--bg) 70%, transparent)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-[600px] max-w-[92vw] max-h-[88vh] flex flex-col rounded-2xl border overflow-hidden"
        style={{ background: 'var(--surface)', borderColor: 'var(--border-strong)', boxShadow: 'var(--shadow-elev)' }}
      >
        <div className="flex items-center gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center"
               style={{ background: `rgba(var(${tintRgb}),0.10)`, border: `1px solid rgba(var(${tintRgb}),0.20)` }}>
            <Icon size={15} style={{ color: ringColor }} />
          </div>
          <h2 className="text-[15px] font-semibold tracking-tight">{meta.title}</h2>
          <button onClick={onClose} className="ml-auto w-8 h-8 rounded-md flex items-center justify-center text-mute hover:bg-[var(--surface-2)] hover:text-text">
            <L.X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{meta.body}</div>
      </div>
    </div>
  );
}

function ProfileSection() {
  const [name, setName] = React.useState('Kernel Hayashi');
  const [email, setEmail] = React.useState('kernel@openclaw.local');
  const [shell, setShell] = React.useState('zsh');
  return (
    <div className="px-6 py-5 space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full flex items-center justify-center text-[18px] font-semibold mono shrink-0"
             style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: 'var(--bg)' }}>K</div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium">{name}</div>
          <div className="text-[11.5px] mono text-mute mt-0.5">{email}</div>
        </div>
        <Button tone="default" size="sm" icon={L.Upload}>upload avatar</Button>
      </div>
      <Field label="Display name">
        <TextInput value={name} onChange={setName} mono={false} />
      </Field>
      <Field label="Email">
        <TextInput value={email} onChange={setEmail} mono={false} />
      </Field>
      <Field label="Default shell on remote nodes">
        <div className="inline-flex p-0.5 rounded-md border" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          {['zsh','bash','fish'].map(s => (
            <button key={s} onClick={() => setShell(s)}
              className="px-3 py-1.5 text-[12px] mono rounded transition"
              style={{
                background: shell === s ? 'var(--surface-3)' : 'transparent',
                color: shell === s ? 'var(--accent)' : 'var(--text-mute)',
              }}>{s}</button>
          ))}
        </div>
      </Field>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button tone="default" size="md">discard</Button>
        <Button tone="solid" size="md" icon={L.Check}>save changes</Button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.16em] text-mute mono mb-1.5">{label}</div>
      {children}
    </div>
  );
}

const SEED_TOKENS = [
  { id: 't1', name: 'CLI · laptop',         secret: 'oclw_live_kjs82j3hf83hd9akf28', scope: 'read + write', last: 'just now',     created: '2026-04-12' },
  { id: 't2', name: 'GitHub Actions',       secret: 'oclw_live_a8sjhf928fja92hsk37', scope: 'read only',    last: '3 hours ago',  created: '2026-03-02' },
];

function TokensSection() {
  const [tokens, setTokens] = React.useState(SEED_TOKENS);
  const [reveal, setReveal] = React.useState({});
  const [copied, setCopied] = React.useState(null);

  const mask = s => s.slice(0, 9) + '•'.repeat(s.length - 13) + s.slice(-4);
  const copy = (t) => { navigator.clipboard?.writeText(t.secret); setCopied(t.id); setTimeout(() => setCopied(null), 1200); };
  const revoke = (id) => setTokens(ts => ts.filter(t => t.id !== id));
  const generate = () => {
    const rand = Math.random().toString(36).slice(2, 24);
    setTokens(ts => [{ id: `t${Date.now()}`, name: 'New token', secret: `oclw_live_${rand}`, scope: 'read + write', last: 'never', created: new Date().toISOString().slice(0, 10) }, ...ts]);
  };

  return (
    <div className="px-6 py-5 space-y-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-[12.5px] text-dim">Issue, revoke, and rotate access tokens for the cluster gateway.</div>
        <Button tone="accent" size="sm" icon={L.Plus} onClick={generate}>generate token</Button>
      </div>
      {tokens.length === 0 && (
        <div className="text-center py-10 text-[12px] mono text-mute">no tokens — generate one above</div>
      )}
      {tokens.map(t => (
        <div key={t.id} className="rounded-lg border p-3.5" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <div className="flex items-center gap-2 mb-1.5">
            <L.KeyRound size={13} style={{ color: 'var(--accent)' }} />
            <div className="text-[12.5px] font-medium">{t.name}</div>
            <Pill tone={t.scope === 'read only' ? 'default' : 'accent'}>{t.scope}</Pill>
            <span className="ml-auto text-[10.5px] mono text-mute">created {t.created} · last used {t.last}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 mono text-[12px] tnum truncate px-3 py-2 rounded"
                 style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              {reveal[t.id] ? t.secret : mask(t.secret)}
            </div>
            <Button tone="default" size="sm" icon={reveal[t.id] ? L.EyeOff : L.Eye}
                    onClick={() => setReveal(r => ({ ...r, [t.id]: !r[t.id] }))} />
            <Button tone="default" size="sm" icon={copied === t.id ? L.Check : L.Copy} onClick={() => copy(t)}>
              {copied === t.id ? 'copied' : 'copy'}
            </Button>
            <Button tone="crit" size="sm" icon={L.Trash2} onClick={() => revoke(t.id)}>revoke</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

const SHORTCUTS = [
  { group: 'Navigation', items: [
    { keys: ['⌘', 'K'],    label: 'Command palette' },
    { keys: ['⌘', '1'],    label: 'Go to Cluster overview' },
    { keys: ['⌘', '2'],    label: 'Go to Nodes & network' },
    { keys: ['⌘', '3'],    label: 'Go to Chat playground' },
    { keys: ['⌘', ','],    label: 'Open settings' },
  ]},
  { group: 'Chat', items: [
    { keys: ['Enter'],          label: 'Send message' },
    { keys: ['Shift', 'Enter'], label: 'New line' },
    { keys: ['⌘', '↑'],       label: 'Edit last user message' },
    { keys: ['⌘', 'R'],        label: 'Regenerate response' },
  ]},
  { group: 'Cluster', items: [
    { keys: ['⌘', 'D'],        label: 'Open deployment dialog' },
    { keys: ['⌘', 'T'],        label: 'Cycle theme' },
    { keys: ['⌘', 'L'],        label: 'Lock all nodes' },
  ]},
];

function ShortcutsSection() {
  return (
    <div className="px-6 py-5 space-y-5">
      {SHORTCUTS.map(g => (
        <div key={g.group}>
          <div className="text-[10.5px] uppercase tracking-[0.18em] text-mute mono mb-2 font-medium">{g.group}</div>
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {g.items.map((s, i) => (
              <div key={i} className="flex items-center justify-between px-3.5 py-2.5 border-b last:border-0"
                   style={{ borderColor: 'color-mix(in srgb, var(--border) 70%, transparent)', background: i % 2 === 0 ? 'var(--surface-2)' : 'var(--surface)' }}>
                <span className="text-[12.5px]">{s.label}</span>
                <div className="flex items-center gap-1">
                  {s.keys.map((k, j) => (
                    <React.Fragment key={j}>
                      <kbd className="min-w-[24px] h-[22px] px-1.5 rounded mono text-[10.5px] flex items-center justify-center"
                           style={{ background: 'var(--surface-3)', border: '1px solid var(--border-strong)', color: 'var(--text)', boxShadow: 'inset 0 -1px 0 var(--border-strong)' }}>{k}</kbd>
                      {j < s.keys.length - 1 && <span className="text-[10.5px] mono text-mute">+</span>}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const DOC_SECTIONS = [
  { title: 'Quickstart',          icon: 'Rocket',          body: 'Set up a 1-node openclaw cluster in 5 minutes.',         path: '/quickstart',          time: '5 min read' },
  { title: 'Cluster setup',       icon: 'Network',         body: 'Join workers, configure ray.head, pick allreduce.',      path: '/cluster',             time: '12 min read' },
  { title: 'Model deployment',    icon: 'Rocket',          body: 'Shard, pin, or per-node strategies for any GGUF model.', path: '/deployment',          time: '8 min read' },
  { title: 'Agents & tools',      icon: 'Bot',             body: 'Wire OpenClaw agents to local tools and external APIs.',  path: '/agents',              time: '15 min read' },
  { title: 'API reference',       icon: 'BookText',        body: 'Full HTTP + WS surface for the cluster gateway.',         path: '/api',                 time: 'reference' },
  { title: 'Troubleshooting',     icon: 'LifeBuoy',        body: 'Common errors: OOM, ring partition, model load fails.',  path: '/troubleshoot',        time: '10 min read' },
];

function DocsSection() {
  return (
    <div className="px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[12.5px] text-dim">Local docs mirror — served from <span className="mono">docs.openclaw.local</span>. Always offline-available.</div>
        <Button tone="default" size="sm" icon={L.ExternalLink}>open in browser</Button>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {DOC_SECTIONS.map(d => {
          const Icon = L[d.icon];
          return (
            <button key={d.path} className="text-left rounded-lg p-3.5 border transition"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb),0.35)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}>
              <div className="flex items-center gap-2 mb-1.5">
                <Icon size={13} style={{ color: 'var(--accent)' }} />
                <span className="text-[12.5px] font-medium">{d.title}</span>
              </div>
              <div className="text-[11.5px] text-dim leading-relaxed mb-2">{d.body}</div>
              <div className="flex items-center justify-between text-[10.5px] mono text-mute">
                <span>{d.path}</span>
                <span>{d.time}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const SAVED_CLUSTERS = [
  { id: 'home',  name: 'home/openclaw.cluster',  host: 'workstation.local:6379', nodes: 3,  status: 'current',  ms: 0 },
  { id: 'dc',    name: 'colo/dc-east',            host: 'dc01.openclaw.io:6379',  nodes: 14, status: 'available', ms: 28 },
  { id: 'edge',  name: 'edge/raspi-cluster',      host: 'pi5.local:6379',          nodes: 5,  status: 'available', ms: 4 },
];

function SwitchSection({ onClose }) {
  const [connecting, setConnecting] = React.useState(null);
  const connect = (c) => {
    setConnecting(c.id);
    setTimeout(() => { setConnecting(null); onClose(); }, 1400);
  };
  return (
    <div className="px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[12.5px] text-dim">Swap your gateway connection. Active inference sessions migrate automatically.</div>
        <Button tone="default" size="sm" icon={L.Plus}>add cluster</Button>
      </div>
      <div className="space-y-2">
        {SAVED_CLUSTERS.map(c => {
          const isCurrent = c.status === 'current';
          const isConnecting = connecting === c.id;
          return (
            <div key={c.id} className="flex items-center gap-3 rounded-lg border p-3"
                 style={{ background: 'var(--surface-2)', borderColor: isCurrent ? 'rgba(var(--accent-rgb),0.30)' : 'var(--border)' }}>
              <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
                   style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <L.Network size={14} style={{ color: isCurrent ? 'var(--accent)' : 'var(--text-dim)' }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-[12.5px] mono truncate">{c.name}</div>
                  {isCurrent && <Pill tone="accent" pulse>connected</Pill>}
                </div>
                <div className="text-[10.5px] mono text-mute tnum mt-0.5">{c.host} · {c.nodes} nodes · {c.ms === 0 ? 'lan' : `${c.ms}ms`}</div>
              </div>
              {isCurrent ? (
                <Button tone="default" size="sm" icon={L.Check} disabled>current</Button>
              ) : (
                <Button tone="accent" size="sm" icon={isConnecting ? L.Loader : L.Plug} onClick={() => connect(c)} disabled={!!connecting}>
                  {isConnecting ? 'connecting…' : 'connect'}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SignOutSection({ onClose }) {
  const [done, setDone] = React.useState(false);
  const sign = () => { setDone(true); setTimeout(onClose, 1400); };
  return (
    <div className="px-6 py-5">
      {!done ? (
        <>
          <div className="flex items-start gap-3 mb-4 rounded-lg p-3.5"
               style={{ background: 'rgba(var(--crit-rgb),0.06)', border: '1px solid rgba(var(--crit-rgb),0.20)' }}>
            <L.TriangleAlert size={15} style={{ color: 'var(--crit)' }} className="mt-0.5 shrink-0" />
            <div>
              <div className="text-[12.5px] font-medium mb-1">Sign out of openclaw.cluster?</div>
              <div className="text-[11.5px] text-dim leading-relaxed">
                This will revoke your gateway session, lock all 3 nodes, and stop any in-flight inference. Cached weights stay on disk.
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button tone="default" size="md" onClick={onClose}>cancel</Button>
            <Button tone="crit"    size="md" icon={L.LogOut} onClick={sign}>sign out</Button>
          </div>
        </>
      ) : (
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
               style={{ background: 'rgba(var(--accent-rgb),0.10)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}>
            <L.CircleCheck size={20} style={{ color: 'var(--accent)' }} />
          </div>
          <div className="text-[13px] font-medium">Signed out</div>
          <div className="text-[11.5px] mono text-mute mt-1">all nodes locked · redirecting…</div>
        </div>
      )}
    </div>
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
