# GridPulse

A real-time battery dispatch command center built for **Base Power Company** — Austin, TX.

GridPulse gives grid operators a live map-based interface to monitor energy demand spikes around UT Austin sports events, pre-position battery clusters, and dispatch stored energy back to the grid at peak pricing moments — all guided by AI.

---

## What It Does

When a major event (football game, basketball, baseball) happens at a UT Austin venue, surrounding zip codes see demand spikes of 80–190% above normal. GridPulse:

1. Ingests historical UT Athletics event data and facility energy usage
2. Calculates exactly which zip codes will spike and by how much
3. Tells operators how many batteries to pre-charge and when
4. Lets the AI generate a full dispatch brief — and then executes the dispatch

Operators go from raw event data to a confirmed energy dispatch in three clicks.

---

## Screenshot — Dashboard

> *[Insert screenshot of Dashboard tab here]*

---

## Screenshot — Dispatch Setup

> *[Insert screenshot of Dispatch tab with event loaded here]*

---

## Who It's For

**Base Power Company** operates a fleet of residential battery systems across Austin. Each home battery is a dispatchable asset. GridPulse is the operator layer that coordinates when and where to dispatch that fleet based on real grid signals and event-driven demand forecasting.

The fleet: **4,200 batteries** across Austin metro.

---

## How It Works

### Event Data Pipeline

- Loads `UT_Sports_Events.csv` — every UT home game with date, time, venue, attendance, and sport
- Loads `Facility_Energy_Usage.csv` — historical energy consumption per campus facility
- Loads `venues_capcity.csv` — venue names, coordinates, and capacity figures
- All three are parsed client-side from CSV at runtime — no backend required

### Demand Spike Calculation

Each event maps to 1–4 Austin zip codes based on venue proximity. Load increase per zip is calculated as:

```
demandIncrease (MW) = (attendance / venueCapacity) × categoryOccupancyFactor × baseLoadMultiplier × zipLoadShare
```

- `categoryOccupancyFactor` — Football = 1.0, Basketball = 0.85, Baseball = 0.65, etc.
- `baseLoadMultiplier` — scales the raw attendance ratio to realistic MW values
- `zipLoadShare` — each zip gets a weighted percentage of total projected load based on geographic proximity to the venue

Surge tiers displayed on map:
- Red: >160% above normal
- Orange: 120–160% elevated  
- Yellow: 80–120% moderate

### Battery Dispatch Calculation

```
batteriesNeeded = demandIncrease (MW) × 1000 (kW) / spreadPerBattery (kW)
preChargeBy = eventStartTime − 90 minutes
estimatedRevenue = batteriesNeeded × ercotPrice × revenuePerBatteryFactor
```

`spreadPerBattery` is the per-unit discharge rate based on battery spec (Base Power hardware).

### ERCOT Price Simulation

Live ERCOT pricing is attempted via fetch. It always fails due to CORS, so GridPulse falls back to a deterministic date-seeded simulation:

```
price = seasonalBase + weekendBonus + attendanceBonus + bigEventBonus + deterministicNoise
```

- Summer (Jun–Sep): base $85/MWh
- Spring (Apr–May): base $52/MWh
- Fall (Oct–Nov): base $48/MWh
- Winter (Dec–Mar): base $38/MWh
- Weekend: +$18, Friday: +$10
- Attendance: up to +$60 scaled to 120k max
- Football/Basketball: +$25 flat
- Noise: ±$15 seeded from date string (same date = same price, always)

Price snaps immediately when the operator changes the date.

---

## Screenshot — AI Dispatch Brief

> *[Insert screenshot of AI brief panel here]*

---

## APIs Used

| API | Purpose |
|-----|---------|
| **Mapbox GL JS v2.15.0** | Interactive map, venue markers, battery cluster dots, demand surge heat zones |
| **Groq — llama-3.3-70b-versatile** | Generates the AI Dispatch Brief — operator instructions, timing, risk flags |
| **Morph — morph-v3-fast** | Confirms and finalizes the dispatch command, returns structured payload |
| **ERCOT** | Attempted live real-time grid pricing (CORS-blocked, falls back to simulation) |

---

## AI Integration

GridPulse uses AI at two stages of the dispatch workflow:

**Stage 1 — Dispatch Brief (Groq)**

The operator clicks "Generate AI Dispatch Brief." GridPulse sends a structured prompt to Groq's `llama-3.3-70b-versatile` model containing:
- Event name, venue, date, start/end time
- Attendance and estimated temperature
- Number of batteries to dispatch
- Affected zip codes and their surge percentages
- Current ERCOT price and tier
- Pre-charge deadline

Groq returns a plain-language brief written for a grid operator: what to do, when, what to watch for. It reads like an air traffic control briefing — precise, no fluff.

**Stage 2 — Dispatch Confirmation (Morph)**

After reviewing the brief, the operator clicks "Confirm Dispatch." GridPulse sends the full dispatch payload to Morph's `morph-v3-fast` model, which validates and finalizes it. The confirmed dispatch is logged with a unique command ID, timestamp, battery count, and revenue estimate.

If either API key is missing, both stages fall back gracefully — Groq uses a mock brief, Morph uses a 900ms simulated confirmation.

---

## Sustainability Impact

Base Power's residential battery network is built entirely on **clean stored energy** — no combustion, no peaker plants.

Traditional grid operators handle demand spikes by spinning up natural gas peaker plants. These plants:
- Take 10–30 minutes to reach output
- Emit CO₂ at ~0.5–0.8 kg per kWh
- Run inefficiently because they only activate for short windows

GridPulse replaces that response with pre-positioned battery dispatch. The energy stored in Base Power's residential fleet comes from the grid during off-peak hours — increasingly sourced from Texas wind and solar. That stored energy is then discharged precisely when and where it's needed.

**For a single football game dispatch (1,000+ batteries, ~2–3 MW):**
- Zero combustion emissions at point of discharge
- Response time: immediate (batteries pre-charged 90 min before kickoff)
- Energy returned to grid at highest-value moment (peak ERCOT pricing = peak demand = highest carbon intensity on the grid)

As Texas builds more wind and solar capacity, the stored energy in Base Power's fleet becomes increasingly renewable. GridPulse is the operational layer that makes that stored clean energy dispatchable at city scale.

**The bigger picture:** As cities grow and host more large events — concerts, sports, festivals — demand spikes become more frequent and harder to predict. A distributed battery network coordinated by a tool like GridPulse means cities can absorb those spikes without new fossil fuel infrastructure. It's how clean energy scales to urban density.

---

## Screenshot — Dispatch Log

> *[Insert screenshot of Log tab with confirmed dispatches here]*

---

## Tech Stack

- **React 18 + Vite 5** — frontend framework and dev server
- **Mapbox GL JS** — map rendering via CDN
- **Tailwind CSS** — utility styling via CDN with custom design tokens
- **GSAP + lucide-react** — animation and iconography
- **Google Fonts** — Plus Jakarta Sans, Outfit, Cormorant Garamond, JetBrains Mono
- **Groq SDK** — AI brief generation
- **Morph API** — dispatch confirmation
- No backend. No database. Runs entirely in the browser.

---

## Setup

```bash
git clone https://github.com/rehanmollick/gridpulse.git
cd gridpulse
npm install
```

Create a `.env` file:

```
VITE_MAPBOX_TOKEN=your_mapbox_token
VITE_GROQ_API_KEY=your_groq_key
VITE_MORPH_API_KEY=your_morph_key
```

```bash
npm run dev
```

Open `http://localhost:5173`

---

Built for Base Power Company · Austin, TX · 2026
