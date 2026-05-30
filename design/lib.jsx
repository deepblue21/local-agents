// ============================================================
// src/lib.jsx — Icon proxy, UI primitives, cluster mock data
// ============================================================
const { useState, useEffect, useRef, useMemo, useLayoutEffect, createContext, useContext } = React;

// ---------- Theme context ----------
const ThemeContext = createContext({ theme: 'deepsea', setTheme: () => {} });

// ---------- Icon proxy over vanilla lucide ----------
function normalizeAttrs(attrs) {
  const out = {};
  for (const [k, v] of Object.entries(attrs || {})) {
    const camel = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v;
  }
  return out;
}
const _iconCache = {};
function LucideIcon({ name, size = 16, strokeWidth = 2, className = '', style = {}, color, ...rest }) {
  const icons = (window.lucide && window.lucide.icons) || {};
  let node = _iconCache[name];
  if (!node) {
    node = icons[name];
    if (!node) {
      const kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
      node = icons[kebab];
    }
    if (node) _iconCache[name] = node;
  }
  if (!node || !Array.isArray(node)) return null;
  const [tag, attrs, children] = node;
  const a = normalizeAttrs(attrs);
  return React.createElement(
    tag,
    { ...a, width: size, height: size, strokeWidth, className, style: color ? { ...style, color } : style, ...rest },
    (children || []).map(([ctag, cattrs], i) => React.createElement(ctag, { ...normalizeAttrs(cattrs), key: i }))
  );
}
const L = new Proxy({}, {
  get: (_, name) => {
    if (typeof name !== 'string') return undefined;
    const Comp = (props) => <LucideIcon name={name} {...props} />;
    Comp.displayName = `L.${name}`;
    return Comp;
  }
});

// ---------- Helpers ----------
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rgba(varName, alpha) { return `rgba(var(${varName}), ${alpha})`; }

// ---------- Cluster mock + live drift ----------
const NODES_SEED = [
  {
    id: 'n1', role: 'master', name: 'workstation.local', os: 'Linux · Ubuntu 24.04',
    icon: 'Monitor', host: '10.0.4.21', latency: 0,
    cpu: { name: 'Intel i7-14700KF', cores: '20c / 28t', pct: 34, temp: 62 },
    ram: { name: 'DDR5 6400', used: 18.4, total: 32 },
    accelerators: [
      { kind: 'gpu', name: 'NVIDIA RTX 3070 OC', vramUsed: 7.6, vramTotal: 8.0, pct: 92, temp: 78, isVramTight: true },
    ],
    unifiedTotal: 8.0,
    unifiedUsed: 7.6,
    task: 'host · layers 0–19 (DeepSeek 67B)',
    layersHosted: 20,
    status: 'online',
    throughput: 22,
  },
  {
    id: 'n2', role: 'worker', name: 'studio.local', os: 'macOS · Sequoia 15.4',
    icon: 'Apple', host: '10.0.4.34', latency: 12,
    cpu: { name: 'Apple M4 Ultra', cores: '24c (16P+8E)', pct: 41, temp: 56 },
    ram: { name: 'Unified Memory', used: 84, total: 128 },
    accelerators: [
      { kind: 'soc', name: 'M4 Ultra GPU · 76c', vramUsed: 84, vramTotal: 128, pct: 66, temp: 58 },
    ],
    unifiedTotal: 128,
    unifiedUsed: 84,
    task: 'shard · layers 20–55 (DeepSeek 67B)',
    layersHosted: 36,
    status: 'online',
    throughput: 58,
  },
  {
    id: 'n3', role: 'worker', name: 'rack-01.dc', os: 'Linux · NixOS 24.05',
    icon: 'Server', host: '10.0.4.42', latency: 4,
    cpu: { name: 'AMD EPYC 9354P', cores: '32c / 64t', pct: 18, temp: 51 },
    ram: { name: 'DDR5 4800 ECC', used: 22, total: 256 },
    accelerators: [
      { kind: 'gpu', name: 'RTX 6000 Ada · slot 0', vramUsed: 14.2, vramTotal: 48, pct: 41, temp: 64 },
      { kind: 'gpu', name: 'RTX 6000 Ada · slot 1', vramUsed: 12.8, vramTotal: 48, pct: 38, temp: 61 },
    ],
    unifiedTotal: 96,
    unifiedUsed: 27.0,
    task: 'shard · layers 56–79 (DeepSeek 67B)',
    layersHosted: 24,
    status: 'processing',
    throughput: 40,
  },
];

const ACTIVE_MODEL = {
  name: 'deepseek-v3:67b',
  family: 'DeepSeek',
  params: '67B',
  quant: 'q4_K_M',
  totalLayers: 80,
  contextWindow: 16384,
  vramFootprint: 38.6,
};

function useCluster() {
  const [nodes, setNodes] = useState(NODES_SEED);
  useEffect(() => {
    const id = setInterval(() => {
      setNodes(ns => ns.map(n => {
        const cpuPct = clamp(n.cpu.pct + (Math.random() - 0.5) * 8, 5, 96);
        const cpuTemp = clamp(n.cpu.temp + (Math.random() - 0.5) * 1.5, 45, 84);
        const ramUsed = clamp(n.ram.used + (Math.random() - 0.5) * 0.6, n.ram.total * 0.10, n.ram.total * 0.95);
        const accel = n.accelerators.map(a => {
          const pct = clamp(a.pct + (Math.random() - 0.5) * 10, 6, 99);
          const vramUsed = clamp(a.vramUsed + (Math.random() - 0.5) * 0.2, a.vramTotal * 0.10, a.vramTotal * 0.985);
          const temp = clamp(a.temp + (Math.random() - 0.5) * 1.8, 48, 84);
          return { ...a, pct, vramUsed, temp, isVramTight: vramUsed / a.vramTotal > 0.90 };
        });
        const unifiedUsed = accel.reduce((s, a) => s + a.vramUsed, 0);
        const latency = n.role === 'master' ? 0 : clamp(n.latency + (Math.random() - 0.5) * 1.4, 1, 30);
        const throughput = clamp(n.throughput + (Math.random() - 0.5) * 6, 10, 90);
        return {
          ...n,
          cpu: { ...n.cpu, pct: cpuPct, temp: cpuTemp },
          ram: { ...n.ram, used: ramUsed },
          accelerators: accel,
          unifiedUsed,
          latency,
          throughput,
        };
      }));
    }, 1300);
    return () => clearInterval(id);
  }, []);

  const totals = useMemo(() => {
    const memTotal = nodes.reduce((s, n) => s + n.unifiedTotal, 0);
    const memUsed = nodes.reduce((s, n) => s + n.unifiedUsed, 0);
    const ramTotal = nodes.reduce((s, n) => s + n.ram.total, 0);
    const ramUsed = nodes.reduce((s, n) => s + n.ram.used, 0);
    const tps = nodes.reduce((s, n) => s + n.throughput, 0);
    const online = nodes.filter(n => n.status === 'online' || n.status === 'processing').length;
    return { memTotal, memUsed, ramTotal, ramUsed, tps, online };
  }, [nodes]);

  return { nodes, totals, model: ACTIVE_MODEL };
}

// ---------- Primitive: ProgressBar ----------
function ProgressBar({ pct, tone = 'accent', height = 6, animated = true, label, valueLabel }) {
  const toneVar = tone === 'warn' ? '--warn-rgb' : tone === 'crit' ? '--crit-rgb' : '--accent-rgb';
  return (
    <div className="w-full">
      {(label || valueLabel) && (
        <div className="flex items-baseline justify-between mb-1.5">
          {label && <span className="text-[10.5px] mono text-mute uppercase tracking-[0.12em]">{label}</span>}
          {valueLabel && <span className="text-[11px] mono tnum" style={{ color: `rgba(var(${toneVar}),1)` }}>{valueLabel}</span>}
        </div>
      )}
      <div className="relative rounded-full overflow-hidden" style={{ height, background: 'var(--surface-3)' }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${clamp(pct, 0, 100)}%`,
            background: `linear-gradient(90deg, rgba(var(${toneVar}), 0.65) 0%, rgba(var(${toneVar}), 1) 100%)`,
            boxShadow: `0 0 14px rgba(var(${toneVar}), 0.35)`,
            transition: 'width .9s cubic-bezier(.4,0,.2,1), background .3s ease',
          }}
        >
          {animated && <div className="absolute inset-0 shimmer-bar" />}
        </div>
      </div>
    </div>
  );
}

// ---------- Primitive: StatCard ----------
function StatCard({ label, value, sub, accent, icon: Icon, trend, spark }) {
  const accentColor = accent || 'var(--text)';
  return (
    <div className="card card-hover p-5 relative overflow-hidden">
      <div className="flex items-start justify-between mb-4">
        <div className="text-[11px] uppercase tracking-[0.14em] text-dim font-medium">{label}</div>
        {Icon && (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
               style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <Icon size={14} style={{ color: accentColor }} />
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2 mono tnum">
        <div className="text-[28px] font-semibold tracking-tight leading-none" style={{ color: accentColor }}>{value}</div>
        {sub && <div className="text-[12px] text-mute">{sub}</div>}
      </div>
      {trend && (
        <div className="text-[11px] mono mt-2 flex items-center gap-1" style={{ color: trend.up ? 'var(--accent)' : 'var(--crit)' }}>
          {trend.up ? '▲' : '▼'} {trend.label}
        </div>
      )}
      {spark && (
        <svg className="absolute bottom-0 right-0 opacity-50" width="140" height="44" viewBox="0 0 140 44" preserveAspectRatio="none">
          <polyline fill="none" stroke={accentColor} strokeWidth="1.5"
            points={spark.map((y, i) => `${(i / (spark.length-1)) * 140},${44 - y * 38}`).join(' ')} />
          <polyline fill={accentColor} fillOpacity="0.07" stroke="none"
            points={`0,44 ${spark.map((y, i) => `${(i / (spark.length-1)) * 140},${44 - y * 38}`).join(' ')} 140,44`} />
        </svg>
      )}
    </div>
  );
}

// ---------- Primitive: Pill / Chip ----------
function Pill({ children, tone = 'default', icon: Icon, pulse }) {
  const tones = {
    default: { bg: 'var(--surface-2)', fg: 'var(--text-dim)', bd: 'var(--border)' },
    accent:  { bg: 'rgba(var(--accent-rgb),0.10)', fg: 'var(--accent)', bd: 'rgba(var(--accent-rgb),0.25)' },
    warn:    { bg: 'rgba(var(--warn-rgb),0.10)',  fg: 'var(--warn)',   bd: 'rgba(var(--warn-rgb),0.25)' },
    crit:    { bg: 'rgba(var(--crit-rgb),0.10)',  fg: 'var(--crit)',   bd: 'rgba(var(--crit-rgb),0.25)' },
  };
  const t = tones[tone] || tones.default;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] mono uppercase tracking-[0.10em]"
          style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}` }}>
      {pulse && <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: t.fg }} />}
      {Icon && <Icon size={10} />}
      {children}
    </span>
  );
}

// ---------- Primitive: Button ----------
function Button({ children, tone = 'default', icon: Icon, iconRight: IconRight, size = 'md', onClick, disabled, className = '', style = {} }) {
  const sizes = {
    sm: { h: 'h-7',  px: 'px-2.5', fs: 'text-[11px]' },
    md: { h: 'h-9',  px: 'px-3.5', fs: 'text-[12.5px]' },
    lg: { h: 'h-10', px: 'px-4',   fs: 'text-[13px]' },
  };
  const tones = {
    default: { bg: 'var(--surface-2)', fg: 'var(--text)', bd: 'var(--border)', hover: 'var(--surface-3)' },
    accent:  { bg: 'rgba(var(--accent-rgb),0.10)', fg: 'var(--accent)', bd: 'rgba(var(--accent-rgb),0.30)', hover: 'rgba(var(--accent-rgb),0.18)' },
    solid:   { bg: 'var(--accent)', fg: 'var(--bg)', bd: 'transparent', hover: 'var(--accent)' },
    ghost:   { bg: 'transparent', fg: 'var(--text-dim)', bd: 'transparent', hover: 'var(--surface-2)' },
    crit:    { bg: 'rgba(var(--crit-rgb),0.08)', fg: 'var(--crit)', bd: 'rgba(var(--crit-rgb),0.25)', hover: 'rgba(var(--crit-rgb),0.16)' },
  };
  const s = sizes[size]; const t = tones[tone];
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className={`${s.h} ${s.px} ${s.fs} rounded-md mono font-medium inline-flex items-center gap-1.5 ${className}`}
      style={{
        background: disabled ? 'var(--surface-2)' : (hover ? t.hover : t.bg),
        color: disabled ? 'var(--text-mute)' : t.fg,
        border: `1px solid ${t.bd}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}>
      {Icon && <Icon size={12} strokeWidth={2.4} />}
      {children}
      {IconRight && <IconRight size={12} strokeWidth={2.4} />}
    </button>
  );
}

// ---------- Primitive: Slider control ----------
function Slider({ value, onChange, min, max, step, format }) {
  return (
    <div>
      <div className="flex items-center gap-4">
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} />
        <div className="w-24 shrink-0">
          <div className="h-9 rounded-md border flex items-center justify-center mono text-[13px] tnum"
               style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--accent)' }}>
            {format ? format(value) : value}
          </div>
        </div>
      </div>
      <div className="flex justify-between text-[10px] mono text-mute mt-1.5 tnum">
        <span>{format ? format(min) : min}</span>
        <span>{format ? format(max) : max}</span>
      </div>
    </div>
  );
}

// ---------- Primitive: TextInput ----------
function TextInput({ value, onChange, placeholder, prefix, mono = true }) {
  return (
    <div className="flex items-center h-10 rounded-md border overflow-hidden"
         style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
      {prefix && (
        <span className={`px-3 text-[12px] ${mono ? 'mono' : ''} h-full flex items-center`}
              style={{ color: 'var(--text-mute)', background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>{prefix}</span>
      )}
      <input
        type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`flex-1 bg-transparent px-3 text-[13px] ${mono ? 'mono' : ''} outline-none placeholder:text-[color:var(--text-mute)]`}
        style={{ color: 'var(--text)' }}
      />
    </div>
  );
}

// ---------- Export to window for cross-script use ----------
Object.assign(window, {
  ThemeContext, LucideIcon, L, clamp, rgba,
  useCluster, ACTIVE_MODEL, NODES_SEED,
  ProgressBar, StatCard, Pill, Button, Slider, TextInput,
});
