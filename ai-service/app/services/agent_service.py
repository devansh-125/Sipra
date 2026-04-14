"""
Autonomous Supply Chain Agent
==============================
Implements an Observe → Reason → Act loop powered by GenAI (via OpenRouter).

Each agent cycle:
  1. OBSERVE  — fetch live data from backend (shipments, disruptions, alerts, risk)
  2. REASON   — send observations to the LLM with agent system prompt
  3. ACT      — execute the LLM's chosen actions (reroute, resolve, alert)
  4. REPORT   — return a structured summary of what happened

The agent uses OpenAI-compatible function calling so the LLM can decide
which actions to take based on real data. Actions are write operations
that actually change the supply chain state.
"""

from __future__ import annotations

import json
import os
import traceback
from collections import deque
from datetime import datetime, timezone
from typing import Any

import httpx
from openai import OpenAI

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:3001")
MODEL_NAME = os.environ.get("LLM_MODEL", "google/gemini-2.0-flash-001")
MAX_TOOL_ROUNDS = 8

# Store last 10 agent cycles in memory
_history: deque[dict] = deque(maxlen=10)

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        if not OPENROUTER_API_KEY:
            raise RuntimeError("OPENROUTER_API_KEY is not set.")
        _client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=OPENROUTER_API_KEY,
            timeout=120.0,
        )
    return _client


# ---------------------------------------------------------------------------
# Backend HTTP helpers
# ---------------------------------------------------------------------------
async def _backend_get(path: str) -> dict:
    """GET from backend, return JSON."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{BACKEND_URL}{path}")
        resp.raise_for_status()
        return resp.json()


async def _backend_post(path: str, body: dict | None = None) -> dict:
    """POST to backend, return JSON."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(f"{BACKEND_URL}{path}", json=body or {})
        resp.raise_for_status()
        return resp.json()


async def _backend_patch(path: str, body: dict | None = None) -> dict:
    """PATCH to backend, return JSON."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.patch(f"{BACKEND_URL}{path}", json=body or {})
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# Agent system prompt
# ---------------------------------------------------------------------------
AGENT_SYSTEM_PROMPT = """\
You are **ChainMind Agent**, an autonomous AI operations agent for a real-time \
supply chain command center. You observe live data, reason about problems, and \
take corrective actions — all without human intervention.

━━━ OBSERVE → REASON → ACT WORKFLOW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PHASE 1 — OBSERVE:
  Call get_supply_chain_state FIRST. Study every field:
  • shipments: check status, risk_level, delay_probability, predicted_delay_min, \
    priority, tracking_number, cargo_type
  • disruptions: check type, severity, status, affected areas
  • alerts: check severity, is_read, message content
  • bottlenecks: check congestion_score, event_count, capacity_score
  • summary: check overall counts (delayed, in_transit, pending)

PHASE 2 — REASON (think before acting):
  For each shipment, compute a priority score:
    urgency = delay_probability × priority_weight × (1 + congestion_on_route)
    where priority_weight: critical=4, high=3, medium=2, low=1
  Sort by urgency descending. Only act on the top issues.

  Decision matrix:
  ┌─────────────────────────┬────────────────────────────────────────────────┐
  │ Condition               │ Action                                         │
  ├─────────────────────────┼────────────────────────────────────────────────┤
  │ delay_prob > 0.5 AND    │ REROUTE (use shipment UUID from "id" field)    │
  │ priority = critical/high│                                                │
  ├─────────────────────────┼────────────────────────────────────────────────┤
  │ delay_prob > 0.3 AND    │ UPDATE STATUS → "delayed"                      │
  │ status = "in_transit"   │                                                │
  ├─────────────────────────┼────────────────────────────────────────────────┤
  │ disruption severity > 7 │ Monitor closely, note in report                │
  │ AND status = "active"   │                                                │
  ├─────────────────────────┼────────────────────────────────────────────────┤
  │ disruption severity ≤ 3 │ RESOLVE DISRUPTION                             │
  │ AND status = "active"   │                                                │
  ├─────────────────────────┼────────────────────────────────────────────────┤
  │ alert.is_read = false   │ MARK ALERT READ after reviewing                │
  │ AND severity = "low"    │                                                │
  ├─────────────────────────┼────────────────────────────────────────────────┤
  │ Everything healthy      │ Report "All clear" — do NOT force actions      │
  └─────────────────────────┴────────────────────────────────────────────────┘

PHASE 3 — ACT:
  Execute the decided actions using the available tools.
  • For reroutes: use the shipment's UUID ("id" field), NOT tracking_number.
  • If a reroute fails, report the failure with the error and move on — never retry.
  • Execute actions in priority order (critical first).

PHASE 4 — REPORT:
  Write a structured summary using this format:

  **Supply Chain Agent Cycle Report**

  **Health Status:** [Healthy / Warning / Critical]

  **Observations:**
  • [Key finding 1 with specific numbers]
  • [Key finding 2]

  **Actions Taken:**
  • [Action 1: what, why, result]
  • [Action 2: what, why, result]

  **Recommendations:**
  • [Any follow-up actions needed]

━━━ RULES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Always reference tracking numbers (e.g., DEMO-1001) and specific data points.
• Maximum 3 reroute actions per cycle to avoid cascading changes.
• Never fabricate data — every number must come from tool results.
• If the supply chain is healthy, say so with supporting evidence.
"""


# ---------------------------------------------------------------------------
# Agent tool definitions (read + write operations)
# ---------------------------------------------------------------------------
AGENT_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_supply_chain_state",
            "description": (
                "Fetch the complete current state of the supply chain: "
                "dashboard summary, all shipments, active disruptions, "
                "open alerts, and network bottlenecks. "
                "Always call this first to understand what's happening."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reroute_shipment",
            "description": (
                "Reroute a shipment to a better alternative route. "
                "Use this when a shipment is delayed, at high risk, or its "
                "current route has active disruptions."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "shipment_id": {
                        "type": "string",
                        "description": "ID of the shipment to reroute",
                    },
                    "reason": {
                        "type": "string",
                        "description": "Why the reroute is needed",
                    },
                },
                "required": ["shipment_id", "reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "resolve_disruption",
            "description": (
                "Mark a disruption as resolved. Use this when conditions have "
                "improved or the disruption has been mitigated."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "disruption_id": {
                        "type": "string",
                        "description": "ID of the disruption to resolve",
                    },
                    "reason": {
                        "type": "string",
                        "description": "Why the disruption is being resolved",
                    },
                },
                "required": ["disruption_id", "reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_shipment_status",
            "description": (
                "Update the status of a shipment. Valid statuses: "
                "pending, in_transit, delayed, delivered, cancelled."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "shipment_id": {
                        "type": "string",
                        "description": "ID of the shipment",
                    },
                    "status": {
                        "type": "string",
                        "enum": ["pending", "in_transit", "delayed", "delivered", "cancelled"],
                        "description": "New status for the shipment",
                    },
                    "reason": {
                        "type": "string",
                        "description": "Why the status is changing",
                    },
                },
                "required": ["shipment_id", "status"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mark_alert_read",
            "description": "Mark an alert as read/acknowledged.",
            "parameters": {
                "type": "object",
                "properties": {
                    "alert_id": {
                        "type": "string",
                        "description": "ID of the alert to mark as read",
                    },
                },
                "required": ["alert_id"],
            },
        },
    },
]


# ---------------------------------------------------------------------------
# Agent tool dispatch — execute actions against the backend
# ---------------------------------------------------------------------------
async def _dispatch_agent_tool(name: str, arguments: dict[str, Any]) -> str:
    """Execute an agent tool call and return the result as JSON string."""
    try:
        if name == "get_supply_chain_state":
            # Fetch data sources sequentially to avoid overwhelming backend pool
            results: dict[str, Any] = {}
            for label, path in [
                ("summary", "/api/dashboard/summary"),
                ("shipments", "/api/shipments?limit=20"),
                ("disruptions", "/api/disruptions?status=active&limit=20"),
                ("alerts", "/api/alerts?is_read=false&limit=20"),
                ("bottlenecks", "/api/dashboard/bottlenecks?limit=5"),
            ]:
                try:
                    data = await _backend_get(path)
                    results[label] = data.get("data", data)
                except Exception as exc:
                    results[label] = {"error": str(exc)}
            return json.dumps(results)

        if name == "reroute_shipment":
            shipment_id = arguments["shipment_id"]
            reason = arguments.get("reason", "Agent-initiated reroute")
            try:
                result = await _backend_post(
                    f"/api/routes/{shipment_id}/reroute",
                    {"reason": reason, "source": "ai-agent"},
                )
                return json.dumps({"success": True, "result": result.get("data", result)})
            except httpx.HTTPStatusError as exc:
                body = exc.response.text
                return json.dumps({
                    "success": False,
                    "error": f"HTTP {exc.response.status_code}: {body}",
                    "shipment_id": shipment_id,
                })
            except Exception as exc:
                return json.dumps({"success": False, "error": str(exc), "shipment_id": shipment_id})

        if name == "resolve_disruption":
            disruption_id = arguments["disruption_id"]
            reason = arguments.get("reason", "Resolved by AI agent")
            try:
                result = await _backend_patch(
                    f"/api/disruptions/{disruption_id}/resolve",
                    {"resolution_notes": reason},
                )
                return json.dumps({"success": True, "result": result.get("data", result)})
            except Exception as exc:
                return json.dumps({"success": False, "error": str(exc)})

        if name == "update_shipment_status":
            shipment_id = arguments["shipment_id"]
            status = arguments["status"]
            reason = arguments.get("reason", "Updated by AI agent")
            try:
                result = await _backend_patch(
                    f"/api/shipments/{shipment_id}/status",
                    {"status": status, "source": "ai-agent", "reason": reason},
                )
                return json.dumps({"success": True, "result": result.get("data", result)})
            except Exception as exc:
                return json.dumps({"success": False, "error": str(exc)})

        if name == "mark_alert_read":
            alert_id = arguments["alert_id"]
            try:
                result = await _backend_patch(f"/api/alerts/{alert_id}/read")
                return json.dumps({"success": True, "result": result.get("data", result)})
            except Exception as exc:
                return json.dumps({"success": False, "error": str(exc)})

        return json.dumps({"error": f"Unknown tool: {name}"})

    except Exception as exc:
        return json.dumps({"error": str(exc), "tool": name})


# ---------------------------------------------------------------------------
# Main agent cycle — Observe → Reason → Act → Report
# ---------------------------------------------------------------------------
async def run_agent_cycle() -> dict[str, Any]:
    """
    Execute one full agent cycle. The LLM observes the supply chain state,
    reasons about what needs attention, and takes corrective actions.

    Returns an AgentCycleResult dict with observations, reasoning, and actions.
    """
    client = _get_client()
    started_at = datetime.now(timezone.utc)

    conversation = [
        {"role": "system", "content": AGENT_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                "Run an autonomous monitoring cycle now.\n\n"
                "IMPORTANT: You MUST actually call the action tools (reroute_shipment, "
                "update_shipment_status, resolve_disruption, mark_alert_read) to execute "
                "actions. Do NOT just describe what you would do — actually call the tools. "
                "Only write your final summary AFTER you have executed all tool calls.\n\n"
                "Step 1: Call get_supply_chain_state\n"
                "Step 2: Based on the data, call the appropriate action tools\n"
                "Step 3: After all actions are complete, write your summary report"
            ),
        },
    ]

    actions_taken: list[dict[str, Any]] = []
    observations_summary = ""

    for _round in range(MAX_TOOL_ROUNDS):
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=conversation,
            tools=AGENT_TOOLS,
            tool_choice="auto",
            temperature=0.2,
            max_tokens=2048,
        )

        choice = response.choices[0]
        message = choice.message

        # No tool calls → final response with reasoning + summary
        if not message.tool_calls:
            observations_summary = message.content or ""
            break

        # Append assistant message with tool_calls
        conversation.append(message)  # type: ignore[arg-type]

        # Execute each tool call
        for tool_call in message.tool_calls:
            fn_name = tool_call.function.name
            try:
                fn_args = json.loads(tool_call.function.arguments)
            except json.JSONDecodeError:
                fn_args = {}

            fn_result = await _dispatch_agent_tool(fn_name, fn_args)

            # Track actions (skip the observe step from action list)
            action_record = {
                "action_type": fn_name,
                "target_id": fn_args.get("shipment_id") or fn_args.get("disruption_id") or fn_args.get("alert_id"),
                "details": fn_args,
                "result": _safe_parse(fn_result),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

            if fn_name != "get_supply_chain_state":
                actions_taken.append(action_record)

            conversation.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": fn_result,
            })

    finished_at = datetime.now(timezone.utc)

    cycle_result = {
        "observations_summary": observations_summary,
        "actions": actions_taken,
        "actions_count": len(actions_taken),
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": round((finished_at - started_at).total_seconds(), 1),
        "model": MODEL_NAME,
    }

    # Store in history
    _history.appendleft(cycle_result)

    return cycle_result


def _safe_parse(s: str) -> Any:
    """Try to parse as JSON, fallback to string."""
    try:
        return json.loads(s)
    except (json.JSONDecodeError, TypeError):
        return s


def get_agent_history(limit: int = 10) -> list[dict]:
    """Return the last N agent cycle results."""
    return list(_history)[:limit]
