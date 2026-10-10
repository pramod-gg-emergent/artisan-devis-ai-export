import React, { useState } from "react";
import { Mic, Square, Loader2, SendHorizonal } from "lucide-react";
import { useDictation } from "@/hooks/useDictation";

export const ChatComposer = ({ onSend, busy }) => {
  const dict = useDictation();
  const [text, setText] = useState("");
  const send = (t) => { const v = (t ?? text).trim(); if (v && !busy) { onSend(v); setText(""); } };
  const toggleMic = () => (dict.listening ? dict.stop() : dict.start(text, setText, (t) => send(t)));

  return (
    <div className="fixed bottom-[76px] left-0 right-0 z-20 border-t border-white/5 bg-night/90 px-4 py-3 backdrop-blur-xl sm:bottom-0">
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="mx-auto flex max-w-3xl items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-2xl border border-electric/40 bg-night-panel px-4 py-2.5 focus-within:border-electric-glow">
          <input data-testid="chat-input" value={text} onChange={(e) => setText(e.target.value)} disabled={dict.listening}
            placeholder={dict.listening ? "Je vous écoute… touchez le micro pour terminer" : dict.transcribing ? "Je retranscris…" : "Posez votre question…"}
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none" />
          <button data-testid="chat-send" type="submit" disabled={busy || !text.trim()} aria-label="Envoyer"
            className="text-electric-glow transition-colors hover:text-white disabled:opacity-40"><SendHorizonal size={18} /></button>
        </div>
        {dict.supported && (
          <button data-testid="chat-mic" type="button" onClick={toggleMic} disabled={dict.transcribing}
            aria-label={dict.listening ? "Arrêter la dictée" : "Dicter"}
            className={`mic-neon flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-electric to-[#123a8c] text-white ${dict.listening ? "ring-4 ring-red-400/60" : ""}`}>
            {dict.transcribing ? <Loader2 size={20} className="animate-spin" /> : dict.listening ? <Square size={18} fill="currentColor" /> : <Mic size={22} />}
          </button>
        )}
      </form>
    </div>
  );
};

export default ChatComposer;
