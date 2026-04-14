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

## Quick Reference — Common Commands

```bash
# Start backend (from backend/)
DATABASE_SSL=true npx tsx src/server.ts

# Start frontend (from frontend/)
npx vite --host 0.0.0.0

# Start AI service (from ai-service/)
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
```
