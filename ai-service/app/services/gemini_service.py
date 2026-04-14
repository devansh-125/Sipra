"""
Gemini / LLM Chat Service (via OpenRouter)
============================================
Uses the OpenAI Python SDK pointed at OpenRouter's API to access
google/gemini-2.0-flash with function-calling (tool use).

8 tools are defined, each mapping to an existing ML service or backend API:
  - predict_shipment_delay  → prediction_service.predict_delay()
  - detect_anomaly          → disruption_detector.detect_anomaly()
  - score_routes            → route_optimizer.score_routes()
  - recommend_best_route    → route_optimizer.recommend_route()
  - simulate_disruption     → simulation_service.simulate_disruption()
  - get_supply_chain_summary→ GET /api/dashboard/summary
  - get_active_disruptions  → GET /api/disruptions?status=active
  - get_at_risk_shipments   → GET /api/shipments?status=in_transit

The chat() function runs a multi-turn loop: if the model returns tool_calls,
we execute them against real services and feed results back until the model
produces a final text response.
"""

from __future__ import annotations

import json
import os
import traceback
from typing import Any

import httpx
from openai import OpenAI
from openai.types.chat import ChatCompletionMessageParam

from app.schemas.models import (
    PredictDelayRequest,
    DetectAnomalyRequest,
    ScoreRouteRequest,
    RouteCandidate,
    SimulateDisruptionRequest,
)
from app.services.prediction_service import predict_delay
from app.services.disruption_detector import detect_anomaly
from app.services.route_optimizer import score_routes, recommend_route
from app.services.simulation_service import simulate_disruption

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:3001")
MODEL_NAME = os.environ.get("LLM_MODEL", "google/gemini-2.0-flash-001")
MAX_TOOL_ROUNDS = 10

SYSTEM_PROMPT = """\
You are **ChainMind**, the AI operations analyst for a real-time supply chain \
command center. You have direct access to live databases and ML models through \
function tools, and you MUST use them aggressively to deliver complete, \
data-grounded answers.

━━━ CORE BEHAVIOR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• ALWAYS call tools before answering — never say "I don't have information" if \
  a tool can provide it.
• Chain multiple tools in a single response to build a complete picture. For \
  example: get_at_risk_shipments → predict_shipment_delay → get_bottlenecks.
• NEVER ask the user for data you can retrieve with tools. If a shipment or hub \
  is mentioned, look it up.
• Derive root causes by cross-referencing data from multiple tools. Don't stop \
  at surface-level answers.

━━━ MULTI-TOOL STRATEGY (follow this per question type) ━━━━━━━━━━━━━━━━━━━━━
■ "Which shipments are delayed / at risk?"
  1. get_at_risk_shipments — find them
  2. get_bottlenecks — check if their route's hubs are congested
  3. get_active_disruptions — check if disruptions affect those routes
  4. Synthesize: for each shipment, explain the specific combination of factors

■ "Should we reroute? What's the best action?"
  1. get_at_risk_shipments — identify candidates
  2. get_bottlenecks — check congestion at hubs on their routes
  3. get_active_disruptions — check route disruptions
  4. predict_shipment_delay — model the delay for each at-risk shipment
  5. Synthesize: rank shipments by urgency, recommend specific actions

■ "Hub congestion / bottleneck analysis"
  1. get_bottlenecks — get ranked congestion data
  2. get_at_risk_shipments — find shipments passing through congested hubs
  3. get_active_disruptions — check for disruptions at those hubs
  4. simulate_disruption — model what happens if congestion worsens
  5. Synthesize: show congestion impact on specific shipments

■ "Overall health / daily briefing"
  1. get_supply_chain_summary — overall status
  2. get_bottlenecks — congestion hotspots
  3. get_active_disruptions — active issues
  4. get_at_risk_shipments — at-risk shipments
  5. Synthesize: health score, top risks, recommended priorities

■ "Anomaly detection"
  1. detect_anomaly — with relevant metrics
  2. get_supply_chain_summary — compare against baselines
  3. Synthesize: explain whether this is anomalous and why

■ "Route comparison / optimization"
  1. score_routes or recommend_best_route — with candidate data
  2. get_bottlenecks — check congestion on proposed routes
  3. Synthesize: recommend the best option with reasons

━━━ RESPONSE FORMAT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Lead with the key finding or recommendation.
• Include specific numbers: tracking numbers, congestion scores, delay minutes, \
  risk levels, hub names.
• Use **bold** for important terms and bullet points for lists.
• End with a "Recommended Actions" section when actionable.
• Use tables for comparisons when there are 3+ items.
• Keep responses 150-400 words — detailed but not verbose.
• Always respond in English.

━━━ WARNING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEVER fabricate data. Every number in your answer must come from a tool result. \
If a tool returns an error, say what happened and what data is missing.
"""

# ---------------------------------------------------------------------------
# OpenAI client → OpenRouter
# ---------------------------------------------------------------------------
_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        if not OPENROUTER_API_KEY:
            raise RuntimeError(
                "OPENROUTER_API_KEY is not set. "
                "Get a key at https://openrouter.ai/keys"
            )
        _client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=OPENROUTER_API_KEY,
        )
    return _client


# ---------------------------------------------------------------------------
# Tool definitions (OpenAI function-calling schema)
# ---------------------------------------------------------------------------
TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "predict_shipment_delay",
            "description": (
                "Predict the delay probability, estimated delay in minutes, "
                "and risk level for a shipment given its route and condition parameters."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "distance_km": {
                        "type": "number",
                        "description": "Distance in km for the shipment route",
                    },
                    "weather_risk_score": {
                        "type": "number",
                        "description": "Weather risk score 0-1",
                    },
                    "traffic_risk_score": {
                        "type": "number",
                        "description": "Traffic risk score 0-1",
                    },
                    "congestion_score": {
                        "type": "number",
                        "description": "Congestion score 0-1",
                    },
                    "disruptions_count": {
                        "type": "integer",
                        "description": "Number of active disruptions on the route",
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["low", "medium", "high", "critical"],
                        "description": "Shipment priority level",
                    },
                },
                "required": ["distance_km"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "detect_anomaly",
            "description": (
                "Detect anomalies in supply chain metrics. Returns anomaly score, "
                "whether it's anomalous, and top contributing indicators."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "delivery_time_deviation": {
                        "type": "number",
                        "description": "Deviation in delivery times 0-1",
                    },
                    "order_volume_spike": {
                        "type": "number",
                        "description": "Order volume spike indicator 0-1",
                    },
                    "inventory_level": {
                        "type": "number",
                        "description": "Inventory level ratio 0-1",
                    },
                    "supplier_lead_time": {
                        "type": "number",
                        "description": "Supplier lead time factor 0-1",
                    },
                    "defect_rate": {
                        "type": "number",
                        "description": "Defect rate 0-1",
                    },
                    "transport_cost_ratio": {
                        "type": "number",
                        "description": "Transport cost ratio 0-1",
                    },
                    "weather_severity": {
                        "type": "number",
                        "description": "Weather severity 0-1",
                    },
                    "port_congestion": {
                        "type": "number",
                        "description": "Port congestion level 0-1",
                    },
                    "threshold": {
                        "type": "number",
                        "description": "Anomaly threshold 0-1 (default 0.7)",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "score_routes",
            "description": (
                "Score one or more route candidates based on distance, time, "
                "weather/traffic/disruption risk, and cost. Returns scored routes "
                "sorted by score (best first)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "candidates": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "distance_km": {"type": "number"},
                                "estimated_time_min": {"type": "number"},
                                "weather_risk": {"type": "number"},
                                "traffic_risk": {"type": "number"},
                                "disruption_risk": {"type": "number"},
                                "cost": {"type": "number"},
                            },
                        },
                        "description": "Array of route candidates to score",
                    },
                },
                "required": ["candidates"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "recommend_best_route",
            "description": (
                "Recommend the best route from candidates, plus up to 2 alternatives."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "candidates": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "distance_km": {"type": "number"},
                                "estimated_time_min": {"type": "number"},
                                "weather_risk": {"type": "number"},
                                "traffic_risk": {"type": "number"},
                                "disruption_risk": {"type": "number"},
                                "cost": {"type": "number"},
                            },
                        },
                        "description": "Array of route candidates to evaluate",
                    },
                },
                "required": ["candidates"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "simulate_disruption",
            "description": (
                "Simulate a supply chain disruption and estimate its impact "
                "(number of affected shipments, average delay)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": ["weather", "congestion", "blockage", "vehicle_issue"],
                        "description": "Disruption type",
                    },
                    "severity": {
                        "type": "number",
                        "description": "Severity 1-10",
                    },
                    "affected_radius_km": {
                        "type": "number",
                        "description": "Affected radius in km",
                    },
                },
                "required": ["type", "severity"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_supply_chain_summary",
            "description": (
                "Get the current supply chain dashboard summary including total "
                "shipments by status, active disruptions, open alerts, and "
                "average delay statistics."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_active_disruptions",
            "description": (
                "Get a list of currently active supply chain disruptions "
                "with their type, severity, status, and location."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_at_risk_shipments",
            "description": (
                "Get a list of in-transit shipments that may be at risk of delay. "
                "Includes tracking number, status, delay probability, and risk level."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_network_nodes",
            "description": (
                "Get all network hub/warehouse/port/checkpoint nodes with their "
                "type, city, country, latitude, longitude, and active status. "
                "Use this to answer questions about hubs, warehouses, ports, and locations."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_bottlenecks",
            "description": (
                "Get the top network bottleneck nodes ranked by congestion, "
                "event count, and shipment volume. Use this to find which hubs "
                "or routes have the highest congestion or traffic."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Number of top bottlenecks to return (default 10)",
                    },
                },
                "required": [],
            },
        },
    },
]


# ---------------------------------------------------------------------------
# Tool dispatch — execute a function call against real services/APIs
# ---------------------------------------------------------------------------
async def _call_backend(path: str) -> dict:
    """Call the Node.js backend and return the JSON response."""
    url = f"{BACKEND_URL}{path}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()


async def _dispatch_tool(name: str, arguments: dict[str, Any]) -> str:
    """Execute a tool call and return its JSON result as a string."""
    try:
        if name == "predict_shipment_delay":
            req = PredictDelayRequest(**arguments)
            result = predict_delay(req)
            return result.model_dump_json()

        if name == "detect_anomaly":
            threshold = arguments.pop("threshold", 0.7)
            req = DetectAnomalyRequest(metrics=arguments, threshold=threshold)
            result = detect_anomaly(req)
            return result.model_dump_json()

        if name == "score_routes":
            candidates = [RouteCandidate(**c) for c in arguments.get("candidates", [])]
            req = ScoreRouteRequest(candidates=candidates)
            result = score_routes(req)
            return result.model_dump_json()

        if name == "recommend_best_route":
            candidates = [RouteCandidate(**c) for c in arguments.get("candidates", [])]
            req = ScoreRouteRequest(candidates=candidates)
            result = recommend_route(req)
            return result.model_dump_json()

        if name == "simulate_disruption":
            req = SimulateDisruptionRequest(**arguments)
            result = simulate_disruption(req)
            return result.model_dump_json()

        if name == "get_supply_chain_summary":
            data = await _call_backend("/api/dashboard/summary")
            return json.dumps(data)

        if name == "get_active_disruptions":
            data = await _call_backend("/api/disruptions?status=active&limit=20")
            return json.dumps(data)

        if name == "get_at_risk_shipments":
            data = await _call_backend("/api/shipments?status=in_transit&limit=20")
            return json.dumps(data)

        if name == "get_network_nodes":
            data = await _call_backend("/api/network/nodes?limit=50")
            return json.dumps(data)

        if name == "get_bottlenecks":
            limit = arguments.get("limit", 10)
            data = await _call_backend(f"/api/dashboard/bottlenecks?limit={limit}")
            return json.dumps(data)

        return json.dumps({"error": f"Unknown tool: {name}"})

    except Exception as exc:
        return json.dumps({"error": str(exc), "tool": name})


# ---------------------------------------------------------------------------
# Main chat function — multi-turn with function calling
# ---------------------------------------------------------------------------
async def chat(
    messages: list[dict[str, str]],
    user_message: str,
) -> dict[str, Any]:
    """
    Send a user message (plus history) to the LLM. Handles multi-turn
    function calling: if the model returns tool_calls, we execute them
    and feed the results back until we get a final text response.

    Returns:
        {
            "reply": <final text>,
            "actions_taken": [{"tool": ..., "input": ..., "output": ...}, ...],
            "model": <model name>
        }
    """
    client = _get_client()

    # Build conversation
    conversation: list[ChatCompletionMessageParam] = [
        {"role": "system", "content": SYSTEM_PROMPT}
    ]

    # Add history
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("user", "assistant"):
            conversation.append({"role": role, "content": content})

    # Add new user message
    conversation.append({"role": "user", "content": user_message})

    actions_taken: list[dict[str, Any]] = []

    # Multi-turn function calling loop
    for _round in range(MAX_TOOL_ROUNDS):
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=conversation,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0.3,
            max_tokens=3000,
        )

        choice = response.choices[0]
        message = choice.message

        # If no tool calls → we have the final text answer
        if not message.tool_calls:
            return {
                "reply": message.content or "",
                "actions_taken": actions_taken,
                "model": MODEL_NAME,
            }

        # Append assistant message with tool_calls
        conversation.append(message)  # type: ignore[arg-type]

        # Execute each tool call
        for tool_call in message.tool_calls:
            fn_name = tool_call.function.name
            try:
                fn_args = json.loads(tool_call.function.arguments)
            except json.JSONDecodeError:
                fn_args = {}

            fn_result = await _dispatch_tool(fn_name, fn_args)

            actions_taken.append({
                "tool": fn_name,
                "input": fn_args,
                "output": json.loads(fn_result) if fn_result.startswith("{") or fn_result.startswith("[") else fn_result,
            })

            # Feed tool result back to conversation
            conversation.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": fn_result,
            })

    # If we exhausted rounds, return what we have
    return {
        "reply": "I gathered the data but ran out of processing rounds. Please try a more specific question.",
        "actions_taken": actions_taken,
        "model": MODEL_NAME,
    }
