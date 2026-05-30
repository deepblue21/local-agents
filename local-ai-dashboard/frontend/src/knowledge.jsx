// ============================================================
// src/knowledge.jsx — RAG knowledge base with drag/drop ingest
// ============================================================

const KB_SEED = [
  { name: 'Architecture Overview.md',      source: 'markdown', size: '24 KB',  chunks: 42,  status: 'active' },
  { name: 'API Reference v2.pdf',          source: 'pdf',      size: '1.2 MB', chunks: 388, status: 'active' },
  { name: 'Kotlin Coroutines Notes.md',    source: 'obsidian', size: '12 KB',  chunks: 21,  status: 'active' },
  { name: 'Postgres Tuning Cookbook.pdf',  source: 'pdf',      size: '3.4 MB', chunks: 612, status: 'active' },
  { name: 'Sprint 24 Retrospective.md',    source: 'obsidian', size: '8 KB',   chunks: 14,  status: 'active' },
  { name: 'OpenClaw Agent SOP.pdf',        source: 'pdf',      size: '0.8 MB', chunks: 156, status: 'indexing', progress: 64 },
];

const SOURCE_META = {
  markdown: { icon: 'FileText', color: 'var(--info)' },
  pdf:      { icon: 'FileType', color: 'var(--crit)' },
  obsidian: { icon: 'BookOpen', color: 'var(--accent)' },
};

function KnowledgeBase() {
  const [docs, setDocs] = React.useState(KB_SEED);
  const [dragOver, setDragOver] = React.useState(false);
  const [filter, setFilter] = React.useState('');
  const fileInput = React.useRef(null);
  const apiOn = !!window.api;

  // ─── Real backend: poll /api/kb/docs every 1s to reflect indexing progress.
  React.useEffect(() => {
    if (!apiOn) {
      const id = setInterval(() => {
        setDocs(ds => ds.map(d => {
          if (d.status !== 'indexing') return d;
          const next = (d.progress || 0) + 4 + Math.random() * 5;
          if (next >= 100) return { ...d, status: 'active', progress: undefined };
          return { ...d, progress: next };
        }));
      }, 500);
      return () => clearInterval(id);
    }
    let active = true;
    const refresh = () => window.api.getJSON('/api/kb/docs')
      .then(rows => { if (active && Array.isArray(rows)) setDocs(rows); })
      .catch(() => {});
    refresh();
    const id = setInterval(refresh, 1000);
    return () => { active = false; clearInterval(id); };
  }, [apiOn]);

  const addFiles = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    if (apiOn) {
      for (const f of list) {
        try { await window.api.upload('/api/kb/upload', f); } catch (e) { console.error(e); }
      }
      return;  // refresh interval picks it up
    }
    const news = list.slice(0, 4).map(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      const source = ext === 'pdf' ? 'pdf' : 'markdown';
      const kb = Math.max(1, Math.round((f.size || 24000) / 1024));
      return {
        name: f.name, source,
        size: kb > 1024 ? `${(kb/1024).toFixed(1)} MB` : `${kb} KB`,
        chunks: Math.round((f.size || 24000) / 600),
        status: 'indexing', progress: 0,
      };
    });
    setDocs(ds => [...news, ...ds]);
  };

  const connectObsidian = async () => {
    if (apiOn) {
      const path = window.prompt('Path to your Obsidian vault folder:');
      if (!path) return;
      try { await window.api.post('/api/kb/obsidian', { path }); } catch (e) { console.error(e); }
      return;
    }
    setDocs(ds => [
      { name: 'Daily Notes (vault)',     source: 'obsidian', size: '4.1 MB', chunks: 1842, status: 'indexing', progress: 0 },
      { name: 'Engineering Notes (vault)', source: 'obsidian', size: '2.6 MB', chunks: 942, status: 'indexing', progress: 0 },
      ...ds,
    ]);
  };

  const filtered = filter ? docs.filter(d => d.name.toLowerCase().includes(filter.toLowerCase())) : docs;
  const totalChunks = docs.reduce((a, d) => a + d.chunks, 0);
  const activeCount = docs.filter(d => d.status === 'active').length;

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 gap-6 overflow-auto">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold tracking-tight">Knowledge Base</h2>
          <div className="text-[13px] text-dim mt-1">
            Retrieval-augmented context · pulled into every chat turn the model thinks needs it. Indexed once, queried locally.
          </div>
        </div>
        <Button tone="default" size="md" icon={L.RefreshCw}>re-index all</Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Documents" value={docs.length} sub={`${activeCount} active`} icon={L.FileText} accent="var(--info)" />
        <StatCard label="Chunks indexed" value={totalChunks.toLocaleString()} sub="600-tok @ 60 overlap" icon={L.Hash} />
        <StatCard label="Embedding model" value="bge-large" sub="1024d · cosine" icon={L.Sparkles} accent="var(--accent)" />
        <StatCard label="Vector store" value="qdrant" sub="local · :6333" icon={L.Database} />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        className="rounded-xl border-2 border-dashed p-7 flex items-center gap-5 transition-all duration-200"
        style={{
          borderColor: dragOver ? 'var(--accent)' : 'var(--border-strong)',
          background: dragOver ? 'rgba(var(--accent-rgb),0.06)' : 'var(--surface)',
          boxShadow: dragOver ? `0 0 0 4px rgba(var(--accent-rgb),0.12)` : 'var(--shadow-card)',
        }}
      >
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0"
             style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <L.UploadCloud size={24} style={{ color: dragOver ? 'var(--accent)' : 'var(--text-dim)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold">
            {dragOver ? 'Release to ingest' : 'Drop files to add to the knowledge base'}
          </div>
          <div className="text-[12.5px] text-dim mt-1.5">
            Markdown, PDF, plain text. Files are chunked at 600 tokens with a 60-token overlap and embedded with <span className="mono">bge-large</span>.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input ref={fileInput} type="file" multiple className="hidden" onChange={e => addFiles(e.target.files)} />
          <Button tone="default" size="md" icon={L.FolderOpen} onClick={() => fileInput.current?.click()}>browse files</Button>
          <Button tone="accent" size="md" icon={L.BookOpen} onClick={connectObsidian}>connect Obsidian vault</Button>
        </div>
      </div>

      {/* Docs table */}
      <div className="card flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <L.Layers size={14} style={{ color: 'var(--text-dim)' }} />
          <div className="text-[13.5px] font-medium">Active documents</div>
          <span className="text-[11.5px] mono text-mute">{docs.length} files · context window auto-selects relevant chunks per query</span>
          <div className="ml-auto flex items-center h-9 rounded-md border px-3 gap-2"
               style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <L.Search size={12} className="text-mute" />
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="filter…" className="bg-transparent text-[12.5px] outline-none mono placeholder:text-[color:var(--text-mute)] w-36" style={{ color: 'var(--text)' }} />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_92px_92px_104px_160px_44px] gap-3 px-5 py-2 border-b text-[10px] uppercase tracking-[0.16em] text-mute mono"
             style={{ borderColor: 'var(--border)' }}>
          <div>Name</div>
          <div className="text-right">Size</div>
          <div className="text-right">Chunks</div>
          <div>Source</div>
          <div>Status</div>
          <div></div>
        </div>
        <div>
          {filtered.map((d, i) => {
            const meta = SOURCE_META[d.source];
            const SrcIcon = L[meta.icon];
            return (
              <div key={`${d.name}-${i}`} className="grid grid-cols-[1fr_92px_92px_104px_160px_44px] gap-3 px-5 py-3 border-b last:border-0 items-center transition hover:bg-[var(--surface-2)]"
                   style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <SrcIcon size={15} style={{ color: meta.color }} className="shrink-0" />
                  <span className="text-[12.5px] truncate">{d.name}</span>
                </div>
                <div className="text-right text-[11.5px] mono tnum text-dim">{d.size}</div>
                <div className="text-right text-[11.5px] mono tnum text-dim">{d.chunks.toLocaleString()}</div>
                <div>
                  <span className="text-[10px] mono uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--surface-2)', color: meta.color, border: `1px solid var(--border)` }}>{d.source}</span>
                </div>
                <div>
                  {d.status === 'active' ? (
                    <span className="text-[11px] mono flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} /> active
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1"><ProgressBar pct={d.progress || 0} tone="accent" height={3} animated={false} /></div>
                      <span className="text-[10.5px] mono tnum shrink-0" style={{ color: 'var(--accent)' }}>{(d.progress || 0).toFixed(0)}%</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-end">
                  <button onClick={() => {
                      if (apiOn && d.id) {
                        window.api.del(`/api/kb/docs/${encodeURIComponent(d.id)}`).catch(() => {});
                      }
                      setDocs(ds => ds.filter(x => x.name !== d.name));
                    }}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-mute hover:bg-[var(--surface-3)]"
                    style={{ transition: 'color .2s ease' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--crit)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-mute)'}>
                    <L.X size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { KnowledgeBase });
