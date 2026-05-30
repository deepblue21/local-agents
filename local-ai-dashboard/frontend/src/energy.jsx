// ============================================================
// src/energy.jsx — Power & cost tracking with date/device breakdown
// ============================================================

// Per-device power profile (Watts)
const POWER_PROFILE = {
  n1: { active: 220, idle:  92, name: 'workstation', icon: 'Monitor', color: 'var(--accent)' },
  n2: { active: 180, idle:  60, name: 'studio',      icon: 'Apple',   color: 'var(--accent-2)' },
  n3: { active: 740, idle: 280, name: 'rack-01',     icon: 'Server',  color: 'var(--warn)' },
};

const PRICE_PER_KWH = 0.18;       // USD
const CARBON_PER_KWH = 0.42;      // kgCO2

// Deterministic-ish RNG so the chart doesn't flicker on every re-render
function seeded(seed) {
  let s = seed | 0;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function buildSeries(range) {
  // returns { points: [{ t, label, n1, n2, n3 }], totalUnit, unitLabel, xTickStride }
  const points = [];
  const today = new Date('2026-05-17T22:30:00');
  if (range === '24h') {
    const rnd = seeded(101);
    for (let h = 23; h >= 0; h--) {
      const t = new Date(today); t.setHours(today.getHours() - h, 0, 0, 0);
      const hour = t.getHours();
      // Activity envelope: ramp up 8–10, plateau noon–22, ramp down at night
      let active;
      if (hour < 7) active = 0.18;
      else if (hour < 9) active = 0.45;
      else if (hour < 12) active = 0.82;
      else if (hour < 19) active = 0.95;
      else if (hour < 23) active = 0.68;
      else active = 0.22;
      const j = () => 0.92 + rnd() * 0.16;
      points.push({
        t, label: String(hour).padStart(2, '0'),
        n1: +((POWER_PROFILE.n1.idle + (POWER_PROFILE.n1.active - POWER_PROFILE.n1.idle) * active * j()) / 1000).toFixed(3),
        n2: +((POWER_PROFILE.n2.idle + (POWER_PROFILE.n2.active - POWER_PROFILE.n2.idle) * active * j()) / 1000).toFixed(3),
        n3: +((POWER_PROFILE.n3.idle + (POWER_PROFILE.n3.active - POWER_PROFILE.n3.idle) * active * j()) / 1000).toFixed(3),
      });
    }
    return { points, unitLabel: 'kWh / hour', xTickEvery: 3 };
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const rnd = seeded(days * 13);
  for (let d = days - 1; d >= 0; d--) {
    const t = new Date(today); t.setDate(today.getDate() - d); t.setHours(0,0,0,0);
    const dow = t.getDay();              // 0 sun, 6 sat — weekends slightly lower
    const weekendFactor = (dow === 0 || dow === 6) ? 0.62 : 1.0;
    const trend = 1 + Math.sin(d / 9) * 0.18;    // slow oscillation
    const noise = () => 0.88 + rnd() * 0.22;
    // Daily kWh = profile * hours * mix
    const utilMix = 0.62 * weekendFactor * trend;
    const kWh = (n) => +((POWER_PROFILE[n].idle * 24 * 0.4 + POWER_PROFILE[n].active * 24 * utilMix * noise()) / 1000).toFixed(2);
    points.push({
      t, label: t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      n1: kWh('n1'), n2: kWh('n2'), n3: kWh('n3'),
    });
  }
  const xTickEvery = days === 7 ? 1 : days === 30 ? 4 : 12;
  return { points, unitLabel: 'kWh / day', xTickEvery };
}

// ---------- KPI strip ----------
function EnergyKPIs({ totals, range }) {
  const rangeLabel = { '24h': 'last 24 hours', '7d': 'past 7 days', '30d': 'past 30 days', '90d': 'past 90 days' }[range];
  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard label="Total energy"   value={totals.kWh.toFixed(1)}        sub={`kWh \u00b7 ${rangeLabel}`} icon={L.BatteryCharging} accent="var(--accent)" trend={{ up: totals.trendUp, label: `${totals.trendUp ? '+' : '\u2212'}${Math.abs(totals.trendPct).toFixed(1)}% vs prev` }} />
      <StatCard label="Estimated cost" value={`$${totals.cost.toFixed(2)}`}  sub={`@ $${PRICE_PER_KWH.toFixed(2)} / kWh`} icon={L.CircleDollarSign} />
      <StatCard label="Peak draw"      value={`${totals.peakW.toFixed(0)}`}  sub={`W \u00b7 ${totals.peakWhen}`} icon={L.Zap} accent="var(--warn)" />
      <StatCard label="Carbon"         value={`${totals.kgCO2.toFixed(1)}`}  sub={`kgCO\u2082 \u00b7 ${CARBON_PER_KWH} kg/kWh`} icon={L.Leaf} accent="var(--accent-2)" />
    </div>
  );
}

// ---------- Stacked-area / line chart ----------
function EnergyChart({ series, mode, setMode }) {
  const W = 1000, H = 280;
  const PAD_L = 56, PAD_R = 24, PAD_T = 22, PAD_B = 36;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const totals = series.points.map(p => p.n1 + p.n2 + p.n3);
  const max = Math.max(...totals, 1);
  // round up max to nice value
  const niceMax = Math.ceil(max * 1.1);

  const x = (i) => PAD_L + (i / Math.max(1, series.points.length - 1)) * innerW;
  const y = (v) => PAD_T + (1 - v / niceMax) * innerH;

  // Build stacked y series for each device
  const stack = series.points.map(p => ({
    n3Top: p.n3,
    n2Top: p.n3 + p.n2,
    n1Top: p.n3 + p.n2 + p.n1,
  }));

  const areaPath = (key, prevKey) => {
    let d = `M ${x(0)},${y(stack[0][key])}`;
    for (let i = 1; i < series.points.length; i++) d += ` L ${x(i)},${y(stack[i][key])}`;
    if (prevKey) {
      for (let i = series.points.length - 1; i >= 0; i--) d += ` L ${x(i)},${y(stack[i][prevKey])}`;
    } else {
      d += ` L ${x(series.points.length - 1)},${y(0)} L ${x(0)},${y(0)} Z`;
      return d;
    }
    d += ' Z';
    return d;
  };
  const linePath = (key) => series.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)},${y(stack[i][key])}`).join(' ');

  // grid horizontal lines (4 divisions)
  const gridLines = [];
  for (let i = 0; i <= 4; i++) {
    const v = (niceMax / 4) * i;
    gridLines.push({ y: y(v), v });
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-4">
        <L.LineChart size={14} style={{ color: 'var(--accent)' }} />
        <h3 className="text-[13.5px] font-semibold tracking-tight">Power consumption</h3>
        <span className="text-[11px] mono text-mute">{series.unitLabel}</span>
        <div className="ml-auto flex items-center gap-3">
          {/* legend */}
          <div className="flex items-center gap-3 text-[10.5px] mono">
            <Legend color="var(--accent)"   label="workstation" />
            <Legend color="var(--accent-2)" label="studio" />
            <Legend color="var(--warn)"     label="rack-01" />
          </div>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H, maxHeight: H }}>
        <defs>
          <linearGradient id="grad-n1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="var(--accent)"   stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)"  stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="grad-n2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="var(--accent-2)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent-2)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="grad-n3" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="var(--warn)"     stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--warn)"    stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* grid */}
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={g.y} y2={g.y} stroke="var(--border)" strokeDasharray={i === 0 || i === 4 ? '0' : '2 4'} strokeWidth="1" />
            <text x={PAD_L - 8} y={g.y + 3} textAnchor="end" fontSize="10.5" fill="var(--text-mute)" fontFamily="JetBrains Mono">
              {g.v.toFixed(g.v > 10 ? 0 : 1)}
            </text>
          </g>
        ))}

        {/* stacked areas (n3 bottom → n2 → n1 top) */}
        <path d={areaPath('n3Top')}        fill="url(#grad-n3)" />
        <path d={areaPath('n2Top','n3Top')} fill="url(#grad-n2)" />
        <path d={areaPath('n1Top','n2Top')} fill="url(#grad-n1)" />

        {/* lines */}
        <path d={linePath('n3Top')}  fill="none" stroke="var(--warn)"     strokeWidth="1.5" />
        <path d={linePath('n2Top')}  fill="none" stroke="var(--accent-2)" strokeWidth="1.5" />
        <path d={linePath('n1Top')}  fill="none" stroke="var(--accent)"   strokeWidth="1.8" />

        {/* x-axis labels */}
        {series.points.map((p, i) => (
          (i % series.xTickEvery === 0 || i === series.points.length - 1) && (
            <text key={i} x={x(i)} y={H - PAD_B + 18} textAnchor="middle" fontSize="10" fill="var(--text-mute)" fontFamily="JetBrains Mono">
              {p.label}
            </text>
          )
        ))}
      </svg>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      <span className="text-mute">{label}</span>
    </span>
  );
}

// ---------- Per-device breakdown table ----------
function DeviceBreakdown({ series, range }) {
  const totals = ['n1','n2','n3'].map(key => {
    const sum = series.points.reduce((s, p) => s + p[key], 0);
    return { key, kWh: sum, profile: POWER_PROFILE[key] };
  });
  const grand = totals.reduce((s, x) => s + x.kWh, 0) || 1;
  // estimate active hours: assume idle baseline draws 30% of total — rough
  const hoursInRange = range === '24h' ? 24 : (range === '7d' ? 7 : range === '30d' ? 30 : 90) * 24;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <L.HardDrive size={14} style={{ color: 'var(--accent)' }} />
        <div className="text-[13.5px] font-medium">Per-device breakdown</div>
        <span className="text-[11.5px] mono text-mute">3 devices \u00b7 {hoursInRange.toFixed(0)} hours sampled</span>
      </div>
      <div className="grid grid-cols-[1fr_120px_120px_120px_2fr_70px] gap-3 px-5 py-2 border-b text-[10px] uppercase tracking-[0.16em] text-mute mono"
           style={{ borderColor: 'var(--border)' }}>
        <div>Device</div>
        <div className="text-right">Avg power</div>
        <div className="text-right">Energy</div>
        <div className="text-right">Cost</div>
        <div>Share of total</div>
        <div className="text-right">CO\u2082</div>
      </div>
      {totals.map(t => {
        const Icon = L[t.profile.icon] || L.Server;
        const share = (t.kWh / grand) * 100;
        const avgW = (t.kWh * 1000) / hoursInRange; // kWh → Wh / hours
        const cost = t.kWh * PRICE_PER_KWH;
        const co2  = t.kWh * CARBON_PER_KWH;
        return (
          <div key={t.key} className="grid grid-cols-[1fr_120px_120px_120px_2fr_70px] gap-3 px-5 py-3 border-b last:border-0 items-center"
               style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                   style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <Icon size={13} style={{ color: t.profile.color }} />
              </div>
              <div className="min-w-0">
                <div className="text-[12.5px] mono truncate" style={{ color: 'var(--text)' }}>{t.profile.name}</div>
                <div className="text-[10.5px] mono text-mute mt-0.5 tnum">{t.profile.idle}\u2013{t.profile.active} W envelope</div>
              </div>
            </div>
            <div className="text-right text-[12px] mono tnum" style={{ color: 'var(--text)' }}>{avgW.toFixed(0)} <span className="text-mute">W</span></div>
            <div className="text-right text-[12px] mono tnum" style={{ color: 'var(--text)' }}>{t.kWh.toFixed(1)} <span className="text-mute">kWh</span></div>
            <div className="text-right text-[12px] mono tnum" style={{ color: 'var(--text)' }}>${cost.toFixed(2)}</div>
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                  <div className="h-full rounded-full" style={{ width: `${share}%`, background: t.profile.color, boxShadow: `0 0 8px ${t.profile.color}` }} />
                </div>
                <span className="text-[11px] mono tnum shrink-0 w-12 text-right" style={{ color: 'var(--text-dim)' }}>{share.toFixed(1)}%</span>
              </div>
            </div>
            <div className="text-right text-[11px] mono tnum text-dim">{co2.toFixed(1)} kg</div>
          </div>
        );
      })}
      {/* totals row */}
      <div className="grid grid-cols-[1fr_120px_120px_120px_2fr_70px] gap-3 px-5 py-3 items-center" style={{ background: 'var(--surface-2)' }}>
        <div className="text-[10.5px] mono uppercase tracking-[0.14em]" style={{ color: 'var(--text)' }}>Total</div>
        <div className="text-right text-[12px] mono tnum" style={{ color: 'var(--text)' }}>{((grand * 1000) / hoursInRange).toFixed(0)} <span className="text-mute">W</span></div>
        <div className="text-right text-[12.5px] mono tnum font-semibold" style={{ color: 'var(--accent)' }}>{grand.toFixed(1)} <span className="text-mute">kWh</span></div>
        <div className="text-right text-[12.5px] mono tnum font-semibold" style={{ color: 'var(--accent)' }}>${(grand * PRICE_PER_KWH).toFixed(2)}</div>
        <div></div>
        <div className="text-right text-[11px] mono tnum" style={{ color: 'var(--text-dim)' }}>{(grand * CARBON_PER_KWH).toFixed(1)} kg</div>
      </div>
    </div>
  );
}

// ---------- Calendar heatmap (only useful for 30d/90d) ----------
function CalendarHeatmap({ series }) {
  if (series.points.length < 14) return null;
  const max = Math.max(...series.points.map(p => p.n1 + p.n2 + p.n3));
  // Build a grid: weeks as columns, dow as rows. First find the leading day-of-week.
  const first = series.points[0].t;
  const leading = first.getDay(); // 0 sun..6 sat
  // Fill leading empties
  const cells = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  series.points.forEach(p => cells.push(p));
  // pad trailing
  while (cells.length % 7 !== 0) cells.push(null);
  const cols = cells.length / 7;
  const SIZE = 14, GAP = 3;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <L.CalendarDays size={14} style={{ color: 'var(--accent)' }} />
        <h3 className="text-[13.5px] font-semibold tracking-tight">Daily activity</h3>
        <span className="text-[11px] mono text-mute">brighter = more energy</span>
        <div className="ml-auto flex items-center gap-1.5 text-[10.5px] mono text-mute">
          <span>less</span>
          {[0.15, 0.3, 0.55, 0.8, 1].map((a, i) => (
            <span key={i} className="w-3 h-3 rounded-sm" style={{ background: `rgba(var(--accent-rgb), ${a})`, border: '1px solid var(--border)' }} />
          ))}
          <span>more</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg width={cols * (SIZE + GAP) + 36} height={7 * (SIZE + GAP) + 18}>
          {/* dow labels */}
          {['M','W','F'].map((d, i) => (
            <text key={d} x="4" y={(i * 2 + 1) * (SIZE + GAP) + 10} fontSize="9" fill="var(--text-mute)" fontFamily="JetBrains Mono">{d}</text>
          ))}
          {cells.map((p, i) => {
            const col = Math.floor(i / 7);
            const row = i % 7;
            if (!p) return null;
            const total = p.n1 + p.n2 + p.n3;
            const intensity = total / max;
            return (
              <rect key={i}
                    x={28 + col * (SIZE + GAP)}
                    y={row * (SIZE + GAP)}
                    width={SIZE} height={SIZE}
                    rx="2.5"
                    fill={`rgba(var(--accent-rgb), ${0.08 + intensity * 0.9})`}
                    stroke="var(--border)" strokeWidth="1">
                <title>{p.label}: {total.toFixed(2)} kWh</title>
              </rect>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ---------- Energy view root ----------
function EnergyView({ cluster }) {
  const [range, setRange] = React.useState('30d');
  const [remote, setRemote] = React.useState(null);  // {series, totals} from /api/energy

  // Live data path — only if backend is reachable AND it returns non-empty points.
  React.useEffect(() => {
    if (!window.api) { setRemote(null); return; }
    let active = true;
    Promise.all([
      window.api.getJSON(`/api/energy/series?range=${range}`),
      window.api.getJSON(`/api/energy/totals?range=${range}`),
    ]).then(([series, totalsApi]) => {
      if (!active) return;
      if (series && Array.isArray(series.points) && series.points.length) {
        setRemote({ series, totals: totalsApi });
      } else {
        setRemote(null);  // fall back to mock until enough samples exist
      }
    }).catch(() => setRemote(null));
    return () => { active = false; };
  }, [range]);

  const series = remote ? remote.series : React.useMemo(() => buildSeries(range), [range]);

  // compute totals (mock path or fallback when remote.totals is missing)
  const totals = remote && remote.totals ? remote.totals : React.useMemo(() => {
    const kWh = series.points.reduce((s, p) => s + p.n1 + p.n2 + p.n3, 0);
    const cost = kWh * PRICE_PER_KWH;
    const kgCO2 = kWh * CARBON_PER_KWH;
    const intervalH = range === '24h' ? 1 : 24;
    let peakW = 0, peakWhen = '';
    series.points.forEach(p => {
      const w = ((p.n1 + p.n2 + p.n3) / intervalH) * 1000;
      if (w > peakW) { peakW = w; peakWhen = p.label; }
    });
    const mid = Math.floor(series.points.length / 2);
    const earlier = series.points.slice(0, mid).reduce((s, p) => s + p.n1 + p.n2 + p.n3, 0);
    const later   = series.points.slice(mid).reduce((s, p) => s + p.n1 + p.n2 + p.n3, 0);
    const earlierPerDay = earlier / Math.max(1, mid);
    const laterPerDay   = later   / Math.max(1, series.points.length - mid);
    const trendPct = ((laterPerDay - earlierPerDay) / Math.max(0.01, earlierPerDay)) * 100;
    return { kWh, cost, kgCO2, peakW, peakWhen: range === '24h' ? `at ${peakWhen}:00` : peakWhen, trendPct, trendUp: trendPct >= 0 };
  }, [series, range]);

  const ranges = [
    { id: '24h', label: '24h' },
    { id: '7d',  label: '7 days' },
    { id: '30d', label: '30 days' },
    { id: '90d', label: '90 days' },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-semibold tracking-tight">Energy &amp; cost</h2>
            <div className="text-[13px] text-dim mt-1">
              Cluster-wide power draw, energy used, and carbon emitted — sampled every 30s, aggregated by day.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center p-0.5 rounded-lg border"
                 style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
              {ranges.map(r => (
                <button key={r.id} onClick={() => setRange(r.id)}
                  className="px-3 py-1.5 text-[12px] mono rounded-md transition"
                  style={{
                    background: range === r.id ? 'var(--surface-3)' : 'transparent',
                    color: range === r.id ? 'var(--text)' : 'var(--text-mute)',
                  }}>{r.label}</button>
              ))}
            </div>
            <Button tone="default" size="md" icon={L.Download}>export CSV</Button>
          </div>
        </div>

        <EnergyKPIs totals={totals} range={range} />
        <EnergyChart series={series} mode={range} />

        <div className="grid grid-cols-[1fr_360px] gap-4 items-start">
          <DeviceBreakdown series={series} range={range} />
          <div className="space-y-4">
            <RateCard />
            <EnvHint trend={totals.trendPct} />
          </div>
        </div>

        {(range === '30d' || range === '90d') && <CalendarHeatmap series={series} />}
      </div>
    </div>
  );
}

function RateCard() {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <L.Receipt size={14} style={{ color: 'var(--accent)' }} />
        <h3 className="text-[13.5px] font-semibold tracking-tight">Tariff</h3>
      </div>
      <div className="space-y-2.5 text-[12px] mono">
        <Row label="Rate"        value={`$${PRICE_PER_KWH.toFixed(2)} / kWh`} />
        <Row label="Provider"    value="local · TimeOfUse" />
        <Row label="Off-peak"    value="22:00 – 06:00 · $0.11" sub />
        <Row label="On-peak"     value="06:00 – 22:00 · $0.18" sub />
        <Row label="Carbon mix"  value={`${CARBON_PER_KWH} kgCO\u2082 / kWh`} sub />
      </div>
      <div className="mt-3 pt-3 border-t flex items-center justify-between text-[11px] mono"
           style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}>
        <span className="text-mute">last bill cycle</span>
        <span>$84.20 · 468 kWh</span>
      </div>
    </div>
  );
}

function Row({ label, value, sub }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-mute uppercase tracking-wider text-[10px]">{label}</span>
      <span className={sub ? 'text-dim' : ''} style={{ color: sub ? 'var(--text-dim)' : 'var(--text)' }}>{value}</span>
    </div>
  );
}

function EnvHint({ trend }) {
  const up = trend > 0;
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-2">
        <L.Sprout size={14} style={{ color: 'var(--accent)' }} />
        <h3 className="text-[13.5px] font-semibold tracking-tight">Footprint</h3>
      </div>
      <div className="text-[12px] text-dim leading-relaxed mb-3">
        Your cluster's energy use is <span style={{ color: up ? 'var(--warn)' : 'var(--accent)' }}>{up ? 'up' : 'down'} {Math.abs(trend).toFixed(1)}%</span> vs the previous half of the window. Largest contributor: <span style={{ color: 'var(--warn)' }}>rack-01</span> (dual RTX 6000 Ada).
      </div>
      <div className="text-[11px] mono text-mute space-y-1.5">
        <div className="flex items-center gap-2">
          <L.CircleCheck size={11} style={{ color: 'var(--accent)' }} /> drain rack-01 at night to save ~$8/wk
        </div>
        <div className="flex items-center gap-2">
          <L.CircleCheck size={11} style={{ color: 'var(--accent)' }} /> enable KV-cache 8-bit · cuts power ~6%
        </div>
        <div className="flex items-center gap-2">
          <L.CircleCheck size={11} style={{ color: 'var(--accent)' }} /> route small models to studio (M4) — better perf/W
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { EnergyView });
