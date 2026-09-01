import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Clock, Bell, TrendingUp, CheckCircle2, ArrowRight, Plus, FileText } from "lucide-react";
import api from "@/lib/apiClient";
import { euro, timeSaved, dateShort } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";

const StatCard = ({ icon: Icon, label, value, sub, tone, testid }) => (
  <div
    data-testid={testid}
    className="rounded-2xl border border-petrol/10 bg-card p-4 shadow-card transition-transform hover:-translate-y-0.5"
  >
    <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
      <Icon size={18} strokeWidth={2.2} />
    </div>
    <div className="font-heading text-2xl font-extrabold text-petrol">{value}</div>
    <div className="text-xs font-semibold text-muted-foreground">{label}</div>
    {sub && <div className="mt-1 text-[11px] font-medium text-lagoon-glow">{sub}</div>}
  </div>
);

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => api.quotes() });

  const todo = quotes.filter((q) => ["brouillon", "a_relancer"].includes(q.statut));

  return (
    <div className="space-y-6 animate-float-in">
      {/* Hero */}
      <section className="overflow-hidden rounded-3xl bg-petrol p-5 text-white shadow-active sm:p-7">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-cyan-300">À traiter aujourd'hui</div>
            <div className="mt-1 font-heading text-3xl font-extrabold sm:text-4xl">
              {todo.length} devis
            </div>
            <p className="mt-1 max-w-xs text-sm text-cyan-100/80">
              {todo.length > 0
                ? "Des devis attendent votre attention — préparez ou relancez en un clic."
                : "Tout est à jour. Créez un nouveau devis pour votre prochain chantier."}
            </p>
          </div>
          <div className="hidden rounded-2xl bg-white/10 p-3 sm:block">
            <TrendingUp size={28} className="text-lagoon" />
          </div>
        </div>
        <button
          data-testid="new-quote-button"
          onClick={() => navigate("/nouveau")}
          className="animate-mic-pulse mt-5 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-lagoon py-4 text-base font-bold text-white shadow-cta transition-transform active:scale-95 sm:w-auto sm:px-8"
        >
          <Sparkles size={20} strokeWidth={2.4} /> Nouveau devis IA
        </button>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard testid="stat-a-preparer" icon={FileText} label="Devis à préparer"
          value={stats?.a_preparer ?? "—"} tone="bg-slatey-bg text-slatey-draft" />
        <StatCard testid="stat-envoyes" icon={ArrowRight} label="Devis envoyés"
          value={stats?.envoyes ?? "—"} tone="bg-lagoon-light text-lagoon-glow" />
        <StatCard testid="stat-a-relancer" icon={Bell} label="À relancer"
          value={stats?.a_relancer ?? "—"} sub={stats ? euro(stats.relance_total) : ""}
          tone="bg-amber-bg text-amber-relance" />
        <StatCard testid="stat-ca-potentiel" icon={TrendingUp} label="CA potentiel"
          value={stats ? euro(stats.ca_potentiel) : "—"}
          tone="bg-emerald-bg text-emerald-accepted" />
      </section>

      {/* Business benefits strip */}
      <section className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-petrol/10 bg-card px-4 py-3 text-sm shadow-card">
        <div data-testid="benefit-temps" className="flex items-center gap-2">
          <Clock size={16} className="text-lagoon" />
          <span className="font-semibold text-petrol">{stats ? timeSaved(stats.temps_gagne_min) : "—"}</span>
          <span className="text-muted-foreground">gagnés avec l'IA</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-accepted" />
          <span className="font-semibold text-petrol">{stats ? euro(stats.ca_accepte) : "—"}</span>
          <span className="text-muted-foreground">acceptés</span>
        </div>
      </section>

      {/* To-do list */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-xl font-bold text-petrol">À traiter</h2>
          <button data-testid="see-all-quotes" onClick={() => navigate("/devis")}
            className="flex items-center gap-1 text-sm font-semibold text-lagoon-glow">
            Tous les devis <ArrowRight size={15} />
          </button>
        </div>
        <div className="space-y-3">
          {todo.length === 0 && (
            <div className="rounded-2xl border border-dashed border-petrol/20 bg-card p-8 text-center text-sm text-muted-foreground">
              Aucun devis à traiter. Bravo !
            </div>
          )}
          {todo.map((q) => (
            <QuoteRow key={q.id} q={q} onClick={() => navigate(`/devis/${q.id}`)} />
          ))}
        </div>
      </section>
    </div>
  );
}

export const QuoteRow = ({ q, onClick }) => (
  <button
    data-testid={`quote-row-${q.numero}`}
    onClick={onClick}
    className="flex w-full items-center gap-3 rounded-2xl border border-petrol/10 bg-card p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-active"
  >
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <span className="truncate font-heading text-base font-bold text-petrol">{q.client?.nom || "Client"}</span>
        <StatusBadge statut={q.statut} />
      </div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">
        {q.numero} · {dateShort(q.created_at)}
      </div>
    </div>
    <div className="text-right">
      <div className="font-heading text-base font-extrabold text-petrol">{euro(q.totaux?.total_ttc)}</div>
      <div className="text-[11px] text-muted-foreground">TTC</div>
    </div>
    <ArrowRight size={18} className="text-slate-300" />
  </button>
);
