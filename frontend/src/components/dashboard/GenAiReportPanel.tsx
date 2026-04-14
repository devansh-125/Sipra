import { useCallback, useState } from 'react';
import SectionCard from '../common/SectionCard.tsx';
import LoadingBlock from '../common/LoadingBlock.tsx';
import { genaiApi } from '../../services/api/genaiApi.ts';

export default function GenAiReportPanel() {
  const [report, setReport] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const generateReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await genaiApi.briefing();
      const data = response.data;

      if (typeof data === 'object' && data !== null) {
        const briefing = (data as Record<string, unknown>).briefing;
        if (typeof briefing === 'string') {
          setReport(briefing);
        } else {
          setReport(JSON.stringify(data, null, 2));
        }
      } else {
        setReport(String(data));
      }
      setGeneratedAt(new Date().toLocaleTimeString());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate report';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <SectionCard
      title="Generative AI Report"
      subtitle="Executive briefing generated from live supply chain data"
    >
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => void generateReport()}
          disabled={isLoading}
          className="w-full rounded-lg border border-cyan-500/30 bg-gradient-to-r from-cyan-500/15 to-blue-500/15 px-4 py-2.5 text-sm font-semibold text-cyan-200 hover:from-cyan-500/25 hover:to-blue-500/25 disabled:opacity-50 transition-all"
        >
          {isLoading ? 'Generating Report...' : '✦ Generate Executive Briefing'}
        </button>

        {isLoading && <LoadingBlock />}

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {!isLoading && report && (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4">
              <div className="prose prose-sm prose-invert max-w-none">
                {report.split('\n').map((line, i) => {
                  if (!line.trim()) return <br key={i} />;
                  if (line.startsWith('**') && line.endsWith('**')) {
                    return (
                      <h4 key={i} className="mt-3 mb-1 text-sm font-bold text-cyan-200">
                        {line.replace(/\*\*/g, '')}
                      </h4>
                    );
                  }
                  if (line.startsWith('- ') || line.startsWith('• ')) {
                    return (
                      <div key={i} className="flex gap-2 text-sm text-slate-300 ml-2">
                        <span className="text-cyan-400">•</span>
                        <span>{line.slice(2)}</span>
                      </div>
                    );
                  }
                  return (
                    <p key={i} className="text-sm text-slate-300 leading-relaxed">
                      {line}
                    </p>
                  );
                })}
              </div>
            </div>

            {generatedAt && (
              <p className="text-[11px] text-slate-500">
                Generated at {generatedAt} via Gemini 2.0 Flash
              </p>
            )}
          </div>
        )}

        {!isLoading && !report && !error && (
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-center">
            <p className="text-sm text-slate-400">
              Click the button above to generate an AI-powered executive briefing from your live supply chain data.
            </p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
