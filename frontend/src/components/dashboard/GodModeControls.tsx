import { useMemo, useState } from 'react';
import SectionCard from '../common/SectionCard.tsx';
import { useDemoControls } from '../../hooks/useDemoControls.ts';

type SeedResponse = {
  data?: {
    network?: {
      nodes_created?: number;
      edges_created?: number;
    };
    shipments?: Array<unknown>;
  };
};

type GodModeResponse = {
  data?: {
    rerouted_count?: number;
    impacted_shipments?: Array<unknown>;
  };
};

type ResetResponse = {
  data?: {
    removed?: {
      shipments?: number;
      disruptions?: number;
      alerts?: number;
      nodes?: number;
      edges?: number;
      carriers?: number;
    };
  };
};

type FeedbackState = {
  tone: 'success' | 'error' | 'info';
  title: string;
  description: string;
};

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Request failed';
  }

  const raw = error.message || 'Request failed';
  try {
    const parsed = JSON.parse(raw) as { message?: string };
    if (parsed?.message) {
      return parsed.message;
    }
  } catch {
    return raw;
  }

  return raw;
}

export default function GodModeControls() {
  const { runSeed, runGodMode, runReset } = useDemoControls();

  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const isBusy = useMemo(() => Boolean(activeAction), [activeAction]);

  async function seedNetwork() {
    setActiveAction('seed');
    setFeedback({
      tone: 'info',
      title: 'Seeding Demo Network',
      description: 'Creating sample routes, nodes, and shipments...'
    });

    try {
      const response = (await runSeed(4)) as SeedResponse;
      const nodes = response.data?.network?.nodes_created ?? 0;
      const edges = response.data?.network?.edges_created ?? 0;
      const shipments = response.data?.shipments?.length ?? 0;

      setFeedback({
        tone: 'success',
        title: 'Demo Network Ready',
        description: `${nodes} nodes, ${edges} edges, ${shipments} shipments created.`
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        title: 'Seed Failed',
        description: parseErrorMessage(error)
      });
    } finally {
      setActiveAction(null);
    }
  }

  async function runScenario(label: string, severity: number) {
    setActiveAction(label);
    setFeedback({
      tone: 'info',
      title: `${label} Running`,
      description: 'Injecting disruption and simulating reroutes...'
    });

    try {
      let response: GodModeResponse;

      try {
        response = (await runGodMode(severity)) as GodModeResponse;
      } catch (error) {
        const message = parseErrorMessage(error).toLowerCase();
        if (message.includes('seed') || message.includes('demo network not found') || message.includes('critical edge not found')) {
          await runSeed(4);
          response = (await runGodMode(severity)) as GodModeResponse;
        } else {
          throw error;
        }
      }

      const impacted = response.data?.impacted_shipments?.length ?? 0;
      const rerouted = response.data?.rerouted_count ?? 0;

      setFeedback({
        tone: 'success',
        title: `${label} Complete`,
        description: `${impacted} shipments impacted, ${rerouted} rerouted.`
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        title: `${label} Failed`,
        description: parseErrorMessage(error)
      });
    } finally {
      setActiveAction(null);
    }
  }

  async function resetNetwork() {
    setActiveAction('reset');
    setFeedback({
      tone: 'info',
      title: 'Resetting Demo State',
      description: 'Removing demo disruptions, nodes, and shipments...'
    });

    try {
      const response = (await runReset()) as ResetResponse;
      const removed = response.data?.removed;

      setFeedback({
        tone: 'success',
        title: 'Demo Reset Complete',
        description: `Removed ${removed?.shipments ?? 0} shipments, ${removed?.disruptions ?? 0} disruptions, ${removed?.alerts ?? 0} alerts.`
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        title: 'Reset Failed',
        description: parseErrorMessage(error)
      });
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <SectionCard title="God Mode" subtitle="Trigger dramatic scenarios for demo impact">
      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => void seedNetwork()}
          className="rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold hover:bg-sky-600 disabled:opacity-60"
        >
          {activeAction === 'seed' ? 'Seeding...' : 'Seed Demo Network'}
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => void runScenario('Monsoon Flood', 8)}
          className="rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold hover:bg-rose-500 disabled:opacity-60"
        >
          {activeAction === 'Monsoon Flood' ? 'Running...' : 'Simulate Monsoon Flood'}
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => void runScenario('Port Congestion', 9)}
          className="rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold hover:bg-amber-500 disabled:opacity-60"
        >
          {activeAction === 'Port Congestion' ? 'Running...' : 'Simulate Port Congestion'}
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => void runScenario('Highway Closure', 10)}
          className="rounded-md bg-red-700 px-3 py-2 text-sm font-semibold hover:bg-red-600 disabled:opacity-60"
        >
          {activeAction === 'Highway Closure' ? 'Running...' : 'Simulate Highway Closure'}
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => void resetNetwork()}
          className="rounded-md bg-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-600 disabled:opacity-60"
        >
          {activeAction === 'reset' ? 'Resetting...' : 'Reset Network'}
        </button>
      </div>

      {feedback ? (
        <div
          className={`mt-3 rounded-md border p-3 text-xs ${
            feedback.tone === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : feedback.tone === 'error'
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                : 'border-sky-500/40 bg-sky-500/10 text-sky-200'
          }`}
        >
          <p className="font-semibold">{feedback.title}</p>
          <p className="mt-1">{feedback.description}</p>
        </div>
      ) : null}
    </SectionCard>
  );
}
