// ============================================================
// src/chat.jsx — Chat Playground with prompt templates & metric badges
// ============================================================

const PROMPT_TEMPLATES = [
  { id: 'default',  name: 'Default Assistant',  icon: 'Sparkles',   tag: 'general',     sys: 'You are a helpful assistant. Be concise and accurate.' },
  { id: 'kotlin',   name: 'Kotlin Expert',      icon: 'Code2',      tag: 'engineering', sys: 'You are a senior Kotlin engineer. Reply with idiomatic Kotlin, prefer extension functions and coroutines, and explain tradeoffs briefly.' },
  { id: 'qa',       name: 'QA Tester',          icon: 'BugPlay',    tag: 'engineering', sys: 'You are a QA engineer. For every feature, list happy paths, edge cases, and adversarial inputs as a checklist.' },
  { id: 'sql',      name: 'SQL Architect',      icon: 'Database',   tag: 'data',        sys: 'You are a SQL expert. Reply with portable ANSI SQL. Always cite the index strategy and explain query plans.' },
  { id: 'duck',     name: 'Rubber Duck',        icon: 'Bird',       tag: 'thinking',    sys: 'You are a patient debugging partner. Ask clarifying questions and never give code unless asked.' },
  { id: 'editor',   name: 'Markdown Editor',    icon: 'PencilLine', tag: 'writing',     sys: 'You are a meticulous editor. Improve clarity and tone. Show a diff with reasoning beside it.' },
];

const SEED_CHAT = [
  { role: 'system', content: PROMPT_TEMPLATES[1].sys },
  { role: 'user',   content: 'Write me a coroutine-safe singleton cache with TTL eviction. Keep it under 30 lines.' },
  {
    role: 'assistant',
    content: "Here's a minimal coroutine-safe cache backed by a `Mutex`. Entries expire on read, so there's no background sweep:\n\n```kotlin\nclass TtlCache<K, V>(private val ttl: Duration) {\n    private data class Entry<V>(val value: V, val expiresAt: Long)\n    private val store = mutableMapOf<K, Entry<V>>()\n    private val mutex = Mutex()\n\n    suspend fun get(key: K, loader: suspend () -> V): V = mutex.withLock {\n        val now = System.currentTimeMillis()\n        store[key]?.takeIf { it.expiresAt > now }?.value\n            ?: loader().also { store[key] = Entry(it, now + ttl.inWholeMillis) }\n    }\n\n    suspend fun invalidate(key: K) = mutex.withLock { store.remove(key) }\n}\n```\n\nTradeoff: the `Mutex` serializes loaders, so a thundering herd on the same key only triggers one call. If you need parallel loads per-key, swap to a `ConcurrentHashMap<K, Deferred<V>>` pattern.",
    metrics: { tps: 142.4, time: 2.71, tokens: 386, model: 'deepseek-v3:67b', nodes: ['n1','n2','n3'] },
  },
];

function MetricBadge({ icon, label, value, accent }) {
  const Icon = L[icon];
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md mono text-[10.5px] tnum"
         style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <Icon size={11} style={{ color: accent || 'var(--text-dim)' }} />
      <span className="text-mute">{label}</span>
      <span style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  );
}

function renderInline(s) {
  const parts = s.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="mono px-1.5 py-0.5 rounded text-[12px]" style={{ background: 'var(--surface-2)', color: 'var(--code-accent)' }}>{part.slice(1,-1)}</code>;
    }
    // bold
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    return boldParts.map((bp, j) => {
      if (bp.startsWith('**') && bp.endsWith('**')) {
        return <strong key={`${i}-${j}`} className="font-semibold" style={{ color: 'var(--text)' }}>{bp.slice(2,-2)}</strong>;
      }
      return <React.Fragment key={`${i}-${j}`}>{bp}</React.Fragment>;
    });
  });
}

function ChatMarkdown({ text }) {
  const parts = [];
  let key = 0;
  const re = /```(\w+)?\n([\s\S]*?)```/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', content: text.slice(last, m.index), key: key++ });
    parts.push({ type: 'code', lang: m[1] || '', content: m[2], key: key++ });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ type: 'text', content: text.slice(last), key: key++ });

  return parts.map(p => {
    if (p.type === 'code') {
      return (
        <div key={p.key} className="my-3 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)', background: 'var(--code-bg)' }}>
          <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--surface) 60%, transparent)' }}>
            <span className="text-[10.5px] mono uppercase tracking-[0.12em] text-mute">{p.lang || 'plain'}</span>
            <button className="text-[10.5px] mono text-mute hover:text-text flex items-center gap-1">
              <L.Copy size={11} /> copy
            </button>
          </div>
          <pre className="mono text-[12.5px] leading-[1.6] p-4 overflow-x-auto" style={{ color: 'var(--text)' }}><code>{p.content}</code></pre>
        </div>
      );
    }
    return p.content.split('\n\n').map((para, i) => {
      // detect list
      const lines = para.split('\n');
      const isList = lines.every(l => /^[-*]\s/.test(l) || l.trim() === '');
      if (isList && lines.length > 1) {
        return (
          <ul key={`${p.key}-${i}`} className="mb-2 space-y-1 list-none">
            {lines.filter(l => l.trim()).map((l, k) => (
              <li key={k} className="flex gap-2.5 text-[13.5px]">
                <span style={{ color: 'var(--accent)' }}>›</span>
                <span className="flex-1">{renderInline(l.replace(/^[-*]\s/, ''))}</span>
              </li>
            ))}
          </ul>
        );
      }
      return (
        <p key={`${p.key}-${i}`} className="mb-2.5 last:mb-0 text-[13.5px] leading-relaxed">
          {renderInline(para)}
        </p>
      );
    });
  });
}

function ChatMessage({ msg }) {
  if (msg.role === 'system') return null;
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end mb-6">
        <div className="max-w-[78%] rounded-2xl rounded-tr-md px-4 py-3 text-[13.5px] leading-relaxed"
             style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.20)' }}>
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex mb-6 gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
           style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <L.Sparkles size={14} style={{ color: 'var(--accent)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <ChatMarkdown text={msg.content} />
        {msg.metrics && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            <MetricBadge icon="Zap"   label="speed"  value={`${msg.metrics.tps} tok/s`} accent="var(--accent)" />
            <MetricBadge icon="Timer" label="time"   value={`${msg.metrics.time}s`} />
            <MetricBadge icon="Hash"  label="tokens" value={msg.metrics.tokens} />
            <MetricBadge icon="Boxes" label="model"  value={msg.metrics.model} />
            {msg.metrics.nodes && (
              <MetricBadge icon="Network" label="shards" value={msg.metrics.nodes.join(' · ')} accent="var(--accent)" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function simulateReply(prompt, tpl) {
  const lower = prompt.toLowerCase();
  if (lower.includes('test') || tpl.id === 'qa') {
    return "Sure — here's a quick test matrix you can paste into your tracker:\n\n**Happy paths**\n- Valid input within bounds returns the expected shape\n- Concurrent reads return consistent state\n- Idempotent retries don't double-write\n\n**Edge cases**\n- Empty input / null / unicode / extremely long strings\n- Boundary values (off-by-one on both sides)\n- Network partition mid-write across the cluster\n\n**Adversarial**\n- SQL injection in free-text fields\n- Replay attacks against signed tokens\n- Memory pressure with 10k items in flight\n\n```bash\n# Smoke\ncurl -X POST :8080/api/v1/foo -d '{\"id\":\"\"}'\ncurl -X POST :8080/api/v1/foo -d \"$(yes A | head -c 1048576)\"\n```\n\nLet me know which path you want fleshed out into actual cases.";
  }
  if (lower.includes('sql') || tpl.id === 'sql') {
    return "Try this — a covering index handles the common predicate without a heap fetch:\n\n```sql\nCREATE INDEX idx_orders_user_status_created\n  ON orders (user_id, status, created_at DESC)\n  INCLUDE (total_cents);\n\nEXPLAIN ANALYZE\nSELECT id, total_cents\n  FROM orders\n WHERE user_id = $1\n   AND status  = 'fulfilled'\n ORDER BY created_at DESC\n LIMIT 50;\n```\n\nPlan should be an *Index Only Scan* with no recheck. If you still see a Sort node, the column order in the index is wrong — leading columns must match the predicate's equality keys first, ordered key last.";
  }
  if (tpl.id === 'duck') {
    return "Walk me through what you've tried so far. Before we look at code:\n\n- What's the *symptom* — wrong output, crash, hang, or slow?\n- What changed since it last worked?\n- Can you reproduce it deterministically, or only sometimes?\n\nThe answers usually shrink the search space by 90%.";
  }
  if (tpl.id === 'editor') {
    return "Here's a tighter version with notes alongside:\n\n```diff\n- The system, which is distributed across multiple machines in a network, leverages the combined memory of all the nodes.\n+ The system pools memory across every node on the network.\n```\n\n**Why:** the original buries the verb under two clauses. The active rewrite drops 12 words without losing meaning.";
  }
  return "Quick answer: yes, that works — but watch the lifecycle.\n\n```kotlin\nclass Foo @Inject constructor(\n    private val cache: TtlCache<UserId, User>,\n) {\n    suspend fun load(id: UserId) = cache.get(id) { remote.fetch(id) }\n}\n```\n\nA few things worth flagging:\n\n- The cache lives for the **process** lifetime when scoped to `SingletonComponent`. If you need it cleared on logout, expose an `invalidateAll()` and call it from your auth state observer.\n- Memory bound — `mutableMapOf` won't evict. Pair it with a max-size LRU if your key space is unbounded.\n- For tests, swap `SingletonComponent` for `ViewModelComponent` and inject a fake — Hilt handles the rebind automatically.";
}

// ---------- Prompt editor modal ----------
const ICON_PALETTE = [
  'Sparkles','Code2','BugPlay','Database','Bird','PencilLine',
  'Wand2','Bot','Brain','Hammer','GraduationCap','Wrench',
  'Compass','Lightbulb','BookOpen','Microscope','Rocket','Flame',
  'TerminalSquare','MessageCircle','Crown','Stars',
];
const TAG_OPTIONS = ['general','engineering','data','writing','thinking','research','ops','creative'];

function PromptEditor({ open, initial, onClose, onSave, onDelete }) {
  const [name, setName] = React.useState('');
  const [tag, setTag] = React.useState('general');
  const [icon, setIcon] = React.useState('Sparkles');
  const [sys, setSys] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const editing = initial && initial.id;
  const nameRef = React.useRef(null);

  React.useEffect(() => {
    if (open) {
      setName(initial?.name || '');
      setTag(initial?.tag || 'general');
      setIcon(initial?.icon || 'Sparkles');
      setSys(initial?.sys || '');
      setTouched(false);
      setTimeout(() => nameRef.current?.focus(), 30);
    }
  }, [open, initial?.id]);

  React.useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  const nameValid = name.trim().length > 0;
  const sysValid = sys.trim().length > 0;
  const valid = nameValid && sysValid;
  const IconPreview = L[icon];

  const save = () => {
    setTouched(true);
    if (!valid) return;
    onSave({
      id: initial?.id || `tpl-${Date.now().toString(36)}`,
      name: name.trim(),
      tag,
      icon,
      sys: sys.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center fade-up"
         style={{ background: 'color-mix(in srgb, var(--bg) 75%, transparent)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
         onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
           className="w-[640px] max-w-[92vw] max-h-[88vh] flex flex-col rounded-2xl border overflow-hidden"
           style={{ background: 'var(--surface)', borderColor: 'var(--border-strong)', boxShadow: 'var(--shadow-elev), 0 0 0 1px rgba(var(--accent-rgb),0.08)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center"
               style={{ background: 'rgba(var(--accent-rgb),0.10)', border: '1px solid rgba(var(--accent-rgb),0.20)' }}>
            <IconPreview size={16} style={{ color: 'var(--accent)' }} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-tight">{editing ? 'Edit system prompt' : 'New system prompt'}</h2>
            <div className="text-[11.5px] text-mute mt-0.5">Define the assistant's persona, constraints, and reply style.</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-md flex items-center justify-center text-mute hover:bg-[var(--surface-2)] hover:text-text">
            <L.X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name + tag */}
          <div className="grid grid-cols-[1fr_180px] gap-3">
            <div>
              <label className="text-[10.5px] uppercase tracking-[0.16em] text-mute mono block mb-1.5">Name</label>
              <div className="flex items-center h-10 rounded-md border overflow-hidden"
                   style={{ borderColor: touched && !nameValid ? 'var(--crit)' : 'var(--border)', background: 'var(--surface-2)' }}>
                <input
                  ref={nameRef}
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Rust Performance Coach"
                  className="flex-1 bg-transparent px-3 text-[13px] outline-none placeholder:text-[color:var(--text-mute)]"
                  style={{ color: 'var(--text)' }} />
              </div>
              {touched && !nameValid && (
                <div className="text-[10.5px] mono mt-1" style={{ color: 'var(--crit)' }}>Give your prompt a name.</div>
              )}
            </div>
            <div>
              <label className="text-[10.5px] uppercase tracking-[0.16em] text-mute mono block mb-1.5">Tag</label>
              <select value={tag} onChange={e => setTag(e.target.value)}
                className="w-full h-10 rounded-md border px-3 text-[13px] mono outline-none"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
                {TAG_OPTIONS.map(t => <option key={t} value={t} style={{ background: 'var(--surface)', color: 'var(--text)' }}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Icon palette */}
          <div>
            <label className="text-[10.5px] uppercase tracking-[0.16em] text-mute mono block mb-2">Icon</label>
            <div className="grid grid-cols-11 gap-1.5">
              {ICON_PALETTE.map(iname => {
                const IcoEl = L[iname];
                const active = icon === iname;
                return (
                  <button key={iname} onClick={() => setIcon(iname)}
                    title={iname}
                    className="aspect-square rounded-md flex items-center justify-center transition"
                    style={{
                      background: active ? 'rgba(var(--accent-rgb),0.12)' : 'var(--surface-2)',
                      border: `1px solid ${active ? 'rgba(var(--accent-rgb),0.40)' : 'var(--border)'}`,
                      color: active ? 'var(--accent)' : 'var(--text-dim)',
                    }}>
                    <IcoEl size={14} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* System prompt body */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="text-[10.5px] uppercase tracking-[0.16em] text-mute mono">System prompt</label>
              <span className="text-[10.5px] mono text-mute tnum">{sys.length} chars</span>
            </div>
            <textarea
              value={sys} onChange={e => setSys(e.target.value)}
              rows={9} placeholder="You are a senior...&#10;&#10;Always reply in markdown. Be concise. Cite sources when uncertain."
              className="w-full rounded-md px-3.5 py-3 mono text-[12.5px] leading-relaxed outline-none resize-none"
              style={{
                background: 'var(--surface-2)',
                border: `1px solid ${touched && !sysValid ? 'var(--crit)' : 'var(--border)'}`,
                color: 'var(--text)',
              }}
            />
            {touched && !sysValid && (
              <div className="text-[10.5px] mono mt-1" style={{ color: 'var(--crit)' }}>The prompt body can't be empty.</div>
            )}
            <div className="text-[11px] text-mute mt-2 leading-relaxed">
              Tip — give the model a <em>role</em>, a <em>style</em>, and any hard <em>constraints</em>. The shorter the better.
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-lg border p-3.5" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 mb-2">
              <L.Eye size={12} className="text-mute" />
              <span className="text-[10.5px] uppercase tracking-[0.16em] text-mute mono">Preview as it appears in the rail</span>
            </div>
            <div className="inline-flex items-center gap-2.5 px-3 py-2.5 rounded-lg"
                 style={{ background: 'var(--surface-3)', boxShadow: 'inset 0 0 0 1px var(--border-strong)' }}>
              <div className="w-7 h-7 rounded-md flex items-center justify-center"
                   style={{ background: 'rgba(var(--accent-rgb),0.10)' }}>
                <IconPreview size={13} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <div className="text-[12.5px] font-medium" style={{ color: 'var(--text)' }}>{name.trim() || 'Untitled prompt'}</div>
                <div className="text-[10px] mono uppercase tracking-wider text-mute mt-1">{tag}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-6 py-3.5 border-t" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          {editing && onDelete && (
            <Button tone="crit" size="md" icon={L.Trash2} onClick={() => { if (confirm(`Delete "${initial.name}"?`)) onDelete(initial.id); }}>delete</Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button tone="default" size="md" onClick={onClose}>cancel</Button>
            <Button tone="solid" size="md" icon={editing ? L.Check : L.Plus} onClick={save}>
              {editing ? 'save changes' : 'create prompt'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatPlayground({ cluster }) {
  const [prompts, setPrompts] = React.useState(PROMPT_TEMPLATES);
  const [tplId, setTplId] = React.useState('kotlin');
  const tpl = prompts.find(t => t.id === tplId) || prompts[0];
  const [editing, setEditing] = React.useState(null); // null | {} | {id,...}
  const [messages, setMessages] = React.useState(SEED_CHAT);
  const [draft, setDraft] = React.useState('');
  const [streaming, setStreaming] = React.useState(false);
  const [streamText, setStreamText] = React.useState('');
  const scrollRef = React.useRef(null);
  const abortRef = React.useRef(null);

  // Hydrate prompts from the backend if it's available.
  React.useEffect(() => {
    if (!window.api) return;
    window.api.getJSON('/api/prompts').then(rows => {
      if (Array.isArray(rows) && rows.length) setPrompts(rows);
    }).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamText]);

  const send = async () => {
    if (!draft.trim() || streaming) return;
    const userMsg = { role: 'user', content: draft.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setDraft('');
    setStreaming(true);
    setStreamText('');

    // ─── Real backend path ───────────────────────────────────────────────
    if (window.streamChat) {
      let acc = '';
      let metrics = null;
      const cancelled = { v: false };
      abortRef.current = () => { cancelled.v = true; };
      try {
        const apiMessages = nextMessages
          .filter(m => m.role !== 'system')
          .map(m => ({ role: m.role, content: m.content }));
        for await (const evt of window.streamChat({
          messages: apiMessages,
          template_id: tpl?.id,
          temperature: 0.7, top_p: 0.9, max_tokens: 2048,
        })) {
          if (cancelled.v) break;
          if (evt.type === 'delta') {
            acc += evt.text;
            setStreamText(acc);
          } else if (evt.type === 'metrics') {
            metrics = evt;
          }
        }
      } catch (e) {
        acc = acc || `_(stream failed: ${e.message})_`;
      }
      setMessages(m => [...m, { role: 'assistant', content: acc, metrics: metrics || undefined }]);
      setStreamText('');
      setStreaming(false);
      abortRef.current = null;
      return;
    }

    // ─── Fallback: local simulator (no backend) ──────────────────────────
    const reply = simulateReply(userMsg.content, tpl);
    let i = 0;
    const start = performance.now();
    const id = setInterval(() => {
      i += Math.max(1, Math.floor(Math.random() * 5) + 1);
      setStreamText(reply.slice(0, i));
      if (i >= reply.length) {
        clearInterval(id);
        const elapsed = (performance.now() - start) / 1000;
        const tokens = Math.max(40, Math.round(reply.length / 4));
        const tps = +(tokens / elapsed).toFixed(1);
        setMessages(m => [...m, {
          role: 'assistant', content: reply,
          metrics: { tps, time: +elapsed.toFixed(2), tokens, model: cluster.model?.name || 'local', nodes: ['n1','n2','n3'] },
        }]);
        setStreamText('');
        setStreaming(false);
      }
    }, 24);
    abortRef.current = () => clearInterval(id);
  };

  const onTplChange = (id) => {
    setTplId(id);
    const newTpl = prompts.find(t => t.id === id);
    if (newTpl) setMessages([{ role: 'system', content: newTpl.sys }]);
    setStreamText('');
  };

  const savePrompt = (p) => {
    setPrompts(ps => {
      const exists = ps.some(x => x.id === p.id);
      return exists ? ps.map(x => x.id === p.id ? p : x) : [...ps, p];
    });
    setTplId(p.id);
    setMessages([{ role: 'system', content: p.sys }]);
    setStreamText('');
    setEditing(null);
    // Persist on the backend, ignore failures.
    if (window.api) {
      const exists = prompts.some(x => x.id === p.id);
      const path = exists ? `/api/prompts/${encodeURIComponent(p.id)}` : '/api/prompts';
      const method = exists ? 'patch' : 'post';
      window.api[method](path, p).catch(() => {});
    }
  };

  const deletePrompt = (id) => {
    setPrompts(ps => {
      const next = ps.filter(x => x.id !== id);
      if (tplId === id && next.length) {
        setTplId(next[0].id);
        setMessages([{ role: 'system', content: next[0].sys }]);
      }
      return next;
    });
    setEditing(null);
    if (window.api) window.api.del(`/api/prompts/${encodeURIComponent(id)}`).catch(() => {});
  };

  const clear = () => {
    setMessages([{ role: 'system', content: tpl.sys }]);
    setStreamText('');
  };

  return (
    <div className="flex-1 flex min-h-0">
      {/* Prompt rail */}
      <div className="w-[256px] shrink-0 border-r flex flex-col" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--bg) 96%, transparent)' }}>
        <div className="px-4 pt-5 pb-2">
          <div className="text-[10px] uppercase tracking-[0.20em] text-mute mb-3 font-medium">System prompt</div>
          <div className="space-y-1">
            {prompts.map(t => {
              const Ico = L[t.icon];
              const active = tplId === t.id;
              return (
                <div key={t.id} className="group relative">
                  <button onClick={() => onTplChange(t.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left"
                    style={{
                      background: active ? 'var(--surface-3)' : 'transparent',
                      color: active ? 'var(--text)' : 'var(--text-dim)',
                      boxShadow: active ? 'inset 0 0 0 1px var(--border-strong)' : 'none',
                    }}>
                    <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                         style={{ background: active ? 'rgba(var(--accent-rgb),0.10)' : 'var(--surface-2)' }}>
                      <Ico size={13} style={{ color: active ? 'var(--accent)' : 'var(--text-dim)' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] truncate font-medium">{t.name}</div>
                      <div className="text-[10px] mono uppercase tracking-wider text-mute mt-1">{t.tag}</div>
                    </div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditing(t); }}
                    title="Edit prompt"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}
                  >
                    <L.Pencil size={11} />
                  </button>
                </div>
              );
            })}
            <button
              onClick={() => setEditing({})}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left hover:bg-[var(--surface-2)]"
              style={{ color: 'var(--text-mute)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-dim)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-mute)'}
            >
              <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 border border-dashed" style={{ borderColor: 'var(--border-strong)' }}>
                <L.Plus size={12} />
              </div>
              <span className="text-[12.5px]">New prompt</span>
            </button>
          </div>
        </div>

        <div className="mt-auto px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="text-[10px] uppercase tracking-[0.20em] text-mute mb-2 font-medium">Recent conversations</div>
          <div className="space-y-1.5 mono text-[11.5px]">
            <div style={{ color: 'var(--text)' }} className="truncate">› Coroutine cache w/ TTL</div>
            <div className="text-mute truncate">› SQLite WAL setup</div>
            <div className="text-mute truncate">› Compose recomposition</div>
            <div className="text-mute truncate">› Ray placement groups</div>
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* header */}
        <div className="flex items-center gap-3 px-8 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[16px] font-semibold tracking-tight">{tpl.name}</h1>
              <Pill tone="accent">{tpl.tag}</Pill>
            </div>
            <div className="text-[11.5px] text-mute mt-1 truncate max-w-[640px]">{tpl.sys}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button tone="default" size="sm" icon={L.Pencil} onClick={() => setEditing(tpl)}>edit prompt</Button>
            <Button tone="default" size="sm" icon={L.Eraser} onClick={clear}>clear</Button>
          </div>
        </div>

        {/* messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-6">
          {messages.map((m, i) => <ChatMessage key={i} msg={m} />)}
          {streaming && streamText && (
            <div className="flex mb-6 gap-3 fade-up">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                   style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <L.Sparkles size={14} style={{ color: 'var(--accent)' }} className="animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <ChatMarkdown text={streamText} />
                <span className="caret w-[7px] h-[14px] inline-block ml-1 align-middle" style={{ background: 'var(--accent)' }} />
              </div>
            </div>
          )}
        </div>

        {/* composer */}
        <div className="px-8 pb-6 pt-2">
          <div className="rounded-2xl border p-3"
               style={{ borderColor: 'var(--border)', background: 'var(--surface)', boxShadow: 'var(--shadow-elev)' }}>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={`Message ${cluster.model.name}… (${tpl.name})`}
              rows={2}
              className="w-full bg-transparent resize-none px-2 py-1.5 text-[13.5px] outline-none placeholder:text-[color:var(--text-mute)]"
              style={{ color: 'var(--text)' }}
            />
            <div className="flex items-center gap-2 px-1 pt-1">
              <Button tone="ghost" size="sm" icon={L.Paperclip}>attach</Button>
              <Button tone="ghost" size="sm" icon={L.SlidersHorizontal}>temp 0.70</Button>
              <Button tone="ghost" size="sm" icon={L.Network}>3 shards</Button>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[10.5px] mono text-mute tnum">{draft.length} / 16,384</span>
                <Button
                  tone={streaming ? 'crit' : 'solid'}
                  size="md"
                  icon={streaming ? L.Square : L.SendHorizontal}
                  onClick={send}
                  disabled={!draft.trim() && !streaming}
                >
                  {streaming ? 'stop' : 'send'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Prompt editor modal */}
      <PromptEditor
        open={editing !== null}
        initial={editing}
        onClose={() => setEditing(null)}
        onSave={savePrompt}
        onDelete={editing && editing.id ? deletePrompt : null}
      />
    </div>
  );
}

Object.assign(window, { ChatPlayground });
