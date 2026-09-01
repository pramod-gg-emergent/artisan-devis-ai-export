import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Building2, MapPin, Phone, Loader2, Sparkles, ShieldCheck,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/apiClient";
import { euro, num, dateFr, lineHt } from "@/lib/format";

export default function PublicQuote() {
  const { token } = useParams();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["public-quote", token],
    queryFn: () => api.publicQuote(token),
    retry: false,
  });

  const [confirm, setConfirm] = useState(null); // 'accept' | 'refuse' | null
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // 'accepte' | 'refuse'

  const decide = async () => {
    setBusy(true);
    try {
      if (confirm === "accept") { await api.publicAccept(token); setDone("accepte"); }
      else { await api.publicRefuse(token, comment); setDone("refuse"); }
      setConfirm(null);
      refetch();
    } catch { toast.error("Une erreur est survenue"); }
    finally { setBusy(false); }
  };

  if (isLoading) return <Center><Loader2 className="animate-spin text-lagoon" size={32} /></Center>;
  if (isError || !data) return <Center><p className="text-muted-foreground">Devis introuvable ou lien expiré.</p></Center>;

  const q = data.quote;
  const c = data.company;
  const t = q.totaux;
  const already = done || (["accepte", "refuse"].includes(q.statut) ? q.statut : null);

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="bg-petrol px-4 py-3 text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-lagoon shadow-cta">
            <Sparkles size={18} strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <div className="font-heading text-base font-extrabold">{c.name}</div>
            <div className="text-[11px] text-cyan-200">Votre devis en ligne</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5 animate-float-in">
        {already && (
          <div data-testid="public-confirmation" className={`mb-4 flex items-center gap-3 rounded-2xl p-4 font-semibold ${
            already === "accepte" ? "bg-emerald-bg text-emerald-accepted" : "bg-red-50 text-destructive"}`}>
            {already === "accepte" ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
            {already === "accepte"
              ? "Merci ! Vous avez accepté ce devis. L'artisan en est informé."
              : "Vous avez refusé ce devis. L'artisan en est informé."}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-petrol/10 bg-card shadow-card">
          <div className="flex items-start justify-between bg-petrol p-5 text-white">
            <div>
              <div className="font-heading text-lg font-extrabold">{c.name}</div>
              <div className="mt-1 space-y-0.5 text-xs text-cyan-100/80">
                <div className="flex items-center gap-1.5"><MapPin size={12} /> {c.address}</div>
                <div className="flex items-center gap-1.5"><Phone size={12} /> {c.phone}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-heading text-xl font-extrabold text-lagoon">DEVIS</div>
              <div className="text-sm font-semibold">{q.numero}</div>
              <div className="text-xs text-cyan-100/80">{dateFr(q.created_at)}</div>
            </div>
          </div>

          <div className="border-b border-petrol/10 p-5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Adressé à</div>
            <div className="mt-1 font-heading text-base font-bold text-petrol">{q.client?.nom}</div>
            <div className="text-sm text-muted-foreground">{q.client?.adresse}</div>
          </div>

          <div className="p-5">
            {q.lignes.map((l, i) => (
              <div key={l.id || i} className="flex justify-between gap-3 border-b border-petrol/5 py-2.5 text-sm">
                <div className="text-petrol">
                  <div className="font-medium">{l.designation}</div>
                  <div className="text-xs text-muted-foreground">{num(l.quantite)} {l.unite} × {euro(l.prix_unitaire_ht)}</div>
                </div>
                <div className="whitespace-nowrap font-heading font-bold text-petrol">{euro(lineHt(l))}</div>
              </div>
            ))}
            <div className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total HT</span><span className="font-semibold text-petrol">{euro(t.total_ht)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">TVA</span><span className="font-semibold text-petrol">{euro(t.total_tva)}</span></div>
              <div className="flex items-center justify-between rounded-xl bg-petrol px-4 py-2.5 text-white">
                <span className="font-heading font-bold">Total TTC</span>
                <span className="font-heading text-lg font-extrabold text-lagoon">{euro(t.total_ttc)}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-petrol/10 bg-secondary/50 px-5 py-3 text-[11px] text-muted-foreground">
            {c.assurance} · Devis valable 30 jours. En acceptant, vous validez ce devis pour accord.
          </div>
        </div>

        <a data-testid="public-pdf-link" href={api.pdfUrl(q.id)} target="_blank" rel="noreferrer"
          className="mt-3 block text-center text-sm font-semibold text-lagoon-glow">
          Télécharger le PDF
        </a>

        {!already && (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button data-testid="public-accept-button" onClick={() => setConfirm("accept")}
              className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-accepted py-4 text-base font-bold text-white shadow-active transition-transform active:scale-95">
              <CheckCircle2 size={20} /> Accepter le devis
            </button>
            <button data-testid="public-refuse-button" onClick={() => { setComment(""); setConfirm("refuse"); }}
              className="flex items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-card py-4 text-base font-bold text-destructive shadow-card transition-transform active:scale-95">
              <XCircle size={20} /> Refuser le devis
            </button>
          </div>
        )}

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck size={13} /> Espace client sécurisé · {c.name}
        </div>
      </main>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent data-testid="public-confirm-modal" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-extrabold text-petrol">
              {confirm === "accept" ? "Confirmer l'acceptation" : "Confirmer le refus"}
            </DialogTitle>
            <DialogDescription className="sr-only">Confirmez votre décision concernant ce devis</DialogDescription>
          </DialogHeader>
          <p className="-mt-2 text-sm text-muted-foreground">
            {confirm === "accept"
              ? `Vous êtes sur le point d'accepter le devis ${q.numero} (${euro(t.total_ttc)} TTC).`
              : "Vous pouvez indiquer la raison du refus (facultatif)."}
          </p>
          {confirm === "refuse" && (
            <Textarea data-testid="public-refuse-comment" value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Commentaire (facultatif)" className="min-h-[110px] text-sm" />
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <button onClick={() => setConfirm(null)}
              className="rounded-xl border border-petrol/15 px-4 py-3 text-sm font-semibold text-petrol">Annuler</button>
            <button data-testid="public-confirm-decision" onClick={decide} disabled={busy}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white disabled:opacity-60 ${
                confirm === "accept" ? "bg-emerald-accepted" : "bg-destructive"}`}>
              {busy ? <Loader2 className="animate-spin" size={16} /> : (confirm === "accept" ? <CheckCircle2 size={16} /> : <XCircle size={16} />)}
              Confirmer
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Center = ({ children }) => (
  <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">{children}</div>
);
