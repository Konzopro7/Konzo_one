import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "../lib/api.js";
import { uploadFile } from "../lib/uploads.js";
import { useAuth } from "../hooks/useAuth.jsx";

const initialSettings = {
  logoUrl: "",
  agencyName: "Konzotech Agency",
  agencyEmail: "",
  agencyPhone: "",
  paymentTerms: "Paiement sous 15 jours.",
  currency: "CAD",
  reminderEnabled: true,
  quoteFollowupDays: 5,
  invoiceDueDaysBefore: 3,
  quoteEmailSubject: "Votre devis {{documentNumber}} - {{agencyName}}",
  quoteEmailBody:
    "<p>Bonjour {{clientName}},</p><p>Votre devis {{documentNumber}} est disponible.</p><p>{{portalUrl}}</p>",
  invoiceEmailSubject: "Votre facture {{documentNumber}} - {{agencyName}}",
  invoiceEmailBody:
    "<p>Bonjour {{clientName}},</p><p>Votre facture {{documentNumber}} est disponible.</p><p>{{portalUrl}}</p>",
  reminderEmailSubject: "Rappel {{documentNumber}} - {{agencyName}}",
  reminderEmailBody:
    "<p>Bonjour {{clientName}},</p><p>Ceci est un rappel concernant {{documentNumber}}.</p>",
  stripeEnabled: false
};

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const defaultLogoSrc = `${import.meta.env.BASE_URL}logo.svg`;
  const [form, setForm] = useState(initialSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get("/settings")
      .then(({ data }) => {
        if (!active) return;
        setForm({
          ...initialSettings,
          ...data,
          logoUrl: data.logoUrl || "",
          currency: "CAD",
          reminderEnabled: Boolean(data.reminderEnabled),
          quoteFollowupDays: Number(data.quoteFollowupDays || 5),
          invoiceDueDaysBefore: Number(data.invoiceDueDaysBefore || 3),
          stripeEnabled: Boolean(data.stripeEnabled)
        });
      })
      .catch(() => toast.error("Impossible de charger les paramètres."))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleLogoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const uploaded = await uploadFile(file, "logo");
      setForm((prev) => ({ ...prev, logoUrl: uploaded.url }));
      toast.success("Logo uploadé.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Upload impossible.");
    } finally {
      setUploadingLogo(false);
      event.target.value = "";
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isAdmin) {
      toast.error("Seuls les admins peuvent modifier ces paramètres.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        logoUrl: form.logoUrl || null
      };
      const { data } = await api.put("/settings", payload);
      setForm((prev) => ({
        ...prev,
        ...data,
        logoUrl: data.logoUrl || "",
        stripeEnabled: Boolean(data.stripeEnabled)
      }));
      toast.success("Paramètres enregistrés.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Sauvegarde impossible.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="card">
        <p className="text-sm text-slate-500">Chargement des paramètres...</p>
      </section>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.45fr_0.9fr]">
      <section className="card">
        <h2 className="font-heading text-xl font-semibold text-slate-900">Paramètres agence</h2>
        <p className="mt-1 text-sm text-slate-500">
          Infos de marque, facturation, Stripe, relances et templates email.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-800">Identité</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="field-label">Logo</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700"
                  onChange={handleLogoUpload}
                  disabled={!isAdmin || uploadingLogo}
                />
                <input
                  type="url"
                  className="field-input mt-2"
                  placeholder="https://..."
                  value={form.logoUrl}
                  onChange={(event) => setForm((prev) => ({ ...prev, logoUrl: event.target.value }))}
                  disabled={!isAdmin}
                />
              </div>
              <div>
                <label className="field-label">Nom de l'agence</label>
                <input
                  className="field-input"
                  value={form.agencyName}
                  onChange={(event) => setForm((prev) => ({ ...prev, agencyName: event.target.value }))}
                  required
                  disabled={!isAdmin}
                />
              </div>
              <div>
                <label className="field-label">Email agence</label>
                <input
                  type="email"
                  className="field-input"
                  value={form.agencyEmail}
                  onChange={(event) => setForm((prev) => ({ ...prev, agencyEmail: event.target.value }))}
                  required
                  disabled={!isAdmin}
                />
              </div>
              <div>
                <label className="field-label">Téléphone</label>
                <input
                  className="field-input"
                  value={form.agencyPhone || ""}
                  onChange={(event) => setForm((prev) => ({ ...prev, agencyPhone: event.target.value }))}
                  disabled={!isAdmin}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Devise par défaut</label>
              <input
                className="field-input uppercase"
                maxLength={3}
                value={form.currency}
                onChange={() => setForm((prev) => ({ ...prev, currency: "CAD" }))}
                required
                disabled
              />
            </div>
            <div>
              <label className="field-label">Conditions de paiement</label>
              <input
                className="field-input"
                value={form.paymentTerms}
                onChange={(event) => setForm((prev) => ({ ...prev, paymentTerms: event.target.value }))}
                required
                disabled={!isAdmin}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-800">Relances automatiques</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.reminderEnabled}
                  onChange={(event) => setForm((prev) => ({ ...prev, reminderEnabled: event.target.checked }))}
                  disabled={!isAdmin}
                />
                Activer les relances automatiques
              </label>
              <div>
                <label className="field-label">Relance devis après (jours)</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  className="field-input"
                  value={form.quoteFollowupDays}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, quoteFollowupDays: Number(event.target.value || 5) }))
                  }
                  disabled={!isAdmin}
                />
              </div>
              <div>
                <label className="field-label">Relance facture avant échéance (jours)</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  className="field-input"
                  value={form.invoiceDueDaysBefore}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, invoiceDueDaysBefore: Number(event.target.value || 3) }))
                  }
                  disabled={!isAdmin}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-slate-800">Templates email</p>
            <p className="mb-3 text-xs text-slate-500">
              Variables disponibles: {"{{agencyName}}"}, {"{{clientName}}"}, {"{{documentNumber}}"}, {"{{total}}"}, {"{{portalUrl}}"}.
            </p>
            <div className="space-y-4">
              <div>
                <label className="field-label">Sujet devis</label>
                <input
                  className="field-input"
                  value={form.quoteEmailSubject}
                  onChange={(event) => setForm((prev) => ({ ...prev, quoteEmailSubject: event.target.value }))}
                  disabled={!isAdmin}
                />
                <textarea
                  className="field-textarea mt-2"
                  rows={4}
                  value={form.quoteEmailBody}
                  onChange={(event) => setForm((prev) => ({ ...prev, quoteEmailBody: event.target.value }))}
                  disabled={!isAdmin}
                />
              </div>
              <div>
                <label className="field-label">Sujet facture</label>
                <input
                  className="field-input"
                  value={form.invoiceEmailSubject}
                  onChange={(event) => setForm((prev) => ({ ...prev, invoiceEmailSubject: event.target.value }))}
                  disabled={!isAdmin}
                />
                <textarea
                  className="field-textarea mt-2"
                  rows={4}
                  value={form.invoiceEmailBody}
                  onChange={(event) => setForm((prev) => ({ ...prev, invoiceEmailBody: event.target.value }))}
                  disabled={!isAdmin}
                />
              </div>
              <div>
                <label className="field-label">Sujet relance</label>
                <input
                  className="field-input"
                  value={form.reminderEmailSubject}
                  onChange={(event) => setForm((prev) => ({ ...prev, reminderEmailSubject: event.target.value }))}
                  disabled={!isAdmin}
                />
                <textarea
                  className="field-textarea mt-2"
                  rows={4}
                  value={form.reminderEmailBody}
                  onChange={(event) => setForm((prev) => ({ ...prev, reminderEmailBody: event.target.value }))}
                  disabled={!isAdmin}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={saving || !isAdmin}>
              {saving ? "Enregistrement..." : "Sauvegarder"}
            </button>
          </div>
        </form>
      </section>

      <aside className="card h-fit space-y-4">
        <div>
          <h3 className="font-heading text-lg font-semibold text-slate-900">Aperçu document</h3>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-brand-500 to-brand-700 p-5 text-white">
            <div className="mb-4 flex items-center gap-3">
              <img
                src={form.logoUrl || defaultLogoSrc}
                alt="Logo agence"
                width="48"
                height="48"
                className="h-12 w-12 rounded-xl border border-white/25 bg-white/10 object-contain"
              />
              <div>
                <p className="font-heading text-sm">{form.agencyName || "Konzotech Agency"}</p>
                <p className="text-xs text-blue-100">{form.agencyEmail || "contact@..."}</p>
              </div>
            </div>
            <div className="rounded-xl border border-white/25 bg-white/10 p-3 text-xs text-blue-50">
              <p className="font-semibold text-white">Conditions de paiement</p>
              <p className="mt-1 leading-relaxed">{form.paymentTerms}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Intégrations paiement</p>
          <p className="mt-2 text-sm text-slate-600">
            Stripe:{" "}
            <span className={form.stripeEnabled ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
              {form.stripeEnabled ? "Configuré" : "Non configuré"}
            </span>
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Configurez `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` dans `server/.env`.
          </p>
        </div>
      </aside>
    </div>
  );
}
