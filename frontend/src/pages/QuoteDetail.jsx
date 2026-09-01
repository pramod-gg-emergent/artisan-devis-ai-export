import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Send, CheckCircle2, XCircle, Bell, Loader2, Building2, MapPin, Phone, Mail, Copy, Pencil, Clock,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
  const [delay, setDelay] = useState(7);

  const { data: q, isLoading } = useQuery({ queryKey: ["quote", id], queryFn: () => api.quote(id) });
  const { data: company } = useQuery({ queryKey: ["company"], queryFn: api.company });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["quote", id] });
    qc.invalidateQueries({ queryKey: ["quotes"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };

  const changeStatus = async (statut, msg, extra = {}) => {
    setBusy(true);
    try {
      await api.setStatus(id, statut, extra);
      toast.success(msg);
      refresh();
    } catch { toast.error("Action impossible"); }
    finally { setBusy(false); }
  };

  const confirmSend = async () => {
    setSendOpen(false);
    await changeStatus("envoye", "Devis envoyé au client", { relance_delay_days: delay });
  };

  const openRelance = async () => {
    setBusy(true);
    try {
      const res = await api.relanceMessage(id);
      setRelanceMsg(res.message);
      setRelanceOpen(true);
    } catch { toast.error("Impossible de générer la relance"); }
    finally { setBusy(false); }
  };

  const confirmRelance = async () => {
    setBusy(true);
    try {
      await api.markRelance(id);
      toast.success("Client relancé — statut « Relancé »");
      setRelanceOpen(false);
      refresh();
    } catch { toast.error("Action impossible"); }
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

  return (
    <div className="mx-auto max-w-2xl space-y-4 animate-float-in">
      <button data-testid="back-button" onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm font-semibold text-petrol/70">
        <ArrowLeft size={16} /> Retour
      </button>

      {/* Relance tracking */}
      {(q.relance_count > 0 || isSent) && q.statut !== "accepte" && q.statut !== "refuse" && (
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

      {/* Actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {editable && (
          <button data-testid="edit-quote-button" onClick={() => navigate(`/nouveau?edit=${q.id}`)}
            className="flex items-center justify-center gap-2 rounded-2xl border border-petrol/20 bg-card py-4 text-base font-bold text-petrol shadow-card transition-transform active:scale-95">
            <Pencil size={18} /> {isSent ? "Modifier et renvoyer" : "Modifier le devis"}
          </button>
        )}

        {q.statut === "brouillon" && (
          <button data-testid="send-quote-button" onClick={() => { setDelay(company?.relance_delay_days || 7); setSendOpen(true); }} disabled={busy}
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
            <CheckCircle2 size={20} /> Devis accepté — bravo !
          </div>
        )}
        {q.statut === "refuse" && (
          <div className="col-span-full flex items-center justify-center gap-2 rounded-2xl bg-red-50 py-4 font-bold text-destructive">
            <XCircle size={20} /> Devis refusé
          </div>
        )}
      </div>

      {/* Send dialog */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent data-testid="send-modal" className="max-w-md">
          <DialogHeader><DialogTitle className="font-heading text-xl font-extrabold text-petrol">Envoyer le devis</DialogTitle></DialogHeader>
          <p className="-mt-2 text-sm text-muted-foreground">Planifiez la prochaine relance automatique.</p>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">Prochaine relance</label>
            <div className="flex gap-2">
              {DELAYS.map((d) => (
                <button key={d} data-testid={`delay-${d}`} onClick={() => setDelay(d)}
                  className={`flex-1 rounded-xl border py-3 text-sm font-bold transition-colors ${
                    delay === d ? "border-lagoon bg-lagoon text-white" : "border-petrol/15 bg-card text-petrol"}`}>
                  J+{d}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <button data-testid="confirm-send-btn" onClick={confirmSend} disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-lagoon px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
              <Send size={16} /> Confirmer l'envoi
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Relance modal */}
      <Dialog open={relanceOpen} onOpenChange={setRelanceOpen}>
        <DialogContent data-testid="relance-modal" className="max-w-lg">
          <DialogHeader><DialogTitle className="font-heading text-xl font-extrabold text-petrol">Message de relance</DialogTitle></DialogHeader>
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
