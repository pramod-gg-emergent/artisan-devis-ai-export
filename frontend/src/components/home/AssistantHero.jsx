import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, Square, Loader2, SendHorizonal, FileText, Euro, CalendarPlus } from "lucide-react";
import { useDictation } from "@/hooks/useDictation";
import { soon } from "./HomeUI";

const Chip = ({ icon: Icon, label, tone, onClick, testid }) => (
  <button data-testid={testid} onClick={onClick}
    className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5 active:scale-95 ${tone}`}>
    <Icon size={15} /> {label}
  </button>
);

const MicButton = ({ dict, onToggle }) => (
  <button data-testid="home-mic-button" onClick={onToggle} disabled={dict.transcribing}
    aria-label={dict.listening ? "Arrêter la dictée" : "Parler à l'assistant"}
    className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full sm:h-28 sm:w-28">
    <span className="mic-ring absolute inset-0 rounded-full border-2 border-dashed border-electric-cyan/50" />
    <span className="absolute inset-2 rounded-full border border-electric-glow/40" />
    <span className={`mic-neon relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-b from-electric to-[#123a8c] text-white sm:h-20 sm:w-20 ${dict.listening ? "ring-4 ring-red-400/60" : ""}`}>
      {dict.transcribing ? <Loader2 size={30} className="animate-spin" />
        : dict.listening ? <Square size={26} fill="currentColor" /> : <Mic size={34} strokeWidth={2.2} />}
    </span>
  </button>
);

export const AssistantHero = ({ firstName }) => {
  const navigate = useNavigate();
  const dict = useDictation();
  const [text, setText] = useState("");

  const go = (description) => navigate("/nouveau", { state: { description } });
  const toggle = () => {
    if (dict.listening) return dict.stop();
    dict.start(text, setText, (t) => t && go(t));
  };
  const micLabel = dict.transcribing ? "Je retranscris…" : dict.listening ? "Je vous écoute… touchez pour terminer" : "Parlez, je vous écoute…";

  return (
    <section data-testid="assistant-hero" className="glass-panel relative overflow-hidden rounded-3xl p-5 shadow-glow sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 data-testid="home-greeting" className="font-heading text-2xl font-extrabold text-white sm:text-3xl">Bonjour {firstName} !</h1>
          <p className="mt-1 text-sm text-slate-300">Je suis votre assistant IA.<br />Que puis-je faire pour vous aujourd'hui ?</p>
        </div>
        {dict.supported && <MicButton dict={dict} onToggle={toggle} />}
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) go(text.trim()); }}
          className="flex flex-1 items-center gap-2 rounded-2xl border border-electric/40 bg-night/70 px-4 py-2.5 focus-within:border-electric-glow">
          <input data-testid="home-ask-input" value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Décrivez un chantier ou demandez une action…"
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none" />
          <button data-testid="home-ask-submit" type="submit" aria-label="Envoyer" className="text-electric-glow hover:text-white">
            <SendHorizonal size={18} />
          </button>
        </form>
        <span data-testid="home-mic-status" className="text-xs font-medium text-electric-cyan sm:w-40">{micLabel}</span>
      </div>
      <div className="no-scrollbar -mx-1 mt-4 flex gap-2 overflow-x-auto px-1">
        <Chip testid="chip-create-quote" icon={FileText} label="Créer un devis" onClick={() => navigate("/nouveau")} tone="border-electric/40 bg-electric/15" />
        <Chip testid="chip-relance" icon={Euro} label="Relancer un client" onClick={() => navigate("/devis")} tone="border-emerald-400/40 bg-emerald-500/15" />
        <Chip testid="chip-plan" icon={CalendarPlus} label="Planifier un chantier" onClick={() => soon("Planification")} tone="border-violet-400/40 bg-violet-500/15" />
      </div>
    </section>
  );
};

export default AssistantHero;
