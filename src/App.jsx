import { useEffect, useMemo, useRef, useState } from "react";

const EVENTS = [
  {
    name: "UT Longhorns vs Georgia",
    venue: "DKR Texas Memorial Stadium",
    lat: 30.2837,
    lng: -97.7326,
    attendance: 100247,
    endTime: "10:15 PM",
    tempF: 99,
    affectedZips: ["78705", "78751", "78752", "78756"],
    dispersalRadiusMiles: 4,
  },
  {
    name: "Post Malone at Moody Center",
    venue: "Moody Center",
    lat: 30.2874,
    lng: -97.7359,
    attendance: 15000,
    endTime: "11:00 PM",
    tempF: 88,
    affectedZips: ["78705", "78751"],
    dispersalRadiusMiles: 2,
  },
  {
    name: "ACL Festival - Weekend 1",
    venue: "Zilker Park",
    lat: 30.2672,
    lng: -97.7731,
    attendance: 75000,
    endTime: "10:00 PM",
    tempF: 95,
    affectedZips: ["78704", "78703", "78701"],
    dispersalRadiusMiles: 3.5,
  },
  {
    name: "Formula 1 US Grand Prix",
    venue: "Circuit of the Americas",
    lat: 30.1328,
    lng: -97.6411,
    attendance: 120000,
    endTime: "4:30 PM",
    tempF: 92,
    affectedZips: ["78617", "78744", "78748"],
    dispersalRadiusMiles: 6,
  },
  {
    name: "SXSW Music Festival",
    venue: "Downtown Austin",
    lat: 30.2672,
    lng: -97.7431,
    attendance: 250000,
    endTime: "2:00 AM",
    tempF: 72,
    affectedZips: ["78701", "78702", "78703", "78704"],
    dispersalRadiusMiles: 5,
  },
];

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

const AUSTIN_CENTER = [-97.7431, 30.2672];

function to12Hour(totalMinutes) {
  const minutesInDay = ((totalMinutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(minutesInDay / 60);
  const minutes = minutesInDay % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function subtractMinutes(time, delta) {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return time;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3].toUpperCase();
  if (meridiem === "AM" && hours === 12) hours = 0;
  if (meridiem === "PM" && hours !== 12) hours += 12;
  const total = hours * 60 + minutes - delta;
  return to12Hour(total);
}

function getProjectedMW(event) {
  const tempMultiplier = event.tempF > 90 ? 3.2 : event.tempF > 75 ? 1.8 : 1.0;
  return event.attendance * 0.0028 * tempMultiplier;
}

function getMapbox() {
  if (typeof window === "undefined" || !window.mapboxgl) return null;
  return window.mapboxgl;
}

function App() {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const venueMarkerRef = useRef(null);
  const [selectedName, setSelectedName] = useState(EVENTS[0].name);
  const [dispatchBrief, setDispatchBrief] = useState("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState("");
  const [dispatchConfirmed, setDispatchConfirmed] = useState(false);
  const [morphLoading, setMorphLoading] = useState(false);
  const [morphMessage, setMorphMessage] = useState("");
  const [ercotPrice, setErcotPrice] = useState(42);
  const [spreadValue, setSpreadValue] = useState(0);
  const rampTargetRef = useRef(null);
  const rampStartedAtRef = useRef(null);
  const initialRampPriceRef = useRef(42);

  const selectedEvent = useMemo(
    () => EVENTS.find((event) => event.name === selectedName) ?? EVENTS[0],
    [selectedName]
  );

  const stats = useMemo(() => {
    const projectedMW = getProjectedMW(selectedEvent);
    const batteriesNeeded = Math.round(projectedMW * 142);
    const preChargeBy = subtractMinutes(selectedEvent.endTime, 90);
    const revenueEstimate = Math.round(projectedMW * 847);
    return { projectedMW, batteriesNeeded, preChargeBy, revenueEstimate };
  }, [selectedEvent]);

  useEffect(() => {
    const mapboxgl = getMapbox();
    if (!mapNodeRef.current || !mapboxgl || mapRef.current) return;
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

    const map = new mapboxgl.Map({
      container: mapNodeRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: AUSTIN_CENTER,
      zoom: 10.2,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("heat-ring", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "heat-ring-layer",
        type: "circle",
        source: "heat-ring",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            20,
            10,
            60,
            12,
            120,
          ],
          "circle-color": "#f97316",
          "circle-opacity": 0.25,
          "circle-blur": 0.85,
        },
      });

      map.addSource("zip-points", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "zip-layer",
        type: "circle",
        source: "zip-points",
        paint: {
          "circle-color": "#f97316",
          "circle-radius": 18,
          "circle-opacity": 0.28,
          "circle-stroke-color": "#fb923c",
          "circle-stroke-width": 1.2,
          "circle-stroke-opacity": 0.8,
        },
      });
      map.addLayer({
        id: "zip-labels",
        type: "symbol",
        source: "zip-points",
        layout: {
          "text-field": ["get", "zip"],
          "text-size": 11,
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-offset": [0, 1.7],
        },
        paint: {
          "text-color": "#fdba74",
          "text-halo-color": "#0a0e1a",
          "text-halo-width": 1,
        },
      });
    });

    return () => {
      if (venueMarkerRef.current) {
        venueMarkerRef.current.remove();
        venueMarkerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyLayers = () => {
      map.flyTo({
        center: [selectedEvent.lng, selectedEvent.lat],
        zoom: 11.8,
        speed: 0.8,
        curve: 1.25,
      });

      const ringFeature = {
        type: "Feature",
        properties: { radiusMiles: selectedEvent.dispersalRadiusMiles },
        geometry: {
          type: "Point",
          coordinates: [selectedEvent.lng, selectedEvent.lat],
        },
      };

      const ringSource = map.getSource("heat-ring");
      if (ringSource) {
        ringSource.setData({
          type: "FeatureCollection",
          features: [ringFeature],
        });
        const radiusPixels = Math.max(55, selectedEvent.dispersalRadiusMiles * 40);
        map.setPaintProperty("heat-ring-layer", "circle-radius", radiusPixels);
      }

      const zipFeatures = selectedEvent.affectedZips
        .map((zip) => {
          const coords = ZIP_COORDS[zip];
          if (!coords) return null;
          return {
            type: "Feature",
            properties: { zip },
            geometry: { type: "Point", coordinates: coords },
          };
        })
        .filter(Boolean);

      const zipSource = map.getSource("zip-points");
      if (zipSource) {
        zipSource.setData({
          type: "FeatureCollection",
          features: zipFeatures,
        });
      }

      if (venueMarkerRef.current) venueMarkerRef.current.remove();
      const markerEl = document.createElement("div");
      markerEl.className = dispatchConfirmed
        ? "venue-marker confirmed"
        : "venue-marker pulsing";

      const mapboxgl = getMapbox();
      if (!mapboxgl) return;
      venueMarkerRef.current = new mapboxgl.Marker({ element: markerEl })
        .setLngLat([selectedEvent.lng, selectedEvent.lat])
        .addTo(map);
    };

    if (map.isStyleLoaded()) applyLayers();
    else map.once("load", applyLayers);
  }, [selectedEvent, dispatchConfirmed]);

  useEffect(() => {
    setDispatchConfirmed(false);
    setMorphMessage("");
    setDispatchBrief("");
    setBriefError("");
  }, [selectedEvent.name]);

  useEffect(() => {
    const ticker = setInterval(() => {
      setErcotPrice((prev) => {
        const randomMove = Math.random() * 16 - 8;
        let next = prev + randomMove;
        if (rampTargetRef.current && rampStartedAtRef.current) {
          const elapsed = (Date.now() - rampStartedAtRef.current) / 1000;
          const progress = Math.min(elapsed / 30, 1);
          const target =
            initialRampPriceRef.current +
            (rampTargetRef.current - initialRampPriceRef.current) * progress;
          next = Math.max(next, target);
          if (progress >= 1) {
            rampStartedAtRef.current = null;
          }
        }
        return Math.max(15, Math.min(450, Number(next.toFixed(2))));
      });
    }, 5000);

    return () => clearInterval(ticker);
  }, []);

  useEffect(() => {
    initialRampPriceRef.current = ercotPrice;
    rampTargetRef.current = 180 + Math.random() * 220;
    rampStartedAtRef.current = Date.now();
  }, [selectedEvent.name]);

  async function requestDispatchBrief() {
    setBriefLoading(true);
    setBriefError("");
    setDispatchBrief("");
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_GROQ_API_KEY ?? ""}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "You are GridPulse, an AI energy dispatch system for Base Power. You analyze Austin events and generate urgent, specific battery pre-charge recommendations. Be concise, specific, and data-driven. Sound like a real operations system, not a chatbot. Max 4 sentences.",
            },
            {
              role: "user",
              content: `Event: ${selectedEvent.name} at ${selectedEvent.venue}. Attendance: ${selectedEvent.attendance.toLocaleString()}. Temperature: ${selectedEvent.tempF}°F. Event ends: ${selectedEvent.endTime}. Projected demand spike: ${stats.projectedMW.toFixed(1)}MW across zip codes ${selectedEvent.affectedZips.join(", ")}. Batteries needed: ${stats.batteriesNeeded}. Generate a dispatch brief for Base Power's operations team.`,
            },
          ],
          temperature: 0.4,
        }),
      });

      if (!response.ok) {
        throw new Error(`Groq request failed (${response.status})`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content?.trim();
      setDispatchBrief(content || "No dispatch brief returned.");
    } catch (error) {
      setBriefError(error.message || "Unable to generate dispatch brief.");
    } finally {
      setBriefLoading(false);
    }
  }

  async function confirmDispatchWithMorph() {
    setMorphLoading(true);
    setMorphMessage("");
    try {
      const dispatchState = {
        event: selectedEvent.name,
        venue: selectedEvent.venue,
        projectedMW: Number(stats.projectedMW.toFixed(1)),
        batteriesNeeded: stats.batteriesNeeded,
        preChargeBy: stats.preChargeBy,
        affectedZips: selectedEvent.affectedZips,
      };
      const response = await fetch("https://api.morphllm.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_MORPH_API_KEY ?? ""}`,
        },
        body: JSON.stringify({
          model: "morph-v3-fast",
          messages: [
            {
              role: "system",
              content:
                "You execute dispatch intent confirmations for an energy fleet management workflow.",
            },
            {
              role: "user",
              content: `Apply the following dispatch state:\n${JSON.stringify(dispatchState, null, 2)}\n\nInstruction:\n${dispatchBrief}`,
            },
          ],
          temperature: 0.2,
        }),
      });
      if (!response.ok) {
        throw new Error(`Morph request failed (${response.status})`);
      }
      await response.json();

      setDispatchConfirmed(true);
      setSpreadValue(Math.max(20, Math.round(ercotPrice - 42)));
      setMorphMessage(
        `${stats.batteriesNeeded.toLocaleString()} batteries pre-charging in zip codes ${selectedEvent.affectedZips.join(", ")}`
      );
    } catch (error) {
      setMorphMessage(error.message || "Dispatch confirmation failed.");
    } finally {
      setMorphLoading(false);
    }
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0a0e1a] text-white">
      <div className="relative h-[calc(100%-58px)]">
        <div ref={mapNodeRef} className="absolute inset-0" />

        <aside className="absolute left-4 top-4 z-20 w-[320px] rounded-xl border border-slate-700/70 bg-[#0d1426]/95 p-4 shadow-2xl backdrop-blur">
          <h1 className="text-xl font-bold tracking-wide text-[#3b82f6]">GridPulse</h1>
          <p className="mt-1 text-xs text-slate-300">
            AI-powered pre-charge forecasting for Base Power's Austin fleet.
          </p>

          <div className="mt-4">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Select Event
            </label>
            <select
              value={selectedName}
              onChange={(event) => setSelectedName(event.target.value)}
              className="w-full rounded-md border border-slate-600 bg-[#111a30] px-3 py-2 text-sm text-slate-100 outline-none transition hover:border-[#3b82f6] focus:border-[#3b82f6]"
            >
              {EVENTS.map((event) => (
                <option key={event.name} value={event.name}>
                  {event.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 rounded-lg border border-slate-700 bg-[#0b1223] p-3">
            <p className="text-sm font-semibold text-slate-100">{selectedEvent.venue}</p>
            <p className="mt-1 text-xs text-slate-400">
              End Time: {selectedEvent.endTime} · Temp: {selectedEvent.tempF}F
            </p>
            <p className="mt-2 text-xs text-slate-300">
              Affected ZIPs: {selectedEvent.affectedZips.join(", ")}
            </p>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <StatRow label="Projected Demand Spike" value={`${stats.projectedMW.toFixed(1)} MW`} />
            <StatRow
              label="Batteries to Pre-Charge"
              value={stats.batteriesNeeded.toLocaleString()}
            />
            <StatRow label="Pre-Charge Deadline" value={stats.preChargeBy} />
            <StatRow
              label="Est. Arbitrage Revenue"
              value={`$${stats.revenueEstimate.toLocaleString()}`}
            />
          </div>

          <button
            onClick={requestDispatchBrief}
            disabled={briefLoading}
            className="mt-4 w-full rounded-md bg-[#3b82f6] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#2563eb] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {briefLoading ? "Generating Brief..." : "Generate AI Dispatch Brief"}
          </button>
        </aside>

        <section className="absolute right-4 top-4 z-20 w-[390px] rounded-xl border border-slate-700/70 bg-[#0d1426]/95 p-4 shadow-2xl backdrop-blur">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#3b82f6]">
            AI Dispatch Brief
          </h2>

          <div className="mt-3 min-h-[220px] rounded-lg border border-slate-700 bg-[#050914] p-3 font-mono text-sm text-slate-100">
            {briefLoading && (
              <div className="flex items-center gap-3 text-slate-300">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#3b82f6] border-t-transparent" />
                Querying Groq dispatch model...
              </div>
            )}
            {!briefLoading && briefError && (
              <p className="text-[#f97316]">Dispatch brief unavailable: {briefError}</p>
            )}
            {!briefLoading && !briefError && dispatchBrief && (
              <p className="whitespace-pre-line leading-relaxed">{dispatchBrief}</p>
            )}
            {!briefLoading && !briefError && !dispatchBrief && (
              <p className="text-slate-500">
                Select an event and generate a dispatch brief to receive an operations-grade recommendation.
              </p>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-slate-700 bg-[#0b1223] p-3 text-sm text-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-400">Battery Deployment Recommendation</p>
            <p className="mt-2">
              Stage <span className="font-semibold text-[#3b82f6]">{stats.batteriesNeeded.toLocaleString()}</span>{" "}
              batteries for zones {selectedEvent.affectedZips.join(", ")} by{" "}
              <span className="font-semibold text-[#f97316]">{stats.preChargeBy}</span>.
            </p>
          </div>

          {dispatchBrief && (
            <button
              onClick={confirmDispatchWithMorph}
              disabled={morphLoading}
              className="mt-4 w-full rounded-md bg-[#f97316] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#ea580c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {morphLoading ? "Applying Dispatch..." : "⚡ Confirm Dispatch with Morph"}
            </button>
          )}

          {dispatchConfirmed && (
            <div className="mt-4 rounded-md border border-[#22c55e]/70 bg-[#05200f] px-3 py-2 text-sm text-[#86efac]">
              ✓ Dispatch Confirmed
            </div>
          )}
          {morphMessage && <p className="mt-2 text-xs text-slate-300">{morphMessage}</p>}
        </section>
      </div>

      <footer className="flex h-[58px] items-center justify-between border-t border-slate-800 bg-[#070b14] px-5 font-mono text-sm">
        <span className={dispatchConfirmed ? "text-[#22c55e]" : "text-slate-200"}>
          ERCOT Real-Time Price: ${ercotPrice.toFixed(2)}/MWh
        </span>
        {dispatchConfirmed && (
          <span className="text-[#22c55e]">Base Power capturing ${spreadValue}/MWh spread</span>
        )}
      </footer>
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-700 bg-[#0b1223] px-3 py-2">
      <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
      <span className="font-semibold text-slate-100">{value}</span>
    </div>
  );
}

export default App;
