import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { AppButton } from '@/components/shared/ui';
import { useFeatureFlag } from '@/lib/featureFlags';
import { chatWithSile, type SileChatMessage } from '@/lib/sile-chat';
import { Sparkles, X } from 'lucide-react';

const GREETING =
  'Hi, I’m Síle — the practice’s AI assistant. Ask about your day, a patient you have open, or how to get things done in Cúram. I can’t change records and I never replace clinical judgement.';

/** Bottom-right "Chat with Síle" widget. Read-only AI helper — it can see which
 *  page the GP is on but never mutates records. Gated by the sileChat flag. */
export default function SileChatWidget() {
  const [enabled] = useFeatureFlag('sileChat');
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<SileChatMessage[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  if (!enabled) return null;

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setError('');
    const history = [...messages, { role: 'user' as const, content: text }];
    setMessages([...history, { role: 'assistant', content: '…' }]);
    setBusy(true);
    const result = await chatWithSile(history, { route: location });
    setBusy(false);
    if (result.ok) {
      setMessages([...history, { role: 'assistant', content: result.reply }]);
    } else {
      setMessages(history);
      setError(result.disabled ? 'Chat with Síle is currently disabled by the practice.' : result.error);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="Chat with Síle"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-teal-700 text-white shadow-lg transition hover:bg-teal-800"
        >
          <Sparkles size={19} />
        </button>
      )}
      {open && (
        <div className="fixed bottom-5 right-5 z-40 flex h-[480px] w-[360px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="icon-box icon-teal"><Sparkles size={14} /></span>
              <div>
                <p className="text-sm font-semibold text-slate-800">Chat with Síle</p>
                <p className="text-[10px] text-slate-400">AI · read-only · verify anything clinical</p>
              </div>
            </div>
            <button type="button" aria-label="Close chat" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-5 text-slate-600">{GREETING}</p>
            {messages.map((message, index) => (
              <p
                key={index}
                className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[12px] leading-5 ${
                  message.role === 'user'
                    ? 'ml-auto bg-teal-700 text-white'
                    : 'bg-slate-50 text-slate-600'
                }`}
              >
                {message.content}
              </p>
            ))}
            {error && <p className="text-[11px] text-red-600">{error}</p>}
          </div>
          <div className="border-t border-slate-100 p-3">
            <div className="flex items-end gap-2">
              <textarea
                className="h-10 flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                placeholder="Ask Síle… (Enter to send)"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              <AppButton size="sm" variant="primary" disabled={busy || !input.trim()} onClick={() => void send()}>
                Send
              </AppButton>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              Emergencies: 999/112. Síle can’t edit records — everything it drafts needs your approval.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
