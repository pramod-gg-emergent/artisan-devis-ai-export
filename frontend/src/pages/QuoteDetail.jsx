import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Send, CheckCircle2, Bell, Loader2, Building2, MapPin, Phone, Mail, Copy,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/apiClient";
import { euro, num, dateFr, lineHt } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";

export default function QuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [relanceOpen, setRelanceOpen] = useState(false);
  const [relanceMsg, setRelanceMsg] = useState("");

  const { data: q, isLoading } = useQuery({ queryKey: ["quote", id], queryFn: () => api.quote(id) });
  const { data: company } = useQuery({ queryKey: ["company"], queryFn: api.company });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["quote", id] });
    qc.invalidateQueries({ queryKey: ["quotes"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };

  const changeStatus = async (statut, msg) => {
    setBusy(true);
    try {
      await api.setStatus(id, statut);
      toast.success(msg);
      refresh();
    } catch {
      toast.error("Action impossible");
    } finally {
      setBusy(false);
    }
  };

  const openRelance = async () => {
    setBusy(true);
    try {
      const res = await api.relanceMessage(id);
      setRelanceMsg(res.message);
      setRelanceOpen(true);
    } catch {
      toast.error("Impossible de générer la relance");
    } finally {
      setBusy(false);
    }
  };

  const confirmRelance = async () => {
    setBusy(true);
    try {
      await api.markRelance(id);
      toast.success("Client relancé — devis marqué « À relancer »");
      setRelanceOpen(false);
      refresh();
    } catch {
      toast.error("Action impossible");
    } finally {
      setBusy(false);
    }
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

  return (
    <div className="mx-auto max-w-2xl space-y-4 animate-float-in">
      <button
        data-testid="back-button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm font-semibold text-petrol/70"
      >
        <ArrowLeft size={16} /> Retour
      </button>

      {/* Quote document */}
      <div data-testid="quote-preview" className="overflow-hidden rounded-2xl border border-petrol/10 bg-card shadow-card">
        {/* Header */}
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
            <div className="mt-2"><StatusBadge statut={q.statut} /></div>
          </div>
        </div>

        {/* Client box */}
        <div className="border-b border-petrol/10 p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Client</div>
          <div className="mt-1 font-heading text-lg font-bold text-petrol">{q.client?.nom || "—"}</div>
          <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
            {q.client?.adresse && <div className="flex items-center gap-1.5"><Building2 size={13} /> {q.client.adresse}</div>}
            {q.client?.telephone && <div className="flex items-center gap-1.5"><Phone size={13} /> {q.client.telephone}</div>}
            {q.client?.email && <div className="flex items-center gap-1.5"><Mail size={13} /> {q.client.email}</div>}
          </div>
        </div>

        {/* Line items */}
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

          {/* Totals */}
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
        {(q.statut === "brouillon") && (
          <button
            data-testid="send-quote-button"
            onClick={() => changeStatus("envoye", "Devis envoyé au client")}
            disabled={busy}
            className="col-span-full flex items-center justify-center gap-2 rounded-2xl bg-lagoon py-4 text-base font-bold text-white shadow-cta transition-transform active:scale-95 disabled:opacity-60"
          >
            <Send size={18} /> Envoyer au client
          </button>
        )}

        {(q.statut === "envoye" || q.statut === "a_relancer") && (
          <button
            data-testid="relance-button"
            onClick={openRelance}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-2xl bg-amber-relance py-4 text-base font-bold text-white shadow-active transition-transform active:scale-95 disabled:opacity-60"
          >
            <Bell size={18} /> Relancer le client
          </button>
        )}

        {q.statut !== "accepte" && (
          <button
            data-testid="accept-quote-button"
            onClick={() => changeStatus("accepte", "Devis marqué comme accepté")}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-accepted py-4 text-base font-bold text-white shadow-active transition-transform active:scale-95 disabled:opacity-60"
          >
            <CheckCircle2 size={18} /> Marquer comme accepté
          </button>
        )}

        {q.statut === "accepte" && (
          <div className="col-span-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-bg py-4 font-bold text-emerald-accepted">
            <CheckCircle2 size={20} /> Devis accepté — bravo !
          </div>
        )}
      </div>

      {/* Relance modal */}
      <Dialog open={relanceOpen} onOpenChange={setRelanceOpen}>
        <DialogContent data-testid="relance-modal" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-extrabold text-petrol">Message de relance</DialogTitle>
          </DialogHeader>
          <p className="-mt-2 text-sm text-muted-foreground">
            Message prérempli — modifiez-le librement avant l'envoi.
          </p>
          <Textarea
            data-testid="relance-textarea"
            value={relanceMsg}
            onChange={(e) => setRelanceMsg(e.target.value)}
            className="min-h-[220px] text-sm"
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              data-testid="copy-relance-btn"
              onClick={() => { navigator.clipboard?.writeText(relanceMsg); toast.success("Message copié"); }}
              className="flex items-center justify-center gap-2 rounded-xl border border-petrol/15 px-4 py-3 text-sm font-semibold text-petrol"
            >
              <Copy size={16} /> Copier
            </button>
            <button
              data-testid="confirm-relance-btn"
              onClick={confirmRelance}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-relance px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
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
