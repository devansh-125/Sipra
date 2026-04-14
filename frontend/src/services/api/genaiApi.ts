import { apiRequest } from './httpClient.ts';
import type { ApiResponse } from '../../types/api.ts';

// ── Chat ─────────────────────────────────────────────────────────

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ChatResponse = {
  reply: string;
  actions_taken?: { tool: string; input: Record<string, unknown>; output: unknown }[];
  model?: string;
};

// ── Insights ─────────────────────────────────────────────────────

export type BriefingResponse = {
  briefing: string;
  generated_at?: string;
  model?: string;
};

export type FleetInsightsResponse = {
  summary?: string;
  concerns?: string[];
  actions?: string[];
  risk_level?: string;
  model?: string;
};

// ── Agent ────────────────────────────────────────────────────────

export type AgentAction = {
  action_type: string;
  target_id?: string | null;
  details?: Record<string, unknown>;
  result?: unknown;
  timestamp?: string;
};

export type AgentCycleResult = {
  observations_summary: string;
  actions: AgentAction[];
  actions_count: number;
  started_at: string;
  finished_at: string;
  duration_seconds: number;
  model?: string;
};

// ── API methods ──────────────────────────────────────────────────

export const genaiApi = {
  /** Send a chat message and get an AI response with optional tool use. */
  chat: (userMessage: string, history: ChatMessage[] = []) =>
    apiRequest<ApiResponse<ChatResponse>>('/api/genai/chat', {
      method: 'POST',
      body: JSON.stringify({ user_message: userMessage, messages: history }),
      timeoutMs: 120_000,
    }),

  /** Generate an executive briefing from live dashboard data. */
  briefing: () =>
    apiRequest<ApiResponse<BriefingResponse>>('/api/genai/insights/briefing', {
      method: 'POST',
      body: JSON.stringify({}),
      timeoutMs: 120_000,
    }),

  /** Generate fleet-level insights. */
  fleetInsights: (shipments: unknown[], summary: Record<string, unknown> = {}) =>
    apiRequest<ApiResponse<FleetInsightsResponse>>('/api/genai/insights/fleet', {
      method: 'POST',
      body: JSON.stringify({ shipments, summary }),
      timeoutMs: 120_000,
    }),

  /** Explain a single shipment's delay. */
  explainShipment: (shipment: Record<string, unknown>) =>
    apiRequest<ApiResponse<unknown>>('/api/genai/insights/shipment', {
      method: 'POST',
      body: JSON.stringify({ shipment }),
      timeoutMs: 120_000,
    }),

  /** Run one autonomous agent cycle. */
  agentRun: () =>
    apiRequest<ApiResponse<AgentCycleResult>>('/api/genai/agent/run', {
      method: 'POST',
      body: JSON.stringify({}),
      timeoutMs: 120_000,
    }),

  /** Get agent run history. */
  agentHistory: (limit = 10) =>
    apiRequest<ApiResponse<AgentCycleResult[]>>('/api/genai/agent/history', {
      query: { limit },
    }),
};
