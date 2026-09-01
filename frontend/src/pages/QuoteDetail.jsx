import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Send, CheckCircle2, XCircle, Bell, Loader2, Building2, MapPin, Phone, Mail,
  Copy, Pencil, Clock, FileDown, Link2, Mail as MailIcon, Info,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import api from "@/lib/apiClient";
import { euro, num, dateFr, lineHt } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";

const DELAYS = [5, 7, 10];

export default function QuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [relanceOpen, setRelanceOpen] = useState(false);
  const [relanceMsg, setRelanceMsg] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const [delay, setDelay] = useState(7);
  const [emailData, setEmailData] = useState({ to: "", subject: "", message: "", email_configured: true });

  const { data: q, isLoading } = useQuery({ queryKey: ["quote", id], queryFn: () => api.quote(id) });
  const { data: company } = useQuery({ queryKey: ["company"], queryFn: api.company });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["quote", id] });
    qc.invalidateQueries({ queryKey: ["quotes"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };

  const changeStatus = async (statut, msg, extra = {}) => {
    setBusy(true);
    try { await api.setStatus(id, statut, extra); toast.success(msg); refresh(); }
    catch { toast.error("Action impossible"); }
    finally { setBusy(false); }
  };

  const openSend = async () => {
    if ((q?.lignes || []).some((l) => l.tva === null || l.tva === undefined || l.tva === "")) {
      toast.error("Vérifiez et définissez la TVA avant d'envoyer le devis.");
      return;
    }
    setDelay(company?.relance_delay_days || 7);
    try {
      const p = await api.emailPreview(id);
      if (p.has_email) {
        setEmailData({ to: p.to, subject: p.subject, message: p.default_message, email_configured: p.email_configured });
        setSendOpen(true);
      } else {
        setMarkOpen(true); // no client email -> just mark sent
      }
    } catch { toast.error("Impossible de préparer l'envoi"); }
  };

  const confirmEmail = async () => {
    setBusy(true);
    try {
      const res = await api.sendEmail(id, {
        personal_message: emailData.message,
        app_base_url: window.location.origin,
        relance_delay_days: delay,
      });
      setSendOpen(false);
      if (res.mode === "live") toast.success(`Email envoyé à ${res.to} (PDF joint)`);
      else toast.warning("MODE DÉMONSTRATION : email simulé — envoi réel à connecter");
      refresh();
    } catch { toast.error("Envoi impossible"); }
    finally { setBusy(false); }
  };

  const confirmMarkSent = async () => {
    setMarkOpen(false);
    await changeStatus("envoye", "Devis marqué comme envoyé", { relance_delay_days: delay });
  };

  const openRelance = async () => {
    setBusy(true);
    try { const res = await api.relanceMessage(id); setRelanceMsg(res.message); setRelanceOpen(true); }
    catch { toast.error("Impossible de générer la relance"); }
    finally { setBusy(false); }
  };

  const confirmRelance = async () => {
    setBusy(true);
    try { await api.markRelance(id); toast.success("Client relancé — statut « Relancé »"); setRelanceOpen(false); refresh(); }
    catch { toast.error("Action impossible"); }
    finally { setBusy(false); }
  };

  if (isLoading || !q) {
    return (
      <div className="space-y-3">
        <div className="shimmer h-32 rounded-2xl" />
        <div className="shimmer h-64 rounded-2xl" />
      </div>
    );
  }

  const t = q.totaux;
  const eff = q.effective_statut;
  const isSent = ["envoye", "relance", "a_relancer"].includes(eff);
  const editable = q.statut !== "accepte" && q.statut !== "refuse";
  const clientLink = q.public_token ? `${window.location.origin}/devis-client/${q.public_token}` : null;
  const needsTva = (q.lignes || []).some((l) => l.tva === null || l.tva === undefined || l.tva === "");

  return (
    <div className="mx-auto max-w-2xl space-y-4 animate-float-in">
      <button data-testid="back-button" onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm font-semibold text-petrol/70">
        <ArrowLeft size={16} /> Retour
      </button>

      {(q.relance_count > 0 || isSent) && editable && (
        <div data-testid="relance-info" className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-petrol/10 bg-card px-4 py-2.5 text-sm shadow-card">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Bell size={14} className="text-amber-relance" /> {q.relance_count} relance{q.relance_count > 1 ? "s" : ""}
          </span>
          {q.last_relance_at && <span className="text-muted-foreground">Dernière : {dateFr(q.last_relance_at)}</span>}
          {q.next_relance_at && (
            <span className="flex items-center gap-1.5 font-semibold text-petrol">
              <Clock size={14} /> Prochaine relance : {dateFr(q.next_relance_at)}
            </span>
          )}
        </div>
      )}

      {/* Client link for sent quotes */}
      {clientLink && editable && (
        <div data-testid="client-link-box" className="rounded-xl border border-lagoon/30 bg-lagoon-light px-4 py-3 shadow-card">
          <div className="flex items-center gap-2 text-sm font-semibold text-lagoon-glow">
            <Link2 size={15} /> Lien client (acceptation / refus en ligne)
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <input readOnly value={clientLink} data-testid="client-link-input"
              className="h-9 flex-1 truncate rounded-lg border border-lagoon/20 bg-white px-2 text-xs text-petrol" />
            <button data-testid="copy-link-btn"
              onClick={() => { navigator.clipboard?.writeText(clientLink); toast.success("Lien copié"); }}
              className="flex h-9 items-center gap-1 rounded-lg bg-lagoon px-3 text-xs font-bold text-white">
              <Copy size={13} /> Copier
            </button>
          </div>
        </div>
      )}

      {needsTva && (
        <div data-testid="tva-warning" className="rounded-xl border border-amber-relance/40 bg-amber-bg px-4 py-3 text-sm font-semibold text-amber-relance">
          Vérifiez et définissez la TVA avant d'envoyer le devis.
          {editable && (
            <button data-testid="tva-warning-edit" onClick={() => navigate(`/nouveau?edit=${q.id}`)} className="ml-2 underline">
              Modifier
            </button>
          )}
        </div>
      )}

      {/* Quote document */}
      <div data-testid="quote-preview" className="overflow-hidden rounded-2xl border border-petrol/10 bg-card shadow-card">
        <div className="flex items-start justify-between bg-petrol p-5 text-white">
          <div>
            <div className="font-heading text-xl font-extrabold">{company?.name}</div>
            <div className="mt-1 space-y-0.5 text-xs text-cyan-100/80">
              <div className="flex items-center gap-1.5"><MapPin size={12} /> {company?.address}</div>
              <div className="flex items-center gap-1.5"><Phone size={12} /> {company?.phone}</div>
              <div>SIRET {company?.siret}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-heading text-2xl font-extrabold text-lagoon">DEVIS</div>
            <div className="text-sm font-semibold">{q.numero}</div>
            <div className="text-xs text-cyan-100/80">{dateFr(q.created_at)}</div>
            <div className="mt-2"><StatusBadge statut={eff} /></div>
          </div>
        </div>

        <div className="border-b border-petrol/10 p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Client</div>
          <div className="mt-1 font-heading text-lg font-bold text-petrol">{q.client?.nom || "—"}</div>
          <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
            {q.client?.adresse && <div className="flex items-center gap-1.5"><Building2 size={13} /> {q.client.adresse}</div>}
            {q.client?.telephone && <div className="flex items-center gap-1.5"><Phone size={13} /> {q.client.telephone}</div>}
            {q.client?.email && <div className="flex items-center gap-1.5"><Mail size={13} /> {q.client.email}</div>}
          </div>
        </div>

        <div className="p-5">
          <div className="hidden border-b border-petrol/10 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid sm:grid-cols-12">
            <div className="col-span-6">Désignation</div>
            <div className="col-span-2 text-right">Qté</div>
            <div className="col-span-2 text-right">P.U. HT</div>
            <div className="col-span-2 text-right">Total HT</div>
          </div>
          <div className="divide-y divide-petrol/5">
            {q.lignes.map((l, i) => (
              <div key={l.id || i} data-testid={`preview-line-${i}`} className="grid grid-cols-12 gap-2 py-3 text-sm">
                <div className="col-span-12 font-medium text-petrol sm:col-span-6">
                  {l.designation}
                  {l.source === "estimation" && (
                    <span className="ml-2 rounded bg-amber-bg px-1.5 py-0.5 text-[10px] font-semibold text-amber-relance">estimation</span>
                  )}
                  <span className="ml-2 text-xs text-muted-foreground sm:hidden">
                    {num(l.quantite)} {l.unite} × {euro(l.prix_unitaire_ht)}
                  </span>
                </div>
                <div className="hidden text-right text-muted-foreground sm:col-span-2 sm:block">{num(l.quantite)} {l.unite}</div>
                <div className="hidden text-right text-muted-foreground sm:col-span-2 sm:block">{euro(l.prix_unitaire_ht)}</div>
                <div className="col-span-12 text-right font-heading font-bold text-petrol sm:col-span-2">{euro(lineHt(l))}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 ml-auto max-w-xs space-y-1.5">
            <Row label="Total HT" value={euro(t.total_ht)} testid="preview-total-ht" />
            <Row label="TVA" value={euro(t.total_tva)} testid="preview-total-tva" />
            <div className="flex items-center justify-between rounded-xl bg-petrol px-4 py-2.5 text-white">
              <span className="font-heading font-bold">Total TTC</span>
              <span data-testid="preview-total-ttc" className="font-heading text-lg font-extrabold text-lagoon">{euro(t.total_ttc)}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-petrol/10 bg-secondary/50 px-5 py-3 text-[11px] text-muted-foreground">
          {company?.assurance} · TVA intra. {company?.tva_intra} · Devis valable 30 jours.
        </div>
      </div>

      {/* PDF download */}
      {needsTva ? (
        <button data-testid="download-pdf-button"
          onClick={() => toast.error("Vérifiez et définissez la TVA avant d'envoyer le devis.")}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-petrol/15 bg-secondary/60 py-3.5 text-base font-bold text-muted-foreground">
          <FileDown size={18} /> Télécharger le PDF
        </button>
      ) : (
        <a data-testid="download-pdf-button" href={api.pdfUrl(q.id)} target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-2xl border border-petrol/20 bg-card py-3.5 text-base font-bold text-petrol shadow-card transition-transform active:scale-95">
          <FileDown size={18} /> Télécharger le PDF
        </a>
      )}

      {/* Actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {editable && (
          <button data-testid="edit-quote-button" onClick={() => navigate(`/nouveau?edit=${q.id}`)}
            className="flex items-center justify-center gap-2 rounded-2xl border border-petrol/20 bg-card py-4 text-base font-bold text-petrol shadow-card transition-transform active:scale-95">
            <Pencil size={18} /> {isSent ? "Modifier et renvoyer" : "Modifier le devis"}
          </button>
        )}

        {q.statut === "brouillon" && (
          <button data-testid="send-quote-button" onClick={openSend} disabled={busy}
            className="flex items-center justify-center gap-2 rounded-2xl bg-lagoon py-4 text-base font-bold text-white shadow-cta transition-transform active:scale-95 disabled:opacity-60">
            <Send size={18} /> Envoyer au client
          </button>
        )}

        {isSent && (
          <button data-testid="relance-button" onClick={openRelance} disabled={busy}
            className="flex items-center justify-center gap-2 rounded-2xl bg-amber-relance py-4 text-base font-bold text-white shadow-active transition-transform active:scale-95 disabled:opacity-60">
            <Bell size={18} /> Relancer le client
          </button>
        )}

        {editable && (
          <button data-testid="accept-quote-button" onClick={() => changeStatus("accepte", "Devis marqué comme accepté")} disabled={busy}
            className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-accepted py-4 text-base font-bold text-white shadow-active transition-transform active:scale-95 disabled:opacity-60">
            <CheckCircle2 size={18} /> Marquer accepté
          </button>
        )}

        {isSent && (
          <button data-testid="refuse-quote-button" onClick={() => changeStatus("refuse", "Devis marqué comme refusé")} disabled={busy}
            className="flex items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-card py-4 text-base font-bold text-destructive shadow-card transition-transform active:scale-95 disabled:opacity-60">
            <XCircle size={18} /> Marquer refusé
          </button>
        )}

        {q.statut === "accepte" && (
          <div className="col-span-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-bg py-4 font-bold text-emerald-accepted">
            <CheckCircle2 size={20} /> Devis accepté{q.decision_source === "client" ? " par le client" : ""}{q.accepted_at ? ` le ${dateFr(q.accepted_at)}` : ""}
          </div>
        )}
        {q.statut === "refuse" && (
          <div className="col-span-full rounded-2xl bg-red-50 py-4 px-4 text-center font-bold text-destructive">
            <div className="flex items-center justify-center gap-2"><XCircle size={20} /> Devis refusé{q.decision_source === "client" ? " par le client" : ""}</div>
            {q.refus_comment && <div className="mt-1 text-sm font-normal text-destructive/80">« {q.refus_comment} »</div>}
          </div>
        )}
      </div>

      {/* Email preview modal */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent data-testid="email-modal" className="max-w-lg">
          <DialogHeader><DialogTitle className="font-heading text-xl font-extrabold text-petrol">Envoyer le devis par email</DialogTitle><DialogDescription className="sr-only">Prévisualisez et envoyez le devis au client</DialogDescription></DialogHeader>
          {!emailData.email_configured && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-bg/60 px-3 py-2 text-xs text-amber-relance">
              <Info size={14} className="mt-0.5 shrink-0" /> Envoi réel non configuré : le message sera simulé (mode démonstration).
            </div>
          )}
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Destinataire</label>
            <Input data-testid="email-to" value={emailData.to} readOnly className="h-10 bg-secondary/50" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Objet</label>
            <Input data-testid="email-subject" value={emailData.subject} readOnly className="h-10 bg-secondary/50" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Message (modifiable)</label>
            <Textarea data-testid="email-message" value={emailData.message}
              onChange={(e) => setEmailData({ ...emailData, message: e.target.value })} className="min-h-[160px] text-sm" />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MailIcon size={13} className="text-lagoon" /> Le PDF du devis sera joint. Un lien d'acceptation en ligne est ajouté automatiquement.
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">Prochaine relance</label>
            <div className="flex gap-2">
              {DELAYS.map((d) => (
                <button key={d} data-testid={`delay-${d}`} onClick={() => setDelay(d)}
                  className={`flex-1 rounded-xl border py-2.5 text-sm font-bold transition-colors ${
                    delay === d ? "border-lagoon bg-lagoon text-white" : "border-petrol/15 bg-card text-petrol"}`}>J+{d}</button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <button data-testid="confirm-email-btn" onClick={confirmEmail} disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-lagoon px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
              {busy ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />} Envoyer au client
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark-sent modal (no client email) */}
      <Dialog open={markOpen} onOpenChange={setMarkOpen}>
        <DialogContent data-testid="send-modal" className="max-w-md">
          <DialogHeader><DialogTitle className="font-heading text-xl font-extrabold text-petrol">Marquer comme envoyé</DialogTitle><DialogDescription className="sr-only">Marquer le devis comme envoyé et planifier la relance</DialogDescription></DialogHeader>
          <p className="-mt-2 text-sm text-muted-foreground">Aucune adresse email client renseignée. Le devis sera marqué envoyé et suivi pour relance.</p>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">Prochaine relance</label>
            <div className="flex gap-2">
              {DELAYS.map((d) => (
                <button key={d} data-testid={`mark-delay-${d}`} onClick={() => setDelay(d)}
                  className={`flex-1 rounded-xl border py-3 text-sm font-bold transition-colors ${
                    delay === d ? "border-lagoon bg-lagoon text-white" : "border-petrol/15 bg-card text-petrol"}`}>J+{d}</button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <button data-testid="confirm-send-btn" onClick={confirmMarkSent} disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-lagoon px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
              <Send size={16} /> Confirmer
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Relance modal */}
      <Dialog open={relanceOpen} onOpenChange={setRelanceOpen}>
        <DialogContent data-testid="relance-modal" className="max-w-lg">
          <DialogHeader><DialogTitle className="font-heading text-xl font-extrabold text-petrol">Message de relance</DialogTitle><DialogDescription className="sr-only">Modifiez le message de relance avant envoi</DialogDescription></DialogHeader>
          <p className="-mt-2 text-sm text-muted-foreground">Message prérempli — modifiez-le librement avant l'envoi.</p>
          <Textarea data-testid="relance-textarea" value={relanceMsg}
            onChange={(e) => setRelanceMsg(e.target.value)} className="min-h-[220px] text-sm" />
          <DialogFooter className="gap-2 sm:gap-2">
            <button data-testid="copy-relance-btn"
              onClick={() => { navigator.clipboard?.writeText(relanceMsg); toast.success("Message copié"); }}
              className="flex items-center justify-center gap-2 rounded-xl border border-petrol/15 px-4 py-3 text-sm font-semibold text-petrol">
              <Copy size={16} /> Copier
            </button>
            <button data-testid="confirm-relance-btn" onClick={confirmRelance} disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-relance px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
              {busy ? <Loader2 className="animate-spin" size={16} /> : <Bell size={16} />} Envoyer la relance
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Row = ({ label, value, testid }) => (
  <div className="flex items-center justify-between text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span data-testid={testid} className="font-semibold text-petrol">{value}</span>
  </div>
);
