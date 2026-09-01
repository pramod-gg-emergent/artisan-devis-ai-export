export const euro = (v) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(v || 0));

export const num = (v) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(v || 0));

export const dateFr = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return "—";
  }
};

export const dateShort = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch {
    return "—";
  }
};

export const isDue = (iso) => {
  if (!iso) return false;
  try {
    return new Date(iso).getTime() <= Date.now();
  } catch {
    return false;
  }
};

export const STATUS_META = {
  brouillon: { label: "Brouillon", cls: "bg-slatey-bg text-slatey-draft border-slate-200", dot: "bg-slate-400" },
  envoye: { label: "Envoyé", cls: "bg-lagoon-light text-lagoon-glow border-cyan-200", dot: "bg-lagoon" },
  a_relancer: { label: "À relancer", cls: "bg-amber-bg text-amber-relance border-amber-200", dot: "bg-amber-relance" },
  relance: { label: "Relancé", cls: "bg-sky-100 text-sky-700 border-sky-200", dot: "bg-sky-500" },
  accepte: { label: "Accepté", cls: "bg-emerald-bg text-emerald-accepted border-emerald-200", dot: "bg-emerald-accepted" },
  refuse: { label: "Refusé", cls: "bg-red-50 text-destructive border-red-200", dot: "bg-red-400" },
};

export const lineHt = (l) => Number(l.quantite || 0) * Number(l.prix_unitaire_ht || 0);

export const computeTotals = (lignes = []) => {
  let ht = 0, tva = 0;
  for (const l of lignes) {
    const h = lineHt(l);
    ht += h;
    tva += (h * Number(l.tva || 0)) / 100;
  }
  return { total_ht: ht, total_tva: tva, total_ttc: ht + tva };
};

export const timeSaved = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}h${m.toString().padStart(2, "0")}`;
};
