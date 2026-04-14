# Generative AI & Autonomous Agent — ChainMind

> Complete documentation of the LLM integration, function-calling chat system, narrative insight generators, and the autonomous Observe→Reason→Act agent.

---

## Table of Contents

- [Overview](#overview)
- [LLM Infrastructure](#llm-infrastructure)
- [Chat System (ChainMind)](#chat-system-chainmind)
  - [System Prompt](#system-prompt)
  - [Function-Calling Tools (10)](#function-calling-tools-10)
  - [Multi-Tool Chaining](#multi-tool-chaining)
  - [Chat API](#chat-api)
- [Narrative Insight Service](#narrative-insight-service)
  - [Fleet Overview](#fleet-overview)
  - [Shipment Deep-Dive](#shipment-deep-dive)
  - [Disruption Analysis](#disruption-analysis)
  - [Executive Briefing](#executive-briefing)
- [Autonomous Agent](#autonomous-agent)
  - [Agent Architecture](#agent-architecture)
  - [Observation Phase](#observation-phase)
  - [Reasoning Phase](#reasoning-phase)
  - [Action Phase](#action-phase)
  - [Agent Tools (5)](#agent-tools-5)
  - [Decision Matrix](#decision-matrix)
  - [Agent History](#agent-history)
  - [Agent API](#agent-api)
- [Frontend Integration](#frontend-integration)
- [Prompt Engineering](#prompt-engineering)
- [Data Flow](#data-flow)
- [Configuration](#configuration)

---

## Overview

ChainMind integrates **Google Gemini 2.0 Flash** via **OpenRouter** to provide three GenAI capabilities:

| Capability     | Service                | Description                                                                              |
| -------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| **Chat**       | `gemini_service.py`    | Natural language Q&A with 10 function-calling tools that query live backend data         |
| **Narratives** | `narrative_service.py` | 4 structured report generators (fleet, shipment, disruption, briefing)                   |
| **Agent**      | `agent_service.py`     | Autonomous Observe→Reason→Act loop that detects problems and executes corrective actions |

All three services:

- Use the **OpenAI Python SDK** pointed at OpenRouter's API
- Call the **backend REST API** to fetch/mutate live data
- Return structured responses consumed by the React frontend

---

## LLM Infrastructure

### Provider Chain

```
Frontend (React) → Backend (Express proxy) → AI Service (FastAPI) → OpenRouter API → Google Gemini 2.0 Flash
```

### SDK Configuration

```python
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("OPENROUTER_API_KEY"),
    base_url="https://openrouter.ai/api/v1",
    timeout=120.0  # 120 second timeout for WSL latency
)

MODEL = os.getenv("LLM_MODEL", "google/gemini-2.0-flash-001")
```

### Why OpenRouter?

- Single API key for multiple LLM providers
- OpenAI SDK-compatible endpoint (drop-in replacement)
- Supports function calling / tool use with Gemini models
- No Google Cloud project setup required

### Request Parameters

| Parameter     | Chat                 | Narrative            | Agent                |
| ------------- | -------------------- | -------------------- | -------------------- |
| `model`       | gemini-2.0-flash-001 | gemini-2.0-flash-001 | gemini-2.0-flash-001 |
| `max_tokens`  | 3000                 | 2500                 | 2000                 |
| `temperature` | 0.3                  | 0.4                  | 0.2                  |
| `tools`       | 10 tools             | None                 | 5 tools              |
| `tool_choice` | "auto"               | —                    | "auto"               |

---

## Chat System (ChainMind)

**File:** `ai-service/app/services/gemini_service.py` (596 lines)

### System Prompt

The chat system uses a detailed prompt that establishes ChainMind as a supply chain expert:

```
You are "ChainMind", an expert AI assistant for a supply-chain control tower.
You have LIVE access to the platform's backend through the tools below.
Your job: give concrete, data-backed answers to operators, managers, planners.

RULES:
• ALWAYS call at least one tool before answering a question about data.
• If the first tool's result is not enough, call MORE tools.
• Combine data from multiple tools when the question spans shipments + routes + disruptions.
• Never say "I don't have access" — you DO have access through your tools.
• Quote IDs, tracking numbers, counts, and metrics from tool results.
• Format tables, bullet lists, and bold text for readability.
```

### Multi-Tool Chaining Strategy

The prompt includes explicit strategies for each question type:

| Question Type         | Tools to Chain                                                                 | Example                                                             |
| --------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| "What's delayed?"     | `get_shipments(status=delayed)` → `get_disruptions(status=active)` → Correlate | "3 shipments delayed due to monsoon disruption on Mumbai-Pune edge" |
| "Fleet health"        | `get_dashboard_summary` → `get_risk_distribution` → `get_bottlenecks`          | "82% on-time, 3 critical hubs, 2 active disruptions"                |
| "Should I reroute X?" | `get_shipment(id)` → `get_active_route(id)` → `get_alternatives(id)`           | "Route B saves 2h, reduces risk from 0.7 → 0.3"                     |
| "Hub analysis"        | `get_network_nodes` → `get_bottlenecks` → `get_disruptions`                    | "Mumbai hub: 5 blocked edges, 12 delayed shipments passing through" |

### Function-Calling Tools (10)

Each tool is defined as an OpenAI-format function with name, description, and JSON schema parameters:

#### Data Query Tools (8)

| #   | Tool Name                | HTTP Call                          | Parameters                          | Returns                                  |
| --- | ------------------------ | ---------------------------------- | ----------------------------------- | ---------------------------------------- |
| 1   | `get_shipments`          | `GET /api/shipments`               | `status?`, `carrier_id?`, `limit?`  | Shipment list with risk, delay, location |
| 2   | `get_shipment_by_id`     | `GET /api/shipments/:id`           | `shipment_id` (required)            | Single shipment detail                   |
| 3   | `get_dashboard_summary`  | `GET /api/dashboard/summary`       | —                                   | KPIs: counts, delays, on-time %          |
| 4   | `get_disruptions`        | `GET /api/disruptions`             | `status?`, `type?`, `severity_gte?` | Disruption records                       |
| 5   | `get_active_route`       | `GET /api/routes/:shipmentId`      | `shipment_id` (required)            | Active route plan + segments             |
| 6   | `get_route_alternatives` | `GET /api/routes/:id/alternatives` | `shipment_id`, `limit?`             | Alternative route candidates             |
| 7   | `get_network_nodes`      | `GET /api/network/nodes`           | `type?`, `city?`, `limit?`          | Network hub list                         |
| 8   | `get_bottlenecks`        | `GET /api/dashboard/bottlenecks`   | `limit?`                            | Congested nodes/edges with event counts  |

#### Read Tools (2)

| #   | Tool Name               | HTTP Call                              | Parameters                            | Returns                                       |
| --- | ----------------------- | -------------------------------------- | ------------------------------------- | --------------------------------------------- |
| 9   | `get_alerts`            | `GET /api/alerts`                      | `is_read?`, `severity_gte?`, `limit?` | Alert records                                 |
| 10  | `get_risk_distribution` | `GET /api/dashboard/risk-distribution` | —                                     | Risk buckets for shipments/disruptions/routes |

### Tool Execution Loop

```
User message → LLM decides tool calls → Execute tools → Feed results back → LLM decides more tools or final answer

MAX_TOOL_ROUNDS = 10  (up to 10 iterations of tool calling)
```

```python
for round in range(MAX_TOOL_ROUNDS):
    response = client.chat.completions.create(
        model=MODEL,
        messages=conversation,
        tools=TOOLS,
        tool_choice="auto",
        max_tokens=3000,
        temperature=0.3
    )

    if response has tool_calls:
        for tool_call in tool_calls:
            result = execute_tool(tool_call.function.name, tool_call.function.arguments)
            conversation.append(tool_result_message)
        continue  # Next round
    else:
        return response.content  # Final answer
```

### Chat API

#### `POST /ai/chat`

```json
// Request
{
  "message": "Which shipments are delayed and why?",
  "history": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi! I'm ChainMind..." }
  ]
}

// Response
{
  "reply": "Currently **3 shipments** are delayed:\n\n| Tracking | Route | Delay | Cause |\n|...",
  "actions_taken": [
    "Called get_shipments with status=delayed",
    "Called get_disruptions with status=active"
  ],
  "model": "google/gemini-2.0-flash-001"
}
```

---

## Narrative Insight Service

**File:** `ai-service/app/services/narrative_service.py` (315 lines)

Each narrative generator:

1. Fetches live data from the backend API
2. Constructs a detailed prompt with explicit JSON output schema
3. Sends to LLM with structured format instructions
4. Returns the generated narrative

### Fleet Overview

**Endpoint:** `POST /ai/insights/fleet`

**Data Sources:**

- `GET /api/dashboard/summary` — KPIs
- `GET /api/shipments?limit=100` — Active shipments
- `GET /api/disruptions?status=active` — Active disruptions

**Prompt Structure:**

```
You are a supply-chain analyst. Below is live fleet data.
Write a JSON object with these keys:
- summary: 2-3 paragraph fleet health overview
- concerns: array of {title, description, severity}
- actions: array of {action, priority, rationale}
- risk_level: "low" | "medium" | "high" | "critical"
```

**Response:**

```json
{
  "summary": "Fleet is operating at 82% on-time delivery...",
  "concerns": [
    {
      "title": "Mumbai Hub Congestion",
      "description": "...",
      "severity": "high"
    }
  ],
  "actions": [
    {
      "action": "Reroute SHP-2847 via Pune bypass",
      "priority": "immediate",
      "rationale": "..."
    }
  ],
  "risk_level": "medium"
}
```

### Shipment Deep-Dive

**Endpoint:** `POST /ai/insights/shipment`

**Data Sources:**

- Shipment record (from request body)
- `GET /api/shipments/:id/events` — Event history
- `GET /api/routes/:id` — Active route
- `GET /api/alerts/shipment/:id` — Related alerts

**Prompt Structure:**

```
Analyze this single shipment in depth. Return JSON:
- analysis: 2-3 paragraphs on current state and risk factors
- risk_factors: array of {factor, impact, likelihood}
- recommendations: array of {action, expected_outcome}
- eta_assessment: {current_eta, confidence, factors_affecting}
```

### Disruption Analysis

**Endpoint:** `POST /ai/insights/disruption`

**Data Sources:**

- `GET /api/disruptions?status=active` — Active disruptions
- `GET /api/dashboard/bottlenecks` — Congested nodes
- `GET /api/shipments?status=in_transit` — In-transit shipments

**Prompt Structure:**

```
Analyze the current disruption landscape. Return JSON:
- overview: Disruption situation summary
- impacts: array of {disruption, affected_shipments, estimated_delay, mitigation}
- cascading_risks: array of {risk, probability, affected_areas}
- mitigation_plan: array of {action, timeline, expected_outcome}
```

### Executive Briefing

**Endpoint:** `POST /ai/insights/briefing`

**Data Sources:**

- `GET /api/dashboard/summary` — KPIs
- `GET /api/shipments?limit=200` — All shipments
- `GET /api/disruptions?status=active` — Disruptions
- `GET /api/dashboard/bottlenecks` — Network bottlenecks
- `GET /api/dashboard/risk-distribution` — Risk overview

**Prompt Structure (6 sections):**

```
Write a comprehensive executive daily briefing with these sections:

1. EXECUTIVE SUMMARY - 3-4 sentences, key numbers
2. FLEET STATUS - Shipment counts by status, on-time percentage
3. RISK LANDSCAPE - Active disruptions, risk distribution, hotspots
4. NETWORK HEALTH - Bottleneck nodes, blocked edges, congestion
5. AI RECOMMENDATIONS - Prioritized actions with rationale
6. OUTLOOK - Next 24-48 hour forecast
```

**Response:** Markdown-formatted text with headers, tables, and bullet points.

---

## Autonomous Agent

**File:** `ai-service/app/services/agent_service.py` (430 lines)

### Agent Architecture

The agent operates in a structured **Observe → Reason → Act → Report** cycle:

```
┌───────────────────────────────────────────────────┐
│                  AGENT CYCLE                       │
│                                                    │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐      │
│  │ OBSERVE  │──▶│  REASON  │──▶│   ACT    │      │
│  │          │   │          │   │          │      │
│  │ Fetch:   │   │ LLM      │   │ Execute: │      │
│  │ shipments│   │ analyzes  │   │ reroute  │      │
│  │ disrupt. │   │ patterns  │   │ alert    │      │
│  │ alerts   │   │ decides   │   │ resolve  │      │
│  │ nodes    │   │ actions   │   │ status   │      │
│  └──────────┘   └──────────┘   └──────────┘      │
│                                      │             │
│                                      ▼             │
│                               ┌──────────┐        │
│                               │  REPORT  │        │
│                               │          │        │
│                               │ Summary  │        │
│                               │ Actions  │        │
│                               │ Duration │        │
│                               └──────────┘        │
└───────────────────────────────────────────────────┘
```

### Observation Phase

The agent collects live data by calling the backend:

| Data Source          | API Call                                        | Purpose                          |
| -------------------- | ----------------------------------------------- | -------------------------------- |
| Delayed shipments    | `GET /api/shipments?status=delayed&limit=20`    | Find shipments needing attention |
| In-transit shipments | `GET /api/shipments?status=in_transit&limit=20` | Monitor active shipments         |
| Active disruptions   | `GET /api/disruptions?status=active&limit=15`   | Current network issues           |
| Unread alerts        | `GET /api/alerts?is_read=false&limit=20`        | Pending notifications            |
| Bottlenecks          | `GET /api/dashboard/bottlenecks?limit=10`       | Congested network points         |

This data is assembled into an **observation report** injected into the LLM prompt:

```
── OBSERVATION REPORT ──
Delayed shipments (3):
  • SHP-2847: Mumbai→Delhi, delay_probability=0.82, risk=high
  • SHP-1923: Chennai→Kolkata, delay_probability=0.71, risk=high
  ...
Active disruptions (2):
  • DIS-001: weather, severity=8, Mumbai hub
  ...
Unread alerts (5): [list]
Bottleneck nodes (2): [list]
```

### Reasoning Phase

The LLM receives the observation report along with the agent system prompt and decides which actions to take using its available tools.

### Agent System Prompt

```
You are the "ChainMind Agent" — an autonomous supply-chain operations agent.

WORKFLOW:
1. OBSERVE: Review the observation report provided below.
2. REASON: Identify the top 3-5 issues that need intervention.
3. ACT: For each issue, call the appropriate action tool.
4. REPORT: Summarize what you observed, decided, and did.

DECISION MATRIX:
• delay_probability > 0.6 AND has alternatives → REROUTE
• disruption severity ≥ 7 AND resolved=false → CREATE ALERT + review reroutes
• disruption severity < 5 AND ends_at passed → RESOLVE
• high-risk shipment without recent alert → CREATE ALERT
• bottleneck node with > 5 delayed shipments → FLAG in report

CRITICAL RULES:
• You MUST call action tools. Do NOT just describe what should be done.
• Prefer rerouting over alerting when alternatives exist.
• Always provide a clear reason when creating alerts.
```

### Action Phase

The LLM calls tools using function calling. The agent executes each tool call against the backend API.

### Agent Tools (5)

| #   | Tool Name                | HTTP Call                             | Purpose                                             |
| --- | ------------------------ | ------------------------------------- | --------------------------------------------------- |
| 1   | `reroute_shipment`       | `POST /api/routes/:id/reroute`        | Trigger reroute for a delayed/at-risk shipment      |
| 2   | `create_alert`           | Composite: create via alerts pipeline | Generate alert for a shipment or disruption         |
| 3   | `resolve_disruption`     | `PATCH /api/disruptions/:id/resolve`  | Mark a disruption as resolved                       |
| 4   | `update_shipment_status` | `PATCH /api/shipments/:id/status`     | Change shipment status (e.g., delayed → in_transit) |
| 5   | `mark_alert_read`        | `PATCH /api/alerts/:id/read`          | Acknowledge an alert                                |

### Tool Definitions

```python
AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "reroute_shipment",
            "description": "Reroute a shipment to an alternative route. Use when delay_probability > 0.6 and alternatives exist.",
            "parameters": {
                "type": "object",
                "properties": {
                    "shipment_id": { "type": "string", "description": "UUID of shipment to reroute" },
                    "reason": { "type": "string", "description": "Why this reroute is needed" }
                },
                "required": ["shipment_id", "reason"]
            }
        }
    },
    // ... 4 more tools
]
```

### Decision Matrix

| Condition                                      | Action             | Priority |
| ---------------------------------------------- | ------------------ | -------- |
| `delay_probability > 0.6` + alternatives exist | Reroute            | High     |
| Disruption `severity ≥ 7` + active             | Create alert       | High     |
| Disruption ended + still active                | Resolve disruption | Medium   |
| High-risk shipment without alert               | Create alert       | Medium   |
| Bottleneck node with 5+ delays                 | Report (no tool)   | Low      |

### Agent Execution Loop

```python
MAX_AGENT_ROUNDS = 6

for round in range(MAX_AGENT_ROUNDS):
    response = client.chat.completions.create(
        model=MODEL,
        messages=conversation,
        tools=AGENT_TOOLS,
        tool_choice="auto",
        max_tokens=2000,
        temperature=0.2  # Low creativity for reliable actions
    )

    if response has tool_calls:
        for tool_call in tool_calls:
            result = execute_agent_tool(tool_call)
            actions.append({
                "tool": tool_call.function.name,
                "args": tool_call.function.arguments,
                "result": result,
                "success": result.get("success", True)
            })
            conversation.append(tool_result_message)
        continue
    else:
        summary = response.content  # Final report
        break
```

### Agent History

Agent results are stored in an in-memory deque with `maxlen=10`:

```python
agent_history = deque(maxlen=10)

# Each entry:
{
    "observations_summary": "Found 3 delayed shipments, 2 active disruptions...",
    "actions": [
        {
            "tool": "reroute_shipment",
            "args": { "shipment_id": "abc-123", "reason": "High delay risk on current route" },
            "result": { "success": true, "new_route_plan_id": "..." },
            "success": true
        }
    ],
    "actions_count": 2,
    "started_at": "2025-01-15T10:30:00Z",
    "finished_at": "2025-01-15T10:30:12Z",
    "duration_seconds": 12.3,
    "model": "google/gemini-2.0-flash-001"
}
```

### Agent API

#### `POST /ai/agent/run`

Triggers a single agent cycle (no request body needed).

```json
// Response
{
  "observations_summary": "Scanned 3 delayed shipments, 2 active disruptions, 5 unread alerts...",
  "actions": [
    {
      "tool": "reroute_shipment",
      "args": {
        "shipment_id": "abc-123",
        "reason": "Monsoon disruption on current route"
      },
      "result": { "success": true },
      "success": true
    },
    {
      "tool": "create_alert",
      "args": {
        "shipment_id": "def-456",
        "title": "Critical delay risk",
        "severity": 8
      },
      "result": { "success": true },
      "success": true
    }
  ],
  "actions_count": 2,
  "started_at": "2025-01-15T10:30:00Z",
  "finished_at": "2025-01-15T10:30:12Z",
  "duration_seconds": 12.3,
  "model": "google/gemini-2.0-flash-001"
}
```

#### `GET /ai/agent/history?limit=5`

Returns the last N agent cycle results.

---

## Frontend Integration

### Backend Proxy Layer

The Express backend proxies all GenAI requests to the Python AI service:

**File:** `backend/src/routes/genai.ts` (78 lines)

| Frontend Call                | Backend Route                       | AI Service Target            |
| ---------------------------- | ----------------------------------- | ---------------------------- |
| `genaiApi.chat()`            | `POST /api/genai/chat`              | `POST /ai/chat`              |
| `genaiApi.briefing()`        | `POST /api/genai/insights/briefing` | `POST /ai/insights/briefing` |
| `genaiApi.fleetInsights()`   | `POST /api/genai/insights/fleet`    | `POST /ai/insights/fleet`    |
| `genaiApi.explainShipment()` | `POST /api/genai/insights/shipment` | `POST /ai/insights/shipment` |
| `genaiApi.agentRun()`        | `POST /api/genai/agent/run`         | `POST /ai/agent/run`         |
| `genaiApi.agentHistory()`    | `GET /api/genai/agent/history`      | `GET /ai/agent/history`      |

All proxy routes use 120-second timeout and return 503 on AI service failure.

### Frontend API Client

**File:** `frontend/src/services/api/genaiApi.ts` (120 lines)

Type-safe API client with TypeScript interfaces for all request/response types.

### UI Components

#### AiChatPanel (`components/dashboard/AiChatPanel.tsx`)

- Chat input with submit on Enter
- 4 quick prompt buttons: "Explain Delays", "Summarize Risks", "Recommend Reroute", "Hub Analysis"
- Message history with role-based styling (user=cyan, assistant=slate)
- Tool usage display showing which tools the AI called
- Auto-scroll to latest message

#### GenAiReportPanel (`components/dashboard/GenAiReportPanel.tsx`)

- "Generate Executive Briefing" button
- Renders markdown-like formatted text (bold, bullets, paragraphs)
- Shows generation timestamp and model name
- Loading spinner during generation

#### AiAgentPanel (`components/dashboard/AiAgentPanel.tsx`)

- "Run Agent" button to trigger an observe→act cycle
- Last result display with observations summary
- Action list with emoji icons per tool type and success/fail badges
- History view showing past agent cycles
- Timing display (duration in seconds)

### Dashboard Integration

All three panels are integrated into `DashboardPage.tsx` under a "Generative AI Command Center" section:

```
┌─────────────────────────────────────────────────────────────┐
│            Generative AI Command Center                      │
├────────────────────────────┬────────────────────────────────┤
│  GenAiReportPanel          │  AiChatPanel                   │
│  (Executive Briefing)      │  (Natural Language Q&A)        │
├────────────────────────────┼────────────────────────────────┤
│  AiAgentPanel              │  AiInsightsPanel               │
│  (Autonomous Agent)        │  (ML Predictions Summary)      │
│                            │  + GodModeControls             │
└────────────────────────────┴────────────────────────────────┘
```

---

## Prompt Engineering

### Design Principles

1. **Data-grounding** — Every prompt includes live data fetched from the backend. The LLM never guesses or fabricates metrics.

2. **Multi-tool chaining** — The chat prompt explicitly instructs the LLM to call multiple tools before answering, with strategies for each question type.

3. **Structured output** — Narrative prompts specify exact JSON schemas. The LLM returns parseable structured data.

4. **Low temperature** — Agent uses `temperature=0.2` for reliable, deterministic actions. Chat uses `0.3` for slight creativity.

5. **Action-oriented** — The agent prompt explicitly says "You MUST call action tools. Do NOT just describe what should be done."

6. **Decision matrix** — The agent prompt includes explicit if-then rules mapping conditions to actions, reducing LLM judgment variance.

### Prompt Evolution

| Version      | Issue                                      | Fix                                                                             |
| ------------ | ------------------------------------------ | ------------------------------------------------------------------------------- |
| v1           | Single-tool answers, "I don't have access" | Added multi-tool chaining strategies, "NEVER say you don't have access"         |
| v2           | Agent described actions but didn't execute | Added "MUST call action tools" instruction                                      |
| v3           | Chat didn't query hubs                     | Added `get_network_nodes` and `get_bottlenecks` tools                           |
| v4 (current) | —                                          | MAX_TOOL_ROUNDS=10, max_tokens=3000, decision matrix, 6-section briefing schema |

---

## Data Flow

### Chat Request Flow

```
User types message
  → Frontend: genaiApi.chat(message, history)
  → Backend: POST /api/genai/chat (proxy)
  → AI Service: POST /ai/chat
    → Build conversation (system + history + user message)
    → LLM call with 10 tools
    → Tool call: get_shipments → Backend API → DB → response
    → Tool call: get_disruptions → Backend API → DB → response
    → LLM receives tool results, calls more tools or generates answer
    → Return { reply, actions_taken, model }
  → Backend returns proxied response
  → Frontend renders in AiChatPanel
```

### Agent Cycle Flow

```
User clicks "Run Agent"
  → Frontend: genaiApi.agentRun()
  → Backend: POST /api/genai/agent/run (proxy)
  → AI Service: POST /ai/agent/run
    → OBSERVE: Fetch 5 data sources from backend API
    → Build observation report
    → LLM call with 5 action tools + observation report
    → ACT: LLM calls reroute_shipment → Backend API → DB mutation
    → ACT: LLM calls create_alert → Backend API → DB mutation
    → LLM generates final summary
    → Store in agent_history deque
    → Return { observations_summary, actions[], duration }
  → Backend returns proxied response
  → Frontend renders in AiAgentPanel
```

### Narrative Generation Flow

```
User clicks "Generate Executive Briefing"
  → Frontend: genaiApi.briefing()
  → Backend: POST /api/genai/insights/briefing (proxy)
  → AI Service: POST /ai/insights/briefing
    → Fetch 5 data sources from backend
    → Construct prompt with data + 6-section schema
    → Single LLM call (no tools)
    → Return { briefing, generated_at, model }
  → Backend returns proxied response
  → Frontend renders formatted markdown in GenAiReportPanel
```

---

## Configuration

### Environment Variables

| Variable             | Default                       | Description                                  |
| -------------------- | ----------------------------- | -------------------------------------------- |
| `OPENROUTER_API_KEY` | — (required)                  | OpenRouter API key                           |
| `BACKEND_URL`        | `http://localhost:3001`       | Backend URL for tool/narrative data fetching |
| `LLM_MODEL`          | `google/gemini-2.0-flash-001` | LLM model identifier                         |

### Tunable Constants

| Constant               | File                | Value | Description                          |
| ---------------------- | ------------------- | ----- | ------------------------------------ |
| `MAX_TOOL_ROUNDS`      | `gemini_service.py` | 10    | Max tool-calling iterations in chat  |
| `MAX_AGENT_ROUNDS`     | `agent_service.py`  | 6     | Max tool-calling iterations in agent |
| `AGENT_HISTORY_MAXLEN` | `agent_service.py`  | 10    | Max stored agent cycles              |
| Chat `max_tokens`      | `gemini_service.py` | 3000  | Max response length                  |
| Chat `temperature`     | `gemini_service.py` | 0.3   | Creativity level                     |
| Agent `temperature`    | `agent_service.py`  | 0.2   | Low for reliable actions             |
| Proxy timeout          | `genai.ts`          | 120s  | Backend→AI service timeout           |

### Adding New Tools

To add a new function-calling tool to the chat:

1. Define the tool schema in the `TOOLS` list in `gemini_service.py`:

   ```python
   {
       "type": "function",
       "function": {
           "name": "your_tool_name",
           "description": "What it does",
           "parameters": { ... JSON Schema ... }
       }
   }
   ```

2. Add the execution handler in the `execute_tool()` function:

   ```python
   if name == "your_tool_name":
       response = httpx.get(f"{BACKEND_URL}/api/your-endpoint", params=args)
       return response.json()
   ```

3. Update the system prompt to include chaining strategies for the new tool.

For agent tools, follow the same pattern in `agent_service.py` with `AGENT_TOOLS` and `execute_agent_tool()`.
