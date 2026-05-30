// ============================================================
// src/models.jsx — Model Hub (Installed + Discover with mock download)
// Installed-model state lives in useCluster; we only handle UI + downloads.
// ============================================================

const DISCOVER_MODELS = [
  { name: 'Qwen/Qwen2.5-Coder-32B-Instruct',        family: 'Qwen',     params: '32B',  size: 18.6, downloads: '2.1M', quant: 'q4_K_M', desc: 'SOTA local code model. Beats GPT-4o on HumanEval+.' },
  { name: 'meta-llama/Llama-3.1-405B-Instruct',     family: 'Meta',     params: '405B', size: 231.0,downloads: '892K', quant: 'q4_K_M', desc: 'Frontier-scale. Demands the full cluster — 96GB+ unified memory recommended.' },
  { name: 'mistralai/Mistral-Large-2411',           family: 'Mistral',  params: '123B', size: 73.1, downloads: '892K', quant: 'q3_K_M', desc: 'Strong reasoning, multilingual. CPU-offload friendly.' },
  { name: 'google/gemma-2-9b-it',                   family: 'Gemma',    params: '9B',   size: 5.44, downloads: '5.8M', quant: 'q4_K_M', desc: 'Lean, polite, runs on a single 8GB card.' },
  { name: 'NousResearch/Hermes-3-Llama-3.1-8B',     family: 'NousRes',  params: '8B',   size: 4.92, downloads: '380K', quant: 'q5_K_M', desc: 'Tool-use and function-calling tuned. Roleplay friendly.' },
  { name: 'microsoft/phi-4',                        family: 'Microsoft',params: '14B',  size: 8.12, downloads: '1.4M', quant: 'q4_0',   desc: 'Reasoning-heavy small model. Punches well above its weight class.' },
];

function ModelCard({ m, active, deployment, onDeploy, onDelete }) {
  const footprint = deployment ? (deployment.strategy === 'shard' ? 'sharded · 3 nodes' : deployment.strategy === 'pin' ? `pinned · 1 node` : 'per-node assignment') : '';
  return (
    <div className="card card-hover p-5 relative overflow-hidden"
         style={{ borderColor: active ? 'rgba(var(--accent-rgb),0.35)' : 'var(--border)' }}>
      {active && <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'var(--accent)', boxShadow: '0 0 14px var(--accent)' }} />}

      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
             style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <L.Boxes size={17} style={{ color: active ? 'var(--accent)' : 'var(--text-dim)' }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-[14.5px] font-semibold mono truncate">{m.name}</div>
            {active && <Pill tone="accent" pulse>deployed</Pill>}
          </div>
          <div className="text-[11.5px] text-mute mono">{m.family} · {m.params} params · {m.totalLayers}L</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4 mono">
        <KV label="size"   value={`${m.size.toFixed(2)} GB`} />
        <KV label="quant"  value={m.quant} />
        <KV label="last"   value={m.lastUsed} />
      </div>

      {active && (
        <div className="mb-4 px-3 py-2.5 rounded-md" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="flex justify-between text-[10px] mono mb-1.5">
            <span className="text-mute uppercase tracking-wider">cluster footprint</span>
            <span className="tnum" style={{ color: 'var(--accent)' }}>{m.vramFootprint.toFixed(1)} GB / 176 GB</span>
          </div>
          <ProgressBar pct={Math.min(100, (m.vramFootprint / 176) * 100)} tone="accent" height={3} animated={false} />
          <div className="text-[10.5px] mono text-mute mt-2">{footprint}</div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {active ? (
          <Button tone="default" size="sm" icon={L.SlidersHorizontal} onClick={() => onDeploy(m.id)} className="flex-1 justify-center">
            change deployment
          </Button>
        ) : (
          <Button tone="accent" size="sm" icon={L.Rocket} onClick={() => onDeploy(m.id)} className="flex-1 justify-center">
            deploy to cluster
          </Button>
        )}
        <Button tone="default" size="sm" icon={L.Info}>info</Button>
        <Button tone="default" size="sm" icon={L.Trash2} onClick={() => onDelete(m)} disabled={active} />
      </div>
    </div>
  );
}

function KV({ label, value }) {
  return (
    <div>
      <div className="text-[9.5px] text-mute uppercase tracking-wider mb-1">{label}</div>
      <div className="text-[12px] mono tnum truncate" style={{ color: 'var(--text)' }}>{value}</div>
    </div>
  );
}

function ModelHub({ cluster, onDeploy }) {
  const [tab, setTab] = React.useState('installed');
  const [query, setQuery] = React.useState('');
  const [downloading, setDownloading] = React.useState(null);
  const [registry, setRegistry] = React.useState(DISCOVER_MODELS);
  const models = cluster.installedModels;
  const activeId = cluster.deployment.activeModelId;

  // Live registry search through the backend when available.
  React.useEffect(() => {
    if (!window.api) return;
    const t = setTimeout(() => {
      window.api.getJSON(`/api/models/registry?q=${encodeURIComponent(query)}`)
        .then(rows => Array.isArray(rows) && rows.length && setRegistry(rows))
        .catch(() => {});
    }, 260);
    return () => clearTimeout(t);
  }, [query]);

  const filtered = registry.filter(d => !query
    || d.name.toLowerCase().includes(query.toLowerCase())
    || (d.family || '').toLowerCase().includes(query.toLowerCase()));

  const startDownload = (m) => {
    if (downloading) return;
    setDownloading({ name: m.name, family: m.family, params: m.params, size: m.size, pct: 0, speed: 0, eta: 0, quant: m.quant });

    // Real backend pull — receive progress over /ws/models.
    if (window.api) {
      const ws = window.api.ws('/ws/models', (evt) => {
        if (!evt || evt.name !== m.name) return;
        if (evt.type === 'pull-progress') {
          setDownloading(d => d && d.name === m.name
            ? { ...d, pct: evt.pct, speed: 0, eta: 0 }
            : d);
        } else if (evt.type === 'pull-done') {
          setDownloading(d => d ? { ...d, pct: 100, done: true } : d);
          setTimeout(() => setDownloading(null), 800);
          ws.close();
        } else if (evt.type === 'pull-error') {
          setDownloading(d => d ? { ...d, error: evt.error, done: true } : d);
          setTimeout(() => setDownloading(null), 1500);
          ws.close();
        }
      });
      window.api.post('/api/models/pull', { name: m.name }).catch(() => {});
      return;
    }

    // Fallback simulator (no backend) — keeps the UI demoable.
    const id = setInterval(() => {
      setDownloading(d => {
        if (!d) { clearInterval(id); return d; }
        const inc = 0.4 + Math.random() * 2.2;
        const pct = Math.min(100, d.pct + inc);
        if (pct >= 100) {
          clearInterval(id);
          setTimeout(() => setDownloading(null), 800);
          return { ...d, pct: 100, done: true };
        }
        return { ...d, pct };
      });
    }, 220);
  };

  const totalGB = models.reduce((a, m) => a + m.size, 0);

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 gap-6 overflow-hidden">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold tracking-tight">Model Hub</h2>
          <div className="text-[13px] text-dim mt-1">
            {models.length} installed · <span className="mono tnum">{totalGB.toFixed(1)} GB</span> on disk · cache <span className="mono">/var/lib/ollama/models</span> · synced to all nodes
          </div>
        </div>
        <div className="inline-flex items-center p-0.5 rounded-lg border"
             style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          {[
            { id: 'installed', label: 'Installed', count: models.length },
            { id: 'discover',  label: 'Discover',  count: null },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-3.5 py-2 text-[12px] rounded-md flex items-center gap-2"
              style={{
                background: tab === t.id ? 'var(--surface-3)' : 'transparent',
                color: tab === t.id ? 'var(--text)' : 'var(--text-mute)',
              }}>
              {t.label}
              {t.count != null && (
                <span className="text-[10px] mono px-1.5 py-0.5 rounded"
                      style={{ background: tab === t.id ? 'rgba(var(--accent-rgb),0.12)' : 'var(--surface-2)', color: tab === t.id ? 'var(--accent)' : 'var(--text-mute)' }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'discover' && (
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center h-10 rounded-lg border px-3 gap-2"
                 style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
              <L.Search size={14} className="text-mute" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search Hugging Face / Ollama registry…"
                className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-[color:var(--text-mute)]"
                style={{ color: 'var(--text)' }} />
              <span className="text-[10px] mono text-mute px-1.5 py-0.5 rounded" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>⌘K</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] mono text-mute shrink-0">
              <L.Github size={12} /> huggingface.co · ollama.com
            </div>
          </div>
          {downloading && (
            <div className="mt-4 rounded-lg border p-3.5"
                 style={{ borderColor: 'rgba(var(--accent-rgb),0.25)', background: 'rgba(var(--accent-rgb),0.05)' }}>
              <div className="flex items-center gap-2 mb-2">
                <L.Download size={14} style={{ color: 'var(--accent)' }} className={downloading.done ? '' : 'animate-pulse'} />
                <div className="text-[12.5px] mono truncate flex-1">{downloading.name}</div>
                <span className="text-[12px] mono tnum" style={{ color: 'var(--accent)' }}>{downloading.pct.toFixed(1)}%</span>
              </div>
              <ProgressBar pct={downloading.pct} tone="accent" height={6} animated />
              <div className="flex justify-between text-[10.5px] mono text-mute mt-2 tnum">
                <span>{((downloading.pct/100) * downloading.size).toFixed(2)} GB / {downloading.size.toFixed(2)} GB</span>
                <span>{downloading.speed.toFixed(0)} MB/s</span>
                <span>{downloading.done ? 'finalizing…' : `${downloading.eta}s remaining`}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto -mx-6 px-6">
        {tab === 'installed' && (
          <div className="grid grid-cols-2 gap-4 pb-2">
            {models.map(m => (
              <ModelCard key={m.id} m={m}
                active={activeId === m.id}
                deployment={cluster.deployment}
                onDeploy={onDeploy}
                onDelete={x => cluster.removeInstalled(x.id)}
              />
            ))}
          </div>
        )}

        {tab === 'discover' && (
          <div className="space-y-3 pb-2">
            {filtered.map(d => {
              const isDownloading = downloading && downloading.name === d.name;
              return (
                <div key={d.name} className="card card-hover p-4 flex items-center gap-4">
                  <div className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
                       style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <L.Boxes size={16} className="text-dim" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-[13.5px] mono truncate">{d.name}</div>
                      <Pill>{d.params}</Pill>
                    </div>
                    <div className="text-[12px] text-dim line-clamp-1">{d.desc}</div>
                    <div className="flex items-center gap-3 mt-1.5 text-[10.5px] mono text-mute tnum">
                      <span>{d.size.toFixed(2)} GB</span>
                      <span>·</span>
                      <span>{d.quant}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1"><L.Download size={10} /> {d.downloads}</span>
                    </div>
                  </div>
                  <Button
                    tone={isDownloading ? 'accent' : (downloading ? 'default' : 'accent')}
                    size="md"
                    icon={L.Download}
                    onClick={() => startDownload(d)}
                    disabled={!!downloading}
                  >
                    {isDownloading ? `${downloading.pct.toFixed(0)}%` : 'pull'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ModelHub });
