import React from "react";
import { useNavigate } from "react-router-dom";
import { FileText, UserRoundCheck, CalendarDays, ShoppingCart } from "lucide-react";
import { SectionHead, soon } from "./HomeUI";

export const QuickActions = () => {
  const navigate = useNavigate();
  const actions = [
    { key: "create", label: "Créer un devis", icon: FileText, tone: "from-electric/40 border-electric/50", run: () => navigate("/nouveau") },
    { key: "relance", label: "Relancer un client", icon: UserRoundCheck, tone: "from-emerald-500/30 border-emerald-400/40", run: () => navigate("/devis") },
    { key: "agenda", label: "Voir l'agenda", icon: CalendarDays, tone: "from-violet-500/30 border-violet-400/40", run: () => soon("Agenda") },
    { key: "achat", label: "Achat à optimiser", icon: ShoppingCart, tone: "from-orange-500/30 border-orange-400/40", run: () => soon("Achats") },
  ];
  return (
    <section data-testid="quick-actions">
      <SectionHead title="Actions rapides" />
      <div className="grid grid-cols-4 gap-2.5">
        {actions.map((a) => (
          <button key={a.key} data-testid={`quick-${a.key}`} onClick={a.run}
            className={`flex flex-col items-center gap-2 rounded-2xl border bg-gradient-to-b to-night-panel px-1 py-4 text-center transition-transform hover:-translate-y-0.5 active:scale-95 ${a.tone}`}>
            <a.icon size={24} className="text-white" />
            <span className="text-[11px] font-semibold leading-tight text-white sm:text-xs">{a.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default QuickActions;
