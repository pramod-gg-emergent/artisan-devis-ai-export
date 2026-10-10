import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { detectIntent } from "@/lib/assistant/intents";
import { runIntent } from "@/lib/assistant/handlers";
import ChatMessage from "@/components/assistant/ChatMessage";
import ChatComposer from "@/components/assistant/ChatComposer";

const KEY = "socle-assistant-history";
const WELCOME = {
  id: "welcome", role: "assistant",
  text: "Bonjour ! Je suis votre assistant SOCLE Artisan. Dites-moi ce dont vous avez besoin : créer un devis, retrouver un devis, savoir qui relancer ou voir vos chiffres.",
  actions: [
    { label: "Quels devis dois-je relancer ?", kind: "ask" },
    { label: "Mes devis", kind: "ask" },
    { label: "Mes chiffres clés", kind: "ask" },
  ],
};
const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || [WELCOME]; } catch { return [WELCOME]; } };

export default function Assistant() {
  const [msgs, setMsgs] = useState(load);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    sessionStorage.setItem(KEY, JSON.stringify(msgs));
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  const ask = async (text) => {
    const uid = crypto.randomUUID();
    setMsgs((m) => [...m, { id: uid, role: "user", text }]);
    setBusy(true);
    let reply;
    try { reply = await runIntent(detectIntent(text)); }
    catch (e) { console.error("[assistant]", e); reply = { text: "Je n'ai pas pu récupérer vos données. Vérifiez votre connexion et réessayez." }; }
    setMsgs((m) => [...m, { id: crypto.randomUUID(), role: "assistant", ...reply }]);
    setBusy(false);
  };

  const reset = () => setMsgs([WELCOME]);

  return (
    <div data-testid="assistant-page" className="mx-auto max-w-3xl pb-28">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-white">Assistant</h1>
          <p className="text-xs text-slate-400">Vos devis, relances et chiffres en une question.</p>
        </div>
        <button data-testid="chat-reset" onClick={reset} className="text-xs font-semibold text-electric-glow hover:text-white">Nouvelle conversation</button>
      </div>
      <div data-testid="chat-thread" className="space-y-4">
        {msgs.map((m) => <ChatMessage key={m.id} m={m} onAsk={ask} />)}
        {busy && <div data-testid="chat-busy" className="flex items-center gap-2 pl-11 text-xs text-slate-400"><Loader2 size={14} className="animate-spin" /> Je regarde…</div>}
        <div ref={endRef} />
      </div>
      <ChatComposer onSend={ask} busy={busy} />
    </div>
  );
}
