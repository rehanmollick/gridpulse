# GridPulse

### Real-time battery dispatch for the Austin grid. Built for [Base Power Company](https://www.basepower.com).

GridPulse is an operator command center: it watches UT Austin sports events, forecasts neighborhood-level demand spikes, and tells Base Power's fleet of **4,200 residential batteries** exactly when and where to discharge. Every decision is backed by live grid pricing and AI-generated operator briefs.

---

## What It Does

Large events drive 80-190% demand spikes in surrounding zip codes. GridPulse turns that into an actionable dispatch in three steps:

1. **Forecast** the demand spike per zip code based on event, venue, and attendance
2. **Pre-position** the right number of batteries with a pre-charge deadline
3. **Dispatch** via AI-confirmed command logged with revenue and timestamp

---


**Dashboard**

<img width="1710" height="944" alt="Dashboard" src="https://github.com/user-attachments/assets/56f0e614-caad-4c8e-b67d-dff053e81920" />

**Dispatch Setup and AI Brief**

<img width="1710" height="947" alt="Dispatch AI Brief" src="https://github.com/user-attachments/assets/537865ce-7650-4001-b999-e7989ecaf608" />

**Dispatch Commands**

<img width="1708" height="942" alt="Dispatch Commands" src="https://github.com/user-attachments/assets/0e4fe09d-40e5-4e41-9908-a4d4518b4c13" />

**Dispatch Log**

<img width="1710" height="946" alt="Dispatch Log" src="https://github.com/user-attachments/assets/165735bb-cc73-46da-8c1b-2604aa0cc675" />

---

## How It Works

### Data Pipeline

Three CSVs parsed client-side at runtime:

| File | Contents |
|------|---------|
| `UT_Sports_Events.csv` | Every UT home game: date, time, venue, attendance, sport |
| `Facility_Energy_Usage.csv` | Historical energy consumption per campus facility |
| `venues_capcity.csv` | Venue names, coordinates, capacity |

### Demand Spike Formula

```
demandIncrease (MW) = (attendance / venueCapacity) x categoryOccupancyFactor x baseLoadMultiplier x zipLoadShare
```

- **`categoryOccupancyFactor`** -- Football: 1.0 / Basketball: 0.85 / Baseball: 0.65
- **`zipLoadShare`** -- each affected zip gets a weighted % of total load by proximity to venue

Map surge tiers: **Red** >160% / **Orange** 120-160% / **Yellow** 80-120%

### Battery Dispatch Formula

```
batteriesNeeded  = demandIncrease (kW) / spreadPerBattery (kW)
preChargeBy      = eventStartTime - 90 min
estimatedRevenue = batteriesNeeded x ercotPrice x revenuePerBatteryFactor
```

### ERCOT Price Simulation

Live ERCOT fetch is CORS-blocked, so pricing falls back to a **deterministic date-seeded formula** -- same date always returns the same price:

```
price = seasonalBase + weekendBonus + attendanceBonus + bigEventBonus + deterministicNoise
```

| Factor | Value |
|--------|-------|
| Summer base (Jun-Sep) | $85/MWh |
| Winter base (Dec-Mar) | $38/MWh |
| Weekend bonus | +$18 |
| Football or Basketball | +$25 |
| Attendance (scaled) | up to +$60 |
| Seeded noise | +-$15 |

Price **snaps immediately** when the operator changes the date.

---

## APIs

| API | Purpose |
|-----|---------|
| **Mapbox GL JS v2.15.0** | Map, venue markers, battery clusters, demand surge zones |
| **Groq / llama-3.3-70b-versatile** | AI Dispatch Brief: operator instructions, timing, risk flags |
| **Morph / morph-v3-fast** | Dispatch confirmation and structured payload finalization |
| **ERCOT** | Live grid pricing attempt (falls back to simulation) |

---

## AI Integration

### Stage 1 -- Dispatch Brief (Groq)

Operator clicks **"Generate AI Dispatch Brief."** GridPulse sends Groq a structured prompt with event details, attendance, temperature, battery count, zip surge percentages, ERCOT price, and pre-charge deadline.

Groq returns a plain-language operator brief: what to activate, when, and what risk conditions to watch. Written for someone managing a live grid event.

### Stage 2 -- Dispatch Confirmation (Morph)

Operator clicks **"Confirm Dispatch."** GridPulse sends the full payload to Morph's `morph-v3-fast`, which validates and finalizes it. The result is a logged dispatch record with command ID, battery count, revenue, and timestamp.

Both stages fall back gracefully if API keys are missing.

---

## Why This Matters for Clean Energy

**The problem:** Grid operators handle demand spikes with natural gas peaker plants. They take 10-30 minutes to spin up, emit 0.5-0.8 kg CO2 per kWh, and only run briefly -- making them expensive and dirty per kWh delivered.

**GridPulse's answer:** Replace peaker response with pre-positioned battery dispatch. Base Power batteries charge during off-peak hours from Texas wind and solar, then discharge precisely at peak demand -- **zero combustion at point of use, instant response.**

For a single football game dispatch (~1,000 batteries, 2-3 MW):

- **No emissions** at point of discharge
- **Immediate response** vs. 10-30 min peaker spin-up
- **Maximum grid value** -- dispatching at peak ERCOT price displaces the dirtiest, most expensive generation on the grid

As Texas adds more wind and solar, every battery in Base Power's fleet gets cleaner over time. **GridPulse is the coordination layer that makes distributed clean energy dispatchable at city scale** -- letting dense urban areas absorb event-driven demand spikes without building new fossil fuel infrastructure.

---

## Tech Stack

- **React 18 + Vite 5**
- **Mapbox GL JS** via CDN
- **Tailwind CSS** via CDN with custom design tokens (Moss, Clay, Cream, Charcoal palette)
- **Groq SDK** + **Morph API**
- **GSAP** + **lucide-react**
- **Google Fonts** -- Plus Jakarta Sans, Outfit, Cormorant Garamond, JetBrains Mono

---

## Setup

```bash
git clone https://github.com/rehanmollick/gridpulse.git
cd gridpulse
npm install
```

`.env`:

```
VITE_MAPBOX_TOKEN=your_mapbox_token
VITE_GROQ_API_KEY=your_groq_key
VITE_MORPH_API_KEY=your_morph_key
```

```bash
npm run dev
# http://localhost:5173
```

---

Built for Base Power Company · Austin, TX · 2026
