import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import utEventsCsv from "./data/UT_Sports_Events.csv?raw";
import energyUsageCsv from "./data/Facility_Energy_Usage.csv?raw";
import capacitiesCsv from "./data/venues_capcity.csv?raw";
import { Zap, Activity, Clock, TrendingUp, ChevronRight, BarChart2, Map as MapIcon, BookOpen, X } from "lucide-react";

// =====================================================================
// CONSTANTS
// =====================================================================

const FLEET_SIZE = 4200; // Base Power Austin deployed batteries as of 2025
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
  "Moody Center": { lat: 30.2874, lng: -97.7359, zips: ["78705", "78751", "78752", "78756"] },
  "DKR-Texas Memorial Stadium": { lat: 30.2837, lng: -97.7326, zips: ["78705", "78751", "78752", "78756"] },
  "UFCU Disch-Falk Field": { lat: 30.2829, lng: -97.7283, zips: ["78705", "78751", "78752"] },
  "Texas Tennis Center": { lat: 30.2893, lng: -97.7316, zips: ["78705", "78751"] },
  "Weller Tennis Center": { lat: 30.2878, lng: -97.7292, zips: ["78705", "78751"] },
  "Lee and Joe Jamail Texas Swimming Center": { lat: 30.2866, lng: -97.7352, zips: ["78705", "78751"] },
  "Red & Charline McCombs Field": { lat: 30.2798, lng: -97.7223, zips: ["78702", "78705", "78751"] },
  "Wright-Whitaker Sports Complex": { lat: 30.2503, lng: -97.7191, zips: ["78702", "78744"] },
  "Mike A. Myers Stadium and Soccer Field": { lat: 30.2814, lng: -97.7306, zips: ["78705", "78751", "78752"] },
};

const CATEGORY_OCCUPANCY = {
  Football: 0.96,
  "Men's Basketball": 0.88,
  "Women's Basketball": 0.76,
  Baseball: 0.68,
  Softball: 0.72,
  Soccer: 0.63,
  "Men's Tennis": 0.84,
  "Women's Tennis": 0.82,
  "Men's Swimming and Diving": 0.74,
  "Women's Swimming and Diving": 0.72,
  "Beach Volleyball": 0.78,
  default: 0.68,
};

// Realistic end times by sport (used when CSV data is missing or shows 1-4 AM)
const SPORT_END_TIMES = {
  Football: "10:30 PM",
  "Men's Basketball": "9:30 PM",
  "Women's Basketball": "9:30 PM",
  Baseball: "9:00 PM",
  Softball: "8:30 PM",
  Soccer: "8:00 PM",
  "Men's Tennis": "5:30 PM",
  "Women's Tennis": "5:30 PM",
  "Men's Swimming and Diving": "5:00 PM",
  "Women's Swimming and Diving": "5:00 PM",
  "Beach Volleyball": "7:00 PM",
  default: "8:00 PM",
};

// ERCOT Operating Condition price tiers (real ERCOT concept)
const ERCOT_TIERS = [
  { label: "Normal", max: 50, color: "#22c55e", bg: "#052010", border: "#166534", desc: "Normal grid operations" },
  { label: "Elevated", max: 150, color: "#eab308", bg: "#1a1500", border: "#713f12", desc: "Above-average demand — watch for spikes" },
  { label: "Critical", max: 500, color: "#f97316", bg: "#1a0800", border: "#7c2d12", desc: "High demand spike — dispatch advised" },
  { label: "Emergency", max: Infinity, color: "#ef4444", bg: "#1a0000", border: "#7f1d1d", desc: "Emergency pricing — maximize dispatch" },
];

// 35 battery cluster locations in suburban residential neighborhoods (~120 each = ~4,200 total).
// Deliberately placed in single-family home areas — NOT on the UT campus or downtown.
const BATTERY_CLUSTERS = [
  // Tarrytown / West Austin (78703) — residential streets west of MoPac
  { id: "bc01", lng: -97.7720, lat: 30.2960, zip: "78703", count: 122 },
  { id: "bc02", lng: -97.7810, lat: 30.2880, zip: "78703", count: 115 },
  { id: "bc03", lng: -97.7680, lat: 30.2820, zip: "78703", count: 129 },

  // Hyde Park (78705) — north of campus, actual residential neighborhood
  { id: "bc04", lng: -97.7390, lat: 30.3180, zip: "78705", count: 118 },
  { id: "bc05", lng: -97.7440, lat: 30.3250, zip: "78705", count: 108 },
  { id: "bc06", lng: -97.7350, lat: 30.3120, zip: "78705", count: 124 },

  // Rosedale / Brentwood (78756) — quiet suburban streets
  { id: "bc07", lng: -97.7480, lat: 30.3310, zip: "78756", count: 131 },
  { id: "bc08", lng: -97.7550, lat: 30.3390, zip: "78756", count: 119 },
  { id: "bc09", lng: -97.7420, lat: 30.3420, zip: "78756", count: 113 },

  // North Loop / Crestview (78751) — residential
  { id: "bc10", lng: -97.7260, lat: 30.3220, zip: "78751", count: 126 },
  { id: "bc11", lng: -97.7180, lat: 30.3150, zip: "78751", count: 117 },

  // Windsor Park (78752) — suburban east side
  { id: "bc12", lng: -97.7080, lat: 30.3350, zip: "78752", count: 122 },
  { id: "bc13", lng: -97.6990, lat: 30.3440, zip: "78752", count: 114 },
  { id: "bc14", lng: -97.7150, lat: 30.3480, zip: "78752", count: 120 },

  // South Congress / Travis Heights (78704) — residential south of the river
  { id: "bc15", lng: -97.7560, lat: 30.2440, zip: "78704", count: 125 },
  { id: "bc16", lng: -97.7660, lat: 30.2360, zip: "78704", count: 119 },
  { id: "bc17", lng: -97.7480, lat: 30.2360, zip: "78704", count: 112 },

  // East Austin residential streets (78702)
  { id: "bc18", lng: -97.7110, lat: 30.2580, zip: "78702", count: 120 },
  { id: "bc19", lng: -97.7030, lat: 30.2670, zip: "78702", count: 128 },
  { id: "bc20", lng: -97.7180, lat: 30.2720, zip: "78702", count: 116 },

  // East Austin further east (78721)
  { id: "bc21", lng: -97.6930, lat: 30.2790, zip: "78721", count: 108 },
  { id: "bc22", lng: -97.6850, lat: 30.2660, zip: "78721", count: 113 },

  // South Manchaca / Slaughter area (78745) — classic suburban grid
  { id: "bc23", lng: -97.7700, lat: 30.2200, zip: "78745", count: 122 },
  { id: "bc24", lng: -97.7820, lat: 30.2090, zip: "78745", count: 118 },
  { id: "bc25", lng: -97.7590, lat: 30.2060, zip: "78745", count: 126 },

  // Manchaca / Slaughter Creek (78748) — far south suburbs
  { id: "bc26", lng: -97.8080, lat: 30.1860, zip: "78748", count: 110 },
  { id: "bc27", lng: -97.8190, lat: 30.1750, zip: "78748", count: 106 },
  { id: "bc28", lng: -97.7990, lat: 30.1680, zip: "78748", count: 117 },

  // Southwest Austin (78749) — Circle C / Westgate suburbs
  { id: "bc29", lng: -97.8410, lat: 30.2260, zip: "78749", count: 124 },
  { id: "bc30", lng: -97.8530, lat: 30.2150, zip: "78749", count: 119 },

  // Northwest Austin (78750) — Anderson Mill suburbs
  { id: "bc31", lng: -97.7910, lat: 30.3870, zip: "78750", count: 130 },
  { id: "bc32", lng: -97.8050, lat: 30.3760, zip: "78750", count: 121 },

  // Crestview / St John's (78757) — dense single-family
  { id: "bc33", lng: -97.7410, lat: 30.3560, zip: "78757", count: 127 },
  { id: "bc34", lng: -97.7520, lat: 30.3650, zip: "78757", count: 114 },
  { id: "bc35", lng: -97.7310, lat: 30.3610, zip: "78757", count: 120 },
];

// Approximate crowd dispersal routes per venue (following real Austin roads)
const VENUE_DISPERSAL_ROUTES = {
  "DKR-Texas Memorial Stadium": [
    { id: "r1", label: "→ 78751 / 78752", coords: [[-97.7326, 30.2837], [-97.7300, 30.2950], [-97.7280, 30.3100], [-97.7240, 30.3280]] },
    { id: "r2", label: "→ 78702 (E)", coords: [[-97.7326, 30.2837], [-97.7200, 30.2837], [-97.7100, 30.2800], [-97.6980, 30.2760]] },
    { id: "r3", label: "→ 78705 (N)", coords: [[-97.7326, 30.2837], [-97.7360, 30.2920], [-97.7400, 30.3000]] },
    { id: "r4", label: "→ 78703 (W)", coords: [[-97.7326, 30.2837], [-97.7480, 30.2840], [-97.7620, 30.2870], [-97.7720, 30.2940]] },
    { id: "r5", label: "→ 78752 (I-35)", coords: [[-97.7326, 30.2837], [-97.7200, 30.2900], [-97.7080, 30.3100], [-97.7050, 30.3340]] },
  ],
  "Moody Center": [
    { id: "r1", label: "→ 78751 / 78752", coords: [[-97.7359, 30.2874], [-97.7330, 30.3000], [-97.7280, 30.3150], [-97.7240, 30.3300]] },
    { id: "r2", label: "→ 78702 (E)", coords: [[-97.7359, 30.2874], [-97.7200, 30.2860], [-97.7080, 30.2820], [-97.6980, 30.2760]] },
    { id: "r3", label: "→ 78705 (N)", coords: [[-97.7359, 30.2874], [-97.7380, 30.2960], [-97.7420, 30.3040]] },
    { id: "r4", label: "→ 78703 (W)", coords: [[-97.7359, 30.2874], [-97.7500, 30.2880], [-97.7650, 30.2900], [-97.7750, 30.2960]] },
  ],
  "UFCU Disch-Falk Field": [
    { id: "r1", label: "→ 78751 (N)", coords: [[-97.7283, 30.2829], [-97.7280, 30.2960], [-97.7260, 30.3100]] },
    { id: "r2", label: "→ 78702 (E)", coords: [[-97.7283, 30.2829], [-97.7140, 30.2820], [-97.7010, 30.2780]] },
    { id: "r3", label: "→ 78704 (S)", coords: [[-97.7283, 30.2829], [-97.7300, 30.2700], [-97.7340, 30.2550]] },
    { id: "r4", label: "→ 78703 (W)", coords: [[-97.7283, 30.2829], [-97.7420, 30.2850], [-97.7580, 30.2890]] },
  ],
  "Mike A. Myers Stadium and Soccer Field": [
    { id: "r1", label: "→ 78751 (N)", coords: [[-97.7306, 30.2814], [-97.7290, 30.2960], [-97.7260, 30.3100]] },
    { id: "r2", label: "→ 78702 (E)", coords: [[-97.7306, 30.2814], [-97.7160, 30.2800], [-97.7020, 30.2760]] },
    { id: "r3", label: "→ 78705 (N)", coords: [[-97.7306, 30.2814], [-97.7350, 30.2900], [-97.7400, 30.3000]] },
    { id: "r4", label: "→ 78704 (S)", coords: [[-97.7306, 30.2814], [-97.7330, 30.2680], [-97.7370, 30.2520]] },
  ],
  "Wright-Whitaker Sports Complex": [
    { id: "r1", label: "→ 78702 (N)", coords: [[-97.7191, 30.2503], [-97.7170, 30.2650], [-97.7140, 30.2800]] },
    { id: "r2", label: "→ 78744 (S)", coords: [[-97.7191, 30.2503], [-97.7200, 30.2350], [-97.7220, 30.2200]] },
    { id: "r3", label: "→ 78704 (W)", coords: [[-97.7191, 30.2503], [-97.7350, 30.2500], [-97.7520, 30.2500]] },
  ],
};

// Default to DKR routes for venues without specific routes defined
const getRoutes = (venue) =>
  VENUE_DISPERSAL_ROUTES[venue] ?? VENUE_DISPERSAL_ROUTES["DKR-Texas Memorial Stadium"];

// Projected post-event load increase by ZIP (percentage over baseline)
const ZIP_LOAD_PCT = {
  "78705": [190, 140, 90],
  "78751": [160, 120, 80],
  "78752": [140, 100, 70],
  "78756": [150, 110, 75],
  "78703": [130, 90, 60],
  "78702": [120, 85, 55],
  "78704": [110, 80, 55],
  "78701": [125, 85, 55],
  "78721": [100, 70, 45],
  "78744": [90, 65, 40],
  "78748": [80, 60, 35],
  "78617": [70, 50, 30],
};

// =====================================================================
// UTILITY FUNCTIONS
// =====================================================================

function getMapbox() {
  if (typeof window === "undefined" || !window.mapboxgl) return null;
  return window.mapboxgl;
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function to12Hour(totalMinutes) {
  const minutesInDay = ((totalMinutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(minutesInDay / 60);
  const minutes = minutesInDay % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function subtractMinutes(timeStr, delta) {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return timeStr;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3].toUpperCase();
  if (meridiem === "AM" && hours === 12) hours = 0;
  if (meridiem === "PM" && hours !== 12) hours += 12;
  return to12Hour(hours * 60 + minutes - delta);
}

function timeStrTo24h(timeStr) {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return "21:00:00";
  let h = Number(match[1]);
  const m = Number(match[2]);
  const suf = match[3].toUpperCase();
  if (suf === "PM" && h !== 12) h += 12;
  if (suf === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function cleanTimeValue(raw) {
  if (!raw) return "";
  return raw.replaceAll("?", "").replaceAll(".", "").replace(/CT/i, "").replace(/\s+/g, " ").trim();
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
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
    parseCsvLine(line).forEach((val, i) => { row[headers[i]] = val ?? ""; });
    return row;
  });
}

function parseDateTime(dateText, timeText) {
  if (!dateText) return null;
  const [month, day, year] = dateText.split("/").map(Number);
  if (!month || !day || !year) return null;
  const cleaned = cleanTimeValue(timeText);
  let hours = 19, minutes = 0;
  if (cleaned && !/TBA/i.test(cleaned)) {
    const m = cleaned.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (m) {
      hours = Number(m[1]);
      minutes = Number(m[2] || 0);
      const suf = m[3].toUpperCase();
      if (suf === "AM" && hours === 12) hours = 0;
      if (suf === "PM" && hours !== 12) hours += 12;
    }
  }
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function estimateTempF(date) {
  const month = date.getMonth() + 1;
  if (month >= 6 && month <= 9) return 95;
  if (month >= 4 && month <= 5) return 85;
  if (month >= 10 && month <= 11) return 78;
  return 66;
}

// Fix CSV end times that fall in 1-4 AM range (likely parsing artifact)
function getRealisticEndTime(category, csvEndDate) {
  if (csvEndDate) {
    const h = csvEndDate.getHours();
    if (h < 1 || h > 4) {
      return to12Hour(h * 60 + csvEndDate.getMinutes());
    }
  }
  return SPORT_END_TIMES[category] ?? SPORT_END_TIMES.default;
}

// Realistic battery count per event (capped at fleet size)
function getRealisticBatteries(event) {
  const BASE = {
    Football: 1000,
    "Men's Basketball": 280,
    "Women's Basketball": 220,
    Baseball: 210,
    Softball: 170,
    Soccer: 155,
    "Men's Tennis": 75,
    "Women's Tennis": 75,
    "Men's Swimming and Diving": 60,
    "Women's Swimming and Diving": 60,
    "Beach Volleyball": 70,
    default: 90,
  };
  const base = BASE[event.category] ?? BASE.default;
  const tempFactor = event.tempF > 90 ? 1.25 : event.tempF > 78 ? 1.1 : 1.0;
  // Scale football by how full the stadium is vs. a sold-out game
  const attendanceFactor = event.category === "Football" ? event.attendance / 95000 : 1.0;
  return Math.min(FLEET_SIZE, Math.max(50, Math.round(base * tempFactor * attendanceFactor)));
}

// Revenue spread per battery based on ERCOT price tier
function getSpreadPerBattery(ercotPrice) {
  if (ercotPrice < 50) return 8;
  if (ercotPrice < 100) return 12;
  if (ercotPrice < 150) return 18;
  if (ercotPrice < 250) return 22;
  return 25;
}

// Estimated Austin-wide grid load increase (crowd going home + AC)
function getProjectedMW(event) {
  const tempFactor = event.tempF > 90 ? 1.8 : event.tempF > 78 ? 1.3 : 1.0;
  return Math.round(event.attendance * 0.00003 * tempFactor * 10) / 10;
}

function getErcotTier(price) {
  return ERCOT_TIERS.find((t) => price < t.max) ?? ERCOT_TIERS[ERCOT_TIERS.length - 1];
}

function buildDispatchPayload(event, batteriesNeeded, preChargeBy, ercotPrice) {
  const spread = getSpreadPerBattery(ercotPrice);
  const d = event.startAt;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const seq = String(Math.floor(Math.random() * 900) + 100).padStart(3, "0");
  const chargeByStr = timeStrTo24h(preChargeBy);
  const endH = event.endAt.getHours();
  const endM = String(event.endAt.getMinutes()).padStart(2, "0");
  const disEnd = `${String((endH + 1) % 24).padStart(2, "0")}:${endM}:00`;
  return {
    dispatch_id: `GP-${year}-${month}${day}-${seq}`,
    event: event.name,
    batteries: batteriesNeeded,
    zip_codes: event.affectedZips,
    charge_target: 0.95,
    charge_by: chargeByStr,
    discharge_window: `${String(endH).padStart(2, "0")}:${endM}:00–${disEnd}`,
    estimated_spread_per_battery: `$${spread.toFixed(2)}`,
    estimated_total_capture: `$${(batteriesNeeded * spread).toLocaleString()}`,
  };
}

// Geographic radius in meters for each cluster based on battery count.
// A cluster of ~120 batteries covers roughly an 800m-radius neighborhood.
// Range: 60 batteries → 200m, 140 batteries → 900m (4.5x size spread)
function clusterRadiusM(count) {
  return Math.round(200 + (count - 60) * ((900 - 200) / (140 - 60)));
}

// GeoJSON for battery cluster dots — color and radius driven by active state
function buildClustersGeoJSON(activatedSet) {
  return {
    type: "FeatureCollection",
    features: BATTERY_CLUSTERS.map((c) => ({
      type: "Feature",
      properties: {
        id: c.id,
        zip: c.zip,
        count: c.count,
        active: activatedSet.has(c.id),
        // Geographic radius so circles represent real neighborhood coverage
        radiusM: clusterRadiusM(c.count),
      },
      geometry: { type: "Point", coordinates: [c.lng, c.lat] },
    })),
  };
}

// =====================================================================
// DATA LOADING
// =====================================================================

function loadEventModel() {
  const capacities = new Map(
    parseCsv(capacitiesCsv).map((r) => [r.Venue, Number(r.Capacity || 0)])
  );
  const energyUsage = new Map(
    parseCsv(energyUsageCsv).map((r) => [r["Center Name"], Number(r["Energy Usage"] || 1)])
  );

  return parseCsv(utEventsCsv)
    .map((row, index) => {
      const facility = row.Facility?.trim();
      const coords = FACILITY_COORDS[facility];
      if (!facility || !coords) return null;

      const startDate = parseDateTime(row["Start Date"], row["Start Time"]);
      if (!startDate) return null;
      let endDate = parseDateTime(row["End Date"], row["End Time"]);
      if (!endDate) endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
      if (endDate < startDate) endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);

      const capacity = capacities.get(facility) ?? 3500;
      const occupancy = CATEGORY_OCCUPANCY[row.Category] ?? CATEGORY_OCCUPANCY.default;
      const attendance = Math.max(250, Math.round(capacity * occupancy));
      const tempF = estimateTempF(startDate);
      const energyProfile = energyUsage.get(facility) ?? 1;
      const endTimeLabel = getRealisticEndTime(row.Category, endDate);

      return {
        id: `${row.Event}-${index}`,
        name: row.Event,
        category: row.Category,
        venue: facility,
        lat: coords.lat,
        lng: coords.lng,
        attendance,
        startAt: startDate,
        endAt: endDate,
        endTime: endTimeLabel,
        tempF,
        energyUsage: energyProfile,
        affectedZips: coords.zips,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startAt - b.startAt);
}

// =====================================================================
// APP COMPONENT
// =====================================================================

function formatDateLabel(dateKey) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  }).format(new Date(dateKey));
}

function App() {
  const events = useMemo(() => loadEventModel(), []);
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const animTimers = useRef([]);
  const activatedClustersRef = useRef(new Set());
  const dispatchEventIdRef = useRef(null);

  // Group all events by calendar date
  const eventsByDate = useMemo(() => {
    const map = new Map();
    events.forEach((e) => {
      const key = e.startAt.toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    });
    return map;
  }, [events]);

  // Sorted list of unique date keys
  const dateList = useMemo(
    () => Array.from(eventsByDate.keys()).sort((a, b) => new Date(a) - new Date(b)),
    [eventsByDate]
  );

  const [tab, setTab] = useState("dashboard");
  const [selectedDate, setSelectedDate] = useState(() => dateList[0] ?? "");
  const [dispatchBrief, setDispatchBrief] = useState("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState("");
  const [dispatchConfirmed, setDispatchConfirmed] = useState(false);
  const [morphLoading, setMorphLoading] = useState(false);
  const [dispatchPayload, setDispatchPayload] = useState(null);
  const [ercotPrice, setErcotPrice] = useState(52);
  const [ercotIsSimulated, setErcotIsSimulated] = useState(true);
  const [dispatchHistory, setDispatchHistory] = useState([]);
  const [activatingCount, setActivatingCount] = useState(0);
  const [showDispatchCard, setShowDispatchCard] = useState(false);
  const [layerVis, setLayerVis] = useState({
    batteryClusters: true,
    demandZones: true,
  });
  const [legendPos, setLegendPos] = useState({ x: 0, y: 0 });

  function handleLegendMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    let lastX = e.clientX;
    let lastY = e.clientY;
    const onMove = (ev) => {
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      setLegendPos((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const rampTargetRef = useRef(null);
  const rampStartRef = useRef(null);
  const rampInitRef = useRef(52);

  // All events on the selected date — this replaces the single selectedEvent concept
  const eventsOnDate = useMemo(
    () => eventsByDate.get(selectedDate) ?? [],
    [eventsByDate, selectedDate]
  );

  // All unique ZIPs affected by any event on this date
  const allAffectedZips = useMemo(
    () => [...new Set(eventsOnDate.flatMap((e) => e.affectedZips))],
    [eventsOnDate]
  );

  // Aggregate stats across all events on the selected date
  const stats = useMemo(() => {
    if (eventsOnDate.length === 0) {
      return { projectedMW: 0, batteriesNeeded: 0, preChargeBy: "-", revenueEstimate: 0, spreadPerBattery: 0 };
    }
    const projectedMW =
      Math.round(eventsOnDate.reduce((s, e) => s + getProjectedMW(e), 0) * 10) / 10;
    // Cap combined batteries at fleet size
    const batteriesNeeded = Math.min(
      FLEET_SIZE,
      eventsOnDate.reduce((s, e) => s + getRealisticBatteries(e), 0)
    );
    // Pre-charge deadline = 90 min before the EARLIEST event ending that day
    const earliest = eventsOnDate.reduce((a, e) => (!a || e.endAt < a.endAt ? e : a), null);
    const preChargeBy = earliest ? subtractMinutes(earliest.endTime, 90) : "-";
    const spread = getSpreadPerBattery(ercotPrice);
    return { projectedMW, batteriesNeeded, preChargeBy, revenueEstimate: batteriesNeeded * spread, spreadPerBattery: spread };
  }, [eventsOnDate, ercotPrice]);

  const kpi = useMemo(() => {
    if (eventsOnDate.length === 0) return { eventsOnDate: 0, upcomingDates: 0, projectedRevenue: 0 };
    const refDate = eventsOnDate[0].startAt;
    // How many distinct dates with events are coming up in the next 7 days
    const upcomingDates = dateList.filter((dk) => {
      const d = new Date(dk);
      return d >= refDate && d <= new Date(refDate.getTime() + 7 * 86400000);
    }).length;
    const spread = getSpreadPerBattery(ercotPrice);
    const projectedRevenue = eventsOnDate.reduce((acc, e) => acc + getRealisticBatteries(e) * spread, 0);
    return { eventsOnDate: eventsOnDate.length, upcomingDates, projectedRevenue };
  }, [eventsOnDate, dateList, ercotPrice]);

  // ===== MAP INITIALIZATION =====
  useEffect(() => {
    const mapboxgl = getMapbox();
    if (!mapNodeRef.current || !mapboxgl || mapRef.current) return;
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

    const map = new mapboxgl.Map({
      container: mapNodeRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: AUSTIN_CENTER,
      zoom: 11,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      // --- Venue marker as Mapbox circle layer (always correctly positioned) ---
      map.addSource("venue", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      // Outer halo
      map.addLayer({
        id: "venue-halo",
        type: "circle",
        source: "venue",
        paint: {
          "circle-radius": 28,
          "circle-color": "#ef4444",
          "circle-opacity": 0.2,
          "circle-blur": 0.6,
        },
      });
      // Inner dot
      map.addLayer({
        id: "venue-dot",
        type: "circle",
        source: "venue",
        paint: {
          "circle-radius": 11,
          "circle-color": ["case", ["get", "confirmed"], "#22c55e", "#ef4444"],
          "circle-opacity": 0.95,
          "circle-stroke-color": "white",
          "circle-stroke-width": 2.5,
          "circle-blur": 0,
        },
      });

      // Venue click popup
      const mapboxgl = getMapbox();
      const venuePopup = new mapboxgl.Popup({ offset: 20, closeButton: true });
      map.on("click", "venue-dot", (e) => {
        const p = e.features[0].properties;
        venuePopup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="map-popup"><strong>${p.venue}</strong><br/>` +
            `${p.eventName}<br/>Ends ~${p.endTime} · ${p.attendance} expected<br/>` +
            `Temp: ${p.tempF}°F</div>`
          )
          .addTo(map);
      });
      map.on("mouseenter", "venue-dot", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "venue-dot", () => { map.getCanvas().style.cursor = ""; });

      // --- Battery cluster dots ---
      map.addSource("battery-clusters", {
        type: "geojson",
        data: buildClustersGeoJSON(new Set()),
      });
      map.addLayer({
        id: "battery-clusters-layer",
        type: "circle",
        source: "battery-clusters",
        paint: {
          // Green when dispatched, gray when standby — color only, never size
          "circle-color": ["case", ["get", "active"], "#22c55e", "#9ca3af"],
          // Geographic radius: scales with zoom so each circle always covers the same
          // real-world area. Factor = px/m at Austin latitude (~30.3°).
          // At zoom 10: ~0.0152 px/m → at zoom 14: ~0.2432 px/m (doubles every zoom level)
          "circle-radius": [
            "interpolate", ["exponential", 2], ["zoom"],
            10, ["*", ["get", "radiusM"], 0.0152],
            14, ["*", ["get", "radiusM"], 0.2432],
          ],
          // 50% opacity for both states — map always visible underneath
          "circle-opacity": 0.5,
          "circle-stroke-color": ["case", ["get", "active"], "#16a34a", "#6b7280"],
          "circle-stroke-width": 1.5,
          "circle-blur": 0.2,
        },
      });

      // Battery cluster hover tooltip
      const clusterPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
      map.on("mouseenter", "battery-clusters-layer", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const p = e.features[0].properties;
        const status = p.active ? "Pre-charging to 95%" : "Standby (~70% charge)";
        clusterPopup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="map-popup"><strong>Battery Cluster — ZIP ${p.zip}</strong><br/>` +
            `Units: ~${p.count}<br/>Status: ${status}</div>`
          )
          .addTo(map);
      });
      map.on("mouseleave", "battery-clusters-layer", () => {
        map.getCanvas().style.cursor = "";
        clusterPopup.remove();
      });

      // --- Demand zones (colored circles at ZIP centroids) ---
      map.addSource("demand-zones", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "demand-zones-fill",
        type: "circle",
        source: "demand-zones",
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 52,
          "circle-opacity": 0.28,
          "circle-blur": 0.65,
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-width": 1.5,
          "circle-stroke-opacity": 0.5,
        },
      });
      map.addLayer({
        id: "demand-zones-labels",
        type: "symbol",
        source: "demand-zones",
        layout: {
          // Label shows ZIP, the demand surge %, and how many Base Power batteries
          // are deployed in that neighborhood ready to absorb the spike
          "text-field": [
            "concat",
            "ZIP ", ["get", "zip"], "\n",
            "+", ["get", "loadPct"], "% surge expected\n",
            ["get", "batteries"], " batteries deployed",
          ],
          "text-size": 10,
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-anchor": "center",
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#f1f5f9",
          "text-halo-color": "#0a0e1a",
          "text-halo-width": 1.5,
        },
      });

      // ZIP zone click popup — explains the numbers in plain language
      const zonePopup = new mapboxgl.Popup({ closeButton: true });
      map.on("click", "demand-zones-fill", (e) => {
        const p = e.features[0].properties;
        const covered = p.batteries >= 80 ? "✓ Sufficient coverage" : "⚠ Limited coverage";
        zonePopup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="map-popup">` +
            `<strong>ZIP ${p.zip} — Demand Forecast</strong><br/><br/>` +
            `<strong>+${p.loadPct}% surge expected</strong><br/>` +
            `When fans leave the venue and arrive home, AC units, TVs, and appliances all turn on at once — spiking this neighborhood's grid load ${p.loadPct}% above normal.<br/><br/>` +
            `<strong>${p.batteries} Base Power batteries installed here</strong><br/>` +
            `These are home batteries already sitting in customers' houses in this ZIP — idle right now. They don't do anything useful until a dispatch command is sent.<br/><br/>` +
            `<strong>What dispatch does:</strong> sends a pre-charge command to all ${p.batteries} of these batteries, telling them to charge to 95% before the event ends. When the surge hits, they discharge into the home instead of drawing from the grid — capturing the price spread.<br/><br/>` +
            `Coverage: ${covered}` +
            `</div>`
          )
          .addTo(map);
      });

      // Overlap events are listed in the side panel — no map dots needed
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ===== SINGLE ATOMIC DATE-CHANGE EFFECT =====
  // Handles reset + rebuild atomically whenever the selected date changes.
  useEffect(() => {
    if (eventsOnDate.length === 0) return;

    // 1. Cancel timers and reset animation state
    animTimers.current.forEach(clearTimeout);
    animTimers.current = [];
    dispatchEventIdRef.current = null;
    activatedClustersRef.current = new Set();

    // 2. Reset UI state
    setDispatchConfirmed(false);
    setDispatchPayload(null);
    setDispatchBrief("");
    setBriefError("");
    setActivatingCount(0);
    setShowDispatchCard(false);

    // 3. Rebuild map for all events on this date
    const build = () => {
      const map = mapRef.current;
      if (!map) return;

      // Fly to center of all venues on this date
      const avgLng = eventsOnDate.reduce((s, e) => s + e.lng, 0) / eventsOnDate.length;
      const avgLat = eventsOnDate.reduce((s, e) => s + e.lat, 0) / eventsOnDate.length;
      map.flyTo({
        center: [avgLng - 0.018, avgLat],
        zoom: eventsOnDate.length > 1 ? 11.8 : 12.5,
        speed: 0.65,
        curve: 1.2,
        duration: 1500,
      });

      // Venue dots — one per event on the date
      const venueSrc = map.getSource("venue");
      if (venueSrc) {
        venueSrc.setData({
          type: "FeatureCollection",
          features: eventsOnDate.map((ev) => ({
            type: "Feature",
            properties: {
              venue: ev.venue,
              eventName: ev.name,
              endTime: ev.endTime,
              attendance: ev.attendance.toLocaleString(),
              tempF: ev.tempF,
              confirmed: false,
            },
            geometry: { type: "Point", coordinates: [ev.lng, ev.lat] },
          })),
        });
      }

      // Battery clusters — all gray until dispatch
      const clusterSrc = map.getSource("battery-clusters");
      if (clusterSrc) clusterSrc.setData(buildClustersGeoJSON(new Set()));

      // Demand zones — combine load from ALL events affecting each ZIP
      const zipMap = new Map(); // zip -> {loadPct, batteries}
      eventsOnDate.forEach((ev) => {
        ev.affectedZips.forEach((zip, i) => {
          const tiers = ZIP_LOAD_PCT[zip] ?? [100, 70, 45];
          const loadPct = i < 2 ? tiers[0] : i < 4 ? tiers[1] : tiers[2];
          const batteries =
            BATTERY_CLUSTERS.filter((c) => c.zip === zip).reduce((s, c) => s + c.count, 0) ||
            Math.round(getRealisticBatteries(ev) / ev.affectedZips.length);
          if (zipMap.has(zip)) {
            // Two events hitting same ZIP compounds the surge
            const cur = zipMap.get(zip);
            cur.loadPct = Math.min(280, cur.loadPct + Math.round(loadPct * 0.6));
          } else {
            zipMap.set(zip, { loadPct, batteries });
          }
        });
      });

      const demandFeatures = [...zipMap.entries()]
        .map(([zip, { loadPct, batteries }]) => {
          const coords = ZIP_COORDS[zip];
          if (!coords) return null;
          const color = loadPct > 160 ? "#dc2626" : loadPct > 120 ? "#f97316" : loadPct > 80 ? "#eab308" : "#fef08a";
          return {
            type: "Feature",
            properties: { zip, loadPct, color, batteries },
            geometry: { type: "Point", coordinates: coords },
          };
        })
        .filter(Boolean);

      const demandSrc = map.getSource("demand-zones");
      if (demandSrc) demandSrc.setData({ type: "FeatureCollection", features: demandFeatures });
    };

    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) build();
    else map.once("load", build);
  }, [eventsOnDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update venue dot colors when dispatch is confirmed
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || eventsOnDate.length === 0) return;
    const src = map.getSource("venue");
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: eventsOnDate.map((ev) => ({
        type: "Feature",
        properties: {
          venue: ev.venue,
          eventName: ev.name,
          endTime: ev.endTime,
          attendance: ev.attendance.toLocaleString(),
          tempF: ev.tempF,
          confirmed: dispatchConfirmed,
        },
        geometry: { type: "Point", coordinates: [ev.lng, ev.lat] },
      })),
    });
  }, [dispatchConfirmed, eventsOnDate]);

  // ===== LAYER VISIBILITY TOGGLES =====
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const vis = (on) => (on ? "visible" : "none");
    const set = (id, v) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v); };
    set("battery-clusters-layer", vis(layerVis.batteryClusters));
    set("demand-zones-fill", vis(layerVis.demandZones));
    set("demand-zones-labels", vis(layerVis.demandZones));
    // Venue layers always visible
    set("venue-halo", "visible");
    set("venue-dot", "visible");
  }, [layerVis]);

  // ===== ERCOT PRICE — try real API, fall back to simulated =====
  useEffect(() => {
    (async () => {
      try {
        // ERCOT public API — likely CORS-blocked from browser, we catch and fallback
        const res = await fetch(
          "https://api.ercot.com/api/public-reports/np6-905-cd/spp_node_zone_hub?deliveryDateFrom=today&size=1",
          { signal: AbortSignal.timeout(3000) }
        );
        if (res.ok) {
          const data = await res.json();
          const price = data?.[0]?.settlementPoint?.price;
          if (typeof price === "number" && price > 0) {
            setErcotPrice(price);
            setErcotIsSimulated(false);
            return;
          }
        }
      } catch {
        // Expected: CORS or auth failure
      }
      setErcotIsSimulated(true);
    })();
  }, []);

  useEffect(() => {
    const ticker = setInterval(() => {
      setErcotPrice((prev) => {
        // Small cosmetic jitter ±2 around the current date's base price
        const jitter = (Math.random() - 0.5) * 4;
        return Math.max(18, Math.min(500, Number((prev + jitter).toFixed(2))));
      });
    }, 3500);
    return () => clearInterval(ticker);
  }, []);

  useEffect(() => {
    if (!selectedDate) return;

    // Deterministic seed from the date string so same date → same price
    const seed = selectedDate.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const seededRand = (offset = 0) => {
      const x = Math.sin(seed + offset) * 10000;
      return x - Math.floor(x); // 0–1
    };

    const d = new Date(selectedDate);
    const month = d.getMonth() + 1; // 1–12
    const dow = d.getDay();         // 0 Sun … 6 Sat

    // Seasonal base: Texas summer is brutal, winter mild
    let base;
    if (month >= 6 && month <= 9)       base = 85;   // Jun–Sep: hot/AC-heavy
    else if (month >= 4 && month <= 5)  base = 52;   // Apr–May: spring warmup
    else if (month >= 10 && month <= 11) base = 48;  // Oct–Nov: mild fall
    else                                 base = 38;  // Dec–Mar: lowest demand

    // Weekend bump — more activity, fans driving, AC running late
    const weekendBonus = (dow === 0 || dow === 6) ? 18 : (dow === 5 ? 10 : 0);

    // Event load factor: total attendance across all events drives price spike
    const totalAttendance = eventsOnDate.reduce((s, e) => s + e.attendance, 0);
    const attendanceBonus = Math.min(60, totalAttendance / 1200);

    // Sport premium: football events have 3× the grid footprint of tennis
    const hasBigEvent = eventsOnDate.some((e) =>
      ["Football", "Men's Basketball", "Women's Basketball"].includes(e.category)
    );
    const bigEventBonus = hasBigEvent ? 25 : 0;

    // Noise: ±15 deterministic per-date variation
    const noise = (seededRand(1) - 0.5) * 30;

    const newPrice = Math.max(22, Math.min(420, base + weekendBonus + attendanceBonus + bigEventBonus + noise));

    // Snap immediately to the new date's price, then let the ticker jitter around it
    setErcotPrice(Number(newPrice.toFixed(2)));
    rampInitRef.current = newPrice;
    rampTargetRef.current = null;
    rampStartRef.current = null;
  }, [selectedDate, eventsOnDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== DISPATCH ANIMATION =====
  function runDispatchAnimation(affectedZips, batteriesNeeded, dateKey) {
    const eventId = dateKey;
    const map = mapRef.current;
    // Stamp which event this animation belongs to
    dispatchEventIdRef.current = eventId;

    const affected = BATTERY_CLUSTERS.filter((c) => affectedZips.includes(c.zip));
    const total = Math.max(1, affected.length);
    const interval = Math.floor(3000 / total);

    // Phase 1 (0–3s): activate clusters sequentially, near venue first
    affected.forEach((cluster, i) => {
      const t = setTimeout(() => {
        // Abort if the user switched to a different event
        if (dispatchEventIdRef.current !== eventId) return;
        // Update the ref and push directly to Mapbox — no React state, no race
        activatedClustersRef.current.add(cluster.id);
        const src = mapRef.current?.getSource("battery-clusters");
        if (src) src.setData(buildClustersGeoJSON(activatedClustersRef.current));
        setActivatingCount(Math.min(batteriesNeeded, Math.round((batteriesNeeded * (i + 1)) / total)));
      }, i * interval);
      animTimers.current.push(t);
    });

    // Phase 2 (3s): turn dispersal route lines green
    const t3 = setTimeout(() => {
      if (dispatchEventIdRef.current !== eventId) return;
      if (!map || !map.isStyleLoaded()) return;
      // Routes removed — nothing to update at phase 2
    }, 3200);
    animTimers.current.push(t3);

    // Phase 3 (5.5s): show floating dispatch card
    const t5 = setTimeout(() => {
      if (dispatchEventIdRef.current !== eventId) return;
      setShowDispatchCard(true);
    }, 5500);
    animTimers.current.push(t5);
  }

  // ===== GROQ DISPATCH BRIEF =====
  function getMockDispatchBrief() {
    if (eventsOnDate.length === 0) return "";
    const earliest = eventsOnDate.reduce((a, e) => (!a || e.endAt < a.endAt ? e : a), null);
    const chargeTime = subtractMinutes(earliest.endTime, 100);
    const nearZip = allAffectedZips[0];
    const maxTemp = Math.max(...eventsOnDate.map((e) => e.tempF));
    const tempNote =
      maxTemp > 90
        ? `At ${maxTemp}°F, AC load adds ~25% to projected demand — target 97% charge.`
        : `At ${maxTemp}°F, standard AC load expected — 95% charge target sufficient.`;
    const multiNote =
      eventsOnDate.length > 1
        ? `Risk: ${eventsOnDate.length} simultaneous events — combined ZIP demand may overlap; monitor for fleet capacity ceiling.`
        : "Risk: Monitor I-35 corridor for unexpected crowd rerouting in the discharge window.";
    const eventList = eventsOnDate.map((e) => `${e.name} at ${e.venue} (ends ${e.endTime})`).join("; ");
    return (
      `1. PRE-CHARGE: Begin at ${chargeTime} — 100 min before earliest event end.\n` +
      `2. TARGET: Charge ${stats.batteriesNeeded.toLocaleString()} batteries to 95% across ZIPs ${allAffectedZips.join(", ")}.\n` +
      `3. PRIORITY: Stage ZIP ${nearZip} first — highest projected surge from nearest venue.\n` +
      `4. WEATHER: ${tempNote}\n` +
      `5. ${multiNote}\n\nEvents covered: ${eventList}`
    );
  }

  async function requestDispatchBrief() {
    if (eventsOnDate.length === 0) return;
    setBriefLoading(true);
    setBriefError("");
    setDispatchBrief("");
    const groqKey = import.meta.env.VITE_GROQ_API_KEY ?? "";
    if (!groqKey) {
      await new Promise((r) => setTimeout(r, 800));
      setDispatchBrief(getMockDispatchBrief());
      setBriefLoading(false);
      return;
    }
    try {
      const earliest = eventsOnDate.reduce((a, e) => (!a || e.endAt < a.endAt ? e : a), null);
      const chargeTime = subtractMinutes(earliest.endTime, 100);
      const eventSummaries = eventsOnDate
        .map((e) => `- ${e.name} (${e.category}) at ${e.venue}, ends ${e.endTime}, ${e.attendance.toLocaleString()} expected, ${e.tempF}°F`)
        .join("\n");
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "You are an AI dispatch system for Base Power in Austin, TX. " +
                "Generate a precise multi-event operator dispatch brief in exactly 5 numbered points.\n\n" +
                "Format:\n1. PRE-CHARGE: [exact time]\n2. TARGET: [charge % and total batteries]\n" +
                "3. PRIORITY: [ZIP order and reasoning]\n4. WEATHER: [temp impact]\n5. RISK: [key risk]",
            },
            {
              role: "user",
              content:
                `Date: ${formatDateLabel(selectedDate)}\n` +
                `Events on this date (${eventsOnDate.length} total):\n${eventSummaries}\n\n` +
                `Total batteries to dispatch: ${stats.batteriesNeeded} of ${FLEET_SIZE.toLocaleString()}\n` +
                `All affected ZIPs: ${allAffectedZips.join(", ")}\n` +
                `Pre-charge start: ${chargeTime}\n` +
                `ERCOT price: $${ercotPrice.toFixed(0)}/MWh\n` +
                `Est. revenue: $${stats.revenueEstimate.toLocaleString()} ($${stats.spreadPerBattery}/battery)`,
            },
          ],
          temperature: 0.3,
        }),
      });
      if (!res.ok) throw new Error(`Groq API error (${res.status})`);
      const data = await res.json();
      setDispatchBrief(data?.choices?.[0]?.message?.content?.trim() || "No brief returned.");
    } catch (err) {
      setBriefError(err.message || "Unable to generate brief.");
    } finally {
      setBriefLoading(false);
    }
  }

  // ===== CONFIRM DISPATCH =====
  async function confirmDispatch() {
    if (eventsOnDate.length === 0) return;
    setMorphLoading(true);
    // Build payload covering all events on this date
    const earliest = eventsOnDate.reduce((a, e) => (!a || e.endAt < a.endAt ? e : a), null);
    const payload = buildDispatchPayload(earliest, stats.batteriesNeeded, stats.preChargeBy, ercotPrice);
    // Override zip_codes and event field to cover all events
    payload.zip_codes = allAffectedZips;
    payload.events = eventsOnDate.map((e) => ({ name: e.name, venue: e.venue, end: e.endTime }));
    delete payload.event; // replaced by .events array
    try {
      const morphKey = import.meta.env.VITE_MORPH_API_KEY ?? "";
      if (morphKey) {
        const res = await fetch("/morph-api/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${morphKey}` },
          body: JSON.stringify({
            model: "morph-v3-fast",
            messages: [
              { role: "system", content: "Validate and confirm this battery dispatch command." },
              { role: "user", content: JSON.stringify(payload, null, 2) },
            ],
            temperature: 0.1,
          }),
        });
        if (!res.ok) throw new Error(`Dispatch API error (${res.status})`);
        await res.json();
      } else {
        await new Promise((r) => setTimeout(r, 900));
      }

      setDispatchPayload(payload);
      setDispatchConfirmed(true);
      setDispatchHistory((prev) => [
        {
          id: `${selectedDate}-${Date.now()}`,
          dispatchId: payload.dispatch_id,
          date: formatDateLabel(selectedDate),
          eventCount: eventsOnDate.length,
          eventNames: eventsOnDate.map((e) => e.name).join(", "),
          when: new Date(),
          batteries: stats.batteriesNeeded,
          spreadPerBattery: stats.spreadPerBattery,
          totalCapture: stats.revenueEstimate,
          projectedMW: stats.projectedMW,
          zips: allAffectedZips,
        },
        ...prev,
      ]);
      runDispatchAnimation(allAffectedZips, stats.batteriesNeeded, selectedDate);
    } catch (err) {
      console.error("Dispatch error:", err);
    } finally {
      setMorphLoading(false);
    }
  }

  // ===== RENDER =====
  if (dateList.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-charcoal text-cream">
        <p className="font-serif italic text-2xl opacity-60">No event data available.</p>
      </div>
    );
  }

  const ercotTier = getErcotTier(ercotPrice);

  // Map ERCOT tiers to Moss/Clay palette
  const tierColor = ercotPrice < 50 ? "#2E4036" : ercotPrice < 150 ? "#a87c2a" : ercotPrice < 500 ? "#CC5833" : "#b91c1c";
  const tierBg    = ercotPrice < 50 ? "rgba(46,64,54,0.3)" : ercotPrice < 150 ? "rgba(168,124,42,0.2)" : ercotPrice < 500 ? "rgba(204,88,51,0.2)" : "rgba(185,28,28,0.2)";
  const tierBorder = ercotPrice < 50 ? "rgba(46,64,54,0.6)" : ercotPrice < 150 ? "rgba(168,124,42,0.5)" : ercotPrice < 500 ? "rgba(204,88,51,0.5)" : "rgba(185,28,28,0.5)";

  return (
    <div className="h-screen w-screen overflow-hidden bg-charcoal text-cream" style={{ fontFamily: "'Plus Jakarta Sans', 'Outfit', sans-serif" }}>

      {/* ══════════════════════════════════════════
          FLOATING PILL NAVBAR
      ══════════════════════════════════════════ */}
      <header className="absolute top-4 left-1/2 z-50 -translate-x-1/2 pointer-events-auto">
        <div className="flex items-center gap-1 rounded-full border border-[rgba(46,64,54,0.7)] bg-[rgba(30,43,36,0.88)] px-2 py-1.5 shadow-2xl backdrop-blur-xl">
          {/* Logo wordmark */}
          <div className="px-3 py-1 mr-1">
            <span className="font-sans font-bold text-sm tracking-tight text-cream">Grid</span>
            <span className="font-serif italic text-sm text-[#CC5833]">Pulse</span>
          </div>

          <div className="h-4 w-px bg-[rgba(242,240,233,0.15)]" />

          {/* Nav tabs */}
          <nav className="flex gap-0.5 px-1">
            <PillTab icon={<BarChart2 size={13}/>} active={tab === "dashboard"} onClick={() => setTab("dashboard")}>
              Dashboard
            </PillTab>
            <PillTab icon={<MapIcon size={13}/>} active={tab === "map"} onClick={() => setTab("map")}>
              Dispatch
            </PillTab>
            <PillTab icon={<BookOpen size={13}/>} active={tab === "history"} onClick={() => setTab("history")}>
              Log
            </PillTab>
          </nav>

          <div className="h-4 w-px bg-[rgba(242,240,233,0.15)]" />

          {/* ERCOT live badge */}
          <div
            className="tier-badge mx-2 flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs font-medium"
            style={{ color: tierColor, background: tierBg, border: `1px solid ${tierBorder}` }}
          >
            <span className="status-dot h-1.5 w-1.5 rounded-full" style={{ background: tierColor }} />
            ERCOT {ercotTier.label} · ${ercotPrice.toFixed(0)}/MWh
            {ercotIsSimulated && <span className="opacity-40 ml-0.5">sim</span>}
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════
          MAP + PANELS LAYER
      ══════════════════════════════════════════ */}
      <div className="relative h-full w-full">
        {/* Mapbox container */}
        <div ref={mapNodeRef} className="absolute inset-0" />

        {/* Warm organic vignette over map */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[rgba(26,26,26,0.55)] via-transparent to-[rgba(26,26,26,0.65)]" />

        {/* ── Draggable Map Legend ─────────────────────────────── */}
        <div
          className="absolute bottom-5 right-5 z-20 rounded-3xl p-3.5 text-xs select-none"
          style={{
            transform: `translate(${legendPos.x}px, ${legendPos.y}px)`,
            background: "rgba(30,43,36,0.90)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(46,64,54,0.65)",
          }}
        >
          <p
            className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-widest text-[rgba(242,240,233,0.45)] cursor-grab active:cursor-grabbing"
            onMouseDown={handleLegendMouseDown}
          >
            Map Legend
          </p>
          <div className="space-y-1.5">
            <LegendItem color="#CC5833" label="Event venue" />
            <div className="my-1.5 border-t border-[rgba(242,240,233,0.08)]" />
            <p className="text-[9px] uppercase tracking-widest text-[rgba(242,240,233,0.3)]">Battery clusters</p>
            <LegendItem color="rgba(242,240,233,0.35)" label="Idle — awaiting command" dot />
            <LegendItem color="#2E4036" label="Pre-charging — dispatched" dot />
            <div className="my-1.5 border-t border-[rgba(242,240,233,0.08)]" />
            <p className="text-[9px] uppercase tracking-widest text-[rgba(242,240,233,0.3)]">Demand surge</p>
            <LegendItem color="#b91c1c" label="&gt;160% above normal" dot />
            <LegendItem color="#CC5833" label="120–160% elevated" dot />
            <LegendItem color="#a87c2a" label="80–120% moderate" dot />
          </div>
        </div>

        {/* ── Dispatch Active Floating Badge ───────────────────── */}
        {showDispatchCard && dispatchPayload && (
          <div className="pointer-events-none absolute bottom-24 left-1/2 z-30 -translate-x-1/2">
            <div
              className="flex items-center gap-3 rounded-full px-5 py-3 font-mono text-xs shadow-2xl"
              style={{
                background: "rgba(30,43,36,0.95)",
                border: "1px solid rgba(46,64,54,0.8)",
                backdropFilter: "blur(20px)",
              }}
            >
              <span className="status-dot h-2 w-2 rounded-full bg-[#2E4036]" />
              <span className="font-semibold text-cream">{dispatchPayload.batteries.toLocaleString()} batteries pre-charging</span>
              <span className="text-[rgba(242,240,233,0.5)]">·</span>
              <span className="text-[#CC5833] font-semibold">{dispatchPayload.estimated_total_capture} est.</span>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            DASHBOARD TAB
        ══════════════════════════════════════════ */}
        {tab === "dashboard" && (
          <>
            {/* LEFT — Event Analysis */}
            <aside className="absolute left-5 top-4 z-20 w-[340px] max-h-[calc(100vh-20px)] overflow-y-auto rounded-4xl p-5 shadow-2xl panel-glass">
              <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-[rgba(242,240,233,0.4)]">
                Event Analysis
              </p>
              <h2 className="mt-1 font-serif italic text-xl text-cream leading-tight">
                Select a game date
              </h2>

              {/* Date selector */}
              <div className="mt-4">
                <label className="mb-1.5 block font-sans text-[10px] font-semibold uppercase tracking-widest text-[rgba(242,240,233,0.4)]">
                  Game Date
                </label>
                <select
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full rounded-2xl border border-[rgba(46,64,54,0.5)] bg-[rgba(26,26,26,0.6)] px-3 py-2 font-sans text-sm text-cream outline-none transition hover:border-[#CC5833] focus:border-[#CC5833]"
                >
                  {dateList.map((dk) => {
                    const count = eventsByDate.get(dk)?.length ?? 0;
                    return (
                      <option key={dk} value={dk}>
                        {formatDateLabel(dk)}{count > 1 ? ` — ${count} events` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Event list */}
              <div className="mt-3 max-h-[200px] space-y-1.5 overflow-y-auto pr-0.5">
                {eventsOnDate.map((ev) => (
                  <div
                    key={ev.id}
                    className="rounded-2xl border border-[rgba(46,64,54,0.4)] bg-[rgba(26,26,26,0.5)] px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-sans text-sm font-semibold text-cream leading-tight">{ev.name}</p>
                      <span className="font-sans text-[10px] text-[rgba(242,240,233,0.4)] mt-0.5 shrink-0">{ev.category}</span>
                    </div>
                    <p className="mt-0.5 font-sans text-xs text-[rgba(242,240,233,0.55)]">{ev.venue}</p>
                    <p className="font-mono text-[10px] text-[rgba(242,240,233,0.4)]">
                      {formatDateTime(ev.startAt)} · ends ~{ev.endTime} · {ev.attendance.toLocaleString()} ppl · {ev.tempF}°F
                    </p>
                  </div>
                ))}
              </div>

              {/* Stats */}
              <div className="mt-3 space-y-1.5">
                <OrgStatRow label="Demand increase" value={`${stats.projectedMW.toFixed(1)} MW`} />
                <OrgStatRow label="Batteries to dispatch" value={`${stats.batteriesNeeded.toLocaleString()} / ${FLEET_SIZE.toLocaleString()}`} />
                <OrgStatRow label="Pre-charge by" value={stats.preChargeBy} />
                <OrgStatRow label="Est. revenue" value={`$${stats.revenueEstimate.toLocaleString()}`} hint={`${stats.batteriesNeeded} × $${stats.spreadPerBattery}/battery`} />
              </div>

              {/* CTA */}
              <button
                onClick={() => setTab("map")}
                className="btn-magnetic mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#CC5833] px-4 py-2.5 font-sans text-sm font-semibold text-cream shadow-lg"
              >
                <span className="btn-bg rounded-full bg-[#a84628]" />
                <span className="relative z-10">Go to Dispatch</span>
                <ChevronRight size={15} className="relative z-10" />
              </button>
            </aside>

            {/* RIGHT — Operations Overview */}
            <section className="absolute right-5 top-4 z-20 w-[340px] rounded-4xl p-5 shadow-2xl panel-glass">
              <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-[rgba(242,240,233,0.4)]">
                Operations
              </p>
              <h2 className="mt-1 font-serif italic text-xl text-cream leading-tight">
                Overview
              </h2>

              {/* KPI grid */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <OrgKpiCard icon={<Activity size={14}/>} label="Events today" value={kpi.eventsOnDate} />
                <OrgKpiCard icon={<Clock size={14}/>} label="Event dates (7d)" value={kpi.upcomingDates} />
                <OrgKpiCard icon={<MapIcon size={14}/>} label="ZIPs affected" value={allAffectedZips.length} />
                <OrgKpiCard icon={<TrendingUp size={14}/>} label="Est. revenue" value={`$${Math.round(kpi.projectedRevenue).toLocaleString()}`} />
              </div>

              {/* ERCOT block */}
              <div
                className="mt-3 rounded-3xl p-3.5"
                style={{ background: tierBg, border: `1px solid ${tierBorder}` }}
              >
                <p className="font-sans text-[10px] font-semibold uppercase tracking-widest" style={{ color: tierColor }}>
                  ERCOT Price Alert
                </p>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="font-serif text-2xl font-medium" style={{ color: tierColor }}>
                    {ercotTier.label}
                  </span>
                  <span className="font-mono text-sm text-cream">
                    ${ercotPrice.toFixed(2)}<span className="text-[rgba(242,240,233,0.4)]">/MWh</span>
                    {ercotIsSimulated && <span className="ml-1 font-sans text-[10px] text-[rgba(242,240,233,0.35)]">sim</span>}
                  </span>
                </div>
                <p className="mt-1 font-sans text-xs text-[rgba(242,240,233,0.55)]">{ercotTier.desc}</p>
                <p className="mt-2 font-mono text-[9px] text-[rgba(242,240,233,0.3)]">
                  Normal &lt;$50 · Elevated $50–150 · Critical $150–500 · Emergency $500+
                </p>
              </div>
            </section>
          </>
        )}

        {/* ══════════════════════════════════════════
            DISPATCH TAB
        ══════════════════════════════════════════ */}
        {tab === "map" && (
          <>
            {/* LEFT — Dispatch Setup */}
            <aside className="absolute left-5 top-4 z-20 w-[300px] rounded-4xl p-5 shadow-2xl panel-glass">
              <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-[rgba(242,240,233,0.4)]">
                Dispatch Setup
              </p>
              <h2 className="mt-1 font-serif italic text-lg text-cream leading-tight">
                Command Center
              </h2>

              <div className="mt-3">
                <label className="mb-1.5 block font-sans text-[10px] font-semibold uppercase tracking-widest text-[rgba(242,240,233,0.4)]">
                  Game Date
                </label>
                <select
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full rounded-2xl border border-[rgba(46,64,54,0.5)] bg-[rgba(26,26,26,0.6)] px-3 py-2 font-sans text-sm text-cream outline-none transition hover:border-[#CC5833] focus:border-[#CC5833]"
                >
                  {dateList.map((dk) => {
                    const count = eventsByDate.get(dk)?.length ?? 0;
                    return (
                      <option key={dk} value={dk}>
                        {formatDateLabel(dk)}{count > 1 ? ` — ${count} events` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="mt-2 space-y-1">
                {eventsOnDate.map((ev) => (
                  <div key={ev.id} className="rounded-xl border border-[rgba(46,64,54,0.4)] bg-[rgba(26,26,26,0.5)] px-2.5 py-1.5 font-sans text-xs">
                    <span className="font-semibold text-cream">{ev.name}</span>
                    <span className="ml-2 text-[rgba(242,240,233,0.4)]">{ev.venue} · ends {ev.endTime}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 space-y-1.5">
                <OrgStatRow label="ZIPs" value={allAffectedZips.join(", ")} />
                <OrgStatRow label="Demand spike" value={`${stats.projectedMW.toFixed(1)} MW`} />
                <OrgStatRow label="Batteries" value={`${stats.batteriesNeeded.toLocaleString()} / ${FLEET_SIZE.toLocaleString()}`} />
                <OrgStatRow label="Pre-charge by" value={stats.preChargeBy} />
              </div>

              <p className="mt-3 font-sans text-[10px] text-[rgba(242,240,233,0.35)]">
                1) Generate brief → 2) Review → 3) Confirm
              </p>

              <button
                onClick={requestDispatchBrief}
                disabled={briefLoading || dispatchConfirmed}
                className="btn-magnetic mt-3 w-full rounded-full bg-[#2E4036] px-4 py-2.5 font-sans text-sm font-semibold text-cream transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="btn-bg rounded-full bg-[#1e2b24]" />
                <span className="relative z-10">
                  {briefLoading ? "Generating Brief…" : dispatchConfirmed ? "Brief Generated ✓" : "Generate AI Dispatch Brief"}
                </span>
              </button>

              {dispatchConfirmed && activatingCount > 0 && activatingCount < stats.batteriesNeeded && (
                <div className="mt-3 flex items-center gap-2 rounded-2xl border border-[rgba(46,64,54,0.5)] bg-[rgba(46,64,54,0.2)] px-3 py-2 font-mono text-xs text-cream">
                  <span className="status-dot h-1.5 w-1.5 rounded-full bg-[#2E4036]" />
                  Activating: {activatingCount.toLocaleString()} / {stats.batteriesNeeded.toLocaleString()}
                </div>
              )}
            </aside>

            {/* RIGHT — AI Dispatch Brief */}
            <section className="absolute right-5 top-4 z-20 w-[420px] max-h-[calc(100vh-20px)] overflow-y-auto rounded-4xl p-5 shadow-2xl panel-glass">
              {/* Close */}
              <button
                onClick={() => { setShowDispatchCard(false); setDispatchBrief(""); setBriefError(""); }}
                className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(242,240,233,0.15)] bg-[rgba(26,26,26,0.5)] text-[rgba(242,240,233,0.5)] transition hover:text-cream hover:border-[rgba(242,240,233,0.4)]"
              >
                <X size={12} />
              </button>

              {/* Current state banner */}
              {!dispatchConfirmed && (
                <div className="mb-4 rounded-3xl border border-[rgba(46,64,54,0.4)] bg-[rgba(26,26,26,0.4)] p-3 font-sans text-xs text-[rgba(242,240,233,0.5)]">
                  <p className="mb-1 font-semibold uppercase tracking-widest text-[rgba(242,240,233,0.35)]" style={{fontSize:"9px"}}>Current State</p>
                  <p>{stats.batteriesNeeded.toLocaleString()} batteries on standby · ZIPs {allAffectedZips.join(", ")}</p>
                  <p className="mt-0.5">No pre-charging — awaiting dispatch command</p>
                </div>
              )}

              <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-[rgba(242,240,233,0.4)]">AI Dispatch</p>
              <h2 className="mt-0.5 font-serif italic text-xl text-cream">Brief</h2>

              {/* Brief content */}
              <div className="mt-3 min-h-[160px] rounded-3xl border border-[rgba(46,64,54,0.4)] bg-[rgba(26,26,26,0.5)] p-4 font-mono text-xs text-cream">
                {briefLoading && (
                  <div className="flex items-center gap-3 text-[rgba(242,240,233,0.6)]">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#CC5833] border-t-transparent" />
                    Querying dispatch model…
                  </div>
                )}
                {!briefLoading && briefError && (
                  <p className="text-[#CC5833]">Brief unavailable: {briefError}</p>
                )}
                {!briefLoading && !briefError && dispatchBrief && (
                  <pre className="whitespace-pre-wrap leading-relaxed text-[rgba(242,240,233,0.9)]">{dispatchBrief}</pre>
                )}
                {!briefLoading && !briefError && !dispatchBrief && (
                  <p className="text-[rgba(242,240,233,0.35)]">
                    Click "Generate AI Dispatch Brief" to get operator instructions for this event.
                  </p>
                )}
              </div>

              {/* Confirm button */}
              {dispatchBrief && !dispatchConfirmed && (
                <button
                  onClick={confirmDispatch}
                  disabled={morphLoading}
                  className="btn-magnetic mt-4 w-full rounded-full bg-[#CC5833] px-4 py-2.5 font-sans text-sm font-semibold text-cream transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="btn-bg rounded-full bg-[#a84628]" />
                  <span className="relative z-10">
                    {morphLoading ? "Sending Dispatch Command…" : "Confirm Dispatch"}
                  </span>
                </button>
              )}

              {/* Confirmed state */}
              {dispatchConfirmed && dispatchPayload && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-3xl border border-[rgba(46,64,54,0.6)] bg-[rgba(46,64,54,0.25)] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="status-dot h-2 w-2 rounded-full bg-[#2E4036]" />
                      <p className="font-sans text-sm font-semibold text-cream">Dispatch Command Sent</p>
                    </div>
                    <p className="mt-1 font-mono text-xs text-[rgba(242,240,233,0.6)]">
                      {stats.batteriesNeeded.toLocaleString()} batteries pre-charging · Est. {dispatchPayload.estimated_total_capture}
                    </p>
                  </div>

                  {/* What changed */}
                  <div className="rounded-3xl border border-[rgba(46,64,54,0.4)] bg-[rgba(26,26,26,0.4)] p-3 font-mono text-xs">
                    <p className="mb-2 font-sans text-[9px] font-semibold uppercase tracking-widest text-[rgba(242,240,233,0.35)]">What Changed</p>
                    <div className="space-y-1 text-[rgba(242,240,233,0.7)]">
                      <p>· {stats.batteriesNeeded.toLocaleString()} batteries: Standby → Pre-charging</p>
                      <p>· Charge target: 95% by {stats.preChargeBy}</p>
                      <p>· Discharge: {dispatchPayload.discharge_window}</p>
                      <p>· ZIPs: {allAffectedZips.join(", ")}</p>
                      <p className="text-cream font-semibold">· Est. revenue: {dispatchPayload.estimated_total_capture}</p>
                    </div>
                  </div>

                  {/* Payload JSON */}
                  <div>
                    <p className="mb-1.5 font-sans text-[9px] font-semibold uppercase tracking-widest text-[rgba(242,240,233,0.35)]">Dispatch Command</p>
                    <div className="overflow-x-auto rounded-3xl border border-[rgba(46,64,54,0.4)] bg-[rgba(26,26,26,0.6)] p-3 font-mono text-xs text-[rgba(204,88,51,0.85)]">
                      <pre>{JSON.stringify(dispatchPayload, null, 2)}</pre>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {/* ══════════════════════════════════════════
            DISPATCH LOG TAB
        ══════════════════════════════════════════ */}
        {tab === "history" && (
          <section className="absolute left-1/2 top-1/2 z-20 w-[900px] -translate-x-1/2 -translate-y-1/2 max-h-[calc(100vh-40px)] overflow-y-auto rounded-4xl p-6 shadow-2xl panel-glass">
            <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-[rgba(242,240,233,0.4)]">
              Confirmed Dispatches
            </p>
            <h2 className="mt-1 font-serif italic text-2xl text-cream">Dispatch Log</h2>
            <p className="mt-0.5 font-sans text-xs text-[rgba(242,240,233,0.45)]">
              Each row shows command ID, battery count, revenue math, and timestamp.
            </p>

            <div className="mt-5 overflow-hidden rounded-3xl border border-[rgba(46,64,54,0.4)]">
              <div className="grid grid-cols-6 bg-[rgba(46,64,54,0.3)] px-4 py-2.5 font-sans text-[10px] font-semibold uppercase tracking-widest text-[rgba(242,240,233,0.45)]">
                <span>Dispatch ID</span><span>Event</span><span>Batteries</span>
                <span>Spread</span><span>Est. Capture</span><span>Time</span>
              </div>
              <div className="max-h-[280px] overflow-auto bg-[rgba(26,26,26,0.4)] font-mono text-xs">
                {dispatchHistory.length === 0 ? (
                  <p className="px-4 py-5 font-sans text-sm italic text-[rgba(242,240,233,0.35)]">
                    No dispatches confirmed yet — go to Dispatch tab to get started.
                  </p>
                ) : (
                  dispatchHistory.map((entry) => (
                    <div key={entry.id} className="border-t border-[rgba(46,64,54,0.3)] px-4 py-3">
                      <div className="grid grid-cols-4 gap-2">
                        <span className="text-[rgba(242,240,233,0.45)] col-span-1">{entry.dispatchId}</span>
                        <span className="text-cream col-span-1">{entry.date}</span>
                        <span className="text-[#a87c2a]">${entry.spreadPerBattery}/batt.</span>
                        <span className="font-semibold text-cream">${entry.totalCapture.toLocaleString()}</span>
                      </div>
                      <p className="mt-0.5 font-sans text-[10px] text-[rgba(242,240,233,0.4)]">
                        {entry.eventCount} event(s) · {entry.batteries.toLocaleString()} batteries · {formatDateTime(entry.when)}
                      </p>
                      <p className="font-sans text-[10px] text-[rgba(242,240,233,0.3)] truncate">{entry.eventNames}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Revenue math */}
            {dispatchHistory.length > 0 && (
              <div className="mt-4 rounded-3xl border border-[rgba(46,64,54,0.4)] bg-[rgba(46,64,54,0.15)] p-4 font-mono text-xs">
                <p className="mb-2 font-sans text-[9px] font-semibold uppercase tracking-widest text-[rgba(242,240,233,0.4)]">Revenue Math</p>
                {dispatchHistory.slice(0, 1).map((e) => (
                  <p key={e.id} className="text-[rgba(242,240,233,0.7)]">
                    {e.batteries.toLocaleString()} batteries × ${e.spreadPerBattery}/battery ={" "}
                    <span className="font-semibold text-cream">${e.totalCapture.toLocaleString()}</span>
                  </p>
                ))}
                {dispatchHistory.length > 1 && (
                  <p className="mt-1 text-[rgba(242,240,233,0.7)]">
                    Total across {dispatchHistory.length} dispatches:{" "}
                    <span className="font-semibold text-cream">
                      ${dispatchHistory.reduce((s, e) => s + e.totalCapture, 0).toLocaleString()}
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* Data footnote */}
            <div className="mt-3 rounded-3xl border border-[rgba(46,64,54,0.3)] bg-[rgba(26,26,26,0.4)] p-4 font-sans text-xs text-[rgba(242,240,233,0.4)]">
              <p className="mb-1.5 font-semibold uppercase tracking-widest text-[9px]">About This Data</p>
              <p className="leading-relaxed">
                Event data from UT Austin athletic schedule CSV. Battery count reflects Base Power's current Austin deployment (~{FLEET_SIZE.toLocaleString()} units as of 2025). ERCOT prices simulated based on historical averages — labeled "sim" when not fetched live. Revenue projections use $8–$25/battery spread depending on ERCOT tier.
              </p>
            </div>
          </section>
        )}
      </div>

      {/* ══════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════ */}
      <footer
        className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-2.5 font-mono text-[10px]"
        style={{ background: "rgba(26,26,26,0.85)", backdropFilter: "blur(12px)", borderTop: "1px solid rgba(46,64,54,0.35)" }}
      >
        <div className="flex items-center gap-4">
          <span style={{ color: tierColor }}>
            ERCOT {ercotTier.label}: ${ercotPrice.toFixed(2)}/MWh
            {ercotIsSimulated && <span className="ml-1 opacity-40">[sim]</span>}
          </span>
          <span className="text-[rgba(242,240,233,0.2)]">|</span>
          <span className="text-[rgba(242,240,233,0.35)]">Fleet: {FLEET_SIZE.toLocaleString()} batteries · Austin, TX</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="status-dot h-1.5 w-1.5 rounded-full bg-[#2E4036]" />
          <span className="text-[rgba(242,240,233,0.4)]">System Operational</span>
        </div>
        {dispatchConfirmed && dispatchPayload ? (
          <span className="text-cream">
            ⚡ {stats.batteriesNeeded.toLocaleString()} batteries pre-charging · Est. {dispatchPayload.estimated_total_capture}
          </span>
        ) : (
          <span className="text-[rgba(242,240,233,0.3)]">Event data: UT Austin Athletics · Base Power demo</span>
        )}
      </footer>
    </div>
  );
}

// =====================================================================
// HELPER COMPONENTS
// =====================================================================

function PillTab({ children, active, onClick, icon }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-sans text-xs font-medium transition-all duration-200 ${
        active
          ? "bg-[#2E4036] text-cream shadow-md"
          : "text-[rgba(242,240,233,0.55)] hover:text-cream hover:bg-[rgba(46,64,54,0.4)]"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function OrgKpiCard({ label, value, icon }) {
  return (
    <div className="rounded-3xl border border-[rgba(46,64,54,0.4)] bg-[rgba(26,26,26,0.5)] px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[rgba(242,240,233,0.4)]">{icon}</span>
        <p className="font-sans text-[9px] font-semibold uppercase tracking-widest text-[rgba(242,240,233,0.4)]">{label}</p>
      </div>
      <p className="mt-1.5 font-sans text-lg font-bold text-cream">{value}</p>
    </div>
  );
}

function OrgStatRow({ label, value, hint }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-2xl border border-[rgba(46,64,54,0.35)] bg-[rgba(26,26,26,0.4)] px-3 py-2">
      <div className="min-w-0">
        <span className="font-sans text-[10px] font-semibold uppercase tracking-widest text-[rgba(242,240,233,0.4)]">{label}</span>
        {hint && <p className="mt-0.5 font-mono text-[9px] text-[rgba(242,240,233,0.3)]">{hint}</p>}
      </div>
      <span className="shrink-0 font-mono text-xs font-semibold text-cream">{value}</span>
    </div>
  );
}

function LegendItem({ color, label, dot }) {
  return (
    <div className="flex items-center gap-2 font-sans text-[10px] text-[rgba(242,240,233,0.6)]">
      {dot ? (
        <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      ) : (
        <div className="h-2.5 w-2.5 shrink-0 rounded-full border border-[rgba(242,240,233,0.5)]" style={{ background: color }} />
      )}
      <span>{label}</span>
    </div>
  );
}

export default App;
