import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import api from "@/lib/apiClient";
import { euro, dateShort } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import AssistantHero from "@/components/home/AssistantHero";
import ConnectedTools from "@/components/home/ConnectedTools";
import TodayCards from "@/components/home/TodayCards";
import QuickActions from "@/components/home/QuickActions";
import KeyFigures from "@/components/home/KeyFigures";

export default function Dashboard() {
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => api.quotes() });
  const { data: company } = useQuery({ queryKey: ["company"], queryFn: api.company });

  const firstName = (company?.artisan_name || company?.name || "").trim().split(/\s+/)[0] || "";
  const toRelance = quotes.filter((q) => q.effective_statut === "a_relancer");

  return (
    <div className="stagger space-y-7">
      <AssistantHero firstName={firstName} />
      <ConnectedTools />
      <TodayCards toRelance={toRelance} />
      <QuickActions />
      <KeyFigures stats={stats} />
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
        <StatusBadge statut={q.effective_statut || q.statut} />
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
