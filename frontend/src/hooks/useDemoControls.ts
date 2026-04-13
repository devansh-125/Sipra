import { useCallback, useMemo, useState } from 'react';
import { demoApi } from '../services/demo/demoApi.ts';
import type { ApiResponse } from '../types/api.ts';

type DemoAction = 'seed' | 'godMode' | 'reset';

type SeedResponseData = {
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

type GodModeResponseData = {
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

type ResetResponseData = {
  removed?: {
    shipments?: number;
    disruptions?: number;
    alerts?: number;
    nodes?: number;
    edges?: number;
    carriers?: number;
  };
};

type ScenarioOptions = {
  autoSeedOnMissing?: boolean;
  fallbackSeedCount?: number;
};

type LastResult = {
  action: DemoAction;
  summary: string;
  at: string;
};

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Request failed';
  }

  const raw = error.message || 'Request failed';

  try {
    const parsed = JSON.parse(raw) as { message?: string; error?: string };
    return parsed.message || parsed.error || raw;
  } catch {
    return raw;
  }
}

function shouldRetryWithSeed(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('demo network not found') ||
    text.includes('critical edge not found') ||
    text.includes('call /api/demo/seed') ||
    text.includes('seed')
  );
}

function toSeedSummary(data?: SeedResponseData): string {
  const nodes = data?.network?.nodes_created ?? 0;
  const edges = data?.network?.edges_created ?? 0;
  const shipments = data?.shipments?.length ?? 0;
  return `Seeded ${nodes} nodes, ${edges} edges, ${shipments} shipments.`;
}

function toGodModeSummary(data?: GodModeResponseData): string {
  const impacted = data?.impacted_shipments?.length ?? 0;
  const rerouted = data?.rerouted_count ?? 0;
  return `Scenario impacted ${impacted} shipments and rerouted ${rerouted}.`;
}

function toResetSummary(data?: ResetResponseData): string {
  const removed = data?.removed;
  return `Removed ${removed?.shipments ?? 0} shipments, ${removed?.disruptions ?? 0} disruptions, ${removed?.alerts ?? 0} alerts.`;
}

export function useDemoControls() {
  const [activeAction, setActiveAction] = useState<DemoAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<LastResult | null>(null);

  const isBusy = useMemo(() => activeAction !== null, [activeAction]);

  const runSeed = useCallback(async (shipmentCount = 4): Promise<ApiResponse<SeedResponseData>> => {
    setActiveAction('seed');
    setError(null);

    try {
      const response = (await demoApi.seed(shipmentCount)) as ApiResponse<SeedResponseData>;
      setLastResult({
        action: 'seed',
        summary: toSeedSummary(response.data),
        at: new Date().toISOString()
      });
      return response;
    } catch (requestError) {
      setError(parseErrorMessage(requestError));
      throw requestError;
    } finally {
      setActiveAction(null);
    }
  }, []);

  const runGodMode = useCallback(async (severity = 10): Promise<ApiResponse<GodModeResponseData>> => {
    setActiveAction('godMode');
    setError(null);

    try {
      const response = (await demoApi.godMode(severity)) as ApiResponse<GodModeResponseData>;
      setLastResult({
        action: 'godMode',
        summary: toGodModeSummary(response.data),
        at: new Date().toISOString()
      });
      return response;
    } catch (requestError) {
      setError(parseErrorMessage(requestError));
      throw requestError;
    } finally {
      setActiveAction(null);
    }
  }, []);

  const runReset = useCallback(async (): Promise<ApiResponse<ResetResponseData>> => {
    setActiveAction('reset');
    setError(null);

    try {
      const response = (await demoApi.reset()) as ApiResponse<ResetResponseData>;
      setLastResult({
        action: 'reset',
        summary: toResetSummary(response.data),
        at: new Date().toISOString()
      });
      return response;
    } catch (requestError) {
      setError(parseErrorMessage(requestError));
      throw requestError;
    } finally {
      setActiveAction(null);
    }
  }, []);

  const runScenario = useCallback(
    async (severity = 10, options: ScenarioOptions = {}): Promise<ApiResponse<GodModeResponseData>> => {
      const { autoSeedOnMissing = true, fallbackSeedCount = 4 } = options;

      try {
        return await runGodMode(severity);
      } catch (scenarioError) {
        const message = parseErrorMessage(scenarioError);

        if (!autoSeedOnMissing || !shouldRetryWithSeed(message)) {
          throw scenarioError;
        }

        await runSeed(fallbackSeedCount);
        return runGodMode(severity);
      }
    },
    [runGodMode, runSeed]
  );

  const clearState = useCallback(() => {
    setError(null);
    setLastResult(null);
  }, []);

  return {
    runSeed,
    runGodMode,
    runReset,
    runScenario,
    activeAction,
    isBusy,
    error,
    lastResult,
    clearState
  };
}
