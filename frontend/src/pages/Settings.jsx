import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, BookText, Save, Plus, Trash2, RotateCcw, Loader2, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { num } from "@/lib/format";
import api from "@/lib/apiClient";

const UNITES = ["m²", "ml", "m³", "u", "h", "forfait", "ens."];
const TVA_RATES = [5.5, 10, 20];

export default function Settings() {
  const qc = useQueryClient();
  const { data: company } = useQuery({ queryKey: ["company"], queryFn: api.company });
  const { data: catalogData } = useQuery({ queryKey: ["catalog"], queryFn: api.catalog });

  const [form, setForm] = useState(null);
  const [items, setItems] = useState([]);
  const [savingC, setSavingC] = useState(false);
  const [savingCat, setSavingCat] = useState(false);

  useEffect(() => { if (company) setForm(company); }, [company]);
  useEffect(() => { if (catalogData) setItems(catalogData.items || []); }, [catalogData]);

  const saveCompany = async () => {
    setSavingC(true);
    try {
      await api.updateCompany(form);
      qc.invalidateQueries({ queryKey: ["company"] });
      toast.success("Informations entreprise enregistrées");
    } catch { toast.error("Enregistrement impossible"); }
    finally { setSavingC(false); }
  };

  const saveCatalog = async () => {
    setSavingCat(true);
    try {
      await api.updateCatalog(items);
      qc.invalidateQueries({ queryKey: ["catalog"] });
      toast.success("Catalogue enregistré");
    } catch { toast.error("Enregistrement impossible"); }
    finally { setSavingCat(false); }
  };

  const resetCatalog = async () => {
    try {
      const res = await api.resetCatalog();
      setItems(res.items);
      qc.invalidateQueries({ queryKey: ["catalog"] });
      toast.success("Catalogue de démonstration restauré");
    } catch { toast.error("Action impossible"); }
  };

  const upd = (id, f, v) => setItems(items.map((it) => (it.id === id ? { ...it, [f]: v } : it)));
  const del = (id) => setItems(items.filter((it) => it.id !== id));
  const addItem = () =>
    setItems([...items, { id: crypto.randomUUID(), code: "", designation: "", unite: "u", prix_unitaire_ht: 0, tva: 10, category: "" }]);

  if (!form) return <div className="shimmer h-40 rounded-2xl" />;

  return (
    <div className="space-y-6 animate-float-in">
      <div>
        <h1 className="font-heading text-2xl font-extrabold text-petrol">Paramètres</h1>
        <p className="text-sm text-muted-foreground">Informations de l'entreprise et catalogue tarifaire.</p>
      </div>

      {/* Company */}
      <section className="rounded-2xl border border-petrol/10 bg-card p-5 shadow-card" data-testid="company-form">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-petrol">
            <Building2 size={18} className="text-lagoon" /> Mon entreprise
          </h2>
          {company?.is_demo && (
            <span className="rounded-full bg-amber-bg px-2.5 py-1 text-[11px] font-semibold text-amber-relance">Données de démonstration</span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Raison sociale"><Input data-testid="company-name" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-11" /></Field>
          <Field label="Nom de l'artisan"><Input data-testid="company-artisan" value={form.artisan_name || ""} onChange={(e) => setForm({ ...form, artisan_name: e.target.value })} className="h-11" /></Field>
          <Field label="Adresse" full><Input data-testid="company-address" value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} className="h-11" /></Field>
          <Field label="Téléphone"><Input data-testid="company-phone" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-11" /></Field>
          <Field label="Email"><Input data-testid="company-email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11" /></Field>
          <Field label="SIRET"><Input data-testid="company-siret" value={form.siret || ""} onChange={(e) => setForm({ ...form, siret: e.target.value })} className="h-11" /></Field>
          <Field label="TVA intracom."><Input data-testid="company-tva" value={form.tva_intra || ""} onChange={(e) => setForm({ ...form, tva_intra: e.target.value })} className="h-11" /></Field>
          <Field label="Assurance décennale" full><Input data-testid="company-assurance" value={form.assurance || ""} onChange={(e) => setForm({ ...form, assurance: e.target.value })} className="h-11" /></Field>
          <Field label="Délai de relance par défaut (jours)">
            <Input data-testid="company-relance-delay" type="number" value={form.relance_delay_days ?? 7}
              onChange={(e) => setForm({ ...form, relance_delay_days: parseInt(e.target.value) || 7 })} className="h-11" />
          </Field>
        </div>
        <button data-testid="save-company-btn" onClick={saveCompany} disabled={savingC}
          className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-petrol px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
          {savingC ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Enregistrer
        </button>
      </section>

      {/* Catalog */}
      <section className="rounded-2xl border border-petrol/10 bg-card p-5 shadow-card" data-testid="catalog-editor">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-petrol">
            <BookText size={18} className="text-lagoon" /> Catalogue tarifaire
          </h2>
          <button data-testid="reset-catalog-btn" onClick={resetCatalog}
            className="flex items-center gap-1.5 text-xs font-semibold text-lagoon-glow">
            <RotateCcw size={13} /> Restaurer la démo
          </button>
        </div>
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-bg/50 px-3 py-2 text-xs text-amber-relance">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>Catalogue de <strong>démonstration</strong> modifiable. Il alimentera les prix proposés par l'IA. Connectez ensuite votre propre catalogue.</span>
        </div>

        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={it.id} data-testid={`catalog-item-${i}`} className="rounded-xl border border-petrol/10 bg-background p-2.5">
              <div className="flex items-start gap-2">
                <Input data-testid={`catalog-desig-${i}`} value={it.designation} onChange={(e) => upd(it.id, "designation", e.target.value)}
                  placeholder="Désignation" className="h-10 flex-1 font-medium" />
                <button data-testid={`catalog-del-${i}`} onClick={() => del(it.id)}
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-destructive">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Mini label="Code"><Input value={it.code || ""} onChange={(e) => upd(it.id, "code", e.target.value)} className="h-9" /></Mini>
                <Mini label="Unité">
                  <select value={it.unite} onChange={(e) => upd(it.id, "unite", e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                    {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Mini>
                <Mini label="P.U. HT"><Input type="number" step="any" value={it.prix_unitaire_ht} onChange={(e) => upd(it.id, "prix_unitaire_ht", parseFloat(e.target.value) || 0)} className="h-9" /></Mini>
                <Mini label="TVA">
                  <select value={String(it.tva)} onChange={(e) => upd(it.id, "tva", parseFloat(e.target.value))} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                    {TVA_RATES.map((t) => <option key={t} value={String(t)}>{num(t)} %</option>)}
                  </select>
                </Mini>
                <Mini label="Catégorie"><Input value={it.category || ""} onChange={(e) => upd(it.id, "category", e.target.value)} className="h-9" /></Mini>
              </div>
            </div>
          ))}
        </div>

        <button data-testid="add-catalog-item-btn" onClick={addItem}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-petrol/20 py-2.5 text-sm font-semibold text-petrol/70 hover:border-lagoon hover:text-lagoon">
          <Plus size={16} /> Ajouter un article
        </button>
        <button data-testid="save-catalog-btn" onClick={saveCatalog} disabled={savingCat}
          className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-petrol px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
          {savingCat ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Enregistrer le catalogue
        </button>
      </section>
    </div>
  );
}

const Field = ({ label, children, full }) => (
  <div className={full ? "sm:col-span-2" : ""}>
    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
    {children}
  </div>
);

const Mini = ({ label, children }) => (
  <div>
    <label className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</label>
    {children}
  </div>
);
