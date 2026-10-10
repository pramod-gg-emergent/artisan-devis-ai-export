// Rule-based intent detection (no AI call). Add GONAXIS modules by extending INTENTS.
export const normalize = (s = "") =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

const UNAVAILABLE = [
  { re: /\b(agenda|rendez[- ]vous|rdv|planifi|calendrier)/, label: "L'agenda et la planification" },
  { re: /\b(gmail|boite mail|mes mails|mes e-?mails)\b/, label: "La connexion Gmail" },
  { re: /\b(factur)/, label: "La facturation" },
  { re: /\b(chantiers? en cours|suivi de chantier|avancement)/, label: "Le suivi de chantier" },
  { re: /\b(reseaux sociaux|instagram|facebook|publication)/, label: "Les réseaux sociaux" },
  { re: /\b(avis clients?|reputation)/, label: "Les avis clients" },
  { re: /\b(prospect)/, label: "La prospection" },
  { re: /\b(achat|fournisseur|commande de materiel)/, label: "L'optimisation des achats" },
];

const CREATE_RE = /\b(cree|creer|creez|faire|fais|prepare|preparer|nouveau|nouvel|genere|rediger|redige)\b.*\bdevis\b|\bdevis (pour|de pose|d'installation)\b/;
const RELANCE_LIST_RE = /\b(quel|quels|qui|liste|lesquels|combien)\b.*\brelanc|\ba relancer\b/;
const RELANCE_PREP_RE = /\b(relance|relancer|relancez|prepare une relance|message de relance)\b/;
const STATS_RE = /\b(chiffre|activite|ca\b|chiffre d'affaires|statistique|stats|combien|montant|temps gagne|bilan|resume)/;
const LIST_RE = /\b(mes devis|liste|tous les devis|voir les devis|consulter|affiche)/;
const SEARCH_RE = /\b(cherche|recherche|trouve|retrouve|ou en est|statut du devis|le devis (de|du|pour))|dev-\d{4}-\d{3}/;
const HELP_RE = /^(aide|help|bonjour|salut|hello|que sais-tu faire|que peux-tu faire)/;

const STRIP_CREATE = /^.*?\b(devis)\b\s*(pour|de|d'|:)?\s*/;

export function detectIntent(raw) {
  const t = normalize(raw);
  if (!t) return { type: "help" };
  if (HELP_RE.test(t)) return { type: "help" };
  const un = UNAVAILABLE.find((u) => u.re.test(t));
  if (un && !/\bdevis\b/.test(t)) return { type: "unavailable", label: un.label };
  if (/\b(cherche|recherche|trouve|retrouve|ou en est)\b|dev-\d{4}-\d{3}/.test(t)) return { type: "search", query: t };
  if (CREATE_RE.test(t)) {
    const desc = raw.replace(new RegExp(STRIP_CREATE.source, "i"), "").trim();
    return { type: "create_quote", description: desc.length > 3 ? desc : raw.trim() };
  }
  if (RELANCE_LIST_RE.test(t)) return { type: "relance_list" };
  if (SEARCH_RE.test(t)) return { type: "search", query: t };
  if (RELANCE_PREP_RE.test(t)) return { type: "relance_prepare", query: t };
  if (STATS_RE.test(t)) return { type: "stats" };
  if (LIST_RE.test(t)) return { type: "list" };
  if (un) return { type: "unavailable", label: un.label };
  if (t.split(" ").length >= 6) return { type: "create_quote", description: raw.trim(), guessed: true };
  return { type: "unknown" };
}
