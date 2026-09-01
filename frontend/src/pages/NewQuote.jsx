import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Mic, MicOff, Sparkles, ArrowRight, ArrowLeft, User, Loader2, Wand2, Save,
  HelpCircle, Info, Send, ListChecks, Check, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import api from "@/lib/apiClient";
import LineEditor from "@/components/LineEditor";
import { useDictation } from "@/hooks/useDictation";
import { euro } from "@/lib/format";

const EXAMPLE =
  "Chez Mme Dubois à Agen, refaire la peinture du salon de 32 m², deux couches blanc mat, protéger le sol, reboucher quelques fissures et remplacer 8 mètres de plinthes.";

const AI_STEPS = [
  "Lecture de la description…",
  "Identification des prestations…",
  "Vérification des quantités…",
  "Application du catalogue tarifaire…",
];

const normalizeEmailVoice = (t) =>
  (t || "")
    .toLowerCase()
    .replace(/\s*arobase\s*/g, "@")
    .replace(/\s*(?:point|dot)\s*/g, ".")
    .replace(/\s*tiret\s+bas\s*/g, "_")
    .replace(/\s*(?:underscore|souligné)\s*/g, "_")
    .replace(/\s*tiret\s*/g, "-")
    .replace(/\s+/g, "")
    .replace(/^[.]+|[.]+$/g, "");

export default function NewQuote() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get("edit");

  const [step, setStep] = useState(1);
  const [client, setClient] = useState({ nom: "", telephone: "", email: "", adresse: "" });
  const [description, setDescription] = useState("");
  const [lignes, setLignes] = useState([]);
  const [aiNote, setAiNote] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [aiStep, setAiStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [editStatut, setEditStatut] = useState(null);

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [globalAns, setGlobalAns] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [clientTranscript, setClientTranscript] = useState("");
  const [parsingClient, setParsingClient] = useState(false);

  // voice editing of the quote
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [interpreting, setInterpreting] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [saveConfirm, setSaveConfirm] = useState(null);

  const dict = useDictation();
  const [micTarget, setMicTarget] = useState(null);

  const { data: editQuote } = useQuery({
    queryKey: ["quote", editId],
    queryFn: () => api.quote(editId),
    enabled: !!editId,
  });
  useEffect(() => {
    if (editQuote) {
      setClient(editQuote.client || {});
      setDescription(editQuote.description || "");
      setLignes((editQuote.lignes || []).map((l) => ({ id: l.id || crypto.randomUUID(), ...l })));
      setEditStatut(editQuote.statut);
      setStep(3);
    }
  }, [editQuote]);

  const wasSent = editStatut && editStatut !== "brouillon";

  const toggleMic = (target, { base = "", onLive, onDone } = {}) => {
    if (dict.listening && micTarget === target) {
      dict.stop();
      setMicTarget(null);
    } else if (!dict.listening && !dict.transcribing) {
      setMicTarget(target);
      dict.start(base, onLive, onDone);
    } else {
      dict.stop();
      setMicTarget(null);
    }
  };

  const parseClientVoice = async (transcript) => {
    if (!transcript.trim()) return;
    setParsingClient(true);
    try {
      const res = await api.parseClient(transcript);
      setClient((prev) => ({
        nom: res.nom || prev.nom,
        telephone: res.telephone || prev.telephone,
        email: res.email || prev.email,
        adresse: res.adresse || prev.adresse,
      }));
      toast.success("Client rempli — vérifiez et corrigez si besoin");
    } catch {
      toast.error("Extraction vocale impossible");
    } finally {
      setClientTranscript("");
      setParsingClient(false);
    }
  };

  const callAnalyze = async (answersText) => {
    setAnalyzing(true);
    setAiStep(0);
    const interval = setInterval(() => setAiStep((s) => Math.min(s + 1, AI_STEPS.length - 1)), 900);
    try {
      const res = await api.analyze(description, answersText);
      clearInterval(interval);
      if (res.status === "questions") {
        setQuestions(res.questions);
        setAnswers({});
        toast.info("L'IA a besoin de quelques précisions");
      } else {
        const withIds = res.lignes.map((l) => ({ id: crypto.randomUUID(), ...l }));
        setLignes(withIds);
        setAiNote(res.note || "");
        setQuestions([]);
        setStep(3);
        toast.success(`${withIds.length} lignes générées`);
      }
    } catch {
      clearInterval(interval);
      toast.error("L'analyse IA a échoué. Réessayez.");
    } finally {
      setAnalyzing(false);
    }
  };

  const runAnalyze = () => {
    if (!description.trim()) return toast.error("Décrivez le chantier avant l'analyse.");
    if (dict.listening) toggleMic(micTarget);
    callAnalyze(null);
  };

  const submitAnswers = () => {
    const text = questions.map((q, i) => `${q}\nRéponse: ${answers[i]?.trim() || "non précisé"}`).join("\n\n");
    callAnalyze(text);
  };

  const dispatchVoice = async (transcript) => {
    if (!transcript.trim()) return;
    setDispatching(true);
    try {
      const res = await api.dispatchAnswers(questions, transcript);
      setAnswers((prev) => {
        const n = { ...prev };
        Object.entries(res.answers || {}).forEach(([k, v]) => { if (v && v.trim()) n[k] = v; });
        return n;
      });
      toast.success("Réponses réparties — vérifiez avant de générer");
    } catch {
      toast.error("Répartition vocale impossible");
    } finally {
      setGlobalAns("");
      setDispatching(false);
    }
  };

  const openVoiceEdit = () => {
    setProposal(null);
    setInstruction("");
    setVoiceOpen(true);
  };

  const interpret = async () => {
    if (!instruction.trim()) return toast.error("Dictez ou saisissez une instruction.");
    if (dict.listening) toggleMic("voice-edit");
    setInterpreting(true);
    try {
      const res = await api.editVoice(lignes, instruction);
      if (res.intent === "confirm") {
        setVoiceOpen(false);
        setSaveConfirm({ action: res.confirm_action === "send" && wasSent ? "send" : "save" });
      } else {
        setProposal({ changes: res.changes, lignes: res.lignes, summary: res.summary, totaux: res.totaux });
      }
    } catch {
      toast.error("Interprétation impossible");
    } finally {
      setInterpreting(false);
    }
  };

  const applyProposal = () => {
    setLignes(proposal.lignes.map((l) => ({ id: l.id || crypto.randomUUID(), ...l })));
    setProposal(null);
    setVoiceOpen(false);
    toast.success("Modifications appliquées");
  };

  const save = async (thenSend = false) => {
    if (lignes.length === 0) return toast.error("Ajoutez au moins une ligne au devis.");
    setSaving(true);
    try {
      let quote;
      if (editId) quote = await api.updateQuote(editId, { client, description, lignes });
      else quote = await api.createQuote({ client, description, lignes });
      if (thenSend) {
        await api.setStatus(quote.id, "envoye");
        toast.success("Devis modifié et renvoyé au client");
      } else {
        toast.success(editId ? "Devis mis à jour" : "Devis enregistré");
      }
      navigate(`/devis/${quote.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Enregistrement impossible");
    } finally {
      setSaving(false);
      setSaveConfirm(null);
    }
  };

  // Single primary voice action for the current screen
  const voiceConfig = () => {
    if (step === 1)
      return {
        show: dict.supported, label: "Renseigner le client à la voix", target: "client-global",
        onClick: () => toggleMic("client-global", { base: "", onLive: setClientTranscript, onDone: parseClientVoice }),
        status: parsingClient ? "Extraction des informations…" : (micTarget === "client-global" ? clientTranscript : ""),
      };
    if (step === 2 && questions.length === 0)
      return {
        show: dict.supported, label: "Dicter la description", target: "description",
        onClick: () => toggleMic("description", { base: description, onLive: setDescription, onDone: setDescription }),
        status: micTarget === "description" && dict.listening ? (description || "…") : "",
      };
    if (step === 2)
      return {
        show: dict.supported, label: "Répondre aux précisions à la voix", target: "answers-global",
        onClick: () => toggleMic("answers-global", { base: "", onLive: setGlobalAns, onDone: dispatchVoice }),
        status: dispatching ? "Répartition en cours…" : (micTarget === "answers-global" ? globalAns : ""),
      };
    if (step === 3)
      return { show: true, label: "Modifier le devis à la voix", target: "open-edit", onClick: openVoiceEdit, status: "" };
    return { show: false };
  };

  const VoiceBar = () => {
    const vc = voiceConfig();
    if (!vc.show) return null;
    const active = dict.listening && micTarget === vc.target;
    const busy = dict.transcribing;
    return (
      <div className="pt-1">
        {vc.status ? (
          <p className="mb-2 flex items-center justify-center gap-1.5 text-xs italic text-lagoon-glow">
            {(dispatching || parsingClient) && <Loader2 className="animate-spin" size={12} />} « {vc.status} »
          </p>
        ) : null}
        <button data-testid="voice-primary-button" onClick={vc.onClick} disabled={busy}
          className={`flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-bold text-white shadow-cta transition-transform active:scale-95 disabled:opacity-70 ${
            active ? "animate-mic-pulse bg-destructive" : "bg-lagoon"}`}>
          {busy ? <Loader2 className="animate-spin" size={20} /> : active ? <MicOff size={20} /> : <Mic size={20} />}
          {busy ? "Transcription…" : active ? "Arrêter la dictée" : vc.label}
        </button>
        {dict.mode === "whisper" && !active && !busy && (
          <p className="mt-1 text-center text-[11px] text-muted-foreground">Transcription vocale par IA</p>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-float-in">
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex flex-1 items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              step >= n ? "bg-lagoon text-white" : "bg-secondary text-muted-foreground"}`}>{n}</div>
            {n < 3 && <div className={`h-1 flex-1 rounded-full ${step > n ? "bg-lagoon" : "bg-secondary"}`} />}
          </div>
        ))}
      </div>

      {editId && (
        <div className="rounded-xl bg-lagoon-light px-4 py-2 text-sm font-semibold text-lagoon-glow">
          {wasSent ? "Modification d'un devis déjà envoyé" : "Modification du brouillon"} · {editQuote?.numero}
        </div>
      )}

      {/* Step 1: Client */}
      {step === 1 && (
        <section className="space-y-4">
          <div>
            <h1 className="font-heading text-2xl font-extrabold text-petrol">Informations client</h1>
            <p className="text-sm text-muted-foreground">Dictez ou saisissez les coordonnées du client.</p>
          </div>
          <div className="space-y-3 rounded-2xl border border-petrol/10 bg-card p-4 shadow-card">
            <Field label="Nom / Raison sociale">
              <Input data-testid="client-nom-input" value={client.nom || ""}
                onChange={(e) => setClient({ ...client, nom: e.target.value })}
                placeholder="Ex : Mme Dubois" className="h-12" />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Téléphone">
                <Input data-testid="client-tel-input" value={client.telephone || ""}
                  onChange={(e) => setClient({ ...client, telephone: e.target.value })}
                  placeholder="06 12 34 56 78" className="h-12" />
              </Field>
              <Field label="Email">
                <Input data-testid="client-email-input" value={client.email || ""}
                  onChange={(e) => setClient({ ...client, email: e.target.value })}
                  placeholder="client@email.fr" className="h-12" />
                <p className="mt-1 text-[11px] text-amber-relance">Vérifiez visuellement l'email dicté avant utilisation.</p>
              </Field>
            </div>
            <Field label="Adresse du chantier">
              <Input data-testid="client-adresse-input" value={client.adresse || ""}
                onChange={(e) => setClient({ ...client, adresse: e.target.value })}
                placeholder="Rue, code postal, ville" className="h-12" />
            </Field>
            <button data-testid="prefill-client-btn"
              onClick={() => setClient({ nom: "Mme Dubois", telephone: "06 45 78 12 90", email: "c.dubois@email.fr", adresse: "8 Rue de la République, 47000 Agen" })}
              className="flex items-center gap-1.5 text-sm font-semibold text-lagoon-glow">
              <User size={14} /> Pré-remplir un client d'exemple
            </button>
          </div>

          <VoiceBar />

          <button data-testid="step1-next-btn" onClick={() => setStep(2)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-petrol py-4 text-base font-bold text-white shadow-active transition-transform active:scale-95">
            Continuer <ArrowRight size={18} />
          </button>
        </section>
      )}

      {/* Step 2: Description + questions */}
      {step === 2 && (
        <section className="space-y-4">
          <div>
            <h1 className="font-heading text-2xl font-extrabold text-petrol">Décrivez le chantier</h1>
            <p className="text-sm text-muted-foreground">Saisissez ou dictez, l'IA vérifie avant de chiffrer.</p>
          </div>

          {questions.length === 0 ? (
            <div className="relative rounded-2xl border border-petrol/10 bg-card p-3 shadow-card">
              <Textarea data-testid="description-textarea" value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex : refaire la peinture du salon de 32 m², deux couches blanc mat, protéger le sol…"
                className="min-h-[180px] resize-none border-0 text-base focus-visible:ring-0" />
              <div className="flex items-center justify-between border-t border-petrol/10 pt-3">
                <button data-testid="example-btn" onClick={() => setDescription(EXAMPLE)}
                  className="text-xs font-semibold text-lagoon-glow">Insérer l'exemple</button>
                {dict.listening && micTarget === "description" && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" /> Dictée en cours…
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div data-testid="ai-questions" className="space-y-3 rounded-2xl border border-amber-relance/30 bg-amber-bg/40 p-4">
              <div className="flex items-center gap-2 font-heading font-bold text-amber-relance">
                <HelpCircle size={18} /> Quelques précisions pour un chiffrage fiable
              </div>
              <p className="text-xs text-muted-foreground">
                L'IA ne devine pas les données manquantes (ex : surface des murs ≠ surface au sol).
                Répondez au clavier ou utilisez le bouton micro ci-dessous.
              </p>
              {questions.map((q, i) => (
                <div key={i} data-testid={`question-${i}`}>
                  <label className="mb-1 block text-sm font-semibold text-petrol">{q}</label>
                  <Input data-testid={`answer-${i}`} value={answers[i] || ""}
                    onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}
                    placeholder="Votre réponse (saisie ou dictée)" className="h-11" />
                </div>
              ))}
              <button data-testid="back-to-description-btn" onClick={() => setQuestions([])}
                className="text-xs font-semibold text-lagoon-glow">← Modifier la description</button>
            </div>
          )}

          {analyzing ? (
            <div data-testid="ai-progress" className="rounded-2xl border border-lagoon/30 bg-lagoon-light p-5">
              <div className="flex items-center gap-3">
                <Loader2 className="animate-spin text-lagoon-glow" size={22} />
                <span className="font-heading font-bold text-petrol">{AI_STEPS[aiStep]}</span>
              </div>
            </div>
          ) : (
            <>
              <VoiceBar />
              <div className="flex gap-3">
                <button data-testid="step2-back-btn" onClick={() => setStep(1)}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-petrol/15 bg-card px-5 py-4 font-semibold text-petrol">
                  <ArrowLeft size={18} />
                </button>
                {questions.length === 0 ? (
                  <button data-testid="analyze-button" onClick={runAnalyze}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-petrol py-4 text-base font-bold text-white shadow-active transition-transform active:scale-95">
                    <Wand2 size={20} /> Analyser avec l'IA
                  </button>
                ) : (
                  <button data-testid="submit-answers-button" onClick={submitAnswers}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-petrol py-4 text-base font-bold text-white shadow-active transition-transform active:scale-95">
                    <Sparkles size={20} /> Générer le devis
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {/* Step 3: Line editor */}
      {step === 3 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-lagoon" />
            <h1 className="font-heading text-2xl font-extrabold text-petrol">Lignes du devis</h1>
          </div>
          <p className="-mt-3 text-sm text-muted-foreground">Toutes les lignes restent modifiables.</p>

          <div className="flex items-start gap-2 rounded-xl bg-lagoon-light px-3 py-2.5 text-xs text-lagoon-glow">
            <Info size={15} className="mt-0.5 shrink-0" />
            <span>Prix issus du <strong>catalogue de démonstration</strong> — vérifiez et ajustez. Les lignes « estimation » n'ont pas de prix certain.</span>
          </div>

          {aiNote && (
            <div data-testid="ai-note" className="rounded-xl border border-amber-relance/30 bg-amber-bg/50 px-3 py-2 text-xs text-amber-relance">
              <strong>Hypothèses IA :</strong> {aiNote}
            </div>
          )}

          <LineEditor lignes={lignes} setLignes={setLignes} />

          <VoiceBar />

          <div className="flex flex-wrap gap-3">
            <button data-testid="step3-back-btn" onClick={() => setStep(2)}
              className="flex items-center justify-center gap-2 rounded-2xl border border-petrol/15 bg-card px-5 py-4 font-semibold text-petrol">
              <ArrowLeft size={18} />
            </button>
            <button data-testid="save-quote-button" onClick={() => save(false)} disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-petrol py-4 text-base font-bold text-white shadow-active transition-transform active:scale-95 disabled:opacity-60">
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              {editId ? "Enregistrer" : "Enregistrer & prévisualiser"}
            </button>
            {wasSent && (
              <button data-testid="save-and-resend-button" onClick={() => save(true)} disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-lagoon py-4 text-base font-bold text-white shadow-cta transition-transform active:scale-95 disabled:opacity-60">
                <Send size={18} /> Modifier et renvoyer
              </button>
            )}
          </div>
        </section>
      )}

      {/* Voice edit modal */}
      <Dialog open={voiceOpen} onOpenChange={(o) => { if (!o && dict.listening) toggleMic("voice-edit"); setVoiceOpen(o); }}>
        <DialogContent data-testid="voice-edit-modal" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-extrabold text-petrol">Modifier le devis à la voix</DialogTitle>
            <DialogDescription className="sr-only">Dictez une instruction, l'IA propose les modifications avant application</DialogDescription>
          </DialogHeader>

          {!proposal ? (
            <>
              <p className="-mt-2 text-sm text-muted-foreground">
                Ex : « Passe la peinture à 15 euros le m² », « Ajoute 50 euros de déplacement », « Mets 20 % de TVA sur cette ligne », « Supprime la ligne plinthes ». Vous pouvez aussi dire « valide » ou « enregistre ».
              </p>
              <div className="relative rounded-xl border border-petrol/10 bg-card p-2">
                <Textarea data-testid="voice-instruction-textarea" value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Dictez ou saisissez votre instruction…"
                  className="min-h-[110px] resize-none border-0 text-sm focus-visible:ring-0" />
                {dict.supported && (
                  <button data-testid="voice-edit-mic"
                    onClick={() => toggleMic("voice-edit", { base: instruction, onLive: setInstruction, onDone: setInstruction })}
                    className={`absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-xl text-white ${
                      dict.listening && micTarget === "voice-edit" ? "animate-mic-pulse bg-destructive" : "bg-lagoon"}`}>
                    {dict.listening && micTarget === "voice-edit" ? <MicOff size={17} /> : <Mic size={17} />}
                  </button>
                )}
              </div>
              {!dict.supported && (
                <p className="text-xs text-muted-foreground">Dictée non disponible — saisissez votre instruction.</p>
              )}
              <DialogFooter>
                <button data-testid="interpret-button" onClick={interpret} disabled={interpreting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-petrol px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
                  {interpreting ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />} Interpréter
                </button>
              </DialogFooter>
            </>
          ) : (
            <div data-testid="proposal-view" className="space-y-3">
              <div className="flex items-center gap-2 font-heading font-bold text-petrol">
                <ListChecks size={18} className="text-lagoon" /> Modifications proposées
              </div>
              {proposal.summary && <p className="text-sm text-muted-foreground">{proposal.summary}</p>}
              <ul className="space-y-1.5">
                {proposal.changes.length === 0 && <li className="text-sm text-muted-foreground">Aucun changement détecté.</li>}
                {proposal.changes.map((c, i) => (
                  <li key={i} data-testid={`proposal-change-${i}`} className="flex items-start gap-2 rounded-lg bg-lagoon-light px-3 py-2 text-sm text-petrol">
                    <Check size={15} className="mt-0.5 shrink-0 text-lagoon-glow" /> {c}
                  </li>
                ))}
              </ul>
              {proposal.totaux && (
                <div className="rounded-lg bg-secondary px-3 py-2 text-sm font-semibold text-petrol">
                  Nouveau total TTC : {euro(proposal.totaux.total_ttc)}
                </div>
              )}
              <DialogFooter className="gap-2 sm:gap-2">
                <button data-testid="cancel-proposal-btn" onClick={() => setProposal(null)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-petrol/15 px-4 py-3 text-sm font-semibold text-petrol">
                  <X size={15} /> Annuler
                </button>
                <button data-testid="apply-proposal-btn" onClick={applyProposal}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-lagoon px-4 py-3 text-sm font-bold text-white">
                  <Check size={15} /> Appliquer les modifications
                </button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Voice validation confirmation */}
      <Dialog open={!!saveConfirm} onOpenChange={(o) => !o && setSaveConfirm(null)}>
        <DialogContent data-testid="save-confirm-modal" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-extrabold text-petrol">
              {saveConfirm?.action === "send" ? "Confirmer la modification et le renvoi" : "Confirmer l'enregistrement"}
            </DialogTitle>
            <DialogDescription className="sr-only">Confirmez explicitement l'action demandée à la voix</DialogDescription>
          </DialogHeader>
          <p className="-mt-2 text-sm text-muted-foreground">
            {saveConfirm?.action === "send"
              ? "Le devis sera enregistré puis renvoyé au client."
              : "Le devis sera enregistré."} Confirmez pour continuer.
          </p>
          <DialogFooter className="gap-2 sm:gap-2">
            <button onClick={() => setSaveConfirm(null)}
              className="rounded-xl border border-petrol/15 px-4 py-3 text-sm font-semibold text-petrol">Annuler</button>
            <button data-testid="save-confirm-btn" onClick={() => save(saveConfirm?.action === "send")} disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-lagoon px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />} Confirmer
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div>
    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
    {children}
  </div>
);
