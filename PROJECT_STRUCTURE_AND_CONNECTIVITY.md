# Project Structure & Connectivity — ChainMind

> Complete file-by-file breakdown of every module, its purpose, exports, and how it connects to other files across all three services.

---

## Table of Contents

- [High-Level Architecture](#high-level-architecture)
- [Service Ports & Communication](#service-ports--communication)
- [AI Service (Python)](#ai-service-python)
- [Backend (Node.js)](#backend-nodejs)
- [Frontend (React)](#frontend-react)
- [Database Layer](#database-layer)
- [End-to-End Data Flows](#end-to-end-data-flows)
- [Cross-Service Connectivity Map](#cross-service-connectivity-map)
- [Scripts & Configuration](#scripts--configuration)

---

## High-Level Architecture

```
Supply_Chain/
├── ai-service/          Python FastAPI  — ML inference + GenAI (LLM chat, narratives, agent)
├── backend/             Node.js Express — REST API + WebSocket + DB layer
├── frontend/            React + Vite    — SPA dashboard + map + GenAI UI
├── docs/                Documentation
├── scripts/             Shell scripts for setup/run
├── docker-compose.yml   Container orchestration
├── README.md            Project overview
├── ML_MODEL.md          ML model documentation
├── GENERATIVE_AI_AND_AGENT.md  GenAI documentation
└── PROJECT_STRUCTURE_AND_CONNECTIVITY.md  (this file)
```

---

## Service Ports & Communication

```
Frontend :5175  ──HTTP/WS──▶  Backend :3001  ──HTTP──▶  AI Service :8000  ──HTTPS──▶  OpenRouter API
                                   │
                                   ▼
                          PostgreSQL (Neon)
```

| From                    | To                    | Protocol                                     | Purpose |
| ----------------------- | --------------------- | -------------------------------------------- | ------- |
| Frontend → Backend      | HTTP REST             | API calls (shipments, routes, alerts, GenAI) |
| Frontend → Backend      | WebSocket (Socket.IO) | Real-time events                             |
| Backend → AI Service    | HTTP REST             | ML inference + GenAI proxy                   |
| AI Service → Backend    | HTTP REST             | Tool execution (chat tools, agent actions)   |
| AI Service → OpenRouter | HTTPS                 | LLM API (Gemini 2.0 Flash)                   |
| Backend → PostgreSQL    | TCP (pg)              | Database queries via Knex                    |

---

## AI Service (Python)

```
ai-service/
├── Dockerfile                          # Container build
├── requirements.txt                    # Python dependencies
├── app/
│   ├── main.py                         # FastAPI app entry, 15 endpoints
│   ├── models/                         # Serialized ML models (9 files)
│   │   ├── delay_classifier.joblib
│   │   ├── delay_regressor.joblib
│   │   ├── label_encoders.joblib
│   │   ├── anomaly_detector.joblib
│   │   ├── anomaly_scaler.joblib
│   │   ├── route_score_regressor.joblib
│   │   ├── simulation_shipments_regressor.joblib
│   │   └── simulation_delay_regressor.joblib
│   ├── schemas/
│   │   └── models.py                   # 15 Pydantic request/response schemas
│   └── services/
│       ├── prediction_service.py       # Delay prediction (4 models)
│       ├── disruption_detector.py      # Anomaly detection (IsolationForest)
│       ├── route_optimizer.py          # Route scoring & recommendation
│       ├── simulation_service.py       # Disruption impact simulation
│       ├── gemini_service.py           # LLM chat with 10 function-calling tools
│       ├── narrative_service.py        # 4 narrative report generators
│       └── agent_service.py            # Autonomous Observe→Reason→Act agent
├── training/
│   ├── generate_data.py                # Synthetic data generator (30K records)
│   ├── train_models.py                 # Model training pipeline
│   ├── evaluate_models.py             # Evaluation metrics & plots
│   └── data/
│       └── supply_chain_data.csv       # Generated training data
└── notebooks/                          # Jupyter notebooks (exploration)
```

### File Details

#### `app/main.py` (242 lines)

- **Role:** FastAPI application entry point
- **Startup:** Loads all 9 joblib models via `lifespan` context manager into `app.state`
- **Endpoints (15):**
  - `GET /health` — Health check
  - `POST /predict-delay` → `prediction_service.predict()`
  - `POST /detect-anomaly` → `disruption_detector.detect()`
  - `POST /score-routes` → `route_optimizer.score()`
  - `POST /recommend-route` → `route_optimizer.recommend()`
  - `POST /simulate-disruption` → `simulation_service.simulate()`
  - `POST /ai/chat` → `gemini_service.chat()`
  - `POST /ai/insights/fleet` → `narrative_service.fleet()`
  - `POST /ai/insights/shipment` → `narrative_service.shipment()`
  - `POST /ai/insights/disruption` → `narrative_service.disruption()`
  - `POST /ai/insights/briefing` → `narrative_service.briefing()`
  - `POST /ai/agent/run` → `agent_service.run()`
  - `GET /ai/agent/history` → `agent_service.history()`
- **Connects to:** All 7 service modules, schemas/models.py

#### `app/schemas/models.py` (205 lines)

- **Role:** Pydantic models for request/response validation
- **Exports (15):** `PredictionRequest`, `PredictionResponse`, `AnomalyRequest`, `AnomalyResponse`, `RouteCandidate`, `RouteScoreRequest`, `RouteScoreResponse`, `RouteRecommendRequest`, `RouteRecommendResponse`, `SimulationRequest`, `SimulationResponse`, `ChatRequest`, `ChatResponse`, `AgentResponse`, `NarrativeResponse`
- **Connects to:** main.py (type annotations for all endpoints)

#### `app/services/prediction_service.py` (155 lines)

- **Role:** Delay prediction using classifier + 2 regressors + label encoders
- **Exports:** `predict_delay(request, models)` → `PredictionResponse`
- **Models used:** `delay_classifier`, `delay_regressor` (×2), `label_encoders`
- **Connects to:** main.py (called from `/predict-delay`)

#### `app/services/disruption_detector.py` (125 lines)

- **Role:** Anomaly detection using IsolationForest + StandardScaler
- **Exports:** `detect_anomaly(request, models)` → `AnomalyResponse`
- **Models used:** `anomaly_detector`, `anomaly_scaler`
- **Connects to:** main.py (called from `/detect-anomaly`)

#### `app/services/route_optimizer.py` (170 lines)

- **Role:** Route candidate scoring and recommendation
- **Exports:** `score_routes(request, models)`, `recommend_route(request, models)`
- **Models used:** `route_score_regressor`
- **Connects to:** main.py (called from `/score-routes`, `/recommend-route`)

#### `app/services/simulation_service.py` (96 lines)

- **Role:** Disruption impact simulation
- **Exports:** `simulate_disruption(request, models)` → `SimulationResponse`
- **Models used:** `simulation_shipments_regressor`, `simulation_delay_regressor`
- **Connects to:** main.py (called from `/simulate-disruption`)

#### `app/services/gemini_service.py` (596 lines)

- **Role:** LLM-powered chat with function-calling tools
- **Exports:** `chat(message, history)` → `ChatResponse`
- **External calls:** OpenRouter API (Gemini), Backend REST API (10 tool endpoints)
- **Connects to:** main.py (called from `/ai/chat`)

#### `app/services/narrative_service.py` (315 lines)

- **Role:** 4 narrative report generators using LLM
- **Exports:** `generate_fleet_insights()`, `generate_shipment_insights(shipment)`, `generate_disruption_insights()`, `generate_briefing()`
- **External calls:** OpenRouter API, Backend REST API (data fetching)
- **Connects to:** main.py (called from `/ai/insights/*`)

#### `app/services/agent_service.py` (430 lines)

- **Role:** Autonomous agent with Observe→Reason→Act cycle
- **Exports:** `run_agent_cycle()` → `AgentResponse`, `get_agent_history(limit)`
- **External calls:** OpenRouter API, Backend REST API (observation + action tools)
- **State:** In-memory `deque(maxlen=10)` for history
- **Connects to:** main.py (called from `/ai/agent/run`, `/ai/agent/history`)

#### `training/generate_data.py` (185 lines)

- **Role:** Generate 30K synthetic training records
- **Output:** `training/data/supply_chain_data.csv`
- **Connects to:** train_models.py (data source)

#### `training/train_models.py` (281 lines)

- **Role:** Train all ML models with anti-overfitting measures
- **Input:** `training/data/supply_chain_data.csv`
- **Output:** 9 joblib files in `app/models/`
- **Connects to:** generate_data.py (data), app/models/ (output)

#### `training/evaluate_models.py` (135 lines)

- **Role:** Evaluate trained models with metrics and plots
- **Input:** Same CSV + trained models
- **Connects to:** train_models.py (uses same data), app/models/ (loads models)

---

## Backend (Node.js)

```
backend/
├── knexfile.ts                         # Database config (Neon PostgreSQL)
├── package.json                        # Dependencies & scripts
├── src/
│   ├── server.ts                       # Express app entry, route mounting
│   ├── socket.ts                       # Socket.IO setup & event types
│   ├── db/
│   │   ├── connection.ts               # Knex instance + health check
│   │   └── migrations/
│   │       ├── 01_create_initial_schema.ts   # shipments, warehouses, disruptions, routes, predictions, alternate_routes
│   │       ├── 02_add_users_and_carriers.ts  # users, carriers
│   │       ├── 03_create_network_graph.ts    # network_nodes, network_edges
│   │       ├── 04_upgrade_shipments_and_route_versioning.ts  # route_plans, route_segments, shipment_events + shipment columns
│   │       └── 05_add_disruption_weather_prediction_ops.ts   # alerts, delay_predictions, weather_snapshots, api_cache, job_runs + disruption columns
│   ├── routes/
│   │   ├── shipments.ts                # 7 endpoints — CRUD, tracking, status, location
│   │   ├── routes.ts                   # 6 endpoints — route planning, rerouting, network
│   │   ├── disruptions.ts             # 4 endpoints — list, simulate, detect, resolve
│   │   ├── alerts.ts                   # 3 endpoints — list, mark-read, by-shipment
│   │   ├── analytics.ts               # 5 endpoints — summary, trends, bottlenecks, map, risk
│   │   ├── genai.ts                    # 7 endpoints — proxy to AI service
│   │   ├── ai.ts                       # 5 endpoints — ML prediction proxy + heuristic
│   │   └── demo.ts                     # 3 endpoints — seed, god-mode, reset
│   ├── services/
│   │   ├── aiService.ts                # ML prediction with heuristic fallback
│   │   ├── shipmentService.ts          # Shipment CRUD + events
│   │   ├── routeService.ts             # Route planning, rerouting, network queries
│   │   ├── disruptionService.ts        # Disruption lifecycle management
│   │   ├── alertService.ts             # Alert queries and mutations
│   │   ├── dashboardService.ts         # Analytics aggregations
│   │   └── simulationService.ts        # Demo data seeding & scenarios
│   ├── middleware/
│   │   ├── errorHandler.ts             # Global error handler
│   │   ├── validation.ts               # Request validation helpers
│   │   └── internalAuth.ts             # API key auth for AI→Backend calls
│   └── utils/
│       ├── constants.ts                # Enums, status arrays
│       └── helpers.ts                  # Pagination parser, tracking number gen
└── tests/                              # Test files
```

### File Details

#### `knexfile.ts`

- **Role:** Knex ORM configuration
- **Connection:** `DATABASE_URL` env var, `pg` client, SSL required
- **Pool:** `min: 0, max: 5`, `idleTimeoutMillis: 10000`, `reapIntervalMillis: 1000`
- **afterCreate:** Sets `statement_timeout = '15s'` per connection
- **Connects to:** Neon PostgreSQL, all services via connection.ts

#### `src/server.ts` (47 lines)

- **Role:** Express app setup, route mounting, Socket.IO initialization
- **Route mounts:**
  | Mount Point | Router | File |
  |-------------|--------|------|
  | `/api/shipments` | shipmentRouter | routes/shipments.ts |
  | `/api` | routeRouter | routes/routes.ts |
  | `/api/disruptions` | disruptionRouter | routes/disruptions.ts |
  | `/api/alerts` | alertRouter | routes/alerts.ts |
  | `/api/dashboard` | analyticsRouter | routes/analytics.ts |
  | `/api/demo` | demoRouter | routes/demo.ts |
  | `/ai` | aiRouter | routes/ai.ts |
  | `/api/genai` | genaiRouter | routes/genai.ts |
- **Connects to:** All route files, socket.ts, middleware/errorHandler.ts

#### `src/socket.ts` (33 lines)

- **Role:** Socket.IO server setup and event broadcasting
- **Events broadcast:** `shipment:updated`, `shipment:delayed`, `shipment:delivered`, `shipment:rerouted`, `disruption:new`, `disruption:resolved`, `alert:new`, `dashboard:refresh`
- **Connects to:** server.ts (initialization), all route files (emit events)

#### `src/db/connection.ts` (13 lines)

- **Role:** Create and export Knex instance, run `SELECT 1` health check on startup
- **Connects to:** knexfile.ts (configuration), all services (DB queries)

#### Route Files

| File                         | Endpoints | Tables Accessed                                                                             | Services Used     | Socket Events                                         |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------- |
| `shipments.ts` (157 lines)   | 7         | shipments, shipment_events                                                                  | shipmentService   | shipment:updated/delayed/delivered, dashboard:refresh |
| `routes.ts` (142 lines)      | 6         | route_plans, route_segments, network_nodes, network_edges                                   | routeService      | shipment:updated/rerouted, dashboard:refresh          |
| `disruptions.ts` (162 lines) | 4         | disruptions, network_edges, network_nodes, alerts                                           | disruptionService | disruption:new/resolved, alert:new, dashboard:refresh |
| `alerts.ts` (99 lines)       | 3         | alerts                                                                                      | alertService      | dashboard:refresh                                     |
| `analytics.ts` (91 lines)    | 5         | shipments, disruptions, alerts, delay*predictions, network*\*, route_plans, shipment_events | dashboardService  | —                                                     |
| `genai.ts` (78 lines)        | 7         | — (proxy)                                                                                   | —                 | —                                                     |
| `ai.ts` (63 lines)           | 5         | delay_predictions                                                                           | aiService         | disruption:new, alert:new                             |
| `demo.ts` (124 lines)        | 3         | Multiple (full seed)                                                                        | simulationService | shipment:updated, disruption:new, alert:new           |

#### Service Files

| File                   | Lines | Exports                                                                                                                                                               | DB Tables                                                                                   | External Calls  |
| ---------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------- |
| `aiService.ts`         | ~500  | `predictDelay()`, `detectAnomaly()`, `scoreRouteCandidates()`, `recommendRoute()`, `generateDisruptionScenario()`                                                     | delay_predictions                                                                           | AI Service HTTP |
| `shipmentService.ts`   | ~350  | `createShipment()`, `listShipments()`, `getShipmentById()`, `getShipmentByTrackingNumber()`, `updateShipmentStatus()`, `addShipmentLocation()`, `getShipmentEvents()` | shipments, shipment_events                                                                  | —               |
| `routeService.ts`      | ~400  | `generateInitialRoute()`, `getActiveRoute()`, `getAlternatives()`, `rerouteShipment()`, `listNetworkNodes()`, `listNetworkEdges()`                                    | route_plans, route_segments, network_nodes, network_edges                                   | —               |
| `disruptionService.ts` | ~400  | `listDisruptions()`, `simulateDisruption()`, `detectDisruptions()`, `resolveDisruption()`                                                                             | disruptions, network_edges, network_nodes, alerts                                           | —               |
| `alertService.ts`      | ~200  | `listAlerts()`, `markAlertRead()`, `listAlertsByShipment()`                                                                                                           | alerts                                                                                      | —               |
| `dashboardService.ts`  | ~300  | `getDashboardSummary()`, `getDelayTrends()`, `getBottlenecks()`, `getMapData()`, `getRiskDistribution()`                                                              | shipments, disruptions, alerts, delay*predictions, network*\*, route_plans, shipment_events | —               |
| `simulationService.ts` | ~250  | `seedDemoData()`, `triggerGodMode()`, `resetDemoState()`                                                                                                              | All tables                                                                                  | —               |

#### Middleware

| File              | Purpose                                                   | Used By     |
| ----------------- | --------------------------------------------------------- | ----------- |
| `errorHandler.ts` | Global Express error handler, formats error responses     | server.ts   |
| `validation.ts`   | Request validation helpers (enum checkers, type coercers) | Route files |
| `internalAuth.ts` | API key validation for AI→Backend internal calls          | ai.ts       |

#### Utils

| File           | Exports                                                                                  | Used By          |
| -------------- | ---------------------------------------------------------------------------------------- | ---------------- |
| `constants.ts` | `SHIPMENT_STATUSES`, `DISRUPTION_TYPES`, `DISRUPTION_STATUSES`, `TRANSPORT_MODES`, enums | Routes, services |
| `helpers.ts`   | `parsePagination(query)`, `generateTrackingNumber()`                                     | Routes, services |

---

## Frontend (React)

```
frontend/
├── index.html                          # HTML shell, #root mount
├── package.json                        # Dependencies
├── vite.config.ts                      # Vite + React plugin, @ alias
├── tailwind.config.js                  # Tailwind content paths
├── tsconfig.json                       # TypeScript strict config
├── postcss.config.js                   # PostCSS + Tailwind
├── public/                             # Static assets
└── src/
    ├── main.tsx                        # React entry, StrictMode render
    ├── App.tsx                         # Router: Dashboard + ShipmentDetail
    ├── index.css                       # Tailwind imports + Leaflet dark theme
    ├── vite-env.d.ts                   # Vite type declarations
    ├── types/                          # TypeScript type definitions (10 modules)
    │   ├── index.ts                    # Re-exports
    │   ├── ai.ts                       # ML prediction types
    │   ├── alert.ts                    # Alert types
    │   ├── api.ts                      # Generic API response wrappers
    │   ├── dashboard.ts               # Dashboard KPI/chart types
    │   ├── disruption.ts              # Disruption types
    │   ├── map.ts                      # Map layer/marker types
    │   ├── realtime.ts                # Socket event types
    │   ├── route.ts                    # Route/network types
    │   └── shipment.ts                # Shipment types
    ├── utils/                          # Utility functions (7 modules)
    │   ├── index.ts                    # Re-exports
    │   ├── constants.ts               # Colors, intervals, status arrays
    │   ├── formatters.ts              # Percent, ETA, relative time
    │   ├── helpers.ts                 # Number coercion, error parsing
    │   ├── riskUtils.ts               # Risk normalization & scoring
    │   ├── statusColors.ts            # Status → color tone mapping
    │   └── mapLegend.ts               # Map legend items
    ├── hooks/                          # Custom React hooks (5)
    │   ├── index.ts                    # Re-exports
    │   ├── useDashboardData.ts        # Dashboard data fetching + polling
    │   ├── useDemoControls.ts         # Demo seed/scenario controls
    │   ├── useMapLayers.ts            # Map layer toggle state
    │   ├── useRealtime.ts             # Socket.IO connection + events
    │   └── useShipmentDetail.ts       # Shipment detail data fetching
    ├── services/                       # API clients & data mappers
    │   ├── api/                        # HTTP API layer
    │   │   ├── index.ts               # Re-exports
    │   │   ├── httpClient.ts          # Base HTTP client (fetch wrapper)
    │   │   ├── dashboardApi.ts        # Dashboard API calls
    │   │   ├── alertsApi.ts           # Alerts API calls
    │   │   ├── shipmentsApi.ts        # Shipments API calls
    │   │   ├── routesApi.ts           # Routes API calls
    │   │   ├── disruptionsApi.ts      # Disruptions API calls
    │   │   └── genaiApi.ts            # GenAI API calls
    │   ├── demo/
    │   │   └── demoApi.ts             # Demo endpoint calls
    │   ├── mappers/
    │   │   ├── dashboardMapper.ts     # Raw API → chart-ready data
    │   │   └── shipmentMapper.ts      # Raw API → component-ready data
    │   └── realtime/
    │       └── socketClient.ts        # Socket.IO event emitter
    ├── pages/                          # Route-level pages
    │   ├── DashboardPage.tsx          # Main dashboard (KPIs, map, charts, GenAI)
    │   └── ShipmentDetailPage.tsx     # Single shipment view
    ├── components/                     # Reusable UI components
    │   ├── common/                    # Generic components
    │   │   ├── LoadingBlock.tsx       # Skeleton loader
    │   │   ├── ErrorBoundary.tsx      # Error boundary wrapper
    │   │   ├── EmptyState.tsx         # Empty data placeholder
    │   │   ├── StatusBadge.tsx        # Colored status badge
    │   │   └── SectionCard.tsx        # Card wrapper with title
    │   ├── layout/                    # Page layout
    │   │   ├── AppShell.tsx           # Header + main + footer
    │   │   └── PageHeader.tsx         # Page title with badges
    │   ├── dashboard/                 # Dashboard-specific components
    │   │   ├── KpiCardsRow.tsx        # 6 KPI cards
    │   │   ├── LargeMapPanel.tsx      # Map + controls
    │   │   ├── DashboardChartsSection.tsx  # 5 Recharts
    │   │   ├── DashboardSidePanel.tsx # Alerts/risks/bottlenecks
    │   │   ├── AiInsightsPanel.tsx    # ML prediction summary
    │   │   ├── AiChatPanel.tsx        # LLM chat interface
    │   │   ├── AiAgentPanel.tsx       # Agent run/history
    │   │   ├── GenAiReportPanel.tsx   # Executive briefing
    │   │   └── GodModeControls.tsx    # Demo scenario controls
    │   ├── map/                       # Map components
    │   │   ├── SupplyChainMap.tsx     # Leaflet map (4 layers)
    │   │   ├── MapLayerToggles.tsx    # Layer toggle buttons
    │   │   ├── ShipmentPopupCard.tsx  # Map popup content
    │   │   └── MapLegend.tsx          # Color legend
    │   ├── shipment/                  # Shipment detail components
    │   │   ├── ShipmentSummaryCard.tsx    # Overview card
    │   │   ├── ShipmentTimeline.tsx       # Event timeline
    │   │   ├── ShipmentAiReasonCard.tsx   # AI prediction display
    │   │   ├── RouteComparisonCard.tsx    # Route comparison
    │   │   ├── RerouteActionCard.tsx      # Reroute UI
    │   │   └── ShipmentAlertsPanel.tsx    # Shipment alerts
    │   └── realtime/                  # Realtime components
    │       ├── RealtimeStatusBadge.tsx    # Connection indicator
    │       ├── AlertToastStack.tsx        # Toast notifications
    │       └── LastUpdatedStamp.tsx       # Timestamp display
    └── assets/                        # Static assets (images, etc.)
```

### Key Component Details

#### Pages

| Page                     | URL                      | Layout                                       | Key Hooks                          |
| ------------------------ | ------------------------ | -------------------------------------------- | ---------------------------------- |
| `DashboardPage.tsx`      | `/`                      | KPIs → Map+SidePanel → Charts → GenAI Center | `useDashboardData`, `useRealtime`  |
| `ShipmentDetailPage.tsx` | `/shipments/:shipmentId` | Summary → Route+Timeline → AI+Alerts+Reroute | `useShipmentDetail`, `useRealtime` |

#### Dashboard Layout

```
┌───────────────────────────────────────────────────────────────────┐
│  AppShell (header: logo + RealtimeStatusBadge + LastUpdatedStamp) │
├───────────────────────────────────────────────────────────────────┤
│  PageHeader ("Supply Chain Command Center")                       │
├───────────────────────────────────────────────────────────────────┤
│  KpiCardsRow (6 cards: active, on-time%, delayed, high-risk,     │
│               disruptions, avg delay)                             │
├──────────────────────────────────────────┬────────────────────────┤
│  LargeMapPanel (col-span-3)              │  DashboardSidePanel    │
│  ┌────────────────────────────────────┐  │  (col-span-1)          │
│  │  SupplyChainMap (Leaflet)          │  │  ┌──────────────────┐  │
│  │  + MapLayerToggles                 │  │  │ Active Alerts     │  │
│  │  + MapLegend                       │  │  │ Risky Shipments   │  │
│  └────────────────────────────────────┘  │  │ Bottleneck Hubs   │  │
│                                          │  │ Reroute Suggest.  │  │
│                                          │  └──────────────────┘  │
├──────────────────────────────────────────┴────────────────────────┤
│  DashboardChartsSection                                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ Delay    │ │ Route    │ │ Risk     │ │ Disrupt  │ │Carrier │ │
│  │ Trends   │ │ Perform  │ │ Distrib  │ │ Freq     │ │ Perf   │ │
│  │ (Line)   │ │ (Bar)    │ │ (Pie)    │ │ (Bar)    │ │ (Bar)  │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘ │
├──────────────────────────────────────────────────────────────────┤
│  "Generative AI Command Center"                                   │
├────────────────────────────┬─────────────────────────────────────┤
│  GenAiReportPanel          │  AiChatPanel                        │
│  (Executive Briefing)      │  (Chat + Quick Prompts)             │
├────────────────────────────┼─────────────────────────────────────┤
│  AiAgentPanel              │  AiInsightsPanel + GodModeControls  │
│  (Run Agent / History)     │  (ML Stats + Demo Scenarios)        │
└────────────────────────────┴─────────────────────────────────────┘
```

### Hooks → API → Backend Connections

| Hook                | API Client Methods Called                                                                                                                                   | Backend Routes Hit                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `useDashboardData`  | `dashboardApi.getSummary()`, `.getDelayTrends()`, `.getBottlenecks()`, `.getMapData()`, `.getRiskDistribution()`, `alertsApi.list()`, `shipmentsApi.list()` | `/api/dashboard/*`, `/api/alerts`, `/api/shipments`                     |
| `useShipmentDetail` | `shipmentsApi.getById()`, `.getEvents()`, `alertsApi.listByShipment()`, `routesApi.getActiveRoute()`, `.getAlternatives()`                                  | `/api/shipments/:id/*`, `/api/alerts/shipment/:id`, `/api/routes/:id/*` |
| `useDemoControls`   | `demoApi.seed()`, `.godMode()`, `.reset()`, `.runScenario()`                                                                                                | `/api/demo/*`                                                           |
| `useRealtime`       | — (Socket.IO)                                                                                                                                               | WebSocket connection                                                    |
| `useMapLayers`      | — (local state)                                                                                                                                             | —                                                                       |

### Services → API Clients

| API Client          | Base Path           | Methods                                                                                                                                  |
| ------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `httpClient.ts`     | `VITE_API_BASE_URL` | `apiRequest<T>(path, options)` — base fetch wrapper                                                                                      |
| `dashboardApi.ts`   | `/api/dashboard`    | `getSummary`, `getDelayTrends`, `getBottlenecks`, `getMapData`, `getRiskDistribution`, `getOverview`                                     |
| `alertsApi.ts`      | `/api/alerts`       | `list`, `listUnread`, `listCritical`, `listByShipment`, `markRead`, `markManyRead`                                                       |
| `shipmentsApi.ts`   | `/api/shipments`    | `list`, `create`, `getById`, `getByTrackingNumber`, `getEvents`, `updateStatus`, `addLocation`                                           |
| `routesApi.ts`      | `/api`              | `planInitialRoute`, `getActiveRoute`, `getAlternatives`, `getBestAlternative`, `rerouteShipment`, `listNetworkNodes`, `listNetworkEdges` |
| `disruptionsApi.ts` | `/api/disruptions`  | `list`, `listActive`, `simulate`, `detect`, `resolve`, `resolveMany`                                                                     |
| `genaiApi.ts`       | `/api/genai`        | `chat`, `briefing`, `fleetInsights`, `explainShipment`, `agentRun`, `agentHistory`                                                       |
| `demoApi.ts`        | `/api/demo`         | `seed`, `godMode`, `reset`, `runScenario`, `seedAndRunScenario`                                                                          |

### Data Mappers

| Mapper               | Input (raw API)                          | Output (component-ready)                                                                                                    | Used By                                  |
| -------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `dashboardMapper.ts` | Summary, trends, bottlenecks, risk       | `DashboardSummary`, `DelayTrendPoint[]`, `RoutePerformancePoint[]`, `RiskDistributionPoint[]`, `DisruptionFrequencyPoint[]` | `DashboardChartsSection`                 |
| `shipmentMapper.ts`  | Shipment records, events, alerts, routes | `ShipmentRecord`, `ShipmentEventRecord`, `AlertItem`, `ActiveRouteResponse`, `ShipmentDetailMapped`                         | `ShipmentDetailPage`, various components |

---

## Database Layer

### 18 Tables Across 5 Migrations

```
Migration 01: create_initial_schema
├── shipments          Core shipment records
├── warehouses         Warehouse locations
├── disruptions        Disruption events
├── routes             Legacy routes
├── predictions        Legacy predictions
└── alternate_routes   Legacy alternates

Migration 02: add_users_and_carriers
├── users              User accounts
└── carriers           Carrier companies

Migration 03: create_network_graph
├── network_nodes      Transportation hubs (port, warehouse, airport, rail_terminal, distribution_center)
└── network_edges      Connections between nodes (road, rail, sea, air)

Migration 04: upgrade_shipments_and_route_versioning
├── route_plans        Versioned route plans per shipment
├── route_segments     Ordered segments within a route plan
├── shipment_events    Event log per shipment
└── (shipments)        Added: tracking_number, node refs, coordinates, risk, delay columns

Migration 05: add_disruption_weather_prediction_ops
├── alerts             System alerts (severity 1-10)
├── delay_predictions  ML prediction audit trail
├── weather_snapshots  Weather data cache
├── api_cache          External API response cache
├── job_runs           Background job tracking
└── (disruptions)      Added: status, node/edge refs, title, source columns
```

### Key Relationships (Foreign Keys)

```
network_nodes ──< network_edges (from_node_id, to_node_id)
shipments ──< shipment_events (shipment_id)
shipments ──< route_plans (shipment_id)
route_plans ──< route_segments (route_plan_id)
route_segments >── network_edges (edge_id)
route_segments >── network_nodes (from_node_id, to_node_id)
shipments >── carriers (carrier_id)
shipments >── network_nodes (origin_node_id, destination_node_id, current_node_id)
shipments >── route_plans (active_route_plan_id)
disruptions >── network_nodes (node_id)
disruptions >── network_edges (edge_id)
alerts >── shipments (shipment_id)
alerts >── disruptions (disruption_id)
delay_predictions >── shipments (shipment_id)
weather_snapshots >── network_nodes (node_id)
```

---

## End-to-End Data Flows

### Flow 1: Dashboard Load

```
1. Browser navigates to /
2. DashboardPage renders → useDashboardData hook starts
3. Hook calls 7 API endpoints in parallel:
   → dashboardApi.getSummary()     → GET /api/dashboard/summary     → dashboardService → DB
   → dashboardApi.getDelayTrends() → GET /api/dashboard/delay-trends → dashboardService → DB
   → dashboardApi.getBottlenecks() → GET /api/dashboard/bottlenecks  → dashboardService → DB
   → dashboardApi.getMapData()     → GET /api/dashboard/map-data     → dashboardService → DB
   → dashboardApi.getRiskDistribution() → GET /api/dashboard/risk-distribution → dashboardService → DB
   → alertsApi.list()              → GET /api/alerts                 → alertService → DB
   → shipmentsApi.list()           → GET /api/shipments              → shipmentService → DB
4. Mappers transform raw data → chart-ready format
5. Components render KPIs, map markers, charts, side panel
6. useRealtime subscribes to Socket.IO events
7. Polling refreshes every 15-20 seconds
```

### Flow 2: AI Chat Query

```
1. User types "Which shipments are delayed and why?" → AiChatPanel
2. genaiApi.chat(message, history) → POST /api/genai/chat
3. Backend proxy → POST AI_SERVICE_URL/ai/chat
4. gemini_service.chat():
   a. Build conversation: system prompt + history + user message
   b. LLM decides: call get_shipments(status=delayed)
   c. execute_tool() → GET BACKEND_URL/api/shipments?status=delayed → DB → response
   d. Feed tool result to LLM
   e. LLM decides: call get_disruptions(status=active)
   f. execute_tool() → GET BACKEND_URL/api/disruptions?status=active → DB → response
   g. Feed tool result to LLM
   h. LLM generates final answer with data from both tools
5. Response bubbles back: AI Service → Backend → Frontend
6. AiChatPanel renders assistant message + tool usage display
```

### Flow 3: Agent Reroute Cycle

```
1. User clicks "Run Agent" → AiAgentPanel
2. genaiApi.agentRun() → POST /api/genai/agent/run
3. Backend proxy → POST AI_SERVICE_URL/ai/agent/run
4. agent_service.run_agent_cycle():
   a. OBSERVE: Fetch 5 data sources from backend API
   b. Build observation report text
   c. LLM receives report + agent prompt + 5 tools
   d. LLM calls reroute_shipment(shipment_id, reason)
   e. execute_agent_tool() → POST BACKEND_URL/api/routes/{id}/reroute
      → routeService.rerouteShipment() → DB: deactivate old plan, create new plan + segments
      → Socket.IO: emit shipment:rerouted + shipment:updated + dashboard:refresh
   f. LLM calls create_alert(shipment_id, title, severity)
   g. execute_agent_tool() → alerts pipeline → DB: insert alert
      → Socket.IO: emit alert:new + dashboard:refresh
   h. LLM generates final summary
5. Store result in agent_history deque
6. Response bubbles back to frontend
7. AiAgentPanel renders observations, action list with ✅/❌ badges, timing
8. Dashboard auto-refreshes from dashboard:refresh Socket event
```

### Flow 4: Demo Scenario (Monsoon Flood)

```
1. User clicks "Monsoon Flood" → GodModeControls
2. useDemoControls.runScenario("monsoon_flood")
3. demoApi.seedAndRunScenario() → Two sequential calls:
   a. POST /api/demo/seed → simulationService.seedDemoData()
      → Create network_nodes, network_edges, shipments, route_plans, route_segments
      → Socket.IO: emit shipment:updated for each
   b. POST /api/demo/god-mode → simulationService.triggerGodMode(severity=8)
      → Find critical edge, set is_blocked=true
      → Create disruption, create alerts for affected shipments
      → Socket.IO: emit disruption:new, alert:new, dashboard:refresh
4. Dashboard receives Socket events → auto-refreshes all panels
5. Map shows new disruption markers + blocked route
```

---

## Cross-Service Connectivity Map

### AI Service → Backend (HTTP calls from tools/agent)

| AI Service Function                  | Backend Endpoint                       | Purpose             |
| ------------------------------------ | -------------------------------------- | ------------------- |
| Chat tool: `get_shipments`           | `GET /api/shipments`                   | Query shipment data |
| Chat tool: `get_dashboard_summary`   | `GET /api/dashboard/summary`           | KPI data            |
| Chat tool: `get_disruptions`         | `GET /api/disruptions`                 | Disruption data     |
| Chat tool: `get_active_route`        | `GET /api/routes/:id`                  | Route data          |
| Chat tool: `get_route_alternatives`  | `GET /api/routes/:id/alternatives`     | Alt routes          |
| Chat tool: `get_network_nodes`       | `GET /api/network/nodes`               | Hub data            |
| Chat tool: `get_bottlenecks`         | `GET /api/dashboard/bottlenecks`       | Congestion          |
| Chat tool: `get_alerts`              | `GET /api/alerts`                      | Alert data          |
| Chat tool: `get_risk_distribution`   | `GET /api/dashboard/risk-distribution` | Risk data           |
| Narrative: data fetch                | Multiple `GET` endpoints               | Report data         |
| Agent tool: `reroute_shipment`       | `POST /api/routes/:id/reroute`         | Execute reroute     |
| Agent tool: `resolve_disruption`     | `PATCH /api/disruptions/:id/resolve`   | Resolve             |
| Agent tool: `update_shipment_status` | `PATCH /api/shipments/:id/status`      | Status change       |
| Agent tool: `mark_alert_read`        | `PATCH /api/alerts/:id/read`           | Acknowledge         |

### Backend → AI Service (HTTP calls for ML)

| Backend Function                         | AI Service Endpoint         | Purpose              |
| ---------------------------------------- | --------------------------- | -------------------- |
| `aiService.predictDelay()`               | `POST /predict-delay`       | ML delay prediction  |
| `aiService.detectAnomaly()`              | `POST /detect-anomaly`      | Anomaly detection    |
| `aiService.scoreRouteCandidates()`       | `POST /score-routes`        | Route scoring        |
| `aiService.recommendRoute()`             | `POST /recommend-route`     | Route recommendation |
| `aiService.generateDisruptionScenario()` | `POST /simulate-disruption` | Impact simulation    |

### Frontend → Backend (HTTP + WebSocket)

| Frontend Module  | Backend Routes                                 | Purpose              |
| ---------------- | ---------------------------------------------- | -------------------- |
| `dashboardApi`   | `GET /api/dashboard/*` (5)                     | Dashboard data       |
| `shipmentsApi`   | `GET/POST/PATCH /api/shipments/*` (7)          | Shipment CRUD        |
| `routesApi`      | `GET/POST /api/routes/*`, `/api/network/*` (6) | Route management     |
| `disruptionsApi` | `GET/POST/PATCH /api/disruptions/*` (4)        | Disruption lifecycle |
| `alertsApi`      | `GET/PATCH /api/alerts/*` (3)                  | Alert management     |
| `genaiApi`       | `POST/GET /api/genai/*` (7)                    | GenAI features       |
| `demoApi`        | `POST /api/demo/*` (3)                         | Demo controls        |
| `socketClient`   | WebSocket `/`                                  | Real-time events     |

---

## Scripts & Configuration

### `scripts/setup.sh`

Full environment setup: install dependencies for all 3 services, run migrations.

### `scripts/run-all.sh`

Start all 3 services in parallel (backend, AI service, frontend).

### `scripts/seed-database.sh`

Run database seed via backend demo endpoint.

### `docker-compose.yml`

Container orchestration for all 3 services (currently empty — services run locally).

### npm Scripts

**Backend:**
| Script | Command | Purpose |
|--------|---------|---------|
| `start` | `tsx src/server.ts` | Production start |
| `dev` | `tsx watch src/server.ts` | Dev with file watching |
| `migrate` | `knex migrate:latest` | Run DB migrations |
| `seed` | `knex seed:run` | Run DB seeds |
| `typecheck` | `tsc --noEmit` | Type check |

**Frontend:**
| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `vite --host 0.0.0.0` | Dev server (accessible from network) |
| `build` | `tsc && vite build` | Production build |
| `preview` | `vite preview` | Preview production build |
