// Business actions for the assistant: reuse existing read-only APIs, never send/modify anything.
import api from "@/lib/apiClient";
import { euro, timeSaved, dateShort, STATUS_META } from "@/lib/format";
import { normalize } from "./intents";

const STOP = new Set(["devis", "le", "la", "les", "de", "du", "des", "pour", "mme", "madame", "monsieur", "m", "mr",
  "cherche", "recherche", "trouve", "retrouve", "relance", "relancer", "prepare", "une", "un", "client", "statut",
  "ou", "en", "est", "message", "moi", "mon", "ma", "mes", "a", "au", "aux", "chez", "et", "stp", "svp"]);

const quoteItem = (q) => ({
  id: q.id,
  label: `${q.client?.nom || "Client"} · ${euro(q.totaux?.total_ttc)}`,
  sub: `${q.numero} · ${STATUS_META[q.effective_statut]?.label || q.effective_statut} · ${dateShort(q.created_at)}`,
  to: `/devis/${q.id}`,
});

export function findQuotes(quotes, query) {
  const num = query.match(/dev-\d{4}-\d{3}/);
  if (num) return quotes.filter((q) => normalize(q.numero) === num[0]);
  const words = query.replace(/[^a-z0-9\s-]/g, " ").split(" ").filter((w) => w.length >= 3 && !STOP.has(w));
  if (!words.length) return [];
  return quotes.filter((q) => {
    const nom = normalize(q.client?.nom || "");
    return words.some((w) => nom.includes(w));
  });
}

const HELP_ACTIONS = [
  { label: "Quels devis dois-je relancer ?", kind: "ask" },
  { label: "Mes chiffres clés", kind: "ask" },
  { label: "Crée un devis pour une installation électrique", kind: "ask" },
];

export async function runIntent(intent) {
  switch (intent.type) {
    case "create_quote":
      return {
        text: intent.guessed
          ? `Je peux transformer cette description en devis :\n« ${intent.description} »\nVoulez-vous ouvrir le formulaire Nouveau devis pré-rempli ?`
          : `Je prépare un nouveau devis avec cette description :\n« ${intent.description} »\nConfirmez pour ouvrir le formulaire. Rien n'est enregistré ni envoyé sans votre validation.`,
        actions: [{ label: "Ouvrir Nouveau devis", kind: "navigate", to: "/nouveau", state: { description: intent.description }, primary: true }],
      };
    case "relance_list": {
      const qs = (await api.quotes()).filter((q) => q.effective_statut === "a_relancer");
      if (!qs.length) return { text: "Aucun devis n'est à relancer pour le moment : tous les délais de relance sont respectés." };
      const total = qs.reduce((s, q) => s + (q.totaux?.total_ttc || 0), 0);
      return {
        text: `${qs.length} devis ${qs.length > 1 ? "sont" : "est"} à relancer (date de relance dépassée), pour ${euro(total)} TTC. Touchez un devis pour l'ouvrir, ou demandez « relance ${qs[0].client?.nom || "ce client"} ».`,
        items: qs.map(quoteItem),
      };
    }
    case "relance_prepare": {
      const qs = findQuotes(await api.quotes(), intent.query);
      if (!qs.length) return { text: "Je n'ai pas trouvé de devis correspondant à ce client. Précisez le nom du client ou le numéro (ex : DEV-2026-001).", actions: [{ label: "Quels devis dois-je relancer ?", kind: "ask" }] };
      if (qs.length > 1) return { text: "Plusieurs devis correspondent. Lequel voulez-vous relancer ?", items: qs.map(quoteItem) };
      const q = qs[0];
      if (!["envoye", "relance", "a_relancer"].includes(q.effective_statut))
        return { text: `Le devis ${q.numero} est « ${STATUS_META[q.effective_statut]?.label} » : une relance n'est possible que pour un devis envoyé.`, items: [quoteItem(q)] };
      const { message } = await api.relanceMessage(q.id);
      return {
        text: `Voici une proposition de relance pour ${q.client?.nom} (${q.numero}). Rien n'est envoyé : copiez le message ou ouvrez le devis pour le relancer.`,
        draft: message,
        actions: [{ label: "Ouvrir le devis", kind: "navigate", to: `/devis/${q.id}`, primary: true }],
      };
    }
    case "search": {
      const qs = findQuotes(await api.quotes(), intent.query);
      if (!qs.length) return { text: "Aucun devis ne correspond à cette recherche. Essayez avec le nom du client ou le numéro du devis.", actions: [{ label: "Voir tous mes devis", kind: "navigate", to: "/devis" }] };
      return { text: `${qs.length} devis trouvé${qs.length > 1 ? "s" : ""} :`, items: qs.map(quoteItem) };
    }
    case "list": {
      const qs = await api.quotes();
      if (!qs.length) return { text: "Vous n'avez encore aucun devis.", actions: [{ label: "Créer un devis", kind: "navigate", to: "/nouveau", primary: true }] };
      const counts = qs.reduce((m, q) => ({ ...m, [q.effective_statut]: (m[q.effective_statut] || 0) + 1 }), {});
      const recap = Object.entries(counts).map(([k, n]) => `${n} ${STATUS_META[k]?.label.toLowerCase() || k}`).join(", ");
      return { text: `Vous avez ${qs.length} devis : ${recap}. Voici les plus récents :`, items: qs.slice(0, 5).map(quoteItem), actions: [{ label: "Voir tous mes devis", kind: "navigate", to: "/devis" }] };
    }
    case "stats": {
      const s = await api.stats();
      if (!s.total_devis) return { text: "Aucune donnée d'activité pour l'instant : créez votre premier devis pour suivre vos chiffres." };
      return {
        text: [
          `Voici votre activité (sur l'ensemble de vos devis) :`,
          `• ${s.total_devis - s.a_preparer} devis envoyés, ${s.a_preparer} brouillon(s)`,
          `• ${s.acceptes} accepté(s) pour ${euro(s.ca_accepte)} TTC`,
          `• ${s.a_relancer} à relancer (${euro(s.relance_total)})`,
          `• CA potentiel en attente : ${euro(s.ca_potentiel)}`,
          `• Temps gagné avec l'IA : ${timeSaved(s.temps_gagne_min)}`,
        ].join("\n"),
      };
    }
    case "unavailable":
      return { text: `${intent.label} n'est pas encore disponible dans SOCLE Artisan. Ce module arrivera prochainement. En attendant, je peux vous aider sur vos devis.`, actions: HELP_ACTIONS };
    case "help":
      return { text: "Bonjour ! Je peux créer un devis à partir de votre description, retrouver un devis, lister ceux à relancer, préparer un message de relance ou résumer votre activité.", actions: HELP_ACTIONS };
    default:
      return { text: "Je n'ai pas compris cette demande. Je sais m'occuper de vos devis : création, recherche, relances et chiffres clés.", actions: HELP_ACTIONS };
  }
}
