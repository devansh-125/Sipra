"""
Narrative Service — GenAI-powered insight generation
=====================================================
Uses the LLM (via OpenRouter) to generate human-readable narratives
from raw supply chain data. No function-calling here — just prompt +
structured data → natural language output.

Four narrative types:
  1. Fleet insights  — overall supply chain health summary
  2. Shipment explain — why a specific shipment is delayed / at risk
  3. Disruption report — executive impact report for a disruption
  4. Briefing         — full supply chain daily briefing
"""

from __future__ import annotations

import json
import os
import traceback
from typing import Any

import httpx
from openai import OpenAI

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:3001")
MODEL_NAME = os.environ.get("LLM_MODEL", "google/gemini-2.0-flash-001")

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        if not OPENROUTER_API_KEY:
            raise RuntimeError("OPENROUTER_API_KEY is not set.")
        _client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=OPENROUTER_API_KEY,
        )
    return _client


async def _call_backend(path: str) -> dict:
    """GET a backend endpoint."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{BACKEND_URL}{path}")
        resp.raise_for_status()
        return resp.json()


def _llm(system: str, user: str, temperature: float = 0.4) -> str:
    """Single-turn LLM call, returns text."""
    client = _get_client()
    resp = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        max_tokens=1500,
    )
    return resp.choices[0].message.content or ""


def _llm_json(system: str, user: str, temperature: float = 0.3, max_tokens: int = 2500) -> dict:
    """Single-turn LLM call expecting JSON output."""
    client = _get_client()
    resp = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
    )
    raw = resp.choices[0].message.content or "{}"
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"raw_text": raw}


# ---------------------------------------------------------------------------
# 1. Fleet Insights
# ---------------------------------------------------------------------------
FLEET_SYSTEM = """\
You are **ChainMind**, the AI analyst for a supply chain command center.

Given fleet data, produce a JSON object with:
{
  "summary": "3-4 sentence overview: total fleet size, how many are on-time vs \
at-risk vs delayed, overall health score (Healthy/Warning/Critical). Include \
specific percentages.",
  "risk_assessment": "2-3 sentences: quantify risk exposure — how many \
shipments above 0.4 delay probability, which cargo types are most affected, \
which corridors (origin→destination) have the highest concentration of risk.",
  "top_concerns": [
    "Specific concern with numbers, e.g. '3 of 4 Delhi→Mumbai shipments show >35% delay probability'",
    "Second concern with data backing",
    "Third concern or 'No critical concerns' if fleet is healthy"
  ],
  "recommended_actions": [
    "Specific, actionable recommendation referencing tracking numbers or routes",
    "Second recommendation",
    "Third recommendation"
  ],
  "risk_level": "Low|Medium|High|Critical"
}
RULES:
- Every sentence must reference specific numbers from the data.
- Reference shipment tracking numbers (e.g., DEMO-1001) when discussing \
specific issues.
- Risk level: Low (<20% at-risk), Medium (20-50%), High (50-80%), Critical (>80%).
- Only output valid JSON, nothing else."""


async def generate_fleet_insights(fleet_data: dict) -> dict:
    """Generate a GenAI narrative for fleet health."""
    user_prompt = f"Analyze this fleet data and provide insights:\n\n{json.dumps(fleet_data, indent=2)}"
    result = _llm_json(FLEET_SYSTEM, user_prompt)
    result["model"] = MODEL_NAME
    return result


# ---------------------------------------------------------------------------
# 2. Shipment Explanation
# ---------------------------------------------------------------------------
SHIPMENT_SYSTEM = """\
You are **ChainMind**, explaining a shipment's delay risk to operations managers.

Given shipment data, produce a JSON object with:
{
  "explanation": "3-4 sentence root-cause analysis. State the tracking number, \
cargo type, and route. Explain WHY it's delayed — connect the delay_probability \
and predicted_delay_min to concrete factors like route congestion, weather, \
traffic, or disruptions. Compare against healthy thresholds.",
  "factors": [
    {
      "name": "Factor Name (e.g., Route Congestion, Weather Risk, Traffic Density)",
      "score": 0.0-1.0,
      "impact": "high|medium|low",
      "reason": "Specific explanation using data, e.g., 'Mumbai Port congestion \
score is 0.46, which is above the 0.3 threshold and directly affects this \
shipment's final-mile delivery.'"
    }
  ],
  "recommendation": "2-3 sentence actionable recommendation. Be specific: \
name alternate routes, suggest timing changes, or recommend priority escalation. \
Include expected improvement.",
  "severity": "low|medium|high|critical"
}
RULES:
- Include exactly 3-5 factors sorted by score descending.
- Every factor reason must reference actual data from the shipment.
- The recommendation must be immediately actionable by an ops manager.
- Only output valid JSON."""


async def generate_shipment_explanation(shipment_data: dict) -> dict:
    """Generate a GenAI explanation for a single shipment's risk/delay."""
    user_prompt = f"Explain the delay risk for this shipment:\n\n{json.dumps(shipment_data, indent=2)}"
    result = _llm_json(SHIPMENT_SYSTEM, user_prompt)
    result["model"] = MODEL_NAME
    return result


# ---------------------------------------------------------------------------
# 3. Disruption Impact Report
# ---------------------------------------------------------------------------
DISRUPTION_SYSTEM = """\
You are **ChainMind**, a supply chain crisis analyst for a real-time command center.

Given disruption data, produce a JSON object with:
{
  "title": "Impactful headline with severity, e.g., 'Severity-8 Weather \
Disruption Blocking Mumbai Port Corridor'",
  "impact_narrative": "4-5 sentence executive impact analysis. Quantify: how \
many shipments affected, estimated total delay minutes across fleet, which \
cargo types are impacted (especially critical/high-priority), and revenue risk \
if applicable. Compare severity to historical baseline.",
  "affected_scope": "2-3 sentences: which nodes (hubs/ports/checkpoints) are \
in the disruption radius, which routes are blocked or degraded, and which \
downstream destinations will see cascading delays.",
  "cascading_risks": "1-2 sentences on potential secondary effects if the \
disruption continues (e.g., warehouse overflow, carrier capacity shortage).",
  "mitigation_steps": [
    "Immediate action (next 1-2 hours) with specific shipment references",
    "Short-term action (next 6-12 hours)",
    "Contingency action if disruption worsens"
  ],
  "urgency": "Low|Medium|High|Critical",
  "estimated_resolution": "Best estimate for resolution timeframe"
}
RULES:
- Every number must come from the provided data.
- Reference specific node names, shipment tracking numbers, and route corridors.
- Urgency: Low (sev ≤ 3), Medium (4-5), High (6-7), Critical (≥ 8).
- Only output valid JSON."""


async def generate_disruption_report(disruption_data: dict) -> dict:
    """Generate a GenAI impact report for a disruption event."""
    user_prompt = f"Generate an impact report for this disruption:\n\n{json.dumps(disruption_data, indent=2)}"
    result = _llm_json(DISRUPTION_SYSTEM, user_prompt)
    result["model"] = MODEL_NAME
    return result


# ---------------------------------------------------------------------------
# 4. Supply Chain Briefing
# ---------------------------------------------------------------------------
BRIEFING_SYSTEM = """\
You are **ChainMind**, generating an executive supply chain briefing for C-level \
stakeholders in a real-time command center.

Given current operational data, produce a JSON object with:
{
  "briefing": "5-6 paragraph markdown-formatted executive briefing structured as:\n\n\
**1. Executive Summary** (2-3 sentences: overall health verdict — Healthy / \
Warning / Critical — with key numbers)\n\n\
**2. Fleet Status** (shipment breakdown by status, highlight any delayed or \
at-risk shipments by tracking number, cargo type, and predicted delay)\n\n\
**3. Network Health** (congestion hotspots by node name and score, any blocked \
routes, capacity utilization)\n\n\
**4. Active Issues** (disruptions with type/severity, affected corridors, \
unread alerts)\n\n\
**5. Risk Forecast** (what could go wrong in the next 12-24 hours based on \
current trends — e.g., if congestion at Mumbai Port continues rising) \n\n\
**6. Recommended Priorities** (numbered list of specific actions for the ops team, \
ordered by urgency)",
  "key_metrics": {
    "total_shipments": "<number from data>",
    "in_transit": "<number>",
    "delayed": "<number>",
    "at_risk_count": "<number of shipments with delay_prob > 0.3>",
    "active_disruptions": "<number>",
    "avg_delay_min": "<number>",
    "network_health": "Healthy|Degraded|Critical",
    "top_bottleneck": "<name of most congested node>"
  },
  "action_items": [
    "URGENT: [specific action referencing tracking numbers or node names]",
    "HIGH: [second priority action]",
    "MONITOR: [thing to watch closely]"
  ]
}
RULES:
- Every metric and statement must be backed by the provided data.
- Reference specific tracking numbers (DEMO-1001), node names (Mumbai Port), \
and route corridors (Delhi→Mumbai).
- If data shows everything healthy, still provide the full structure but with \
positive assessments.
- Do not round away meaningful precision — 0.46 congestion score matters vs 0.5.
- Only output valid JSON."""


async def generate_briefing() -> dict:
    """
    Generate a full supply chain briefing by fetching live data
    from the backend and synthesizing it with GenAI.
    """
    # Fetch multiple data sources in parallel
    try:
        summary = await _call_backend("/api/dashboard/summary")
    except Exception:
        summary = {"data": {}}

    try:
        disruptions = await _call_backend("/api/disruptions?status=active&limit=10")
    except Exception:
        disruptions = {"data": []}

    try:
        bottlenecks = await _call_backend("/api/dashboard/bottlenecks?limit=5")
    except Exception:
        bottlenecks = {"data": {}}

    try:
        risk_dist = await _call_backend("/api/dashboard/risk-distribution")
    except Exception:
        risk_dist = {"data": {}}

    try:
        shipments = await _call_backend("/api/shipments?limit=20")
    except Exception:
        shipments = {"data": []}

    combined = {
        "dashboard_summary": summary.get("data", {}),
        "active_disruptions": disruptions.get("data", []),
        "bottlenecks": bottlenecks.get("data", {}),
        "risk_distribution": risk_dist.get("data", {}),
        "shipments": shipments.get("data", []),
    }

    user_prompt = f"Generate a supply chain executive briefing from this live data:\n\n{json.dumps(combined, indent=2)}"
    result = _llm_json(BRIEFING_SYSTEM, user_prompt, max_tokens=3500)
    result["model"] = MODEL_NAME

    from datetime import datetime, timezone
    result["generated_at"] = datetime.now(timezone.utc).isoformat()

    return result
