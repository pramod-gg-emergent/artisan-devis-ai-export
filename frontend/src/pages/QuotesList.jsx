import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import api from "@/lib/apiClient";
import { QuoteRow } from "@/pages/Dashboard";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "", label: "Tous" },
  { key: "brouillon", label: "Brouillons" },
  { key: "envoye", label: "Envoyés" },
  { key: "a_relancer", label: "À relancer" },
  { key: "accepte", label: "Acceptés" },
];

export default function QuotesList() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");
  const { data: quotes = [] } = useQuery({
    queryKey: ["quotes", filter],
    queryFn: () => api.quotes(filter || undefined),
  });

  return (
    <div className="space-y-4 animate-float-in">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-extrabold text-petrol">Mes devis</h1>
        <button
          data-testid="new-quote-button-list"
          onClick={() => navigate("/nouveau")}
          className="hidden items-center gap-2 rounded-xl bg-lagoon px-4 py-2 text-sm font-bold text-white shadow-cta sm:flex"
        >
          <Plus size={18} /> Nouveau
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key || "all"}
            data-testid={`filter-${f.key || "all"}`}
            onClick={() => setFilter(f.key)}
            className={cn(
              "whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
              filter === f.key
                ? "border-petrol bg-petrol text-white"
                : "border-petrol/15 bg-card text-petrol/70 hover:bg-secondary"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {quotes.length === 0 && (
          <div className="rounded-2xl border border-dashed border-petrol/20 bg-card p-10 text-center text-sm text-muted-foreground">
            Aucun devis dans cette catégorie.
          </div>
        )}
        {quotes.map((q) => (
          <QuoteRow key={q.id} q={q} onClick={() => navigate(`/devis/${q.id}`)} />
        ))}
      </div>
    </div>
  );
}
