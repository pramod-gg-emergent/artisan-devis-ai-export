import React from "react";
import { useNavigate } from "react-router-dom";
import { Mail, CalendarDays, Instagram, FileText, Star, Users } from "lucide-react";
import { SectionHead, SoonBadge, soon } from "./HomeUI";

const TOOLS = [
  { key: "gmail", label: "Gmail", sub: "E-mails", icon: Mail, color: "text-red-400" },
  { key: "agenda", label: "Agenda", sub: "Rendez-vous", icon: CalendarDays, color: "text-sky-400" },
  { key: "social", label: "Réseaux sociaux", sub: "Contenus", icon: Instagram, color: "text-pink-400" },
  { key: "admin", label: "Administratif", sub: "Devis, factures", icon: FileText, color: "text-electric-glow", to: "/devis" },
  { key: "avis", label: "Avis clients", sub: "Réputation", icon: Star, color: "text-amber-300" },
  { key: "prospection", label: "Prospection", sub: "Nouveaux clients", icon: Users, color: "text-indigo-300" },
];

export const ConnectedTools = () => {
  const navigate = useNavigate();
  return (
    <section data-testid="connected-tools">
      <SectionHead title="Mes outils connectés" />
      <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-6 sm:px-0">
        {TOOLS.map((t) => (
          <button key={t.key} data-testid={`tool-${t.key}`}
            onClick={() => (t.to ? navigate(t.to) : soon(t.label))}
            className="glass-panel relative flex w-24 shrink-0 flex-col items-center gap-1 rounded-2xl px-2 py-3 text-center transition-transform hover:-translate-y-0.5 sm:w-auto">
            <span className={`absolute right-2 top-2 h-2 w-2 rounded-full ${t.to ? "bg-emerald-400" : "bg-slate-600"}`} />
            <t.icon size={26} className={t.color} />
            <span className="mt-1 text-[11px] font-bold leading-tight text-white">{t.label}</span>
            <span className="text-[10px] leading-tight text-slate-400">{t.sub}</span>
            {!t.to && <SoonBadge />}
          </button>
        ))}
      </div>
    </section>
  );
};

export default ConnectedTools;
