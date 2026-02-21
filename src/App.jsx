import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import utEventsCsv from "./data/UT_Sports_Events.csv?raw";
import energyUsageCsv from "./data/Facility_Energy_Usage.csv?raw";
import capacitiesCsv from "./data/venues_capcity.csv?raw";

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

// 35 battery cluster locations — ~120 batteries each = ~4,200 total
const BATTERY_CLUSTERS = [
  { id: "bc01", lng: -97.7500, lat: 30.2890, zip: "78703", count: 120 },
  { id: "bc02", lng: -97.7650, lat: 30.2850, zip: "78703", count: 115 },
  { id: "bc03", lng: -97.7580, lat: 30.2710, zip: "78703", count: 128 },
  { id: "bc04", lng: -97.7420, lat: 30.2920, zip: "78705", count: 122 },
  { id: "bc05", lng: -97.7380, lat: 30.2850, zip: "78705", count: 110 },
  { id: "bc06", lng: -97.7350, lat: 30.3010, zip: "78705", count: 118 },
  { id: "bc07", lng: -97.7490, lat: 30.2640, zip: "78704", count: 125 },
  { id: "bc08", lng: -97.7620, lat: 30.2570, zip: "78704", count: 119 },
  { id: "bc09", lng: -97.7520, lat: 30.2490, zip: "78704", count: 112 },
  { id: "bc10", lng: -97.7220, lat: 30.3110, zip: "78751", count: 130 },
  { id: "bc11", lng: -97.7160, lat: 30.3050, zip: "78751", count: 116 },
  { id: "bc12", lng: -97.7300, lat: 30.3220, zip: "78756", count: 125 },
  { id: "bc13", lng: -97.7440, lat: 30.3260, zip: "78756", count: 120 },
  { id: "bc14", lng: -97.7010, lat: 30.3300, zip: "78752", count: 122 },
  { id: "bc15", lng: -97.6970, lat: 30.3410, zip: "78752", count: 114 },
  { id: "bc16", lng: -97.7110, lat: 30.3160, zip: "78752", count: 118 },
  { id: "bc17", lng: -97.7170, lat: 30.2650, zip: "78702", count: 120 },
  { id: "bc18", lng: -97.7090, lat: 30.2700, zip: "78702", count: 124 },
  { id: "bc19", lng: -97.7010, lat: 30.2580, zip: "78702", count: 116 },
  { id: "bc20", lng: -97.6910, lat: 30.2790, zip: "78721", count: 108 },
  { id: "bc21", lng: -97.6860, lat: 30.2650, zip: "78721", count: 112 },
  { id: "bc22", lng: -97.7610, lat: 30.2200, zip: "78745", count: 118 },
  { id: "bc23", lng: -97.7710, lat: 30.2100, zip: "78745", count: 122 },
  { id: "bc24", lng: -97.7510, lat: 30.2050, zip: "78745", count: 115 },
  { id: "bc25", lng: -97.8120, lat: 30.1800, zip: "78748", count: 110 },
  { id: "bc26", lng: -97.8220, lat: 30.1700, zip: "78748", count: 106 },
  { id: "bc27", lng: -97.8010, lat: 30.1650, zip: "78748", count: 116 },
  { id: "bc28", lng: -97.7410, lat: 30.2690, zip: "78701", count: 128 },
  { id: "bc29", lng: -97.7360, lat: 30.2760, zip: "78701", count: 124 },
  { id: "bc30", lng: -97.7470, lat: 30.2780, zip: "78701", count: 118 },
  { id: "bc31", lng: -97.7290, lat: 30.2840, zip: "78702", count: 112 },
  { id: "bc32", lng: -97.7800, lat: 30.2400, zip: "78704", count: 120 },
  { id: "bc33", lng: -97.7660, lat: 30.3010, zip: "78703", count: 124 },
  { id: "bc34", lng: -97.6890, lat: 30.3110, zip: "78752", count: 112 },
  { id: "bc35", lng: -97.7310, lat: 30.2450, zip: "78702", count: 116 },
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

// GeoJSON for battery cluster dots — color driven by active state
function buildClustersGeoJSON(activatedSet) {
  return {
    type: "FeatureCollection",
    features: BATTERY_CLUSTERS.map((c) => ({
      type: "Feature",
      properties: { id: c.id, zip: c.zip, count: c.count, active: activatedSet.has(c.id) },
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

function App() {
  const events = useMemo(() => loadEventModel(), []);
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const venueMarkerRef = useRef(null);
  const animTimers = useRef([]);

  const [tab, setTab] = useState("dashboard");
  const [selectedId, setSelectedId] = useState(events[0]?.id ?? "");
  const [dispatchBrief, setDispatchBrief] = useState("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState("");
  const [dispatchConfirmed, setDispatchConfirmed] = useState(false);
  const [morphLoading, setMorphLoading] = useState(false);
  const [dispatchPayload, setDispatchPayload] = useState(null);
  const [ercotPrice, setErcotPrice] = useState(52);
  const [ercotIsSimulated, setErcotIsSimulated] = useState(true);
  const [dispatchHistory, setDispatchHistory] = useState([]);
  const [activatedClusters, setActivatedClusters] = useState(new Set());
  const [activatingCount, setActivatingCount] = useState(0);
  const [showDispatchCard, setShowDispatchCard] = useState(false);
  const [layerVis, setLayerVis] = useState({
    batteryClusters: true,
    demandZones: true,
    dispersalRoutes: true,
  });

  const rampTargetRef = useRef(null);
  const rampStartRef = useRef(null);
  const rampInitRef = useRef(52);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedId) ?? events[0],
    [events, selectedId]
  );

  const overlaps = useMemo(() => {
    if (!selectedEvent) return [];
    return events
      .filter((e) => e.id !== selectedEvent.id)
      .filter((e) => e.startAt < selectedEvent.endAt && e.endAt > selectedEvent.startAt)
      .slice(0, 6);
  }, [events, selectedEvent]);

  const stats = useMemo(() => {
    if (!selectedEvent) {
      return { projectedMW: 0, batteriesNeeded: 0, preChargeBy: "-", revenueEstimate: 0, spreadPerBattery: 0 };
    }
    const projectedMW = getProjectedMW(selectedEvent);
    const batteriesNeeded = getRealisticBatteries(selectedEvent);
    const preChargeBy = subtractMinutes(selectedEvent.endTime, 90);
    const spread = getSpreadPerBattery(ercotPrice);
    return {
      projectedMW,
      batteriesNeeded,
      preChargeBy,
      revenueEstimate: batteriesNeeded * spread,
      spreadPerBattery: spread,
    };
  }, [selectedEvent, ercotPrice]);

  const kpi = useMemo(() => {
    if (!selectedEvent) return { upcoming24h: 0, totalToday: 0, projectedTodayRevenue: 0 };
    const now = selectedEvent.startAt;
    const dayKey = now.toDateString();
    const in24h = events.filter(
      (e) => e.startAt >= now && e.startAt <= new Date(now.getTime() + 86400000)
    );
    const sameDay = events.filter((e) => e.startAt.toDateString() === dayKey);
    const spread = getSpreadPerBattery(ercotPrice);
    const projectedTodayRevenue = sameDay.reduce(
      (acc, e) => acc + getRealisticBatteries(e) * spread,
      0
    );
    return { upcoming24h: in24h.length, totalToday: sameDay.length, projectedTodayRevenue };
  }, [events, selectedEvent, ercotPrice]);

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
          "circle-color": ["case", ["get", "active"], "#22c55e", "#4b5563"],
          "circle-radius": ["case", ["get", "active"], 8, 6],
          "circle-opacity": ["case", ["get", "active"], 1.0, 0.75],
          "circle-stroke-color": ["case", ["get", "active"], "#16a34a", "#374151"],
          "circle-stroke-width": 1.5,
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
          "text-field": ["concat", ["get", "zip"], "\n+", ["get", "loadPct"], "%\n", ["get", "batteries"], " batt."],
          "text-size": 10,
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-anchor": "center",
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#f1f5f9",
          "text-halo-color": "#0a0e1a",
          "text-halo-width": 1.2,
        },
      });

      // ZIP zone click popup
      const zonePopup = new mapboxgl.Popup({ closeButton: true });
      map.on("click", "demand-zones-fill", (e) => {
        const p = e.features[0].properties;
        const covered = p.batteries >= 80 ? "✓ Sufficient" : "⚠ Limited";
        zonePopup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="map-popup"><strong>ZIP ${p.zip}</strong><br/>` +
            `Post-event demand increase: <strong>+${p.loadPct}%</strong><br/>` +
            `Base Power batteries staged: <strong>${p.batteries}</strong><br/>` +
            `Coverage: <strong>${covered}</strong></div>`
          )
          .addTo(map);
      });

      // --- Dispersal routes ---
      map.addSource("dispersal-routes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "dispersal-routes-layer",
        type: "line",
        source: "dispersal-routes",
        paint: {
          "line-color": ["case", ["get", "active"], "#22c55e", "#f97316"],
          "line-width": 2,
          "line-opacity": 0.7,
          "line-dasharray": [3, 3],
        },
      });
      map.addLayer({
        id: "dispersal-routes-labels",
        type: "symbol",
        source: "dispersal-routes",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 10,
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "symbol-placement": "line-center",
          "text-offset": [0, -0.8],
        },
        paint: {
          "text-color": "#fb923c",
          "text-halo-color": "#0a0e1a",
          "text-halo-width": 1.2,
        },
      });

      // Route click popup
      const routePopup = new mapboxgl.Popup({ closeButton: true });
      map.on("click", "dispersal-routes-layer", (e) => {
        const p = e.features[0].properties;
        routePopup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="map-popup"><strong>Crowd Dispersal — ${p.label}</strong><br/>` +
            `Est. vehicles post-game: 3,200–8,400<br/>` +
            `Battery coverage: ${p.active ? "✓ Active" : "Standby"}</div>`
          )
          .addTo(map);
      });

      // --- Overlapping events ---
      map.addSource("overlap-points", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "overlap-layer",
        type: "circle",
        source: "overlap-points",
        paint: {
          "circle-color": "#22d3ee",
          "circle-radius": 7,
          "circle-opacity": 0.9,
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 1.3,
        },
      });
    });

    return () => {
      if (venueMarkerRef.current) { venueMarkerRef.current.remove(); venueMarkerRef.current = null; }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ===== UPDATE MAP WHEN EVENT SELECTED =====
  const applyEventLayers = useCallback(
    (event, currentOverlaps, currentStats) => {
      const map = mapRef.current;
      if (!map) return;

      map.flyTo({
        center: [event.lng - 0.018, event.lat],
        zoom: 12.5,
        speed: 0.65,
        curve: 1.2,
        duration: 1500,
      });

      // Venue marker
      if (venueMarkerRef.current) venueMarkerRef.current.remove();
      const markerEl = document.createElement("div");
      markerEl.className = "venue-marker pulsing";
      const mapboxgl = getMapbox();
      if (!mapboxgl) return;
      const venuePopup = new mapboxgl.Popup({ offset: 25, closeButton: true }).setHTML(
        `<div class="map-popup"><strong>${event.venue}</strong><br/>` +
        `${event.name}<br/>Ends ~${event.endTime} · ${event.attendance.toLocaleString()} expected<br/>` +
        `Temp: ${event.tempF}°F</div>`
      );
      venueMarkerRef.current = new mapboxgl.Marker({ element: markerEl })
        .setLngLat([event.lng, event.lat])
        .setPopup(venuePopup)
        .addTo(map);

      // Demand zones
      const demandFeatures = event.affectedZips
        .map((zip, i) => {
          const coords = ZIP_COORDS[zip];
          if (!coords) return null;
          const tiers = ZIP_LOAD_PCT[zip] ?? [100, 70, 45];
          const loadPct = i < 2 ? tiers[0] : i < 4 ? tiers[1] : tiers[2];
          const color = loadPct > 160 ? "#dc2626" : loadPct > 120 ? "#f97316" : loadPct > 80 ? "#eab308" : "#fef08a";
          const batteries = BATTERY_CLUSTERS.filter((c) => c.zip === zip).reduce((s, c) => s + c.count, 0) || Math.round(currentStats.batteriesNeeded / event.affectedZips.length);
          return {
            type: "Feature",
            properties: { zip, loadPct, color, batteries },
            geometry: { type: "Point", coordinates: coords },
          };
        })
        .filter(Boolean);

      const demandSrc = map.getSource("demand-zones");
      if (demandSrc) demandSrc.setData({ type: "FeatureCollection", features: demandFeatures });

      // Dispersal routes
      const routes = getRoutes(event.venue);
      const routeFeatures = routes.map((r) => ({
        type: "Feature",
        properties: { label: r.label, active: false },
        geometry: { type: "LineString", coordinates: r.coords },
      }));
      const routeSrc = map.getSource("dispersal-routes");
      if (routeSrc) routeSrc.setData({ type: "FeatureCollection", features: routeFeatures });

      // Overlap markers
      const overlapFeatures = currentOverlaps.map((e) => ({
        type: "Feature",
        properties: { name: e.name },
        geometry: { type: "Point", coordinates: [e.lng, e.lat] },
      }));
      const overlapSrc = map.getSource("overlap-points");
      if (overlapSrc) overlapSrc.setData({ type: "FeatureCollection", features: overlapFeatures });
    },
    []
  );

  useEffect(() => {
    if (!selectedEvent) return;
    const map = mapRef.current;
    if (!map) return;
    const apply = () => applyEventLayers(selectedEvent, overlaps, stats);
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [selectedEvent, overlaps, applyEventLayers, stats]);

  // ===== RESET ALL STATE WHEN EVENT CHANGES =====
  useEffect(() => {
    animTimers.current.forEach(clearTimeout);
    animTimers.current = [];
    setDispatchConfirmed(false);
    setDispatchPayload(null);
    setDispatchBrief("");
    setBriefError("");
    setActivatedClusters(new Set());
    setActivatingCount(0);
    setShowDispatchCard(false);

    const map = mapRef.current;
    if (map && map.isStyleLoaded()) {
      // Reset cluster colors
      const clusterSrc = map.getSource("battery-clusters");
      if (clusterSrc) clusterSrc.setData(buildClustersGeoJSON(new Set()));
    }
  }, [selectedEvent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== SYNC ACTIVATED CLUSTERS TO MAP =====
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("battery-clusters");
    if (src) src.setData(buildClustersGeoJSON(activatedClusters));
  }, [activatedClusters]);

  // ===== SYNC DISPATCH CONFIRMED STATE TO VENUE MARKER =====
  useEffect(() => {
    if (!venueMarkerRef.current) return;
    venueMarkerRef.current.getElement().className = dispatchConfirmed
      ? "venue-marker confirmed"
      : "venue-marker pulsing";
  }, [dispatchConfirmed]);

  // ===== LAYER VISIBILITY TOGGLES =====
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const vis = (on) => (on ? "visible" : "none");
    const set = (id, v) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v); };
    set("battery-clusters-layer", vis(layerVis.batteryClusters));
    set("demand-zones-fill", vis(layerVis.demandZones));
    set("demand-zones-labels", vis(layerVis.demandZones));
    set("dispersal-routes-layer", vis(layerVis.dispersalRoutes));
    set("dispersal-routes-labels", vis(layerVis.dispersalRoutes));
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
        const jitter = Math.random() * 14 - 7;
        let next = prev + jitter;
        if (rampTargetRef.current && rampStartRef.current) {
          const elapsed = (Date.now() - rampStartRef.current) / 1000;
          const progress = Math.min(elapsed / 24, 1);
          const target = rampInitRef.current + (rampTargetRef.current - rampInitRef.current) * progress;
          next = Math.max(next, target);
          if (progress >= 1) rampStartRef.current = null;
        }
        return Math.max(20, Math.min(450, Number(next.toFixed(2))));
      });
    }, 5000);
    return () => clearInterval(ticker);
  }, []);

  useEffect(() => {
    rampInitRef.current = ercotPrice;
    rampTargetRef.current = 90 + Math.random() * 130;
    rampStartRef.current = Date.now();
  }, [selectedEvent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== DISPATCH ANIMATION =====
  function runDispatchAnimation(affectedZips, batteriesNeeded, venue) {
    const map = mapRef.current;
    const affected = BATTERY_CLUSTERS.filter((c) => affectedZips.includes(c.zip));
    const total = Math.max(1, affected.length);
    const interval = Math.floor(3000 / total);

    // Phase 1 (0–3s): activate clusters sequentially, near venue first
    affected.forEach((cluster, i) => {
      const t = setTimeout(() => {
        setActivatedClusters((prev) => new Set([...prev, cluster.id]));
        setActivatingCount(Math.min(batteriesNeeded, Math.round((batteriesNeeded * (i + 1)) / total)));
      }, i * interval);
      animTimers.current.push(t);
    });

    // Phase 2 (3s): turn dispersal route lines green
    const t3 = setTimeout(() => {
      if (!map || !map.isStyleLoaded()) return;
      const src = map.getSource("dispersal-routes");
      if (src) {
        const routes = getRoutes(venue);
        src.setData({
          type: "FeatureCollection",
          features: routes.map((r) => ({
            type: "Feature",
            properties: { label: r.label, active: true },
            geometry: { type: "LineString", coordinates: r.coords },
          })),
        });
      }
    }, 3200);
    animTimers.current.push(t3);

    // Phase 3 (5.5s): show floating dispatch card
    const t5 = setTimeout(() => setShowDispatchCard(true), 5500);
    animTimers.current.push(t5);
  }

  // ===== GROQ DISPATCH BRIEF =====
  function getMockDispatchBrief() {
    if (!selectedEvent) return "";
    const chargeTime = subtractMinutes(selectedEvent.endTime, 100);
    const nearZips = selectedEvent.affectedZips.slice(0, 2).join(", ");
    const tempNote =
      selectedEvent.tempF > 90
        ? `At ${selectedEvent.tempF}°F, AC load adds ~25% to projected demand — increase to 97% charge target.`
        : `At ${selectedEvent.tempF}°F, standard AC load expected — 95% target is sufficient.`;
    const riskNote =
      overlaps.length > 0
        ? `Risk: ${overlaps.length} concurrent UT event(s) active — reserve 12% capacity for overlap demand spike.`
        : "Risk: Monitor I-35 corridor for unexpected crowd rerouting in the discharge window.";
    return (
      `1. PRE-CHARGE: Begin pre-charge at ${chargeTime} — 100 min before projected ${selectedEvent.endTime} end.\n` +
      `2. TARGET: Charge ${stats.batteriesNeeded.toLocaleString()} batteries to 95% capacity across ZIPs ${selectedEvent.affectedZips.join(", ")}.\n` +
      `3. PRIORITY: Stage ZIPs ${nearZips} first — closest to ${selectedEvent.venue}, highest initial load.\n` +
      `4. WEATHER: ${tempNote}\n` +
      `5. ${riskNote}`
    );
  }

  async function requestDispatchBrief() {
    if (!selectedEvent) return;
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
      const chargeTime = subtractMinutes(selectedEvent.endTime, 100);
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "You are an AI dispatch system for Base Power, a distributed battery company in Austin, TX. " +
                "Generate a precise operator dispatch brief in exactly 5 numbered points. Be specific — use exact times, percentages, and ZIP codes.\n\n" +
                "Format strictly as:\n" +
                "1. PRE-CHARGE: [exact start time and why]\n" +
                "2. TARGET: [exact charge level % and battery count]\n" +
                "3. PRIORITY: [which ZIP codes to prioritize first and why]\n" +
                "4. WEATHER: [temperature impact on AC load — if >85°F, mention multiplier]\n" +
                "5. RISK: [one specific risk factor to monitor with a number if possible]",
            },
            {
              role: "user",
              content:
                `Event: ${selectedEvent.name} (${selectedEvent.category})\n` +
                `Venue: ${selectedEvent.venue}\n` +
                `Start: ${formatDateTime(selectedEvent.startAt)} | Projected end: ${selectedEvent.endTime}\n` +
                `Attendance: ${selectedEvent.attendance.toLocaleString()} | Temp: ${selectedEvent.tempF}°F\n` +
                `Batteries to dispatch: ${stats.batteriesNeeded} (fleet: ${FLEET_SIZE.toLocaleString()} total)\n` +
                `Affected ZIPs (nearest first): ${selectedEvent.affectedZips.join(", ")}\n` +
                `Suggested pre-charge start: ${chargeTime}\n` +
                `Current ERCOT price: $${ercotPrice.toFixed(0)}/MWh\n` +
                `Est. revenue: $${stats.revenueEstimate.toLocaleString()} ($${stats.spreadPerBattery}/battery)\n` +
                `Concurrent events: ${overlaps.length}`,
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
    if (!selectedEvent) return;
    setMorphLoading(true);
    const payload = buildDispatchPayload(
      selectedEvent,
      stats.batteriesNeeded,
      stats.preChargeBy,
      ercotPrice
    );
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
          id: `${selectedEvent.id}-${Date.now()}`,
          dispatchId: payload.dispatch_id,
          name: selectedEvent.name,
          venue: selectedEvent.venue,
          when: new Date(),
          batteries: stats.batteriesNeeded,
          spreadPerBattery: stats.spreadPerBattery,
          totalCapture: stats.revenueEstimate,
          projectedMW: stats.projectedMW,
          zips: selectedEvent.affectedZips,
        },
        ...prev,
      ]);
      runDispatchAnimation(selectedEvent.affectedZips, stats.batteriesNeeded, selectedEvent.venue);
    } catch (err) {
      console.error("Dispatch error:", err);
    } finally {
      setMorphLoading(false);
    }
  }

  // ===== RENDER =====
  if (!selectedEvent) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0e1a] text-slate-200">
        No event data available.
      </div>
    );
  }

  const ercotTier = getErcotTier(ercotPrice);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0a0e1a] text-white">
      {/* ===== HEADER ===== */}
      <header className="relative z-30 flex h-[64px] items-center gap-4 border-b border-slate-800 bg-[#040814]/95 px-5 backdrop-blur">
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-wide text-[#3b82f6]">GridPulse</h1>
          <p className="text-xs text-slate-400">Base Power Austin — Battery Dispatch Command Center</p>
        </div>
        <nav className="flex gap-2 text-sm">
          <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")}>
            Dashboard
          </TabButton>
          <TabButton active={tab === "map"} onClick={() => setTab("map")}>
            Dispatch
          </TabButton>
          <TabButton active={tab === "history"} onClick={() => setTab("history")}>
            Dispatch Log
          </TabButton>
        </nav>
        {/* ERCOT Price Alert — always visible */}
        <div
          className="rounded-md border px-3 py-1.5 text-xs font-mono shrink-0"
          style={{ borderColor: ercotTier.border, background: ercotTier.bg, color: ercotTier.color }}
        >
          ERCOT {ercotTier.label} · ${ercotPrice.toFixed(0)}/MWh
          {ercotIsSimulated && <span className="ml-1 opacity-50">(sim)</span>}
        </div>
      </header>

      {/* ===== MAP + PANELS ===== */}
      <div className="relative h-[calc(100%-122px)]">
        <div ref={mapNodeRef} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#040814]/60 via-transparent to-[#040814]/70" />

        {/* MAP LEGEND */}
        <div className="absolute bottom-4 left-4 z-20 rounded-lg border border-slate-700 bg-[#0d1426]/90 p-3 text-xs backdrop-blur">
          <p className="mb-2 font-semibold uppercase tracking-wide text-slate-400">Map Legend</p>
          <div className="space-y-1.5">
            <LegendItem color="#f43f5e" label="Event venue (pulsing)" />
            <LegendItem color="#4b5563" label="Battery cluster — standby" dot />
            <LegendItem color="#22c55e" label="Battery cluster — pre-charging" dot />
            <LegendItem color="#dc2626" label="High demand zone (>160%)" dot />
            <LegendItem color="#f97316" label="Medium demand zone" dot />
            <LegendItem color="#eab308" label="Moderate demand zone" dot />
            <LegendItem color="#f97316" label="Crowd dispersal route" line />
          </div>
        </div>

        {/* LAYER TOGGLES */}
        <div className="absolute right-4 top-4 z-20 rounded-lg border border-slate-700 bg-[#0d1426]/90 p-3 text-xs backdrop-blur">
          <p className="mb-2 font-semibold uppercase tracking-wide text-slate-400">Map Layers</p>
          <div className="space-y-2">
            <LayerToggle
              color="#22c55e"
              label="Battery clusters"
              checked={layerVis.batteryClusters}
              onChange={(v) => setLayerVis((p) => ({ ...p, batteryClusters: v }))}
            />
            <LayerToggle
              color="#f97316"
              label="Demand zones"
              checked={layerVis.demandZones}
              onChange={(v) => setLayerVis((p) => ({ ...p, demandZones: v }))}
            />
            <LayerToggle
              color="#fb923c"
              label="Dispersal routes"
              checked={layerVis.dispersalRoutes}
              onChange={(v) => setLayerVis((p) => ({ ...p, dispersalRoutes: v }))}
            />
          </div>
        </div>

        {/* DISPATCH ACTIVE FLOATING CARD */}
        {showDispatchCard && dispatchPayload && (
          <div className="pointer-events-none absolute bottom-24 left-1/2 z-30 -translate-x-1/2">
            <div className="rounded-xl border border-[#22c55e]/60 bg-[#05200f]/95 px-5 py-3.5 text-sm font-mono shadow-2xl backdrop-blur">
              <p className="mb-1 font-bold text-[#22c55e]">⚡ DISPATCH ACTIVE</p>
              <p className="text-slate-200">{dispatchPayload.batteries.toLocaleString()} batteries pre-charging</p>
              <p className="text-slate-400">Discharge: {dispatchPayload.discharge_window}</p>
              <p className="font-semibold text-[#22c55e]">Est. capture: {dispatchPayload.estimated_total_capture}</p>
            </div>
          </div>
        )}

        {/* ===== DASHBOARD TAB ===== */}
        {tab === "dashboard" && (
          <>
            <aside className="absolute left-4 top-4 z-20 w-[360px] rounded-xl border border-slate-700/70 bg-[#0d1426]/95 p-4 shadow-2xl backdrop-blur">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#3b82f6]">
                Event Analysis
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Select a UT Austin event to see the projected grid impact
              </p>
              <div className="mt-3">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  UT Austin Event
                </label>
                <select
                  value={selectedEvent.id}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="w-full rounded-md border border-slate-600 bg-[#111a30] px-3 py-2 text-sm text-slate-100 outline-none transition hover:border-[#3b82f6] focus:border-[#3b82f6]"
                >
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-3 rounded-lg border border-slate-700 bg-[#0b1223] p-3 text-sm">
                <p className="font-semibold text-slate-100">{selectedEvent.venue}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {formatDateTime(selectedEvent.startAt)} · ends ~{selectedEvent.endTime}
                </p>
                <p className="mt-0.5 text-xs text-slate-300">
                  {selectedEvent.category} · {selectedEvent.attendance.toLocaleString()} expected · {selectedEvent.tempF}°F
                </p>
              </div>

              <div className="mt-3 space-y-2 text-sm">
                <StatRow
                  label="Estimated grid demand increase"
                  value={`${stats.projectedMW.toFixed(1)} MW`}
                  hint="Austin-wide load from crowd dispersal & AC use"
                />
                <StatRow
                  label="Batteries to dispatch"
                  value={`${stats.batteriesNeeded.toLocaleString()} of ${FLEET_SIZE.toLocaleString()}`}
                />
                <StatRow label="Pre-charge by" value={stats.preChargeBy} />
                <StatRow
                  label="Est. revenue this event"
                  value={`$${stats.revenueEstimate.toLocaleString()}`}
                  hint={`${stats.batteriesNeeded} batteries × $${stats.spreadPerBattery}/battery`}
                />
              </div>

              <button
                onClick={() => setTab("map")}
                className="mt-4 w-full rounded-md bg-[#3b82f6] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#2563eb]"
              >
                Go to Dispatch →
              </button>
            </aside>

            <section className="absolute right-20 top-4 z-20 w-[380px] rounded-xl border border-slate-700/70 bg-[#0d1426]/95 p-4 shadow-2xl backdrop-blur">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#3b82f6]">
                Operations Overview
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <KpiCard label="Events in next 24h" value={kpi.upcoming24h} />
                <KpiCard label="Events today" value={kpi.totalToday} />
                <KpiCard label="Simultaneous events" value={overlaps.length} />
                <KpiCard
                  label="Est. revenue today"
                  value={`$${Math.round(kpi.projectedTodayRevenue).toLocaleString()}`}
                />
              </div>

              {/* ERCOT Price Alert */}
              <div
                className="mt-3 rounded-lg border p-3 text-sm"
                style={{ borderColor: ercotTier.border, background: ercotTier.bg }}
              >
                <p
                  className="mb-1 text-xs uppercase tracking-wide"
                  style={{ color: ercotTier.color }}
                >
                  ERCOT Price Alert
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold" style={{ color: ercotTier.color }}>
                    {ercotTier.label}
                  </span>
                  <span className="font-mono text-slate-200">
                    ${ercotPrice.toFixed(2)}/MWh
                    {ercotIsSimulated && <span className="ml-1 text-xs text-slate-500">(simulated)</span>}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">{ercotTier.desc}</p>
                <p className="mt-1.5 text-xs text-slate-600">
                  Normal &lt;$50 · Elevated $50–150 · Critical $150–500 · Emergency $500+
                </p>
              </div>

              {/* Simultaneous events */}
              <div className="mt-3 rounded-lg border border-slate-700 bg-[#050914] p-3 text-sm">
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">
                  Simultaneous Events
                </p>
                {overlaps.length === 0 ? (
                  <p className="text-xs text-slate-400">No other UT events overlap this window.</p>
                ) : (
                  overlaps.map((e) => (
                    <div key={e.id} className="mt-1.5 rounded-md border border-slate-700 bg-[#0b1223] px-2 py-1.5">
                      <p className="text-xs font-semibold text-slate-100">{e.name}</p>
                      <p className="text-xs text-slate-400">
                        {e.venue} · {formatDateTime(e.startAt)}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Season math */}
              <div className="mt-3 rounded-lg border border-slate-700 bg-[#050914] p-3 text-sm">
                <p className="mb-1.5 text-xs uppercase tracking-wide text-slate-400">
                  Football Season Estimate
                </p>
                <p className="text-xs leading-relaxed text-slate-300">
                  {stats.batteriesNeeded.toLocaleString()} batteries × ${stats.spreadPerBattery} avg
                  spread × 8 home games
                </p>
                <p className="mt-1 font-semibold text-[#22c55e]">
                  = ${(stats.batteriesNeeded * stats.spreadPerBattery * 8).toLocaleString()} season estimate
                </p>
                <p className="mt-1 text-xs text-slate-500">Fleet grows as Base Power deploys more units.</p>
              </div>
            </section>
          </>
        )}

        {/* ===== DISPATCH TAB ===== */}
        {tab === "map" && (
          <>
            <aside className="absolute left-4 top-4 z-20 w-[310px] rounded-xl border border-slate-700/70 bg-[#0d1426]/95 p-4 shadow-2xl backdrop-blur">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#3b82f6]">
                Dispatch Setup
              </h2>
              <div className="mt-3">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Event
                </label>
                <select
                  value={selectedEvent.id}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="w-full rounded-md border border-slate-600 bg-[#111a30] px-3 py-2 text-sm text-slate-100 outline-none transition hover:border-[#3b82f6] focus:border-[#3b82f6]"
                >
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-3 space-y-2">
                <StatRow label="Affected ZIP codes" value={selectedEvent.affectedZips.join(", ")} />
                <StatRow label="Demand spike" value={`${stats.projectedMW.toFixed(1)} MW`} />
                <StatRow
                  label="Batteries"
                  value={`${stats.batteriesNeeded.toLocaleString()} / ${FLEET_SIZE.toLocaleString()}`}
                />
                <StatRow label="Pre-charge by" value={stats.preChargeBy} />
              </div>

              <p className="mt-3 text-xs text-slate-500">
                Steps: 1) Generate brief → 2) Review → 3) Confirm Dispatch
              </p>

              <button
                onClick={requestDispatchBrief}
                disabled={briefLoading || dispatchConfirmed}
                className="mt-3 w-full rounded-md bg-[#3b82f6] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#2563eb] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {briefLoading
                  ? "Generating Brief..."
                  : dispatchConfirmed
                  ? "Brief Generated ✓"
                  : "Generate AI Dispatch Brief"}
              </button>

              {/* Activation progress counter */}
              {dispatchConfirmed && activatingCount > 0 && activatingCount < stats.batteriesNeeded && (
                <div className="mt-3 rounded-md border border-[#22c55e]/40 bg-[#05200f] px-2 py-1.5 font-mono text-xs text-[#22c55e]">
                  Activating batteries: {activatingCount.toLocaleString()} / {stats.batteriesNeeded.toLocaleString()}
                </div>
              )}
            </aside>

            <section className="absolute right-20 top-4 z-20 w-[430px] max-h-[calc(100vh-140px)] overflow-y-auto rounded-xl border border-slate-700/70 bg-[#0d1426]/95 p-4 shadow-2xl backdrop-blur">
              {/* Before-state context */}
              {!dispatchConfirmed && (
                <div className="mb-4 rounded-lg border border-slate-700 bg-[#0b1223] p-3 text-xs text-slate-400">
                  <p className="mb-1 font-semibold uppercase tracking-wide text-slate-500">
                    Current State
                  </p>
                  <p>
                    {stats.batteriesNeeded.toLocaleString()} batteries on standby across ZIPs{" "}
                    {selectedEvent.affectedZips.join(", ")}
                  </p>
                  <p className="mt-0.5">No pre-charging in progress — awaiting dispatch command</p>
                </div>
              )}

              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#3b82f6]">
                AI Dispatch Brief
              </h2>
              <div className="mt-2 min-h-[180px] rounded-lg border border-slate-700 bg-[#050914] p-3 font-mono text-xs text-slate-100">
                {briefLoading && (
                  <div className="flex items-center gap-3 text-slate-300">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#3b82f6] border-t-transparent" />
                    Querying dispatch model...
                  </div>
                )}
                {!briefLoading && briefError && (
                  <p className="text-[#f97316]">Brief unavailable: {briefError}</p>
                )}
                {!briefLoading && !briefError && dispatchBrief && (
                  <pre className="whitespace-pre-wrap leading-relaxed">{dispatchBrief}</pre>
                )}
                {!briefLoading && !briefError && !dispatchBrief && (
                  <p className="text-slate-500">
                    Click &quot;Generate AI Dispatch Brief&quot; above to get operator instructions
                    for this event.
                  </p>
                )}
              </div>

              {dispatchBrief && !dispatchConfirmed && (
                <button
                  onClick={confirmDispatch}
                  disabled={morphLoading}
                  className="mt-4 w-full rounded-md bg-[#f97316] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#ea580c] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {morphLoading ? "Sending Dispatch Command..." : "Confirm Dispatch"}
                </button>
              )}

              {/* After: Dispatch confirmed state */}
              {dispatchConfirmed && dispatchPayload && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-md border border-[#22c55e]/60 bg-[#05200f] px-3 py-2.5">
                    <p className="font-semibold text-[#22c55e]">✓ Dispatch Command Sent</p>
                    <p className="mt-0.5 text-xs text-slate-300">
                      {stats.batteriesNeeded.toLocaleString()} batteries pre-charging · Est.{" "}
                      {dispatchPayload.estimated_total_capture} capture
                    </p>
                  </div>

                  {/* What changed summary */}
                  <div className="rounded-lg border border-slate-700 bg-[#0b1223] p-3 text-xs">
                    <p className="mb-2 font-semibold uppercase tracking-wide text-slate-400">
                      What changed
                    </p>
                    <div className="space-y-1 text-slate-300">
                      <p>• {stats.batteriesNeeded.toLocaleString()} batteries: Standby → Pre-charging</p>
                      <p>• Charge target: 95% by {stats.preChargeBy}</p>
                      <p>• Discharge window: {dispatchPayload.discharge_window}</p>
                      <p>• ZIPs covered: {selectedEvent.affectedZips.join(", ")}</p>
                      <p className="font-semibold text-[#22c55e]">
                        • Est. revenue: {dispatchPayload.estimated_total_capture}
                      </p>
                    </div>
                  </div>

                  {/* JSON API Payload */}
                  <div>
                    <p className="mb-1.5 text-xs uppercase tracking-wide text-slate-400">
                      Dispatch Command Generated
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-slate-700 bg-[#050914] p-3 font-mono text-xs text-[#86efac]">
                      <pre>{JSON.stringify(dispatchPayload, null, 2)}</pre>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {/* ===== DISPATCH LOG TAB ===== */}
        {tab === "history" && (
          <section className="absolute left-1/2 top-4 z-20 w-[900px] -translate-x-1/2 rounded-xl border border-slate-700/70 bg-[#0d1426]/95 p-4 shadow-2xl backdrop-blur">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#3b82f6]">
              Dispatch Log
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Confirmed dispatch actions — each row shows the command ID, battery count, revenue math, and timestamp.
            </p>

            <div className="mt-4 overflow-hidden rounded-lg border border-slate-700">
              <div className="grid grid-cols-6 bg-[#0a1020] px-3 py-2 text-xs uppercase tracking-wide text-slate-400">
                <span>Dispatch ID</span>
                <span>Event</span>
                <span>Batteries</span>
                <span>Spread</span>
                <span>Est. Capture</span>
                <span>Time</span>
              </div>
              <div className="max-h-[280px] overflow-auto bg-[#050914] text-xs">
                {dispatchHistory.length === 0 ? (
                  <p className="px-3 py-4 text-slate-400">
                    No dispatches confirmed yet. Go to Dispatch tab, generate a brief, and click Confirm Dispatch.
                  </p>
                ) : (
                  dispatchHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="grid grid-cols-6 border-t border-slate-800 px-3 py-2.5 text-slate-200"
                    >
                      <span className="font-mono text-slate-400 text-xs">{entry.dispatchId}</span>
                      <span className="truncate pr-2">{entry.name}</span>
                      <span>{entry.batteries.toLocaleString()}</span>
                      <span className="text-[#eab308]">${entry.spreadPerBattery}/batt.</span>
                      <span className="font-semibold text-[#22c55e]">
                        ${entry.totalCapture.toLocaleString()}
                      </span>
                      <span className="text-slate-400">{formatDateTime(entry.when)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Revenue math transparency */}
            {dispatchHistory.length > 0 && (
              <div className="mt-3 rounded-lg border border-slate-700 bg-[#0b1223] p-3 text-xs">
                <p className="mb-1.5 font-semibold uppercase tracking-wide text-slate-400">
                  Revenue Math
                </p>
                {dispatchHistory.slice(0, 1).map((e) => (
                  <p key={e.id} className="text-slate-300">
                    {e.batteries.toLocaleString()} batteries × ${e.spreadPerBattery}/battery ={" "}
                    <span className="font-semibold text-[#22c55e]">
                      ${e.totalCapture.toLocaleString()}
                    </span>
                  </p>
                ))}
                {dispatchHistory.length > 1 && (
                  <p className="mt-1 text-slate-300">
                    Total across {dispatchHistory.length} dispatches:{" "}
                    <span className="font-semibold text-[#22c55e]">
                      ${dispatchHistory.reduce((s, e) => s + e.totalCapture, 0).toLocaleString()}
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* About This Data footnote */}
            <div className="mt-3 rounded-lg border border-slate-800 bg-[#050914] p-3 text-xs text-slate-500">
              <p className="mb-1 font-semibold uppercase tracking-wide">About This Data</p>
              <p className="leading-relaxed">
                Event data from UT Austin athletic schedule CSV. Battery count reflects Base
                Power&apos;s current Austin deployment (~{FLEET_SIZE.toLocaleString()} units as of
                2025). ERCOT prices simulated based on historical averages for similar events —
                labeled &quot;sim&quot; when not fetched live. Revenue projections use $8–$25/battery
                spread depending on ERCOT price tier (batteries charge at ~$0.03/kWh overnight,
                discharge during event spike). Fleet size grows as Base Power deploys more units.
              </p>
            </div>
          </section>
        )}
      </div>

      {/* ===== FOOTER ===== */}
      <footer className="flex h-[58px] items-center justify-between border-t border-slate-800 bg-[#070b14] px-5 font-mono text-xs">
        <div className="flex items-center gap-4">
          <span style={{ color: ercotTier.color }}>
            ERCOT {ercotTier.label}: ${ercotPrice.toFixed(2)}/MWh
            {ercotIsSimulated && <span className="ml-1 opacity-40">[simulated]</span>}
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-500">
            Fleet: {FLEET_SIZE.toLocaleString()} batteries · Austin, TX
          </span>
        </div>
        {dispatchConfirmed && dispatchPayload && (
          <span className="text-[#22c55e]">
            ⚡ {stats.batteriesNeeded.toLocaleString()} batteries pre-charging · Est.{" "}
            {dispatchPayload.estimated_total_capture}
          </span>
        )}
        <span className="text-slate-700">Event data: UT Austin Athletics · Base Power demo</span>
      </footer>
    </div>
  );
}

// =====================================================================
// HELPER COMPONENTS
// =====================================================================

function TabButton({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm transition ${
        active
          ? "border-[#3b82f6] bg-[#1e3a8a]/60 text-white"
          : "border-slate-700 bg-[#0b1223] text-slate-300 hover:border-slate-500"
      }`}
    >
      {children}
    </button>
  );
}

function KpiCard({ label, value }) {
  return (
    <div className="rounded-md border border-slate-700 bg-[#0b1223] px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function StatRow({ label, value, hint }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-md border border-slate-700 bg-[#0b1223] px-3 py-2">
      <div className="min-w-0">
        <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
        {hint && <p className="mt-0.5 text-xs text-slate-600">{hint}</p>}
      </div>
      <span className="shrink-0 text-sm font-semibold text-slate-100">{value}</span>
    </div>
  );
}

function LegendItem({ color, label, dot, line }) {
  return (
    <div className="flex items-center gap-2 text-slate-300">
      {line ? (
        <div className="h-0 w-5 shrink-0 border-t-2 border-dashed" style={{ borderColor: color }} />
      ) : dot ? (
        <div className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
      ) : (
        <div
          className="h-3 w-3 shrink-0 rounded-full border-2 border-white"
          style={{ background: color }}
        />
      )}
      <span>{label}</span>
    </div>
  );
}

function LayerToggle({ color, label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-slate-300 transition hover:text-white">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3 w-3"
      />
      <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <span>{label}</span>
    </label>
  );
}

export default App;
