import React from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Clock3, Hammer, ChevronRight, MapPin } from "lucide-react";
import { SectionHead, SoonBadge, soon, initials } from "./HomeUI";

const Card = ({ tone, icon: Icon, tag, count, title, children, onClick, testid }) => (
  <button data-testid={testid} onClick={onClick}
    className={`relative flex w-60 shrink-0 flex-col rounded-2xl border bg-night-panel/80 p-4 text-left transition-transform hover:-translate-y-0.5 sm:w-auto ${tone}`}>
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-xs font-bold"><Icon size={15} /> {tag}</span>
      {count}
    </div>
    <div className="mt-2 font-heading text-base font-bold text-white">{title}</div>
    <div className="mt-1 flex-1 text-xs text-slate-400">{children}</div>
  </button>
);

export const TodayCards = ({ toRelance = [] }) => {
  const navigate = useNavigate();
  const n = toRelance.length;
  return (
    <section data-testid="today-section">
      <SectionHead title="À faire aujourd'hui" action="Voir tous les devis" onAction={() => navigate("/devis")} testid="today-see-all" />
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0">
        <Card testid="today-urgent" tone="border-red-500/50 text-red-400 shadow-[0_0_24px_-8px_rgba(239,68,68,0.6)]"
          icon={AlertTriangle} tag="Urgent" onClick={() => navigate("/devis")}
          count={<span data-testid="today-urgent-count" className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{n}</span>}
          title={n ? `${n} devis à relancer` : "Aucune relance en attente"}>
          {n ? "Délai de relance dépassé" : "Vos devis envoyés sont à jour."}
          {n > 0 && (
            <div className="mt-3 flex items-center justify-between">
              <div className="flex -space-x-2">
                {toRelance.slice(0, 3).map((q) => (
                  <span key={q.id} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-night-panel bg-slate-600 text-[10px] font-bold text-white">{initials(q.client?.nom)}</span>
                ))}
                {n > 3 && <span className="pl-3 text-xs text-slate-300">+{n - 3}</span>}
              </div>
              <ChevronRight size={18} className="text-red-400" />
            </div>
          )}
        </Card>
        <Card testid="today-rdv" tone="border-amber-500/40 text-amber-400" icon={Clock3} tag="Aujourd'hui"
          count={<SoonBadge />} title="Rendez-vous client" onClick={() => soon("Agenda")}>
          <span className="flex items-center gap-1"><MapPin size={12} /> Connectez votre agenda pour voir vos rendez-vous.</span>
        </Card>
        <Card testid="today-chantier" tone="border-electric/50 text-electric-glow" icon={Hammer} tag="En cours"
          count={<SoonBadge />} title="Chantier en cours" onClick={() => soon("Suivi de chantier")}>
          Suivez l'avancement de vos chantiers.
          <div className="mt-3 h-1.5 w-full rounded-full bg-night-line"><div className="h-full w-0 rounded-full bg-electric" /></div>
        </Card>
      </div>
    </section>
  );
};

export default TodayCards;
