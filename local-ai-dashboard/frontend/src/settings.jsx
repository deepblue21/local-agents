// ============================================================
// src/settings.jsx — 3-tab settings with theme picker
// ============================================================

function SettingRow({ label, hint, right, children }) {
  return (
    <div className="grid grid-cols-[280px_1fr] gap-10 py-5 border-b last:border-0 items-start"
         style={{ borderColor: 'color-mix(in srgb, var(--border) 70%, transparent)' }}>
      <div>
        <div className="text-[13.5px] font-medium">{label}</div>
        {hint && <div className="text-[12px] text-dim mt-1.5 leading-relaxed">{hint}</div>}
      </div>
      <div className="flex items-center justify-between gap-4 min-w-0">
        <div className="flex-1 min-w-0">{children}</div>
        {right && <div className="text-[12px] mono text-dim shrink-0">{right}</div>}
      </div>
    </div>
  );
}

function ModelParamsTab({ p, setP }) {
  return (
    <div>
      <SettingRow label="Temperature" hint="Controls randomness. Lower is more deterministic, higher more creative." right={`current: ${p.temperature.toFixed(2)}`}>
        <Slider value={p.temperature} onChange={v => setP({ ...p, temperature: v })} min={0} max={2} step={0.01} format={v => v.toFixed(2)} />
      </SettingRow>
      <SettingRow label="Top-P (nucleus)" hint="Sample from the smallest set of tokens whose cumulative probability ≥ p." right={`current: ${p.topP.toFixed(2)}`}>
        <Slider value={p.topP} onChange={v => setP({ ...p, topP: v })} min={0} max={1} step={0.01} format={v => v.toFixed(2)} />
      </SettingRow>
      <SettingRow label="Context window" hint="Maximum prompt + reply tokens. Cluster sharding lets you push this higher than single-node." right={`${p.context.toLocaleString()} tok`}>
        <Slider value={p.context} onChange={v => setP({ ...p, context: v })} min={2048} max={131072} step={1024} format={v => `${(v/1024).toFixed(0)}k`} />
      </SettingRow>
      <SettingRow label="Max output tokens" hint="Hard cap on generated tokens per response." right={`${p.maxTokens} tok`}>
        <Slider value={p.maxTokens} onChange={v => setP({ ...p, maxTokens: v })} min={64} max={8192} step={64} format={v => v.toString()} />
      </SettingRow>
      <SettingRow label="Repetition penalty" hint="Penalizes tokens that have already appeared. 1.0 disables." right={`current: ${p.repPenalty.toFixed(2)}`}>
        <Slider value={p.repPenalty} onChange={v => setP({ ...p, repPenalty: v })} min={1} max={2} step={0.01} format={v => v.toFixed(2)} />
      </SettingRow>
      <SettingRow label="Seed" hint="Fix the RNG seed for reproducible runs. Empty = random.">
        <TextInput value={p.seed} onChange={v => setP({ ...p, seed: v })} placeholder="random" />
      </SettingRow>
    </div>
  );
}

function SystemConfigTab({ s, setS, theme, setTheme }) {
  return (
    <div>
      <SettingRow label="Theme" hint="Switch UI theme. Persists for this session.">
        <div className="grid grid-cols-3 gap-3 max-w-[640px]">
          {THEMES.map(t => {
            const active = theme === t.id;
            const previews = {
              deepsea:   { bg: '#0a0f1e', surface: '#141b2d', accent: '#5fe8ff' },
              forest:    { bg: '#030603', surface: '#0f1a0f', accent: '#00ff66' },
              arctic:    { bg: '#f8fafc', surface: '#f1f5f9', accent: '#2563eb' },
              synthwave: { bg: '#15021f', surface: '#2d1342', accent: '#ff2e96' },
              sandstone: { bg: '#fbf5ea', surface: '#f3e9d5', accent: '#c2410c' },
            }[t.id];
            return (
              <button key={t.id} onClick={() => setTheme(t.id)}
                className="text-left rounded-lg p-3 border transition"
                style={{
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  background: 'var(--surface-2)',
                  boxShadow: active ? `0 0 0 3px rgba(var(--accent-rgb),0.12)` : 'none',
                }}>
                <div className="flex items-center gap-2 mb-2">
                  {L[t.icon] && React.createElement(L[t.icon], { size: 13, style: { color: active ? 'var(--accent)' : 'var(--text-dim)' } })}
                  <span className="text-[12.5px] font-medium">{t.label}</span>
                  {active && <Pill tone="accent">active</Pill>}
                </div>
                <div className="h-12 rounded-md overflow-hidden flex" style={{ border: '1px solid var(--border)' }}>
                  <div style={{ width: '40%', background: previews.bg }} />
                  <div style={{ width: '40%', background: previews.surface }} />
                  <div style={{ width: '20%', background: previews.accent }} />
                </div>
                <div className="text-[10px] mono text-mute mt-2 uppercase tracking-wider">{t.hint}</div>
              </button>
            );
          })}
        </div>
      </SettingRow>
      <SettingRow label="Ray head endpoint" hint="Master node address that workers register against.">
        <TextInput value={s.rayHead} onChange={v => setS({ ...s, rayHead: v })} prefix="addr" />
      </SettingRow>
      <SettingRow label="Ollama API endpoint" hint="Base URL where the Ollama daemon listens. Default :11434 on localhost.">
        <TextInput value={s.ollama} onChange={v => setS({ ...s, ollama: v })} prefix="GET" />
      </SettingRow>
      <SettingRow label="OpenClaw gateway port" hint="Local port the OpenClaw agent gateway binds to.">
        <TextInput value={s.openclawPort} onChange={v => setS({ ...s, openclawPort: v })} prefix=":" />
      </SettingRow>
      <SettingRow label="Default model" hint="Used for new sessions when none is explicitly chosen.">
        <TextInput value={s.defaultModel} onChange={v => setS({ ...s, defaultModel: v })} prefix="model" />
      </SettingRow>
      <SettingRow label="Environment variables" hint="Exported into Ollama + OpenClaw subprocesses across all nodes.">
        <textarea
          value={s.env}
          onChange={e => setS({ ...s, env: e.target.value })}
          rows={6}
          className="w-full rounded-md px-3 py-2.5 mono text-[12.5px] leading-relaxed outline-none"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
      </SettingRow>
    </div>
  );
}

function AdvancedTab({ a, setA }) {
  return (
    <div>
      <SettingRow label="GPU offloading (master)" hint="Layers placed on the master GPU. Cluster mode distributes the rest." right={`${a.gpuLayers} / 80 layers`}>
        <Slider value={a.gpuLayers} onChange={v => setA({ ...a, gpuLayers: v })} min={0} max={80} step={1} format={v => v.toString()} />
      </SettingRow>
      <SettingRow label="Sharding strategy" hint="How layers split across nodes. Pipeline = sequential; tensor = matrix-parallel within a layer.">
        <div className="inline-flex p-0.5 rounded-md border" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          {['pipeline', 'tensor', 'hybrid'].map(opt => (
            <button key={opt} onClick={() => setA({ ...a, shard: opt })}
              className="px-3 py-1.5 text-[11.5px] mono rounded transition"
              style={{
                background: a.shard === opt ? 'var(--surface-3)' : 'transparent',
                color: a.shard === opt ? 'var(--accent)' : 'var(--text-mute)',
              }}>{opt}</button>
          ))}
        </div>
      </SettingRow>
      <SettingRow label="CPU threads per node" hint="OS threads spawned for non-GPU layers." right={`${a.threads} threads`}>
        <Slider value={a.threads} onChange={v => setA({ ...a, threads: v })} min={1} max={64} step={1} format={v => v.toString()} />
      </SettingRow>
      <SettingRow label="Batch size" hint="Tokens evaluated per forward pass." right={`${a.batch} tokens`}>
        <Slider value={a.batch} onChange={v => setA({ ...a, batch: v })} min={32} max={2048} step={32} format={v => v.toString()} />
      </SettingRow>
      <SettingRow label="Flash attention" hint="Faster attention kernel with lower VRAM use. Requires Ampere+ on every GPU node.">
        <div className="flex items-center gap-3">
          <div className={`toggle ${a.flash ? 'on' : ''}`} onClick={() => setA({ ...a, flash: !a.flash })} role="switch" aria-checked={a.flash} />
          <span className="text-[12px] mono text-dim">{a.flash ? 'enabled' : 'disabled'}</span>
        </div>
      </SettingRow>
      <SettingRow label="KV cache · 8-bit" hint="Quantize the key/value cache to int8 — roughly halves cache memory, ~1% quality loss.">
        <div className="flex items-center gap-3">
          <div className={`toggle ${a.kv8 ? 'on' : ''}`} onClick={() => setA({ ...a, kv8: !a.kv8 })} role="switch" aria-checked={a.kv8} />
          <span className="text-[12px] mono text-dim">{a.kv8 ? 'enabled' : 'disabled'}</span>
        </div>
      </SettingRow>
      <SettingRow label="mlock pages" hint="Lock the model in RAM so the kernel can't swap it. Recommended on Linux nodes.">
        <div className="flex items-center gap-3">
          <div className={`toggle ${a.mlock ? 'on' : ''}`} onClick={() => setA({ ...a, mlock: !a.mlock })} role="switch" aria-checked={a.mlock} />
          <span className="text-[12px] mono text-dim">{a.mlock ? 'enabled' : 'disabled'}</span>
        </div>
      </SettingRow>
      <SettingRow label="Telemetry" hint="Send anonymized perf counters back to your local Grafana endpoint. Stays on-network.">
        <div className="flex items-center gap-3">
          <div className={`toggle ${a.telemetry ? 'on' : ''}`} onClick={() => setA({ ...a, telemetry: !a.telemetry })} role="switch" aria-checked={a.telemetry} />
          <span className="text-[12px] mono text-dim">{a.telemetry ? 'on' : 'off'}</span>
        </div>
      </SettingRow>
    </div>
  );
}

function Settings() {
  const { theme, setTheme } = React.useContext(ThemeContext);
  const [tab, setTab] = React.useState('params');
  const [dirty, setDirty] = React.useState(false);

  const [p, _setP] = React.useState({ temperature: 0.7, topP: 0.9, context: 16384, maxTokens: 2048, repPenalty: 1.10, seed: '' });
  const [s, _setS] = React.useState({
    rayHead: 'workstation.local:6379',
    ollama: 'http://localhost:11434',
    openclawPort: '7878',
    defaultModel: 'deepseek-v3:67b',
    env: 'OLLAMA_HOST=0.0.0.0:11434\nOLLAMA_KEEP_ALIVE=30m\nRAY_DASHBOARD_PORT=8265\nOPENCLAW_LOG=info',
  });
  const [a, _setA] = React.useState({ gpuLayers: 20, threads: 14, batch: 512, flash: true, kv8: true, mlock: true, telemetry: false, shard: 'hybrid' });

  const setP = v => { _setP(v); setDirty(true); };
  const setS = v => { _setS(v); setDirty(true); };
  const setA = v => { _setA(v); setDirty(true); };

  // Hydrate from /api/settings on mount.
  React.useEffect(() => {
    if (!window.api) return;
    window.api.getJSON('/api/settings').then(cfg => {
      if (cfg.params)   _setP(prev => ({ ...prev, ...cfg.params }));
      if (cfg.system)   _setS(prev => ({ ...prev, ...cfg.system }));
      if (cfg.advanced) _setA(prev => ({ ...prev, ...cfg.advanced }));
    }).catch(() => {});
  }, []);

  const persistAndApply = () => {
    if (window.api) {
      window.api.patch('/api/settings', { params: p, system: s, advanced: a, theme })
        .catch(() => {});
    }
    setDirty(false);
  };

  const tabs = [
    { id: 'params',   label: 'Model parameters',     icon: 'SlidersHorizontal' },
    { id: 'system',   label: 'System configuration', icon: 'Server' },
    { id: 'advanced', label: 'Advanced · cluster',   icon: 'Wrench' },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 gap-5 overflow-hidden">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold tracking-tight">Settings</h2>
          <div className="text-[13px] text-dim mt-1">Tune inference, system, and cluster behavior. Changes apply once you save.</div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <Pill tone="warn">unsaved changes</Pill>}
          <Button tone="default" size="md" icon={L.RotateCcw}>reset</Button>
          <Button tone="solid" size="md" icon={L.Check} onClick={persistAndApply}>apply &amp; restart cluster</Button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b -mx-6 px-6" style={{ borderColor: 'var(--border)' }}>
        {tabs.map(t => {
          const Icon = L[t.icon];
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className="flex items-center gap-2 px-4 py-3.5 text-[13px] relative"
              style={{ color: active ? 'var(--text)' : 'var(--text-dim)' }}>
              <Icon size={14} style={{ color: active ? 'var(--accent)' : 'currentColor' }} />
              {t.label}
              {active && <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full" style={{ background: 'var(--accent)', boxShadow: '0 0 10px var(--accent)' }} />}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto -mx-6 px-6">
        <div className="card px-7 py-2">
          {tab === 'params'   && <ModelParamsTab p={p} setP={setP} />}
          {tab === 'system'   && <SystemConfigTab s={s} setS={setS} theme={theme} setTheme={setTheme} />}
          {tab === 'advanced' && <AdvancedTab a={a} setA={setA} />}
        </div>

        {tab === 'advanced' && (
          <div className="mt-4 rounded-xl border p-4 flex gap-3 items-start"
               style={{ borderColor: 'rgba(var(--warn-rgb),0.30)', background: 'rgba(var(--warn-rgb),0.06)' }}>
            <L.TriangleAlert size={16} style={{ color: 'var(--warn)' }} className="mt-0.5 shrink-0" />
            <div className="text-[12.5px] leading-relaxed">
              <span className="font-medium" style={{ color: 'var(--text)' }}>n1 VRAM is at 95%.</span>
              <span className="text-dim"> The master's RTX 3070 will spill to system RAM under this configuration. Move 2 more layers to n2 (Mac Studio) or reduce GPU offload to 18 to free headroom.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { Settings });
