import { apiRequest } from '../api/httpClient.ts';
import type { ApiResponse } from '../../types/api.ts';

export type DemoSeedResponse = {
  network?: {
    nodes_created?: number;
    edges_created?: number;
    key_edge_id?: string;
  };
  shipments?: Array<{
    shipment?: {
      id?: string;
      tracking_number?: string;
      status?: string;
    };
    route_plan_id?: string;
  }>;
  carrier_id?: string;
};

export type DemoGodModeResponse = {
  disruption?: {
    id?: string;
    type?: string;
    severity?: number;
    title?: string;
  };
  edge_id?: string;
  impacted_shipments?: Array<{
    shipment_id?: string;
    tracking_number?: string;
    delay_probability?: number;
    predicted_delay_min?: number;
    rerouted?: boolean;
  }>;
  rerouted_count?: number;
};

export type DemoResetResponse = {
  removed?: {
    shipments?: number;
    disruptions?: number;
    alerts?: number;
    nodes?: number;
    edges?: number;
    carriers?: number;
  };
};

export type DemoScenario = 'monsoon_flood' | 'port_congestion' | 'highway_closure';

function toInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scenarioSeverity(scenario: DemoScenario): number {
  if (scenario === 'highway_closure') {
    return 10;
  }

  if (scenario === 'port_congestion') {
    return 9;
  }

  return 8;
}

export const demoApi = {
  seed: (shipmentCount = 4) =>
    apiRequest<ApiResponse<DemoSeedResponse>>('/api/demo/seed', {
      method: 'POST',
      body: JSON.stringify({
        shipment_count: clamp(toInt(shipmentCount, 4), 1, 6)
      })
    }),
  godMode: (severity = 10) =>
    apiRequest<ApiResponse<DemoGodModeResponse>>('/api/demo/god-mode', {
      method: 'POST',
      body: JSON.stringify({
        severity: clamp(toInt(severity, 10), 7, 10)
      })
    }),
  reset: () =>
    apiRequest<ApiResponse<DemoResetResponse>>('/api/demo/reset', {
      method: 'POST'
    }),
  runScenario: (scenario: DemoScenario) =>
    apiRequest<ApiResponse<DemoGodModeResponse>>('/api/demo/god-mode', {
      method: 'POST',
      body: JSON.stringify({
        severity: scenarioSeverity(scenario)
      })
    }),
  seedAndRunScenario: async (scenario: DemoScenario, shipmentCount = 4) => {
    const seedResult = await demoApi.seed(shipmentCount);
    const scenarioResult = await demoApi.runScenario(scenario);

    return {
      seed: seedResult.data,
      scenario: scenarioResult.data
    };
  }
};

export const demoAPI = demoApi;
