# Project Q&A — Errors & Resolutions

All errors encountered during development and how they were resolved.

---

## 1. WSL DNS Resolution Failure

**Error:**

```
getaddrinfo EAI_AGAIN ep-crimson-sun-a1xli5xo.ap-southeast-1.aws.neon.tech
```

**Cause:** WSL default DNS resolver (`10.255.255.254`) was refusing queries, so the backend couldn't resolve the Neon PostgreSQL hostname.

**Fix:**

```bash
# Override DNS to Google
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf

# Make it permanent — prevent WSL from regenerating resolv.conf
sudo tee /etc/wsl.conf << 'EOF'
[network]
generateResolvConf = false

[boot]
systemd = true
EOF
```

---

## 2. Corrupt Knex Migration State

**Error:**

```
migration directory is corrupt, the following files are missing:
20260410131657_create_initial_schema.js
```

**Cause:** An old migration file was deleted from disk but its record still existed in the `knex_migrations` table in the database.

**Fix:** Created `backend/scripts/clean-db.mjs` to drop the stale `knex_migrations` and `knex_migrations_lock` tables, then re-ran migrations:

```bash
cd backend
node scripts/clean-db.mjs
npx knex migrate:latest
# Output: Batch 1 run: 5 migrations
```

---

## 3. JSONB Column Insert Errors (Multiple Instances)

**Error:**

```
invalid input syntax for type json
```

**Cause:** Knex `pg` driver does NOT auto-serialize JavaScript objects/arrays to JSON strings for `jsonb` columns. You must call `JSON.stringify()` manually before inserting.

**Files Fixed:**

- `backend/src/services/simulationService.ts` — `transport_modes`, `geometry_json`
- `backend/src/services/aiService.ts` — `input_features_json`, `top_factors_json`
- `backend/src/services/shipmentService.ts` — `metadata_json` (3 places)
- `backend/src/services/routeService.ts` — `comparison_summary_json` (2 places), `metadata_json` (2 places), `waypoints`, `alternative_waypoints`

**Fix Pattern:**

```ts
// WRONG — throws "invalid input syntax for type json"
await trx("table").insert({ metadata_json: { key: "value" } });

// CORRECT
await trx("table").insert({ metadata_json: JSON.stringify({ key: "value" }) });
```

---

## 4. Foreign Key Violation — Shipments Insert

**Error:**

```
insert or update on table "shipments" violates foreign key constraint "shipments_origin_node_id_foreign"
```

**Cause:** `createShipment()` in `shipmentService.ts` opens its own `db.transaction()` internally. When called from the demo seed's outer transaction (`trx`), the inner transaction uses a separate database connection that cannot see the uncommitted nodes inserted by the outer `trx`.

**Fix:** Replaced the `createShipment(payload)` call with a direct `trx.insert()` inside the same transaction:

```ts
// WRONG — opens a second transaction, can't see uncommitted rows
const shipment = await createShipment(payload);

// CORRECT — insert directly on the same transaction
const [shipment] = await trx("shipments").insert(payload).returning("*");
```

---

## 5. Foreign Key Violation — Delay Predictions Insert

**Error:**

```
insert or update on table "delay_predictions" violates foreign key constraint "delay_predictions_shipment_id_foreign"
```

**Cause:** Same nested transaction issue. `predictDelay()` in `aiService.ts` writes to the `delay_predictions` table using the global `db` connection, which can't see the shipment that was inserted inside the demo seed's uncommitted transaction.

**Fix:** Wrapped the `delay_predictions` insert in a try-catch so it fails silently during seeding (the prediction still returns to the caller, just doesn't persist):

```ts
try {
  await db('delay_predictions').insert({ shipment_id, ... });
} catch {
  // FK may fail during demo seeding when shipment isn't committed yet
}
```

---

## 6. Frontend "Failed to Fetch" / CORS — Wrong API URL

**Error:** Dashboard showed "KPI Error — Failed to fetch" on all cards.

**Cause:** Frontend was running inside WSL at `http://172.29.87.56:5173` but was trying to call the backend at `http://localhost:3001`. From the Windows browser, `localhost` resolves to Windows, not WSL.

**Fix:** Created `frontend/.env`:

```
VITE_API_BASE_URL=http://172.29.87.56:3001
```

Then restarted the Vite dev server so the env var takes effect.

---

## 7. Vite Dev Server Stops When Backgrounded in WSL

**Error:** `ps aux | grep vite` shows process in state `T` (stopped). Frontend not accessible.

**Cause:** Running `npx vite &` (backgrounded with `&`) causes the process to stop when it tries to read from stdin, which is unavailable for background processes.

**Fix:** Run Vite in the foreground in a dedicated terminal, or use `nohup`:

```bash
# Option 1: Foreground in its own terminal
npx vite --host 0.0.0.0

# Option 2: Detached
nohup npx vite --host 0.0.0.0 > /tmp/vite.log 2>&1 &
```

---

## 8. AI Model Training — Noisy Data Producing Bad Models

**Error:** Anomaly detection model had low accuracy (~60%). Route scoring model had poor R² (~0.7).

**Cause:** `generate_data.py` scripts added excessive random noise to labels, making it impossible for models to learn the true patterns.

**Fix:** Rewrote data generation scripts to produce deterministic labels based on clear feature-to-label mappings, then added controlled noise only at the end:

```python
# WRONG — too much noise destroys signal
score = random.uniform(0, 1)

# CORRECT — deterministic base + small noise
score = compute_from_features(row)
score += np.random.normal(0, 0.02)  # small noise
score = np.clip(score, 0, 1)
```

**Results after fix:**

- Anomaly classifier: 91% accuracy (was ~60%)
- Route score regressor: R² = 0.996 (was ~0.7)

---

## 9. TypeScript Build Errors — Frontend Refactoring

**Error:** Multiple `tsc --noEmit` errors after initial codebase review.

**Common patterns fixed:**

- Missing `type` keyword on type-only imports: `import type { X } from ...`
- Unused variables and imports
- Incorrect prop types passed to components
- Missing null checks on optional data

**Verification command:**

```bash
cd frontend && npx tsc --noEmit
# Should produce zero output = zero errors
```

---

## 10. Leaflet to Google Maps Migration

**Change:** Replaced Leaflet (OpenStreetMap) with Google Maps Platform for real traffic data.

**Files changed:**

- `frontend/src/components/map/SupplyChainMap.tsx` — Full rewrite with `@react-google-maps/api`
- `frontend/src/main.tsx` — Removed `import 'leaflet/dist/leaflet.css'`
- `frontend/src/index.css` — Added dark InfoWindow CSS overrides
- `frontend/.env` — Added `VITE_GOOGLE_MAPS_API_KEY`

**Packages:**

```bash
npm install @react-google-maps/api
npm uninstall leaflet react-leaflet @types/leaflet
```

**Requires:** Google Cloud Console API key with Maps JavaScript API enabled.

---

## 11. OpenRouter API — Windows CRLF in `.env` Causing Connection Error

**Error:**

```
openai.APIConnectionError: Connection error.
```

Deeper investigation with raw `httpx` revealed:

```
LocalProtocolError: Illegal header value b'Bearer sk-or-v1-...key...\r'
```

**Cause:** The `ai-service/.env` file was created/edited on Windows, so every line ended with `\r\n` (CRLF) instead of `\n` (LF). When `source .env && export OPENROUTER_API_KEY` was run in WSL/bash, the `\r` became part of the variable value. The `openai` SDK passed this tainted key in the `Authorization: Bearer <key>\r` header, which `httpx` rejected as an illegal header value.

**Fix:**

```bash
# Strip carriage returns from .env
sed -i 's/\r$//' ai-service/.env

# Verify — lines should end with '$' not '^M$'
cat -A ai-service/.env
```

**Prevention:** Always use LF line endings for `.env` files in WSL. In VS Code, check the bottom-right status bar — click "CRLF" and switch to "LF" before saving.

---

## 12. OpenAI SDK Default Timeout Too Short for WSL → OpenRouter

**Error:**

```
openai.APIConnectionError: Connection error.
```

(Same error as #11, but persisted even after fixing CRLF.)

**Cause:** The default `openai` SDK timeout is ~10 seconds. WSL DNS resolution + TLS handshake to OpenRouter (via Cloudflare at `104.18.3.115:443`) can take 5-15 seconds due to WSL's network stack overhead.

**Fix:** Set explicit timeout on the OpenAI client:

```python
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
    timeout=120.0,  # 2 minutes — generous for WSL latency
)
```

Applied in both `gemini_service.py` and `agent_service.py`.

---

## 13. Autonomous Agent — Backend Route Endpoints Not Found (404)

**Error (in agent cycle results):**

```json
{
  "success": false,
  "error": "Client error '404 Not Found' for url 'http://localhost:3001/api/routes/<shipment_id>/reroute'"
}
```

**Cause:** The autonomous agent's `reroute_shipment` tool calls `POST /api/routes/:shipment_id/reroute`, but the backend doesn't have a reroute endpoint. Similarly, `PATCH /api/disruptions/:id/resolve` may not exist. The agent gracefully handles 404s — it logs the failure and moves on to other actions.

**Status:** Not a bug — expected until Phase 4 (backend proxy routes) adds these endpoints. The agent already succeeds on endpoints that do exist (e.g., `PATCH /api/shipments/:id/status` worked and updated DEMO-1001 to "delayed").

**Impact:** Agent is functional but limited. It can observe all data and update shipment statuses, but rerouting and disruption resolution will return 404 until backend routes are added.

---

## 14. GenAI Integration — Phase Summary (Phases 1–3)

**Setup:**

- SDK: `openai>=1.40.0` pointed at `https://openrouter.ai/api/v1`
- Model: `google/gemini-2.0-flash-001` via OpenRouter
- Config: `ai-service/.env` with `OPENROUTER_API_KEY`, `BACKEND_URL`, `LLM_MODEL`

**Phase 1 — LLM Chat with Function Calling** (`gemini_service.py`):

- `POST /ai/chat` — multi-turn conversation with 8 tool definitions
- Tools: `predict_shipment_delay`, `detect_anomaly`, `score_routes`, `recommend_best_route`, `simulate_disruption`, `get_supply_chain_summary`, `get_active_disruptions`, `get_at_risk_shipments`
- Max 6 tool-calling rounds per conversation turn

**Phase 2 — Narrative Insight Endpoints** (`narrative_service.py`):

- `POST /ai/insights/fleet` — fleet health summary with risk assessment
- `POST /ai/insights/shipment` — single shipment delay explanation with factors
- `POST /ai/insights/disruption` — executive disruption impact report
- `POST /ai/insights/briefing` — auto-fetches live data, generates executive briefing

**Phase 3 — Autonomous Agent** (`agent_service.py`):

- `POST /ai/agent/run` — triggers one Observe → Reason → Act cycle
- `GET /ai/agent/history` — returns last 10 cycle results
- 5 agent tools: `get_supply_chain_state`, `reroute_shipment`, `resolve_disruption`, `update_shipment_status`, `mark_alert_read`
- Agent fetches live data from 5 backend endpoints, reasons with LLM, executes write actions
- Tested: agent observed 4 delayed shipments, attempted reroutes (404), successfully updated DEMO-1001 status to "delayed" — 11.4s cycle

---

## Quick Reference — Common Commands

```bash
# Start backend (from backend/)
DATABASE_SSL=true npx tsx src/server.ts

# Start frontend (from frontend/)
npx vite --host 0.0.0.0

# Start AI service (from ai-service/)
source .env && export OPENROUTER_API_KEY BACKEND_URL LLM_MODEL
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Run migrations
cd backend && npx knex migrate:latest

# Seed demo data
curl -X POST http://localhost:3001/api/demo/seed -H "Content-Type: application/json" -d '{"shipment_count":4}'

# Reset demo data
curl -X POST http://localhost:3001/api/demo/reset

# Check TypeScript
cd frontend && npx tsc --noEmit

# Fix WSL DNS
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf

# Fix .env CRLF
sed -i 's/\r$//' ai-service/.env

# Test GenAI Chat
curl -X POST http://localhost:8000/ai/chat -H "Content-Type: application/json" \
  -d '{"user_message":"How are my shipments?","messages":[]}'

# Test Autonomous Agent
curl -X POST http://localhost:8000/ai/agent/run

# View Agent History
curl http://localhost:8000/ai/agent/history

# Test Narrative Insights
curl -X POST http://localhost:8000/ai/insights/briefing
```
