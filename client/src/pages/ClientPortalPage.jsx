import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import { Link, useParams } from "react-router-dom";
import api from "../lib/api.js";
import { formatCurrency, formatDate } from "../lib/format.js";
import StatusBadge from "../components/StatusBadge.jsx";

export default function ClientPortalPage() {
  const { type, token } = useParams();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const normalizedType = type === "quotes" ? "quotes" : "invoices";
  const currentDoc = payload?.quote || payload?.invoice || null;
  const isQuote = normalizedType === "quotes";
  const title = isQuote ? currentDoc?.quoteNumber : currentDoc?.invoiceNumber;
  const items = currentDoc?.items || [];
  const agency = payload?.agency || {};

  useEffect(() => {
    let active = true;
    api
      .get(`/portal/${normalizedType}/${token}`)
      .then(({ data }) => {
        if (active) setPayload(data);
      })
      .catch(() => toast.error("Document introuvable."))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [normalizedType, token]);

  const paymentToken = useMemo(() => {
    if (isQuote) return null;
    return currentDoc?.token || token;
  }, [currentDoc, isQuote, token]);

  async function downloadPdf() {
    try {
      const response = await api.get(`/portal/${normalizedType}/${token}/pdf`, {
        responseType: "blob"
      });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${title || "document"}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Téléchargement impossible.");
    }
  }

  async function acceptQuote() {
    setProcessing(true);
    try {
      const { data } = await api.post(`/portal/quotes/${token}/accept`);
      toast.success(`Devis accepté. Facture ${data.invoiceNumber} prête.`);
      window.location.assign(`/portal/invoices/${data.invoiceToken}`);
    } catch (error) {
      toast.error(error.response?.data?.message || "Acceptation impossible.");
    } finally {
      setProcessing(false);
    }
  }

  async function payInvoice() {
    setProcessing(true);
    try {
      const { data } = await api.post(`/payments/public/${paymentToken}/checkout-session`);
      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Paiement indisponible.");
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <section className="card">
          <p className="text-sm text-slate-500">Chargement du portail...</p>
        </section>
      </div>
    );
  }

  if (!currentDoc) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <section className="card text-center">
          <h1 className="font-heading text-xl font-semibold text-slate-900">Document introuvable</h1>
          <Link className="btn-primary mt-4" to="/pricing">Retour</Link>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <main className="mx-auto max-w-4xl space-y-5">
        <section className="card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {agency.logoUrl ? (
                <img src={agency.logoUrl} alt={agency.name} className="h-12 w-12 rounded-xl object-contain" />
              ) : null}
              <div>
                <p className="font-heading text-lg font-semibold text-slate-900">{agency.name}</p>
                <p className="text-sm text-slate-500">{agency.email || "contact"}</p>
              </div>
            </div>
            <StatusBadge status={currentDoc.status} />
          </div>
        </section>

        <section className="card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">{isQuote ? "Devis" : "Facture"}</p>
              <h1 className="font-heading text-3xl font-semibold text-slate-900">{title}</h1>
              <p className="mt-2 text-sm text-slate-500">
                Client: {currentDoc.client?.name || "-"} · {currentDoc.client?.company || "Sans société"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500">Total</p>
              <p className="font-heading text-3xl font-semibold text-brand-600">
                {formatCurrency(currentDoc.total)}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Émission</p>
              <p className="font-semibold text-slate-900">{formatDate(currentDoc.issueDate)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{isQuote ? "Validité" : "Échéance"}</p>
              <p className="font-semibold text-slate-900">
                {formatDate(isQuote ? currentDoc.validUntil : currentDoc.dueDate)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Statut</p>
              <p className="font-semibold text-slate-900">{currentDoc.status}</p>
            </div>
          </div>
        </section>

        <section className="card overflow-hidden">
          <h2 className="mb-4 font-heading text-lg font-semibold text-slate-900">Détail</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-3">Description</th>
                  <th className="pb-3">Qté</th>
                  <th className="pb-3 text-right">Prix</th>
                  <th className="pb-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 text-slate-800">{item.description}</td>
                    <td className="py-3 text-slate-600">{item.quantity}</td>
                    <td className="py-3 text-right text-slate-600">{formatCurrency(item.unitPrice)}</td>
                    <td className="py-3 text-right font-semibold text-slate-900">
                      {formatCurrency(item.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary gap-2" onClick={downloadPdf}>
            <Download size={15} />
            Télécharger PDF
          </button>
          {isQuote && currentDoc.status !== "accepted" ? (
            <button type="button" className="btn-primary gap-2" onClick={acceptQuote} disabled={processing}>
              <ExternalLink size={15} />
              {processing ? "Traitement..." : "Accepter le devis"}
            </button>
          ) : null}
          {!isQuote && currentDoc.status !== "paid" ? (
            <button type="button" className="btn-primary gap-2" onClick={payInvoice} disabled={processing}>
              <ExternalLink size={15} />
              {processing ? "Traitement..." : "Payer la facture"}
            </button>
          ) : null}
        </section>
      </main>
    </div>
  );
}
