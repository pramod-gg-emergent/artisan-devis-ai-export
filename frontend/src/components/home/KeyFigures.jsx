import React from "react";
import { FileText, Euro, Users, Clock } from "lucide-react";
import { euro, timeSaved } from "@/lib/format";
import { SectionHead } from "./HomeUI";

const Figure = ({ icon: Icon, value, label, color, testid }) => (
  <div data-testid={testid} className="glass-panel rounded-2xl p-3">
    <Icon size={20} className={color} />
    <div className="mt-2 truncate font-heading text-lg font-extrabold text-white">{value}</div>
    <div className="text-[11px] leading-tight text-slate-400">{label}</div>
  </div>
);

export const KeyFigures = ({ stats }) => {
  const sent = stats ? stats.total_devis - stats.a_preparer : "—";
  return (
    <section data-testid="key-figures">
      <SectionHead title="Mes chiffres clés" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Figure testid="kpi-sent" icon={FileText} color="text-electric-glow" value={sent} label="Devis envoyés" />
        <Figure testid="kpi-accepted" icon={Euro} color="text-emerald-400" value={stats ? euro(stats.ca_accepte) : "—"} label="Montant accepté" />
        <Figure testid="kpi-relance" icon={Users} color="text-red-400" value={stats?.a_relancer ?? "—"} label="À relancer" />
        <Figure testid="kpi-time" icon={Clock} color="text-sky-300" value={stats ? timeSaved(stats.temps_gagne_min) : "—"} label="Temps gagné" />
      </div>
    </section>
  );
};

export default KeyFigures;
