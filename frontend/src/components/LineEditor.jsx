import React from "react";
import { Trash2, Plus, AlertTriangle, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { euro, num, lineHt, computeTotals } from "@/lib/format";

const UNITES = ["m²", "ml", "m³", "u", "h", "forfait", "ens."];
const TVA_RATES = [5.5, 10, 20];

export const LineEditor = ({ lignes, setLignes }) => {
  const update = (id, field, value) =>
    setLignes(lignes.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  const remove = (id) => setLignes(lignes.filter((l) => l.id !== id));
  const add = () =>
    setLignes([
      ...lignes,
      { id: crypto.randomUUID(), designation: "", quantite: 1, unite: "u",
        prix_unitaire_ht: 0, tva: 10, source: "manuel", catalog_code: null },
    ]);

  const totaux = computeTotals(lignes);

  return (
    <div className="space-y-3" data-testid="line-editor">
      {lignes.map((l, i) => {
        const estimation = l.source === "estimation";
        return (
          <div
            key={l.id}
            data-testid={`line-item-${i}`}
            className={`rounded-2xl border bg-card p-3 shadow-card ${
              estimation ? "border-amber-relance/40" : "border-petrol/10"
            }`}
          >
            <div className="flex items-start gap-2">
              <Input
                data-testid={`line-designation-${i}`}
                value={l.designation}
                onChange={(e) => update(l.id, "designation", e.target.value)}
                placeholder="Désignation de la prestation"
                className="h-11 flex-1 font-medium"
              />
              <button
                data-testid={`line-delete-${i}`}
                onClick={() => remove(l.id)}
                className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-destructive"
              >
                <Trash2 size={17} />
              </button>
            </div>

            {/* source badge */}
            <div className="mt-1.5">
              {estimation ? (
                <span data-testid={`line-source-${i}`} className="inline-flex items-center gap-1 rounded-full bg-amber-bg px-2 py-0.5 text-[11px] font-semibold text-amber-relance">
                  <AlertTriangle size={11} /> Estimation à vérifier
                </span>
              ) : l.source === "catalogue" ? (
                <span data-testid={`line-source-${i}`} className="inline-flex items-center gap-1 rounded-full bg-lagoon-light px-2 py-0.5 text-[11px] font-semibold text-lagoon-glow">
                  <Tag size={11} /> Catalogue {l.catalog_code ? `· ${l.catalog_code}` : ""}
                </span>
              ) : (
                <span data-testid={`line-source-${i}`} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  Saisie manuelle
                </span>
              )}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div>
                <label className="text-[10px] font-semibold uppercase text-muted-foreground">Qté</label>
                <Input
                  data-testid={`line-quantite-${i}`}
                  type="number" step="any" value={l.quantite}
                  onChange={(e) => update(l.id, "quantite", parseFloat(e.target.value) || 0)}
                  className="h-10"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase text-muted-foreground">Unité</label>
                <select
                  data-testid={`line-unite-${i}`}
                  value={l.unite}
                  onChange={(e) => update(l.id, "unite", e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase text-muted-foreground">P.U. HT</label>
                <Input
                  data-testid={`line-pu-${i}`}
                  type="number" step="any" value={l.prix_unitaire_ht}
                  onChange={(e) => update(l.id, "prix_unitaire_ht", parseFloat(e.target.value) || 0)}
                  className={`h-10 ${estimation && !l.prix_unitaire_ht ? "border-amber-relance/60" : ""}`}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase text-muted-foreground">TVA</label>
                <select
                  data-testid={`line-tva-${i}`}
                  value={l.tva == null ? "" : String(l.tva)}
                  onChange={(e) => update(l.id, "tva", e.target.value === "" ? null : parseFloat(e.target.value))}
                  className={`h-10 w-full rounded-md border bg-background px-2 text-sm ${
                    l.tva == null ? "border-amber-relance/60 text-amber-relance" : "border-input"
                  }`}
                >
                  <option value="">À définir</option>
                  {TVA_RATES.map((t) => <option key={t} value={String(t)}>{`${num(t)} %`}</option>)}
                </select>
              </div>
              <div className="flex flex-col justify-end">
                <label className="text-[10px] font-semibold uppercase text-muted-foreground">Total HT</label>
                <div data-testid={`line-total-${i}`} className="flex h-10 items-center font-heading font-bold text-petrol">
                  {euro(lineHt(l))}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <button
        data-testid="add-line-button"
        onClick={add}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-petrol/20 py-3 text-sm font-semibold text-petrol/70 hover:border-lagoon hover:text-lagoon"
      >
        <Plus size={18} /> Ajouter une ligne
      </button>

      <TotalsBox totaux={totaux} />
    </div>
  );
};

export const TotalsBox = ({ totaux }) => (
  <div data-testid="totals-box" className="rounded-2xl bg-petrol p-4 text-white shadow-active">
    <div className="flex justify-between py-1 text-sm">
      <span className="text-cyan-100/80">Total HT</span>
      <span data-testid="total-ht-display" className="font-semibold">{euro(totaux.total_ht)}</span>
    </div>
    <div className="flex justify-between py-1 text-sm">
      <span className="text-cyan-100/80">TVA</span>
      <span data-testid="total-tva-display" className="font-semibold">{euro(totaux.total_tva)}</span>
    </div>
    <div className="mt-2 flex justify-between border-t border-white/15 pt-2">
      <span className="font-heading text-lg font-bold">Total TTC</span>
      <span data-testid="total-ttc-display" className="font-heading text-xl font-extrabold text-lagoon">
        {euro(totaux.total_ttc)}
      </span>
    </div>
  </div>
);

export default LineEditor;
