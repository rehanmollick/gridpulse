import { useEffect, useMemo, useRef, useState } from "react";
import utEventsCsv from "./data/UT_Sports_Events.csv?raw";
import energyUsageCsv from "./data/Facility_Energy_Usage.csv?raw";
import capacitiesCsv from "./data/venues_capcity.csv?raw";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const AUSTIN_CENTER = [-97.7431, 30.2672];

const ZIP_COORDS = {
  "78701": [-97.7426, 30.2711],
  "78702": [-97.7162, 30.2624],
  "78703": [-97.766, 30.2894],
  "78704": [-97.7604, 30.2437],
  "78705": [-97.7411, 30.2928],
  "78744": [-97.7338, 30.1841],
  "78748": [-97.8175, 30.1613],
  "78751": [-97.7232, 30.3112],
  "78752": [-97.6997, 30.334],
  "78756": [-97.7422, 30.3218],
  "78617": [-97.6283, 30.1582],
};

const FACILITY_COORDS = {
  "Moody Center":                          { lat: 30.2874, lng: -97.7359, zips: ["78705","78751","78752","78756"] },
  "DKR-Texas Memorial Stadium":            { lat: 30.2837, lng: -97.7326, zips: ["78705","78751","78752","78756"] },
  "UFCU Disch-Falk Field":                 { lat: 30.2829, lng: -97.7283, zips: ["78705","78751","78752"] },
  "Texas Tennis Center":                   { lat: 30.2893, lng: -97.7316, zips: ["78705","78751"] },
  "Weller Tennis Center":                  { lat: 30.2878, lng: -97.7292, zips: ["78705","78751"] },
  "Lee and Joe Jamail Texas Swimming Center": { lat: 30.2866, lng: -97.7352, zips: ["78705","78751"] },
  "Red & Charline McCombs Field":          { lat: 30.2798, lng: -97.7223, zips: ["78702","78705","78751"] },
  "Wright-Whitaker Sports Complex":        { lat: 30.2503, lng: -97.7191, zips: ["78702","78744"] },
  "Mike A. Myers Stadium and Soccer Field":{ lat: 30.2814, lng: -97.7306, zips: ["78705","78751","78752"] },
};

const CATEGORY_OCCUPANCY = {
  Football: 0.96, "Men's Basketball": 0.88, "Women's Basketball": 0.76,
  Baseball: 0.68, Softball: 0.72, Soccer: 0.63,
  "Men's Tennis": 0.84, "Women's Tennis": 0.82,
  "Men's Swimming and Diving": 0.74, "Women's Swimming and Diving": 0.72,
  "Beach Volleyball": 0.78, default: 0.68,
};

const CATEGORY_ICON = {
  Football: "🏈", "Men's Basketball": "🏀", "Women's Basketball": "🏀",
  Baseball: "⚾", Softball: "🥎", Soccer: "⚽",
  "Men's Tennis": "🎾", "Women's Tennis": "🎾",
  "Men's Swimming and Diving": "🏊", "Women's Swimming and Diving": "🏊",
  "Beach Volleyball": "🏐", default: "🏟",
};

// ─── DATA PARSING ────────────────────────────────────────────────────────────

function parseCsvLine(line) {
  const values = []; let current = ""; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { values.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  values.push(current.trim());
  return values;
}

function parseCsv(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const row = {};
    parseCsvLine(line).forEach((v, i) => { row[headers[i]] = v ?? ""; });
    return row;
  });
}

function cleanTime(raw) {
  if (!raw) return "";
  return raw.replaceAll("?", "").replace(/CT/i, "").replace(/\s+/g, " ").trim();
}

function parseDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  const [m, d, y] = dateStr.split("/").map(Number);
  if (!m || !d || !y) return null;
  const t = cleanTime(timeStr);
  let h = 19, min = 0;
  if (t && !/TBA/i.test(t) && !/March TBA/i.test(t)) {
    const match = t.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (match) {
      h = Number(match[1]); min = Number(match[2] || 0);
      const suf = match[3].toUpperCase();
      if (suf === "AM" && h === 12) h = 0;
      if (suf === "PM" && h !== 12) h += 12;
    }
  }
  return new Date(y, m - 1, d, h, min, 0, 0);
}

function to12Hour(totalMins) {
  const m = ((totalMins % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60), mins = m % 60;
  const suf = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(mins).padStart(2, "0")} ${suf}`;
}

function subtractMinutes(time, delta) {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return time;
  let h = Number(match[1]); const min = Number(match[2]); const suf = match[3].toUpperCase();
  if (suf === "AM" && h === 12) h = 0;
  if (suf === "PM" && h !== 12) h += 12;
  return to12Hour(h * 60 + min - delta);
}

function estimateTempF(date) {
  const mo = date.getMonth() + 1;
  if (mo >= 6 && mo <= 9) return 98;
  if (mo >= 4 && mo <= 5) return 88;
  if (mo >= 10 && mo <= 11) return 76;
  return 62;
}

function getProjectedMW(event) {
  const tempMult = event.tempF > 90 ? 3.1 : event.tempF > 78 ? 1.85 : 1.1;
  const intensityMult = 1 + event.energyUsage * 0.15;
  return event.attendance * 0.0021 * tempMult * intensityMult;
}

function loadEventModel() {
  const capacities = new Map(parseCsv(capacitiesCsv).map((r) => [r.Venue, Number(r.Capacity || 0)]));
  const energy = new Map(parseCsv(energyUsageCsv).map((r) => [r["Center Name"], Number(r["Energy Usage"] || 1)]));
  return parseCsv(utEventsCsv)
    .map((row, idx) => {
      const facility = row.Facility?.trim();
      const coords = FACILITY_COORDS[facility];
      if (!facility || !coords) return null;
      const startAt = parseDateTime(row["Start Date"], row["Start Time"]);
      if (!startAt) return null;
      let endAt = parseDateTime(row["End Date"], row["End Time"]);
      if (!endAt) endAt = new Date(startAt.getTime() + 2.5 * 3600000);
      if (endAt < startAt) endAt = new Date(endAt.getTime() + 86400000);
      const capacity = capacities.get(facility) || 3500;
      const occupancy = CATEGORY_OCCUPANCY[row.Category] || CATEGORY_OCCUPANCY.default;
      const attendance = Math.max(250, Math.round(capacity * occupancy));
      const tempF = estimateTempF(startAt);
      const energyUsage = energy.get(facility) || 1;
      const endTime = to12Hour(endAt.getHours() * 60 + endAt.getMinutes());
      return {
        id: `${row.Event}-${idx}`,
        name: row.Event.trim(),
        category: row.Category?.trim(),
        venue: facility,
        lat: coords.lat, lng: coords.lng,
        attendance, startAt, endAt, endTime, tempF, energyUsage,
        affectedZips: coords.zips,
        dispersalRadiusMiles: Math.max(1.2, Math.min(6.5, 1.3 + energyUsage * 0.7)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startAt - b.startAt);
}

// Deterministic pseudo-random from a numeric seed — same input always = same output
function seededRand(seed) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// ─── UTILS ───────────────────────────────────────────────────────────────────

function getMapbox() {
  return typeof window !== "undefined" && window.mapboxgl ? window.mapboxgl : null;
}
function fmtDateTime(d) {
  return new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }).format(d);
}
function fmtDate(d) {
  return new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric" }).format(d);
}
function fmtTime(d) {
  return new Intl.DateTimeFormat("en-US", { hour:"numeric", minute:"2-digit" }).format(d);
}

// ─── HOOKS ───────────────────────────────────────────────────────────────────

function useAnimatedCount(target, duration = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    setValue(0);
    if (!target) return;
    let cur = 0;
    const step = target / (duration / 16);
    const t = setInterval(() => {
      cur += step;
      if (cur >= target) { setValue(target); clearInterval(t); }
      else setValue(Math.round(cur));
    }, 16);
    return () => clearInterval(t);
  }, [target, duration]);
  return value;
}

// ─── UI PRIMITIVES ───────────────────────────────────────────────────────────

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-[#0b1223] px-3 py-2">
      <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
      <span className="font-semibold text-slate-100">{value}</span>
    </div>
  );
}

function TabBtn({ active, onClick, children, badge }) {
  return (
    <button onClick={onClick} className={`relative rounded-md border px-4 py-1.5 text-sm font-medium transition ${
      active ? "border-[#3b82f6] bg-[#1e3a8a]/60 text-white" : "border-slate-700 bg-transparent text-slate-400 hover:border-slate-500 hover:text-slate-200"
    }`}>
      {children}
      {badge > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#22c55e] text-[9px] font-black text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

function Sparkline({ prices }) {
  if (prices.length < 2) return null;
  const W = 180, H = 44;
  const min = Math.min(...prices), max = Math.max(...prices), range = max - min || 1;
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W;
    const y = H - ((p - min) / range) * (H - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = prices[prices.length - 1], prev = prices[prices.length - 2];
  const color = last >= prev ? "#22c55e" : "#f97316";
  const lx = W, ly = H - ((last - min) / range) * (H - 6) - 3;
  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="3.5" fill={color} />
    </svg>
  );
}

// ─── OVERVIEW SCREEN ─────────────────────────────────────────────────────────

function OverviewScreen({ events, onEnter }) {
  const totalEvents = events.length;
  const totalMW = useMemo(() => Math.round(events.reduce((a, ev) => a + getProjectedMW(ev), 0)), [events]);
  const totalRevenue = useMemo(() => Math.round(events.reduce((a, ev) => a + getProjectedMW(ev) * 140, 0) / 1000), [events]);

  const animEvents = useAnimatedCount(totalEvents);
  const animMW = useAnimatedCount(totalMW);
  const animRevenue = useAnimatedCount(totalRevenue);

  // Top 8 events by revenue for the season bar
  const topEvents = useMemo(() =>
    [...events]
      .map((ev) => ({ name: ev.name, category: ev.category, revenue: Math.round(getProjectedMW(ev) * 140) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8),
    [events]
  );
  const maxRev = topEvents[0]?.revenue || 1;

  return (
    <div className="flex h-full w-full flex-col items-center overflow-y-auto bg-[#040814] px-6 py-12">
      <div className="w-full max-w-5xl">

        <div className="mb-2 text-center text-xs font-bold uppercase tracking-[0.35em] text-[#3b82f6]">
          Base Power · Austin Fleet · 2025–26 Season
        </div>
        <h1 className="text-center text-7xl font-black tracking-tight">
          Grid<span className="text-[#3b82f6]">Pulse</span>
        </h1>
        <p className="mt-3 text-center text-xl text-slate-300">
          The grid reacts to demand spikes.{" "}
          <span className="font-bold text-white">GridPulse sees them coming.</span>
        </p>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-slate-500">
          Austin events create predictable demand surges. We pre-charge Base Power's battery fleet
          90 minutes before dispersal — then discharge at peak price and capture the spread.
        </p>

        {/* KPI counters */}
        <div className="mt-8 grid grid-cols-3 gap-5">
          <div className="rounded-2xl border border-slate-700 bg-[#0d1426] p-6 text-center">
            <p className="text-5xl font-black text-white">{animEvents}</p>
            <p className="mt-1.5 text-sm font-semibold text-slate-300">UT events this season</p>
            <p className="text-xs text-slate-500">each one a dispatch opportunity</p>
          </div>
          <div className="rounded-2xl border border-[#3b82f6]/50 bg-[#0d1426] p-6 text-center shadow-lg shadow-blue-900/20">
            <p className="text-5xl font-black text-[#3b82f6]">{animMW.toLocaleString()}</p>
            <p className="mt-1.5 text-sm font-semibold text-slate-300">MW in seasonal exposure</p>
            <p className="text-xs text-slate-500">modeled from real event + venue data</p>
          </div>
          <div className="rounded-2xl border border-[#22c55e]/50 bg-[#0d1426] p-6 text-center shadow-lg shadow-green-900/20">
            <p className="text-5xl font-black text-[#22c55e]">${animRevenue.toLocaleString()}K</p>
            <p className="mt-1.5 text-sm font-semibold text-slate-300">projected season revenue</p>
            <p className="text-xs text-slate-500">at avg $140/MWh spread capture</p>
          </div>
        </div>

        {/* How it works — 3 steps */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          {[
            { num:"01", icon:"🏟", title:"Event ends", body:"100K fans leave DKR on a 99°F night. Every one goes home and cranks the AC. Massive, synchronized load hit — entirely predictable from the schedule.", color:"#f97316", border:"border-[#f97316]/30" },
            { num:"02", icon:"⚡", title:"ERCOT spikes", body:"Grid demand surges. Real-time prices jump from $40 to $300+/MWh in minutes. Operators who react after the spike miss the window. It's already over.", color:"#3b82f6", border:"border-[#3b82f6]/30" },
            { num:"03", icon:"🔋", title:"GridPulse already deployed", body:"90 minutes before dispersal, GridPulse generates a dispatch brief, stages batteries in affected ZIP codes, and executes. Base Power discharges at peak. Captures the spread.", color:"#22c55e", border:"border-[#22c55e]/30" },
          ].map((step) => (
            <div key={step.num} className={`rounded-2xl border ${step.border} bg-[#0a0e1a] p-5`}>
              <div className="flex items-center gap-2">
                <span className="text-xl">{step.icon}</span>
                <span className="text-xs font-black" style={{ color: step.color }}>{step.num}</span>
              </div>
              <p className="mt-2 text-sm font-bold text-white">{step.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{step.body}</p>
            </div>
          ))}
        </div>

        {/* Season revenue bar chart */}
        <div className="mt-6 rounded-2xl border border-slate-700 bg-[#0d1426] p-5">
          <p className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-400">
            Top revenue opportunities this season
            <span className="ml-2 font-normal text-slate-600">— football games alone are worth $200K+ each</span>
          </p>
          <div className="space-y-2">
            {topEvents.map((ev) => (
              <div key={ev.name} className="flex items-center gap-3">
                <span className="w-[200px] shrink-0 text-xs text-slate-300 truncate">
                  {CATEGORY_ICON[ev.category] || "🏟"} {ev.name}
                </span>
                <div className="relative flex-1 h-5 rounded bg-[#0b1223]">
                  <div
                    className="absolute inset-y-0 left-0 rounded"
                    style={{
                      width: `${(ev.revenue / maxRev) * 100}%`,
                      background: ev.revenue > 100000 ? "#f97316" : ev.revenue > 30000 ? "#3b82f6" : "#1e3a8a",
                    }}
                  />
                </div>
                <span className="w-[80px] shrink-0 text-right text-xs font-bold text-slate-200">
                  ${(ev.revenue / 1000).toFixed(0)}K
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          <button
            onClick={onEnter}
            className="rounded-xl bg-[#3b82f6] px-10 py-4 text-lg font-bold text-white shadow-xl shadow-blue-900/40 transition hover:bg-[#2563eb]"
          >
            Browse Dispatch Opportunities →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── INTEL SCREEN ─────────────────────────────────────────────────────────────
// Sorted by revenue. Every row is an actionable opportunity with a Dispatch CTA.

function IntelScreen({ events, ercotPrice, priceHistory, setSelectedId, onDispatch, dispatchedEventIds }) {
  const [filter, setFilter] = useState("all");

  const enriched = useMemo(() =>
    events.map((ev) => ({
      ...ev,
      projectedMW: getProjectedMW(ev),
      revenue: Math.round(getProjectedMW(ev) * Math.max(100, ercotPrice - 38)),
      batteriesNeeded: Math.round(getProjectedMW(ev) * 136),
    })).sort((a, b) => b.revenue - a.revenue),
    [events, ercotPrice]
  );

  const filtered = useMemo(() => {
    if (filter === "football") return enriched.filter((e) => e.category === "Football");
    if (filter === "basketball") return enriched.filter((e) => e.category?.includes("Basketball"));
    if (filter === "high") return enriched.filter((e) => e.revenue > 50000);
    return enriched;
  }, [enriched, filter]);

  const totalOpportunity = useMemo(() => enriched.reduce((a, e) => a + e.revenue, 0), [enriched]);

  const last = priceHistory[priceHistory.length - 1] ?? ercotPrice;
  const prev = priceHistory[priceHistory.length - 2] ?? ercotPrice;
  const priceUp = last >= prev;
  const priceStatus = ercotPrice > 150 ? "spike" : ercotPrice > 80 ? "elevated" : "stable";

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-[#040814] p-6">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white">Dispatch Opportunities</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            {enriched.length} events · ${(totalOpportunity / 1000).toFixed(0)}K total season opportunity · sorted by revenue
          </p>
        </div>
        {/* ERCOT live pill */}
        <div className="shrink-0 rounded-xl border border-slate-700 bg-[#0d1426] px-4 py-2 text-right">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">ERCOT Live</p>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl font-black ${priceUp ? "text-[#22c55e]" : "text-[#f97316]"}`}>
              ${ercotPrice.toFixed(0)}
            </span>
            <span className={`text-xs font-bold ${priceUp ? "text-[#22c55e]" : "text-[#f97316]"}`}>{priceUp ? "↑" : "↓"}/MWh</span>
          </div>
          <div className="mt-1">
            <Sparkline prices={priceHistory} />
          </div>
          <p className={`mt-1 text-[10px] font-semibold ${
            priceStatus === "spike" ? "text-[#f97316]" : priceStatus === "elevated" ? "text-yellow-400" : "text-slate-500"
          }`}>
            {priceStatus === "spike" ? "⚠ SPIKE ACTIVE" : priceStatus === "elevated" ? "↑ Elevating" : "Stable"}
          </p>
        </div>
      </div>

      {/* Filter pills */}
      <div className="mb-4 flex gap-2">
        {[
          { id: "all", label: `All (${enriched.length})` },
          { id: "high", label: `High Value (${enriched.filter((e) => e.revenue > 50000).length})` },
          { id: "football", label: "Football" },
          { id: "basketball", label: "Basketball" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              filter === f.id
                ? "border-[#3b82f6] bg-[#1e3a8a]/50 text-white"
                : "border-slate-700 text-slate-400 hover:border-slate-500"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Event table */}
      <div className="overflow-hidden rounded-2xl border border-slate-700">
        <div className="grid grid-cols-12 bg-[#0a1020] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500">
          <span className="col-span-4">Event</span>
          <span className="col-span-2">Date</span>
          <span className="col-span-1 text-right">Att.</span>
          <span className="col-span-1 text-right">MW</span>
          <span className="col-span-2 text-right">Revenue</span>
          <span className="col-span-2 text-right">Action</span>
        </div>
        <div className="divide-y divide-slate-800/60 bg-[#050914]">
          {filtered.map((ev) => {
            const dispatched = dispatchedEventIds.has(ev.id);
            const hot = ev.revenue > 100000;
            return (
              <div key={ev.id} className={`grid grid-cols-12 items-center px-4 py-3 text-sm transition hover:bg-[#0d1426]/60 ${hot ? "border-l-2 border-[#f97316]" : ""}`}>
                <div className="col-span-4">
                  <p className="font-semibold text-slate-100 truncate">
                    {CATEGORY_ICON[ev.category] || "🏟"} {ev.name}
                  </p>
                  <p className="text-xs text-slate-500">{ev.venue}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-300">{fmtDate(ev.startAt)}</p>
                  <p className="text-xs text-slate-500">{fmtTime(ev.endAt)} end</p>
                </div>
                <span className="col-span-1 text-right text-xs text-slate-400">
                  {ev.attendance >= 1000 ? `${(ev.attendance / 1000).toFixed(0)}K` : ev.attendance}
                </span>
                <span className={`col-span-1 text-right text-xs font-bold ${hot ? "text-[#f97316]" : "text-slate-300"}`}>
                  {ev.projectedMW.toFixed(0)}
                </span>
                <span className={`col-span-2 text-right text-xs font-black ${hot ? "text-[#f97316]" : "text-slate-200"}`}>
                  ${ev.revenue >= 1000 ? `${(ev.revenue / 1000).toFixed(0)}K` : ev.revenue}
                </span>
                <div className="col-span-2 flex justify-end">
                  {dispatched ? (
                    <span className="rounded-full bg-[#22c55e]/20 px-2 py-0.5 text-xs font-bold text-[#22c55e]">✓ Dispatched</span>
                  ) : (
                    <button
                      onClick={() => { setSelectedId(ev.id); onDispatch(); }}
                      className="rounded-lg bg-[#3b82f6] px-3 py-1 text-xs font-bold text-white transition hover:bg-[#2563eb]"
                    >
                      Dispatch →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── REVENUE SCREEN ──────────────────────────────────────────────────────────
// The "result" screen. Shows season projection + what you've captured this session.

function RevenueScreen({ events, dispatchHistory, ercotPrice }) {
  const seasonOpportunity = useMemo(() =>
    Math.round(events.reduce((a, ev) => a + getProjectedMW(ev) * 140, 0)),
    [events]
  );
  const sessionRevenue = useMemo(() =>
    Math.round(dispatchHistory.reduce((a, e) => a + e.projectedMW * e.spread * 0.72, 0)),
    [dispatchHistory]
  );
  const sessionBatteries = dispatchHistory.reduce((a, e) => a + e.batteries, 0);
  const pctCaptured = seasonOpportunity > 0 ? Math.min(100, (sessionRevenue / seasonOpportunity) * 100) : 0;

  const animSession = useAnimatedCount(sessionRevenue);
  const animSeason = useAnimatedCount(Math.round(seasonOpportunity / 1000));

  // Revenue by category
  const byCategory = useMemo(() => {
    const map = {};
    events.forEach((ev) => {
      const cat = ev.category || "Other";
      const rev = Math.round(getProjectedMW(ev) * 140);
      map[cat] = (map[cat] || 0) + rev;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [events]);
  const maxCatRev = byCategory[0]?.[1] || 1;

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-[#040814] p-6">
      <h2 className="text-2xl font-black text-white">Revenue Dashboard</h2>
      <p className="mt-1 text-sm text-slate-400">
        Season projection vs. what you've captured this session
      </p>

      {/* Top metrics */}
      <div className="mt-5 grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-[#22c55e]/40 bg-[#0d1426] p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Captured this session</p>
          <p className="mt-2 text-4xl font-black text-[#22c55e]">${animSession.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate-500">{dispatchHistory.length} dispatch{dispatchHistory.length !== 1 ? "es" : ""} confirmed</p>
        </div>
        <div className="rounded-2xl border border-[#3b82f6]/40 bg-[#0d1426] p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Season opportunity</p>
          <p className="mt-2 text-4xl font-black text-[#3b82f6]">${animSeason.toLocaleString()}K</p>
          <p className="mt-1 text-xs text-slate-500">across all {events.length} UT events</p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-[#0d1426] p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Batteries deployed</p>
          <p className="mt-2 text-4xl font-black text-white">{sessionBatteries.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate-500">units across all dispatches</p>
        </div>
      </div>

      {/* Season progress bar */}
      <div className="mt-4 rounded-2xl border border-slate-700 bg-[#0d1426] p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Season capture progress</p>
          <p className="text-xs font-bold text-slate-300">{pctCaptured.toFixed(1)}% captured</p>
        </div>
        <div className="h-3 w-full rounded-full bg-[#0b1223] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#22c55e] transition-all duration-1000"
            style={{ width: `${pctCaptured}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-500">
          <span>$0</span>
          <span>${(seasonOpportunity / 1000).toFixed(0)}K full season</span>
        </div>
      </div>

      {/* Revenue by sport */}
      <div className="mt-4 rounded-2xl border border-slate-700 bg-[#0d1426] p-5">
        <p className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-400">
          Season opportunity by sport
        </p>
        <div className="space-y-2.5">
          {byCategory.map(([cat, rev]) => (
            <div key={cat} className="flex items-center gap-3">
              <span className="w-[150px] shrink-0 text-xs text-slate-300">
                {CATEGORY_ICON[cat] || "🏟"} {cat}
              </span>
              <div className="relative flex-1 h-4 rounded bg-[#0b1223]">
                <div
                  className="absolute inset-y-0 left-0 rounded transition-all duration-700"
                  style={{
                    width: `${(rev / maxCatRev) * 100}%`,
                    background: rev === maxCatRev ? "#f97316" : "#3b82f6",
                  }}
                />
              </div>
              <span className="w-[60px] shrink-0 text-right text-xs font-bold text-slate-200">
                ${(rev / 1000).toFixed(0)}K
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Dispatch history */}
      {dispatchHistory.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-700">
          <div className="grid grid-cols-5 bg-[#0a1020] px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
            <span>When</span>
            <span className="col-span-2">Event</span>
            <span className="text-right">Batteries</span>
            <span className="text-right">Spread</span>
          </div>
          <div className="divide-y divide-slate-800 bg-[#050914]">
            {dispatchHistory.map((e) => (
              <div key={e.id} className="grid grid-cols-5 items-center px-4 py-3 text-sm">
                <span className="text-xs text-slate-500">{fmtDateTime(e.when)}</span>
                <div className="col-span-2">
                  <p className="font-semibold text-slate-100">{e.name}</p>
                  <p className="text-xs text-slate-500">{e.venue}</p>
                </div>
                <span className="text-right text-slate-300">{e.batteries.toLocaleString()}</span>
                <span className="text-right font-bold text-[#22c55e]">${e.spread}/MWh</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dispatchHistory.length === 0 && (
        <div className="mt-4 rounded-2xl border border-slate-700 bg-[#0d1426] p-8 text-center">
          <p className="text-3xl">⚡</p>
          <p className="mt-2 font-semibold text-slate-300">No dispatches yet</p>
          <p className="mt-1 text-sm text-slate-500">Go to Intel, pick a high-value event, and hit Dispatch.</p>
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

function App() {
  const events = useMemo(() => loadEventModel(), []);
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const venueMarkerRef = useRef(null);
  const pulseTimerRef = useRef(null);

  const [tab, setTab] = useState("overview");
  const [selectedId, setSelectedId] = useState(events[0]?.id ?? "");
  const [dispatchBrief, setDispatchBrief] = useState("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState("");
  const [dispatchConfirmed, setDispatchConfirmed] = useState(false);
  const [morphLoading, setMorphLoading] = useState(false);
  const [morphLog, setMorphLog] = useState([]);
  const [morphLogDone, setMorphLogDone] = useState(false);
  const [sessionRevenue, setSessionRevenue] = useState(0);
  const [sessionWindowClosed, setSessionWindowClosed] = useState(false);
  const [ercotPrice, setErcotPrice] = useState(42);
  const [priceHistory, setPriceHistory] = useState(() => Array(24).fill(42));
  const [spreadValue, setSpreadValue] = useState(0);
  const [dispatchHistory, setDispatchHistory] = useState([]);
  const rampTarget = useRef(null);
  const rampStart = useRef(null);
  const rampInitial = useRef(42);
  const revenueTimerRef = useRef(null);

  const selectedEvent = useMemo(() => events.find((ev) => ev.id === selectedId) ?? events[0], [events, selectedId]);

  const overlaps = useMemo(() => {
    if (!selectedEvent) return [];
    return events
      .filter((ev) => ev.id !== selectedEvent.id)
      .filter((ev) => ev.startAt < selectedEvent.endAt && ev.endAt > selectedEvent.startAt)
      .slice(0, 4);
  }, [events, selectedEvent]);

  const stats = useMemo(() => {
    if (!selectedEvent) return { projectedMW: 0, batteriesNeeded: 0, preChargeBy: "-", revenueEstimate: 0 };
    const projectedMW = getProjectedMW(selectedEvent);
    return {
      projectedMW,
      batteriesNeeded: Math.round(projectedMW * 136),
      preChargeBy: subtractMinutes(selectedEvent.endTime, 90),
      revenueEstimate: Math.round(projectedMW * Math.max(110, ercotPrice - 32)),
    };
  }, [selectedEvent, ercotPrice]);

  const dispatchedEventIds = useMemo(() => new Set(dispatchHistory.map((d) => d.eventId)), [dispatchHistory]);

  // ── Map init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const mapboxgl = getMapbox();
    if (!mapNodeRef.current || !mapboxgl || mapRef.current) return;
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? "";
    const map = new mapboxgl.Map({
      container: mapNodeRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: AUSTIN_CENTER, zoom: 10.1, attributionControl: false,
    });
    mapRef.current = map;
    map.on("load", () => {
      const src = (id) => map.addSource(id, { type:"geojson", data:{ type:"FeatureCollection", features:[] } });
      src("zip-points");
      map.addLayer({ id:"zip-layer", type:"circle", source:"zip-points",
        paint:{ "circle-color":"#3b82f6", "circle-radius":14, "circle-opacity":0.15,
          "circle-stroke-color":"#3b82f6", "circle-stroke-width":1.5, "circle-stroke-opacity":0.6 } });
      map.addLayer({ id:"zip-labels", type:"symbol", source:"zip-points",
        layout:{ "text-field":["get","zip"], "text-size":11,
          "text-font":["Open Sans Semibold","Arial Unicode MS Bold"], "text-offset":[0,0] },
        paint:{ "text-color":"#93c5fd", "text-halo-color":"#0a0e1a", "text-halo-width":1.2 } });
      src("battery-swarm");
      map.addLayer({ id:"battery-swarm-layer", type:"circle", source:"battery-swarm",
        paint:{ "circle-radius":3.5, "circle-color":["get","color"], "circle-opacity":0.85,
          "circle-stroke-width":0.5, "circle-stroke-color":"#0f172a" } });
      src("overlap-points");
      map.addLayer({ id:"overlap-layer", type:"circle", source:"overlap-points",
        paint:{ "circle-color":"#22d3ee", "circle-radius":6, "circle-opacity":0.9,
          "circle-stroke-color":"#0f172a", "circle-stroke-width":1.2 } });
      // Venue marker — canvas circle, no DOM element, no positioning bugs
      src("venue-point");
      map.addLayer({ id:"venue-pulse-layer", type:"circle", source:"venue-point",
        paint:{ "circle-radius":18, "circle-color":"#ef4444", "circle-opacity":0.25, "circle-blur":0.4 } });
      map.addLayer({ id:"venue-dot-layer", type:"circle", source:"venue-point",
        paint:{ "circle-radius":10, "circle-color":["get","color"],
          "circle-stroke-width":3, "circle-stroke-color":"#ffffff", "circle-opacity":1 } });
    });
    return () => {
      if (pulseTimerRef.current) clearInterval(pulseTimerRef.current);
      map.remove(); mapRef.current = null;
    };
  }, []);

  // ── Map layers update ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedEvent) return;
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      map.flyTo({ center: [selectedEvent.lng, selectedEvent.lat], zoom: 12, speed: 0.8, curve: 1.2 });

      const zip = map.getSource("zip-points");
      if (zip) zip.setData({ type:"FeatureCollection", features:
        selectedEvent.affectedZips.map((z) => {
          const c = ZIP_COORDS[z]; if (!c) return null;
          return { type:"Feature", properties:{ zip:z }, geometry:{ type:"Point", coordinates:c } };
        }).filter(Boolean)
      });

      const ovl = map.getSource("overlap-points");
      if (ovl) ovl.setData({ type:"FeatureCollection", features:
        overlaps.map((ev) => ({ type:"Feature", properties:{}, geometry:{ type:"Point", coordinates:[ev.lng, ev.lat] } }))
      });

      // Battery swarm — deterministic positions per ZIP (no jumping on re-render)
      // Scale dot count with event size
      const dotsPerZip = Math.max(5, Math.min(18, Math.round(selectedEvent.attendance / 1500)));
      const batteryColor = dispatchConfirmed ? "#22c55e" : "#f97316";
      const swarmFeatures = [];
      selectedEvent.affectedZips.forEach((zip, zi) => {
        const c = ZIP_COORDS[zip]; if (!c) return;
        const zipSeed = zip.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0);
        for (let i = 0; i < dotsPerZip; i++) {
          const dx = (seededRand(zipSeed * 7 + zi * 31 + i * 97) - 0.5) * 0.014;
          const dy = (seededRand(zipSeed * 13 + zi * 17 + i * 53) - 0.5) * 0.014;
          swarmFeatures.push({
            type:"Feature",
            properties:{ color: batteryColor },
            geometry:{ type:"Point", coordinates:[c[0] + dx, c[1] + dy] },
          });
        }
      });
      const swarm = map.getSource("battery-swarm");
      if (swarm) swarm.setData({ type:"FeatureCollection", features: swarmFeatures });

      // Venue dot — canvas circle, color reflects current dispatch state
      const venueColor = dispatchConfirmed ? "#22c55e" : "#ef4444";
      const venueSource = map.getSource("venue-point");
      if (venueSource) {
        venueSource.setData({ type:"FeatureCollection", features:[{
          type:"Feature",
          properties:{ color: venueColor },
          geometry:{ type:"Point", coordinates:[selectedEvent.lng, selectedEvent.lat] }
        }]});
        map.setPaintProperty("venue-pulse-layer", "circle-color", venueColor);
      }

      // Pulse animation only when not dispatched
      if (pulseTimerRef.current) clearInterval(pulseTimerRef.current);
      if (!dispatchConfirmed) {
        let growing = true; let r = 18;
        pulseTimerRef.current = setInterval(() => {
          if (!mapRef.current) return;
          r = growing ? r + 1.2 : r - 1.2;
          if (r >= 26) growing = false;
          if (r <= 14) growing = true;
          try { mapRef.current.setPaintProperty("venue-pulse-layer", "circle-radius", r); } catch(_) {}
        }, 60);
      }
    };
    if (map.isStyleLoaded()) apply(); else map.once("load", apply);
  }, [selectedEvent, dispatchConfirmed, overlaps]);


  // ── Reset on event change — also immediately reset map colors to pre-dispatch ──
  useEffect(() => {
    setDispatchConfirmed(false);
    setDispatchBrief(""); setBriefError("");
    setMorphLog([]); setMorphLogDone(false);
    setSessionRevenue(0); setSessionWindowClosed(false);
    if (revenueTimerRef.current) clearInterval(revenueTimerRef.current);

    // Immediately reset map visuals without waiting for next render
    const map = mapRef.current;
    if (map && map.isStyleLoaded() && selectedEvent) {
      const venueSource = map.getSource("venue-point");
      if (venueSource) {
        venueSource.setData({ type:"FeatureCollection", features:[{
          type:"Feature",
          properties:{ color:"#ef4444" },
          geometry:{ type:"Point", coordinates:[selectedEvent.lng, selectedEvent.lat] }
        }]});
        try { map.setPaintProperty("venue-pulse-layer", "circle-color", "#ef4444"); } catch(_) {}
      }
      const swarm = map.getSource("battery-swarm");
      if (swarm) {
        const dotsPerZip = Math.max(5, Math.min(18, Math.round(selectedEvent.attendance / 1500)));
        const features = [];
        selectedEvent.affectedZips.forEach((zip, zi) => {
          const c = ZIP_COORDS[zip]; if (!c) return;
          const zipSeed = zip.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0);
          for (let i = 0; i < dotsPerZip; i++) {
            features.push({
              type:"Feature",
              properties:{ color:"#f97316" },
              geometry:{ type:"Point", coordinates:[
                c[0] + (seededRand(zipSeed * 7 + zi * 31 + i * 97) - 0.5) * 0.014,
                c[1] + (seededRand(zipSeed * 13 + zi * 17 + i * 53) - 0.5) * 0.014,
              ]},
            });
          }
        });
        swarm.setData({ type:"FeatureCollection", features });
      }
    }
  }, [selectedEvent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── ERCOT ticker ──────────────────────────────────────────────────────────
  useEffect(() => {
    const ticker = setInterval(() => {
      setErcotPrice((prev) => {
        const move = Math.random() * 14 - 7;
        let next = prev + move;
        if (rampTarget.current && rampStart.current) {
          const progress = Math.min((Date.now() - rampStart.current) / 1000 / 24, 1);
          const target = rampInitial.current + (rampTarget.current - rampInitial.current) * progress;
          next = Math.max(next, target);
          if (progress >= 1) rampStart.current = null;
        }
        const clamped = Math.max(20, Math.min(450, Number(next.toFixed(2))));
        setPriceHistory((ph) => [...ph.slice(-23), clamped]);
        return clamped;
      });
    }, 5000);
    return () => clearInterval(ticker);
  }, []);

  useEffect(() => {
    rampInitial.current = ercotPrice;
    rampTarget.current = 160 + Math.random() * 230;
    rampStart.current = Date.now();
  }, [selectedEvent?.id]);

  // ── Start revenue ticker after Morph log finishes ─────────────────────────
  useEffect(() => {
    if (!morphLogDone || !selectedEvent) return;
    if (revenueTimerRef.current) clearInterval(revenueTimerRef.current);
    const windowStart = Date.now();
    const intervalMs = 2000;
    const windowMs = 90000;
    const mw = getProjectedMW(selectedEvent);
    revenueTimerRef.current = setInterval(() => {
      if (Date.now() - windowStart >= windowMs) {
        clearInterval(revenueTimerRef.current);
        setSessionWindowClosed(true);
        return;
      }
      const tick = Math.round(mw * (8 + Math.random() * 12));
      setSessionRevenue((prev) => prev + tick);
    }, intervalMs);
    return () => { if (revenueTimerRef.current) clearInterval(revenueTimerRef.current); };
  }, [morphLogDone, selectedEvent]);

  // ── AI brief ─────────────────────────────────────────────────────────────
  function getMockBrief() {
    if (!selectedEvent) return "";
    return `DISPATCH ALERT — ${selectedEvent.name} at ${selectedEvent.venue} projects ${stats.projectedMW.toFixed(1)} MW spike across ZIPs ${selectedEvent.affectedZips.join(", ")} at dispersal (${selectedEvent.endTime}). Pre-charge ${stats.batteriesNeeded.toLocaleString()} batteries by ${stats.preChargeBy} with priority routing to nearest circuits. ${overlaps.length > 0 ? `${overlaps.length} concurrent event${overlaps.length > 1 ? "s" : ""} active — hold 12% reserve.` : "No concurrent events in this window."} Expected capture: $${stats.revenueEstimate.toLocaleString()}.`;
  }

  async function requestDispatchBrief() {
    if (!selectedEvent) return;
    setBriefLoading(true); setBriefError(""); setDispatchBrief("");
    const key = import.meta.env.VITE_GROQ_API_KEY ?? "";
    if (!key) {
      await new Promise((r) => setTimeout(r, 800));
      setDispatchBrief(getMockBrief()); setBriefLoading(false); return;
    }
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${key}` },
        body: JSON.stringify({
          model:"llama-3.3-70b-versatile",
          messages:[
            { role:"system", content:"You are GridPulse, an AI ops system. Write terse, operator-grade dispatch briefs. No markdown. Max 4 sentences." },
            { role:"user", content:`Event: ${selectedEvent.name} at ${selectedEvent.venue}. End: ${selectedEvent.endTime}. Attendance: ${selectedEvent.attendance.toLocaleString()}. Temp: ${selectedEvent.tempF}°F. Demand spike: ${stats.projectedMW.toFixed(1)} MW. Batteries: ${stats.batteriesNeeded.toLocaleString()}. ZIPs: ${selectedEvent.affectedZips.join(", ")}. Concurrent events: ${overlaps.length}. Generate dispatch brief.` },
          ],
          temperature: 0.3,
        }),
      });
      if (!res.ok) throw new Error(`Groq error (${res.status})`);
      const data = await res.json();
      setDispatchBrief(data?.choices?.[0]?.message?.content?.trim() || "No brief returned.");
    } catch (err) {
      setBriefError(err.message);
    } finally {
      setBriefLoading(false);
    }
  }

  // ── Confirm dispatch ──────────────────────────────────────────────────────
  async function confirmDispatch() {
    if (!selectedEvent) return;
    setMorphLoading(true);
    try {
      const morphKey = import.meta.env.VITE_MORPH_API_KEY ?? "";
      if (morphKey) {
        const res = await fetch("/morph-api/v1/chat/completions", {
          method:"POST",
          headers:{ "Content-Type":"application/json", Authorization:`Bearer ${morphKey}` },
          body: JSON.stringify({
            model:"morph-v3-fast",
            messages:[
              { role:"system", content:"You confirm battery dispatch actions for a grid ops workflow." },
              { role:"user", content:`Confirm: ${JSON.stringify({ event:selectedEvent.name, batteries:stats.batteriesNeeded, zips:selectedEvent.affectedZips, preChargeBy:stats.preChargeBy })}\nBrief: ${dispatchBrief}` },
            ],
            temperature: 0.2,
          }),
        });
        if (!res.ok) throw new Error(`Morph error (${res.status})`);
        await res.json();
      } else {
        await new Promise((r) => setTimeout(r, 600));
      }

      const spread = Math.max(20, Math.round(ercotPrice - 42));
      setDispatchConfirmed(true);
      setSpreadValue(spread);

      // Build and print Morph log line by line
      const bpz = Math.round(stats.batteriesNeeded / selectedEvent.affectedZips.length);
      const lines = [
        "> Morph: Parsing dispatch state...",
        `> Morph: Verified ${stats.batteriesNeeded.toLocaleString()} target units`,
        ...selectedEvent.affectedZips.map((zip) => `> Morph: Routing ${bpz.toLocaleString()} units → ZIP ${zip}`),
        `> Morph: Pre-charge sequence ACTIVE`,
        `> Morph: Discharge window locked · ${selectedEvent.endTime}`,
        `✓ ALL UNITS CONFIRMED`,
      ];
      lines.forEach((line, i) => {
        setTimeout(() => {
          setMorphLog((prev) => [...prev, line]);
          if (i === lines.length - 1) setMorphLogDone(true);
        }, i * 380);
      });

      setDispatchHistory((prev) => [{
        id: `${selectedEvent.id}-${Date.now()}`,
        eventId: selectedEvent.id,
        name: selectedEvent.name,
        venue: selectedEvent.venue,
        when: new Date(),
        batteries: stats.batteriesNeeded,
        spread,
        projectedMW: Number(stats.projectedMW.toFixed(1)),
      }, ...prev]);
    } catch (err) {
      setMorphLog([`✗ Error: ${err.message || "Dispatch failed."}`]);
    } finally {
      setMorphLoading(false);
    }
  }

  const step = dispatchConfirmed ? 3 : dispatchBrief ? 2 : 1;

  if (!selectedEvent) {
    return <div className="flex h-screen items-center justify-center bg-[#040814] text-slate-400">Loading…</div>;
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#040814] text-white">

      {/* Header */}
      <header className="relative z-30 flex h-[60px] items-center justify-between border-b border-slate-800 bg-[#040814]/95 px-5 backdrop-blur">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black">Grid<span className="text-[#3b82f6]">Pulse</span></h1>
          <span className="hidden rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-500 sm:block">
            Base Power · Austin
          </span>
        </div>
        <nav className="flex gap-1.5">
          {[
            { id:"overview", label:"Overview" },
            { id:"intel", label:"Opportunities", badge: 0 },
            { id:"map", label:"Map Ops" },
            { id:"revenue", label:"Revenue" },
          ].map((t) => (
            <TabBtn key={t.id} active={tab === t.id} onClick={() => setTab(t.id)} badge={t.id === "revenue" ? dispatchHistory.length : 0}>
              {t.label}
            </TabBtn>
          ))}
        </nav>
        <div className="flex items-center gap-3 font-mono text-sm">
          <span className={`text-xs font-bold ${ercotPrice > 150 ? "text-[#f97316]" : ercotPrice > 80 ? "text-yellow-400" : "text-slate-300"}`}>
            ERCOT ${ercotPrice.toFixed(0)}/MWh
          </span>
          {dispatchConfirmed && (
            <span className="rounded-full bg-[#22c55e]/20 px-2.5 py-0.5 text-xs font-bold text-[#22c55e]">
              ✓ ${spreadValue}/MWh active
            </span>
          )}
        </div>
      </header>

      {/* Map always mounted — hidden under solid overlay on non-map tabs */}
      <div className="absolute inset-x-0 bottom-0 top-[60px]" style={{ zIndex: 0 }}>
        <div ref={mapNodeRef} className="h-full w-full" />
      </div>

      {/* Non-map screens — solid bg covers the map completely */}
      {tab !== "map" && (
        <div className="absolute inset-x-0 bottom-0 top-[60px] z-20 overflow-auto bg-[#040814]">
          {tab === "overview" && (
            <OverviewScreen events={events} onEnter={() => setTab("intel")} />
          )}
          {tab === "intel" && (
            <IntelScreen
              events={events}
              ercotPrice={ercotPrice}
              priceHistory={priceHistory}
              setSelectedId={setSelectedId}
              onDispatch={() => setTab("map")}
              dispatchedEventIds={dispatchedEventIds}
            />
          )}
          {tab === "revenue" && (
            <RevenueScreen
              events={events}
              dispatchHistory={dispatchHistory}
              ercotPrice={ercotPrice}
            />
          )}
        </div>
      )}

      {/* Map Ops overlays */}
      {tab === "map" && (
        <>
          {/* Step indicator */}
          <div className="absolute left-1/2 top-[70px] z-20 -translate-x-1/2">
            <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-[#0d1426]/95 px-5 py-2 text-xs backdrop-blur">
              {[{ n:1, label:"Select Event" }, { n:2, label:"Generate Brief" }, { n:3, label:"Confirm Dispatch" }].map((s, i) => (
                <div key={s.n} className="flex items-center gap-1.5">
                  {i > 0 && <span className="mx-1 text-slate-600">—</span>}
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
                    step > s.n ? "bg-[#22c55e] text-white" : step === s.n ? "bg-[#3b82f6] text-white" : "bg-slate-700 text-slate-400"
                  }`}>
                    {step > s.n ? "✓" : s.n}
                  </span>
                  <span className={step >= s.n ? "text-white font-medium" : "text-slate-500"}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Left: event + stats */}
          <aside className="absolute left-4 top-[112px] z-20 w-[340px] rounded-2xl border border-slate-700/70 bg-[#0d1426]/95 p-4 shadow-2xl backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-wide text-[#3b82f6]">Dispatch Console</p>
            <div className="mt-3">
              <select
                value={selectedEvent.id}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-[#111a30] px-3 py-2 text-sm text-slate-100 outline-none transition hover:border-[#3b82f6] focus:border-[#3b82f6]"
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name} ({fmtDate(ev.startAt)})</option>
                ))}
              </select>
            </div>
            <div className="mt-3 rounded-lg border border-slate-700 bg-[#0b1223] p-3 text-sm">
              <p className="font-semibold text-slate-100">{selectedEvent.venue}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {fmtDateTime(selectedEvent.startAt)} · ends {fmtTime(selectedEvent.endAt)} · {selectedEvent.tempF}°F
              </p>
              {overlaps.length > 0 && (
                <p className="mt-1 text-xs font-semibold text-[#f97316]">
                  ⚠ {overlaps.length} concurrent event{overlaps.length > 1 ? "s" : ""} detected
                </p>
              )}
            </div>
            <div className="mt-3 space-y-1.5">
              <StatRow label="Attendance" value={selectedEvent.attendance.toLocaleString()} />
              <StatRow label="Projected Demand" value={`${stats.projectedMW.toFixed(1)} MW`} />
              <StatRow label="Batteries to Stage" value={stats.batteriesNeeded.toLocaleString()} />
              <StatRow label="Pre-Charge By" value={stats.preChargeBy} />
              <StatRow label="Revenue Potential" value={`$${stats.revenueEstimate.toLocaleString()}`} />
            </div>
            <button
              onClick={requestDispatchBrief}
              disabled={briefLoading || dispatchConfirmed}
              className="mt-3 w-full rounded-lg bg-[#3b82f6] px-3 py-2.5 text-sm font-bold text-white transition hover:bg-[#2563eb] disabled:opacity-40"
            >
              {briefLoading ? "Generating…" : "Generate AI Dispatch Brief"}
            </button>
          </aside>

          {/* Map legend */}
          <div className="absolute bottom-5 left-4 z-20 rounded-xl border border-slate-700/70 bg-[#0d1426]/95 px-4 py-3 text-xs backdrop-blur">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Map Legend</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white bg-[#ef4444] shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
                <span className="text-slate-300">Event venue</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#f97316]" />
                <span className="text-slate-300">Battery cluster (standby)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
                <span className="text-slate-300">Battery cluster (dispatched)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border border-[#3b82f6]/60 bg-[#3b82f6]/15" />
                <span className="text-slate-300">Affected ZIP zone</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#22d3ee]" />
                <span className="text-slate-300">Concurrent event</span>
              </div>
            </div>
          </div>

          {/* Right: brief + dispatch + morph log + revenue */}
          <section className="absolute right-4 top-[112px] z-20 w-[440px] rounded-2xl border border-slate-700/70 bg-[#0d1426]/95 p-4 shadow-2xl backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-wide text-[#3b82f6]">AI Dispatch Brief</p>
            <div className="mt-2 min-h-[180px] rounded-lg border border-slate-700 bg-[#050914] p-3 font-mono text-sm">
              {briefLoading && (
                <div className="flex items-center gap-3 text-slate-300">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#3b82f6] border-t-transparent" />
                  Querying Groq dispatch model…
                </div>
              )}
              {!briefLoading && briefError && <p className="text-[#f97316]">Error: {briefError}</p>}
              {!briefLoading && dispatchBrief && (
                <p className="whitespace-pre-line leading-relaxed text-slate-100">{dispatchBrief}</p>
              )}
              {!briefLoading && !briefError && !dispatchBrief && (
                <p className="text-slate-500">Select an event and generate a brief to build the dispatch order.</p>
              )}
            </div>

            {dispatchBrief && !dispatchConfirmed && (
              <>
                <div className="mt-3 rounded-lg border border-slate-700 bg-[#0b1223] p-3 text-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Deployment Order</p>
                  <p className="mt-1.5 text-slate-200">
                    Stage <span className="font-bold text-[#3b82f6]">{stats.batteriesNeeded.toLocaleString()}</span> batteries
                    for zones {selectedEvent.affectedZips.join(", ")} by{" "}
                    <span className="font-bold text-[#f97316]">{stats.preChargeBy}</span>.
                  </p>
                </div>
                <button
                  onClick={confirmDispatch}
                  disabled={morphLoading}
                  className="mt-3 w-full rounded-lg bg-[#f97316] px-3 py-3 text-sm font-bold text-white transition hover:bg-[#ea580c] disabled:opacity-50"
                >
                  {morphLoading ? "Executing…" : "⚡ Confirm Dispatch with Morph"}
                </button>
              </>
            )}

            {/* Morph execution log */}
            {morphLog.length > 0 && (
              <div className="mt-3 rounded-lg border border-[#22c55e]/30 bg-[#020a04] p-3 font-mono text-xs">
                {morphLog.map((line, i) => (
                  <p
                    key={i}
                    className={line.startsWith("✓") ? "mt-1 text-sm font-bold text-white" : "text-[#22c55e]"}
                  >
                    {line}
                  </p>
                ))}
                {!morphLogDone && (
                  <span className="mt-1 inline-block h-3 w-1.5 animate-pulse bg-[#22c55e]" />
                )}
              </div>
            )}

            {/* Live revenue counter */}
            {morphLogDone && (
              <div className="mt-3 rounded-lg border border-[#22c55e]/40 bg-[#05200f] p-3">
                <div className="flex items-center gap-2">
                  {!sessionWindowClosed && (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
                    </span>
                  )}
                  <p className="text-xs font-semibold text-slate-300">
                    {sessionWindowClosed ? "Spike window closed" : "Base Power capturing spread"}
                  </p>
                </div>
                <p className="mt-1 text-2xl font-black text-[#22c55e]">${sessionRevenue.toLocaleString()}</p>
                <p className="text-xs text-slate-500">captured this dispatch window</p>
                <button
                  onClick={() => setTab("revenue")}
                  className="mt-2 w-full rounded-md border border-[#22c55e]/40 bg-[#0b2a1a] px-3 py-1.5 text-xs font-bold text-[#22c55e] transition hover:bg-[#0f3322]"
                >
                  View Revenue Dashboard →
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default App;
