import { useCallback, useRef, useState } from 'react';
import SectionCard from '../common/SectionCard.tsx';
import { genaiApi } from '../../services/api/genaiApi.ts';
import type { ChatMessage } from '../../services/api/genaiApi.ts';

type DisplayMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: { tool: string; input: Record<string, unknown> }[];
};

const QUICK_PROMPTS = [
  { label: 'Explain Delays', prompt: 'Which shipments are delayed and why? What factors are contributing?' },
  { label: 'Summarize Risks', prompt: 'Summarize the current risk state of the entire supply chain network.' },
  { label: 'Recommend Reroute', prompt: 'Are there any shipments that should be rerouted? Recommend the best action.' },
  { label: 'Hub Analysis', prompt: 'Which hubs have the highest congestion and what is the impact?' },
];

let msgCounter = 0;
function nextId() {
  msgCounter += 1;
  return `msg-${msgCounter}`;
}

export default function AiChatPanel() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: DisplayMessage = { id: nextId(), role: 'user', content: text.trim() };
      setMessages((prev) => [...prev, userMsg]);
      setChatHistory((prev) => [...prev, { role: 'user', content: text.trim() }]);
      setInput('');
      setIsLoading(true);
      setError(null);
      scrollToBottom();

      try {
        const response = await genaiApi.chat(text.trim(), chatHistory);
        const data = response.data;

        const reply = typeof data === 'object' && data !== null
          ? (data as Record<string, unknown>).reply as string || JSON.stringify(data)
          : String(data);

        const actions = (typeof data === 'object' && data !== null)
          ? ((data as Record<string, unknown>).actions_taken as DisplayMessage['actions']) || []
          : [];

        const assistantMsg: DisplayMessage = {
          id: nextId(),
          role: 'assistant',
          content: reply,
          actions: actions?.length ? actions : undefined,
        };

        setMessages((prev) => [...prev, assistantMsg]);
        setChatHistory((prev) => [...prev, { role: 'assistant', content: reply }]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'AI service unavailable';
        setError(message);
      } finally {
        setIsLoading(false);
        scrollToBottom();
      }
    },
    [chatHistory, isLoading, scrollToBottom]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  return (
    <SectionCard
      title="AI Assistant"
      subtitle="Ask natural-language questions about your supply chain"
    >
      <div className="space-y-3">
        {/* Quick prompt buttons */}
        <div className="flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((qp) => (
            <button
              key={qp.label}
              type="button"
              onClick={() => void sendMessage(qp.prompt)}
              disabled={isLoading}
              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200 disabled:opacity-40 transition-colors"
            >
              {qp.label}
            </button>
          ))}
        </div>

        {/* Chat messages area */}
        <div className="h-72 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-3">
          {messages.length === 0 && !isLoading && (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-slate-500">
                Ask me anything about your supply chain...
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-500/20'
                    : 'bg-slate-800/80 text-slate-200 border border-slate-700'
                }`}
              >
                {msg.content.split('\n').map((line, i) => (
                  <p key={i} className={`${i > 0 ? 'mt-1' : ''} leading-relaxed`}>
                    {line || '\u00A0'}
                  </p>
                ))}

                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-2 border-t border-slate-700 pt-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Tools Used</p>
                    {msg.actions.map((action, i) => (
                      <span
                        key={i}
                        className="mr-1 inline-block rounded-full bg-slate-700/60 px-2 py-0.5 text-[11px] text-cyan-300"
                      >
                        {action.tool}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-slate-800/80 border border-slate-700 px-3 py-2 text-sm text-slate-400">
                <span className="inline-flex gap-1">
                  <span className="animate-pulse">●</span>
                  <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
                  <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
                </span>{' '}
                Thinking...
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        {/* Input area */}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about shipments, routes, risks..."
            disabled={isLoading}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void sendMessage(input)}
            disabled={isLoading || !input.trim()}
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-40 transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </SectionCard>
  );
}
