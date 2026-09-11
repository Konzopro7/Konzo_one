import {
  Building2,
  CreditCard,
  BellRing,
  Mail,
  Save,
  Upload,
  Check,
  FileText,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "react-router-dom";
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
  stripeEnabled: false,
};

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const defaultLogoSrc = `${import.meta.env.BASE_URL}logo.svg`;
  const [tab, setTab] = useState("identity");
  const [emailKind, setEmailKind] = useState("quote");
  const [emailView, setEmailView] = useState("preview");
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState(false);
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
          stripeEnabled: Boolean(data.stripeEnabled),
        });
      })
      .catch(() => {
        setLoadError(true);
        toast.error("Impossible de charger les paramètres.");
      })
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
      setDirty(true);
      toast.success("Logo importé.");
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
        quoteFollowupDays: Number(form.quoteFollowupDays),
        invoiceDueDaysBefore: Number(form.invoiceDueDaysBefore),
        logoUrl: form.logoUrl || null,
      };
      const { data } = await api.put("/settings", payload);
      setForm((prev) => ({
        ...prev,
        ...data,
        logoUrl: data.logoUrl || "",
        stripeEnabled: Boolean(data.stripeEnabled),
      }));
      setDirty(false);
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

  if (loadError)
    return (
      <section className="card">
        <h2 className="font-semibold">Paramètres indisponibles</h2>
        <p className="mt-2 text-sm text-slate-500">
          La connexion n’a pas abouti. Rechargez la page pour réessayer.
        </p>
        <button
          className="btn-secondary mt-4"
          onClick={() => window.location.reload()}
        >
          Réessayer
        </button>
      </section>
    );
  const tabs = [
    ["identity", "Identité", Building2],
    ["billing", "Facturation", CreditCard],
    ["reminders", "Relances", BellRing],
    ["emails", "Emails", Mail],
  ];
  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };
  const field = (key, label, type = "text", extra = {}) => (
    <div>
      <label htmlFor={key} className="field-label">
        {label}
      </label>
      <input
        id={key}
        className="field-input"
        type={type}
        value={form[key] ?? ""}
        onChange={(event) => update(key, event.target.value)}
        disabled={!isAdmin || saving}
        {...extra}
      />
    </div>
  );
  const emailLabels = {
    quote: "Devis",
    invoice: "Facture",
    reminder: "Relance",
  };
  const escapeHtml = (value) =>
    String(value || "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  const replacements = {
    agencyName: form.agencyName,
    clientName: "Camille Martin",
    documentNumber: "DEV-2026-001",
    total: "1 250,00 $ CAD",
    portalUrl: "Lien vers le portail client",
  };
  const preview = String(form[emailKind + "EmailBody"] || "").replace(
    /{{(\w+)}}/g,
    (match, key) => escapeHtml(replacements[key] ?? match),
  );
  const previewDoc = `<!doctype html><html lang="fr"><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; form-action 'none'; base-uri 'none'"><style>body{font:14px/1.8 system-ui,sans-serif;color:#334155;padding:20px;margin:0;overflow-wrap:anywhere}a{color:#0f766e}p{margin:0 0 16px}</style></head><body>${preview}</body></html>`;
  return (
    <div className="settings-page">
      <div
        className="settings-tabs"
        role="tablist"
        aria-label="Catégories de paramètres"
      >
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            id={`tab-${id}`}
            type="button"
            role="tab"
            tabIndex={tab === id ? 0 : -1}
            onKeyDown={(event) => {
              const index = tabs.findIndex((item) => item[0] === id);
              const nextIndex =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index - 1 + tabs.length) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (nextIndex !== null) {
                event.preventDefault();
                setTab(tabs[nextIndex][0]);
                document.getElementById(`tab-${tabs[nextIndex][0]}`)?.focus();
              }
            }}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(id)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>
      {!isAdmin && (
        <p className="mb-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Vous consultez les paramètres en lecture seule. Un administrateur peut
          les modifier.
        </p>
      )}
      <form onSubmit={handleSubmit} className="settings-grid">
        <section
          className="card settings-editor"
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
        >
          {tab === "identity" && (
            <>
              <div className="section-intro">
                <span className="section-icon">
                  <Building2 size={20} />
                </span>
                <div>
                  <h2>Identité de l’agence</h2>
                  <p>Votre marque, sur chaque document et chaque échange.</p>
                </div>
              </div>
              <div className="logo-upload">
                <img
                  src={form.logoUrl || defaultLogoSrc}
                  alt="Logo de votre agence"
                />
                <div>
                  <label
                    className={`btn-secondary gap-2 cursor-pointer ${!isAdmin || uploadingLogo ? "opacity-50" : ""}`}
                  >
                    <Upload size={15} />
                    {uploadingLogo ? "Import en cours…" : "Importer un logo"}
                    <input
                      type="file"
                      className="sr-only"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={handleLogoUpload}
                      disabled={!isAdmin || uploadingLogo}
                    />
                  </label>
                  <p className="mt-2 text-xs text-slate-500">
                    PNG, JPG, WebP ou SVG · 5 Mo maximum
                  </p>
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {field("agencyName", "Nom de l’agence", "text", {
                  required: true,
                })}
                {field("agencyEmail", "Email professionnel", "email", {
                  required: true,
                })}
                {field("agencyPhone", "Téléphone", "tel", {
                  placeholder: "+1 (514) 000-0000",
                })}
                {field("logoUrl", "Lien du logo (facultatif)", "url", {
                  placeholder: "https://…",
                })}
              </div>
              <p className="mt-6 border-t border-slate-100 pt-5 text-xs leading-6 text-slate-500">
                Ces coordonnées apparaissent sur vos devis, factures et dans le
                portail de vos clients.
              </p>
            </>
          )}
          {tab === "billing" && (
            <>
              <div className="section-intro">
                <span className="section-icon">
                  <CreditCard size={20} />
                </span>
                <div>
                  <h2>Préférences de facturation</h2>
                  <p>Des conditions claires pour vos clients.</p>
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {field("currency", "Devise de facturation", "text", {
                  disabled: true,
                })}
                {field("paymentTerms", "Conditions de paiement", "text", {
                  required: true,
                })}
              </div>
              <div className="integration-row">
                <span className="stripe-wordmark">stripe</span>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900">
                    Paiements en ligne
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Encaissez vos factures depuis le portail client.
                  </p>
                </div>
                <span
                  className={`connection-pill ${form.stripeEnabled ? "connected" : ""}`}
                >
                  {form.stripeEnabled ? "Clé configurée" : "À configurer"}
                </span>
              </div>
              <p className="text-xs leading-6 text-slate-500">
                {form.stripeEnabled
                  ? "Une clé Stripe est renseignée. La disponibilité des paiements dépend de la configuration du compte."
                  : "Contactez votre administrateur pour activer les paiements en ligne."}
              </p>
              <Link
                to="/billing"
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-teal-700"
              >
                Gérer l’abonnement de l’agence <ArrowUpRight size={16} />
              </Link>
            </>
          )}
          {tab === "reminders" && (
            <>
              <div className="section-intro">
                <span className="section-icon">
                  <BellRing size={20} />
                </span>
                <div>
                  <h2>Gardez le contact, automatiquement</h2>
                  <p>Choisissez le bon moment pour relancer vos clients.</p>
                </div>
              </div>
              <div className="reminder-toggle">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Relances automatiques
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Préférence de votre agence pour les devis et factures.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.reminderEnabled}
                  aria-label="Activer les relances automatiques"
                  disabled={!isAdmin}
                  className={`toggle ${form.reminderEnabled ? "on" : ""}`}
                  onClick={() =>
                    update("reminderEnabled", !form.reminderEnabled)
                  }
                >
                  <span />
                </button>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {field(
                  "quoteFollowupDays",
                  "Relancer un devis après (jours)",
                  "number",
                  { min: 1, max: 60, required: true },
                )}
                {field(
                  "invoiceDueDaysBefore",
                  "Rappeler avant échéance (jours)",
                  "number",
                  { min: 1, max: 30, required: true },
                )}
              </div>
              <div className="mt-6 rounded-xl bg-teal-50 p-4 text-sm leading-6 text-teal-900">
                Les textes de relance se personnalisent dans l’onglet Emails.
                L’envoi nécessite aussi que le service de relances soit activé.
              </div>
            </>
          )}
          {tab === "emails" && (
            <>
              <div className="section-intro">
                <span className="section-icon">
                  <Mail size={20} />
                </span>
                <div>
                  <h2>Des emails à votre image</h2>
                  <p>
                    Personnalisez vos messages et vérifiez leur présentation.
                  </p>
                </div>
              </div>
              <div className="email-kind">
                {Object.entries(emailLabels).map(([key, label]) => (
                  <button
                    type="button"
                    key={key}
                    className={emailKind === key ? "selected" : ""}
                    onClick={() => setEmailKind(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {field(emailKind + "EmailSubject", "Objet de l’email")}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <label htmlFor="email-body" className="field-label">
                  Contenu du message
                </label>
                <div className="email-kind compact">
                  <button
                    type="button"
                    className={emailView === "preview" ? "selected" : ""}
                    onClick={() => setEmailView("preview")}
                  >
                    Aperçu
                  </button>
                  <button
                    type="button"
                    className={emailView === "edit" ? "selected" : ""}
                    onClick={() => setEmailView("edit")}
                  >
                    Modifier le HTML
                  </button>
                </div>
              </div>
              {emailView === "edit" ? (
                <textarea
                  id="email-body"
                  className="field-textarea email-code"
                  rows={10}
                  value={form[emailKind + "EmailBody"]}
                  onChange={(event) =>
                    update(emailKind + "EmailBody", event.target.value)
                  }
                  disabled={!isAdmin}
                />
              ) : (
                <div className="email-preview">
                  <div className="email-preview-header">
                    Exemple de présentation · données fictives
                  </div>
                  <iframe
                    title="Aperçu sécurisé du message"
                    sandbox=""
                    srcDoc={previewDoc}
                  />
                </div>
              )}
              <p className="mt-4 text-xs leading-6 text-slate-500">
                Champs personnalisés disponibles :
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.keys(replacements).map((key) => (
                  <code className="variable-chip" key={key}>
                    {"{{" + key + "}}"}
                  </code>
                ))}
              </div>
            </>
          )}
        </section>
        <aside className="settings-preview">
          <div className="flex items-center justify-between">
            <span className="eyebrow">VOTRE IDENTITÉ VISUELLE</span>
            <FileText size={16} className="text-slate-400" />
          </div>
          <div className="document-preview">
            <div className="flex items-center gap-3">
              <img
                src={form.logoUrl || defaultLogoSrc}
                className="h-11 w-11 rounded-lg object-contain"
                alt=""
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">
                  {form.agencyName || "Votre agence"}
                </p>
                <p className="truncate text-[11px] text-slate-500">
                  {form.agencyEmail || "Votre email professionnel"}
                </p>
              </div>
            </div>
            <div className="document-rule" />
            <div className="flex justify-between text-xs">
              <span className="font-bold text-slate-800">DEVIS</span>
              <span className="text-slate-400">Aperçu de mise en page</span>
            </div>
            <div className="document-lines" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <div className="mt-7 border-t border-slate-100 pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Conditions de paiement
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                {form.paymentTerms}
              </p>
            </div>
            <p className="mt-5 text-right text-[10px] text-slate-400">
              Montants en dollars canadiens · CAD
            </p>
          </div>
          <p className="mt-4 text-xs leading-6 text-slate-500">
            Votre logo et vos coordonnées accompagnent chaque document envoyé à
            vos clients.
          </p>
        </aside>
        <div className="settings-savebar" aria-live="polite">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            {dirty ? (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                Modifications non enregistrées
              </>
            ) : (
              <>
                <Check size={15} className="text-teal-600" />
                Paramètres à jour
              </>
            )}
          </p>
          <button
            type="submit"
            className="btn-primary gap-2"
            disabled={saving || uploadingLogo || !isAdmin || !dirty}
          >
            <Save size={16} />
            {saving ? "Enregistrement…" : "Enregistrer les modifications"}
          </button>
        </div>
      </form>
    </div>
  );
}
