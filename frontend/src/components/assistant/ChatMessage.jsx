import React from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ChevronRight, Copy } from "lucide-react";
import { toast } from "sonner";

const ActionBtn = ({ a, onAsk, i, mid }) => {
  const navigate = useNavigate();
  const run = () => (a.kind === "ask" ? onAsk(a.label) : navigate(a.to, { state: a.state }));
  return (
    <button data-testid={`chat-action-${mid}-${i}`} onClick={run}
      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-transform active:scale-95 ${a.primary
        ? "border-electric bg-electric text-white shadow-cta" : "border-electric/40 bg-electric/10 text-electric-glow hover:bg-electric/20"}`}>
      {a.label}
    </button>
  );
};

export const ChatMessage = ({ m, onAsk }) => {
  const navigate = useNavigate();
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div data-testid="chat-user-msg" className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-electric px-4 py-2.5 text-sm text-white">{m.text}</div>
      </div>
    );
  }
  return (
    <div data-testid="chat-assistant-msg" className="flex gap-2.5">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-electric to-[#123a8c] text-white shadow-neon">
        <Sparkles size={15} />
      </div>
      <div className="min-w-0 max-w-[88%] space-y-2.5">
        <div className="glass-panel whitespace-pre-line rounded-2xl rounded-tl-md px-4 py-2.5 text-sm leading-relaxed text-slate-100">{m.text}</div>
        {m.items?.map((it) => (
          <button key={it.id} data-testid={`chat-item-${it.id}`} onClick={() => navigate(it.to)}
            className="flex w-full items-center gap-2 rounded-xl border border-electric/25 bg-night-panel px-3 py-2.5 text-left transition-colors hover:border-electric-glow">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">{it.label}</div>
              <div className="truncate text-[11px] text-slate-400">{it.sub}</div>
            </div>
            <ChevronRight size={16} className="text-electric-glow" />
          </button>
        ))}
        {m.draft && (
          <div className="rounded-xl border border-electric/25 bg-night-panel p-3">
            <pre data-testid="chat-draft" className="whitespace-pre-wrap font-sans text-xs text-slate-200">{m.draft}</pre>
            <button data-testid="chat-draft-copy" onClick={() => navigator.clipboard?.writeText(m.draft).then(() => toast.success("Message copié"))}
              className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-electric-glow"><Copy size={13} /> Copier le message</button>
          </div>
        )}
        {m.actions?.length > 0 && (
          <div className="flex flex-wrap gap-2">{m.actions.map((a, i) => <ActionBtn key={i} a={a} i={i} mid={m.id} onAsk={onAsk} />)}</div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
