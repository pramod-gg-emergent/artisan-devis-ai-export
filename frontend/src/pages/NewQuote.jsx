import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Mic, MicOff, Sparkles, ArrowRight, ArrowLeft, User, Loader2, Wand2, Save,
  HelpCircle, Info, Send,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/apiClient";
import LineEditor from "@/components/LineEditor";

const EXAMPLE =
  "Chez Mme Dubois à Agen, refaire la peinture du salon de 32 m², deux couches blanc mat, protéger le sol, reboucher quelques fissures et remplacer 8 mètres de plinthes.";

const AI_STEPS = [
  "Lecture de la description…",
  "Identification des prestations…",
  "Vérification des quantités…",
  "Application du catalogue tarifaire…",
];

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

  // clarifying questions
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});

  // load existing quote in edit mode
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

  // ---- Speech recognition ----
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const supportsSpeech =
    typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (!supportsSpeech) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    let base = "";
    rec.onstart = () => (base = description ? description + " " : "");
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) interim += e.results[i][0].transcript;
      setDescription(base + interim);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = () => {
    if (!supportsSpeech) {
      toast.error("La dictée n'est pas disponible sur ce navigateur.");
      return;
    }
    const rec = recognitionRef.current;
    if (listening) { rec.stop(); setListening(false); }
    else { try { rec.start(); setListening(true); } catch { setListening(false); } }
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
    if (listening) toggleMic();
    callAnalyze(null);
  };

  const submitAnswers = () => {
    const text = questions.map((q, i) => `${q}\nRéponse: ${answers[i]?.trim() || "non précisé"}`).join("\n\n");
    callAnalyze(text);
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
    } catch {
      toast.error("Enregistrement impossible");
    } finally {
      setSaving(false);
    }
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
            <p className="text-sm text-muted-foreground">Coordonnées du client et adresse du chantier.</p>
          </div>
          <div className="space-y-3 rounded-2xl border border-petrol/10 bg-card p-4 shadow-card">
            <Field label="Nom du client">
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
              </Field>
            </div>
            <Field label="Adresse du chantier">
              <Input data-testid="client-adresse-input" value={client.adresse || ""}
                onChange={(e) => setClient({ ...client, adresse: e.target.value })}
                placeholder="Rue, code postal, ville" className="h-12" />
            </Field>
            <button
              data-testid="prefill-client-btn"
              onClick={() => setClient({ nom: "Mme Dubois", telephone: "06 45 78 12 90", email: "c.dubois@email.fr", adresse: "8 Rue de la République, 47000 Agen" })}
              className="flex items-center gap-1.5 text-sm font-semibold text-lagoon-glow">
              <User size={14} /> Pré-remplir un client d'exemple
            </button>
          </div>
          <button data-testid="step1-next-btn" onClick={() => setStep(2)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-petrol py-4 text-base font-bold text-white shadow-active transition-transform active:scale-95">
            Continuer <ArrowRight size={18} />
          </button>
        </section>
      )}

      {/* Step 2: Description + mic + questions */}
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
                <button data-testid="mic-button" onClick={toggleMic}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-transform active:scale-95 ${
                    listening ? "animate-mic-pulse bg-destructive" : "bg-lagoon"}`}>
                  {listening ? <MicOff size={18} /> : <Mic size={18} />}
                  {listening ? "Arrêter" : "Dicter"}
                </button>
              </div>
              {listening && (
                <div data-testid="waveform" className="mt-3 flex h-8 items-center justify-center gap-1">
                  {Array.from({ length: 22 }).map((_, i) => (
                    <span key={i} className="wave-bar h-full w-1 rounded-full bg-lagoon" style={{ animationDelay: `${i * 0.06}s` }} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div data-testid="ai-questions" className="space-y-3 rounded-2xl border border-amber-relance/30 bg-amber-bg/40 p-4">
              <div className="flex items-center gap-2 font-heading font-bold text-amber-relance">
                <HelpCircle size={18} /> Quelques précisions pour un chiffrage fiable
              </div>
              <p className="text-xs text-muted-foreground">
                L'IA ne devine pas les données manquantes (ex : surface des murs ≠ surface au sol).
              </p>
              {questions.map((q, i) => (
                <div key={i} data-testid={`question-${i}`}>
                  <label className="mb-1 block text-sm font-semibold text-petrol">{q}</label>
                  <Input data-testid={`answer-${i}`} value={answers[i] || ""}
                    onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}
                    placeholder="Votre réponse" className="h-11" />
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
            <div className="flex gap-3">
              <button data-testid="step2-back-btn" onClick={() => setStep(1)}
                className="flex items-center justify-center gap-2 rounded-2xl border border-petrol/15 bg-card px-5 py-4 font-semibold text-petrol">
                <ArrowLeft size={18} />
              </button>
              {questions.length === 0 ? (
                <button data-testid="analyze-button" onClick={runAnalyze}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-lagoon py-4 text-base font-bold text-white shadow-cta transition-transform active:scale-95">
                  <Wand2 size={20} /> Analyser avec l'IA
                </button>
              ) : (
                <button data-testid="submit-answers-button" onClick={submitAnswers}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-lagoon py-4 text-base font-bold text-white shadow-cta transition-transform active:scale-95">
                  <Sparkles size={20} /> Générer le devis
                </button>
              )}
            </div>
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
    </div>
  );
}

const Field = ({ label, children }) => (
  <div>
    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
    {children}
  </div>
);
