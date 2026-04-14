import { useCallback, useState } from 'react';
import SectionCard from '../common/SectionCard.tsx';
import LoadingBlock from '../common/LoadingBlock.tsx';
import { genaiApi } from '../../services/api/genaiApi.ts';
import type { AgentCycleResult } from '../../services/api/genaiApi.ts';

function actionIcon(type: string): string {
  if (type.includes('reroute')) return '🔄';
  if (type.includes('resolve')) return '✅';
  if (type.includes('update')) return '📝';
  if (type.includes('alert') || type.includes('mark')) return '🔔';
  return '⚡';
}

function actionResultBadge(result: unknown): { label: string; tone: string } {
  if (result && typeof result === 'object' && 'success' in result) {
    const r = result as { success: boolean };
    return r.success
      ? { label: 'Success', tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' }
      : { label: 'Failed', tone: 'text-rose-300 border-rose-500/30 bg-rose-500/10' };
  }
  return { label: 'Done', tone: 'text-slate-300 border-slate-600 bg-slate-800' };
}

export default function AiAgentPanel() {
  const [lastResult, setLastResult] = useState<AgentCycleResult | null>(null);
  const [history, setHistory] = useState<AgentCycleResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAgent = useCallback(async () => {
    setIsRunning(true);
    setError(null);

    try {
      const response = await genaiApi.agentRun();
      setLastResult(response.data as AgentCycleResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Agent run failed';
      setError(message);
    } finally {
      setIsRunning(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const response = await genaiApi.agentHistory(5);
      const data = response.data;
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      // silent - history is optional
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  return (
    <SectionCard
      title="Supply Chain Agent"
      subtitle="Autonomous AI agent that monitors, reasons, and acts on your supply chain"
    >
      <div className="space-y-4">
        {/* Agent controls */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void runAgent()}
            disabled={isRunning}
            className="flex-1 rounded-lg border border-emerald-500/30 bg-gradient-to-r from-emerald-500/15 to-cyan-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-200 hover:from-emerald-500/25 hover:to-cyan-500/25 disabled:opacity-50 transition-all"
          >
            {isRunning ? 'Agent Running...' : '⚡ Run Agent Cycle'}
          </button>
          <button
            type="button"
            onClick={() => void loadHistory()}
            disabled={isLoadingHistory}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-300 hover:border-slate-500 disabled:opacity-50 transition-colors"
          >
            History
          </button>
        </div>

        {isRunning && (
          <div className="space-y-2">
            <LoadingBlock />
            <p className="text-center text-xs text-slate-400 animate-pulse">
              Observing → Reasoning → Acting...
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {/* Last agent result */}
        {!isRunning && lastResult && (
          <div className="space-y-3">
            {/* Summary */}
            <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
              <p className="text-xs uppercase tracking-wide text-cyan-300/80 mb-2">Agent Observations</p>
              {lastResult.observations_summary.split('\n').map((line, i) => {
                if (!line.trim()) return null;
                return (
                  <p key={i} className="text-sm text-slate-300 leading-relaxed">
                    {line}
                  </p>
                );
              })}
            </div>

            {/* Actions taken */}
            {lastResult.actions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Actions Taken ({lastResult.actions_count})
                </p>
                {lastResult.actions.map((action, i) => {
                  const badge = actionResultBadge(action.result);
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3"
                    >
                      <span className="text-lg">{actionIcon(action.action_type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-200">
                            {action.action_type.replace(/_/g, ' ')}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.tone}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        {action.target_id && (
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            Target: {action.target_id}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {lastResult.actions.length === 0 && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-center">
                <p className="text-sm text-slate-400">
                  No actions needed — the supply chain looks healthy.
                </p>
              </div>
            )}

            {/* Metadata */}
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Duration: {lastResult.duration_seconds}s</span>
              <span>{lastResult.model || 'Gemini 2.0 Flash'}</span>
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-400">Recent Runs</p>
            {history.map((run, i) => (
              <div
                key={i}
                className="rounded-lg border border-slate-800 bg-slate-950/40 p-2 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <p className="text-xs text-slate-300 truncate">
                    {run.actions_count} action{run.actions_count !== 1 ? 's' : ''} taken
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {run.started_at ? new Date(run.started_at).toLocaleString() : 'Unknown time'}
                  </p>
                </div>
                <span className="text-[11px] text-slate-500">{run.duration_seconds}s</span>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isRunning && !lastResult && !error && history.length === 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-center">
            <p className="text-sm text-slate-400">
              The autonomous agent will observe your supply chain state, identify issues, and take corrective actions automatically.
            </p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
