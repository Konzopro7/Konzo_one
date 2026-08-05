import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCcw, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/api.js";
import { formatCurrency, formatDate } from "../lib/format.js";
import Modal from "../components/Modal.jsx";
import { useAuth } from "../hooks/useAuth.jsx";

const initialProspect = {
  name: "",
  company: "",
  email: "",
  phone: "",
  source: "Site web",
  status: "new",
  notes: ""
};

const initialOpportunity = {
  prospectId: "",
  clientId: "",
  title: "",
  stage: "lead",
  value: 0,
  probability: 25,
  expectedCloseDate: "",
  notes: ""
};

const prospectStatuses = [
  ["new", "Nouveau"],
  ["qualified", "Qualifié"],
  ["converted", "Converti"],
  ["lost", "Perdu"]
];

const stages = [
  ["lead", "Lead"],
  ["discovery", "Découverte"],
  ["proposal", "Proposition"],
  ["won", "Gagné"],
  ["lost", "Perdu"]
];

export default function PipelinePage() {
  const { isAdmin, isCommercial } = useAuth();
  const canWrite = isAdmin || isCommercial;
  const [prospects, setProspects] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [prospectModalOpen, setProspectModalOpen] = useState(false);
  const [opportunityModalOpen, setOpportunityModalOpen] = useState(false);
  const [prospectForm, setProspectForm] = useState(initialProspect);
  const [opportunityForm, setOpportunityForm] = useState(initialOpportunity);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    const [prospectsRes, opportunitiesRes, clientsRes] = await Promise.all([
      api.get("/pipeline/prospects"),
      api.get("/pipeline/opportunities"),
      api.get("/clients")
    ]);
    setProspects(prospectsRes.data);
    setOpportunities(opportunitiesRes.data);
    setClients(clientsRes.data);
  }

  useEffect(() => {
    let active = true;
    loadData()
      .catch(() => toast.error("Impossible de charger le pipeline."))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const open = opportunities.filter((item) => !["won", "lost"].includes(item.stage));
    const weighted = open.reduce(
      (sum, item) => sum + Number(item.value || 0) * (Number(item.probability || 0) / 100),
      0
    );
    return {
      prospects: prospects.length,
      openOpportunities: open.length,
      pipelineValue: open.reduce((sum, item) => sum + Number(item.value || 0), 0),
      weighted
    };
  }, [opportunities, prospects]);

  async function saveProspect(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post("/pipeline/prospects", prospectForm);
      toast.success("Prospect ajouté.");
      setProspectForm(initialProspect);
      setProspectModalOpen(false);
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || "Création impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function saveOpportunity(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post("/pipeline/opportunities", {
        ...opportunityForm,
        prospectId: opportunityForm.prospectId || null,
        clientId: opportunityForm.clientId || null,
        expectedCloseDate: opportunityForm.expectedCloseDate || null
      });
      toast.success("Opportunité ajoutée.");
      setOpportunityForm(initialOpportunity);
      setOpportunityModalOpen(false);
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || "Création impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function convertProspect(prospectId) {
    try {
      await api.post(`/pipeline/prospects/${prospectId}/convert-to-client`);
      toast.success("Prospect converti en client.");
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || "Conversion impossible.");
    }
  }

  async function deleteProspect(prospectId) {
    if (!window.confirm("Supprimer ce prospect ?")) return;
    try {
      await api.delete(`/pipeline/prospects/${prospectId}`);
      setProspects((prev) => prev.filter((item) => item.id !== prospectId));
    } catch (error) {
      toast.error(error.response?.data?.message || "Suppression impossible.");
    }
  }

  if (loading) {
    return (
      <section className="card">
        <p className="text-sm text-slate-500">Chargement du pipeline...</p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="card">
          <p className="text-sm text-slate-500">Prospects</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-slate-900">{metrics.prospects}</p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Opportunités ouvertes</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-slate-900">
            {metrics.openOpportunities}
          </p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Valeur pipeline</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-brand-600">
            {formatCurrency(metrics.pipelineValue)}
          </p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Prévision pondérée</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-emerald-700">
            {formatCurrency(metrics.weighted)}
          </p>
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="card overflow-hidden">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold text-slate-900">Prospects</h2>
            {canWrite ? (
              <button className="btn-primary gap-2" type="button" onClick={() => setProspectModalOpen(true)}>
                <Plus size={14} />
                Prospect
              </button>
            ) : null}
          </div>
          <div className="space-y-2">
            {prospects.map((prospect) => (
              <div key={prospect.id} className="rounded-xl border border-slate-200 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{prospect.name}</p>
                    <p className="text-xs text-slate-500">{prospect.company || prospect.email || "Sans société"}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                    {prospect.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {prospect.source || "Source inconnue"} · {formatDate(prospect.createdAt)}
                </p>
                {canWrite && prospect.status !== "converted" ? (
                  <div className="mt-3 flex gap-2">
                    <button className="btn-secondary gap-2" type="button" onClick={() => convertProspect(prospect.id)}>
                      <RefreshCcw size={13} />
                      Convertir
                    </button>
                    {isAdmin ? (
                      <button className="btn-secondary gap-2" type="button" onClick={() => deleteProspect(prospect.id)}>
                        <Trash2 size={13} />
                        Supprimer
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </article>

        <article className="card overflow-hidden">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold text-slate-900">Opportunités</h2>
            {canWrite ? (
              <button className="btn-primary gap-2" type="button" onClick={() => setOpportunityModalOpen(true)}>
                <Plus size={14} />
                Opportunité
              </button>
            ) : null}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {stages.map(([stage, label]) => (
              <div key={stage} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <div className="space-y-2">
                  {opportunities
                    .filter((item) => item.stage === stage)
                    .map((item) => (
                      <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="font-semibold text-slate-900">{item.title}</p>
                        <p className="text-xs text-slate-500">
                          {(item.client || item.prospect)?.name || "Sans contact"}
                        </p>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="font-semibold text-brand-600">{formatCurrency(item.value)}</span>
                          <span className="text-slate-500">{item.probability}%</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <Modal isOpen={prospectModalOpen} title="Ajouter un prospect" onClose={() => setProspectModalOpen(false)}>
        <form onSubmit={saveProspect} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="field-input" placeholder="Nom" value={prospectForm.name} onChange={(e) => setProspectForm((p) => ({ ...p, name: e.target.value }))} required />
            <input className="field-input" placeholder="Société" value={prospectForm.company} onChange={(e) => setProspectForm((p) => ({ ...p, company: e.target.value }))} />
            <input className="field-input" type="email" placeholder="Email" value={prospectForm.email} onChange={(e) => setProspectForm((p) => ({ ...p, email: e.target.value }))} />
            <input className="field-input" placeholder="Téléphone" value={prospectForm.phone} onChange={(e) => setProspectForm((p) => ({ ...p, phone: e.target.value }))} />
            <input className="field-input" placeholder="Source" value={prospectForm.source} onChange={(e) => setProspectForm((p) => ({ ...p, source: e.target.value }))} />
            <select className="field-input" value={prospectForm.status} onChange={(e) => setProspectForm((p) => ({ ...p, status: e.target.value }))}>
              {prospectStatuses.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <textarea className="field-textarea" rows={3} placeholder="Notes" value={prospectForm.notes} onChange={(e) => setProspectForm((p) => ({ ...p, notes: e.target.value }))} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setProspectModalOpen(false)}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={saving}>Enregistrer</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={opportunityModalOpen} title="Ajouter une opportunité" onClose={() => setOpportunityModalOpen(false)}>
        <form onSubmit={saveOpportunity} className="space-y-4">
          <input className="field-input" placeholder="Titre" value={opportunityForm.title} onChange={(e) => setOpportunityForm((p) => ({ ...p, title: e.target.value }))} required />
          <div className="grid gap-3 sm:grid-cols-2">
            <select className="field-input" value={opportunityForm.prospectId} onChange={(e) => setOpportunityForm((p) => ({ ...p, prospectId: e.target.value, clientId: "" }))}>
              <option value="">Prospect lié</option>
              {prospects.map((prospect) => <option key={prospect.id} value={prospect.id}>{prospect.name}</option>)}
            </select>
            <select className="field-input" value={opportunityForm.clientId} onChange={(e) => setOpportunityForm((p) => ({ ...p, clientId: e.target.value, prospectId: "" }))}>
              <option value="">Client lié</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
            <select className="field-input" value={opportunityForm.stage} onChange={(e) => setOpportunityForm((p) => ({ ...p, stage: e.target.value }))}>
              {stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input type="date" className="field-input" value={opportunityForm.expectedCloseDate} onChange={(e) => setOpportunityForm((p) => ({ ...p, expectedCloseDate: e.target.value }))} />
            <input type="number" min="0" step="0.01" className="field-input" value={opportunityForm.value} onChange={(e) => setOpportunityForm((p) => ({ ...p, value: Number(e.target.value || 0) }))} />
            <input type="number" min="0" max="100" className="field-input" value={opportunityForm.probability} onChange={(e) => setOpportunityForm((p) => ({ ...p, probability: Number(e.target.value || 0) }))} />
          </div>
          <textarea className="field-textarea" rows={3} placeholder="Notes" value={opportunityForm.notes} onChange={(e) => setOpportunityForm((p) => ({ ...p, notes: e.target.value }))} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpportunityModalOpen(false)}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={saving}>Enregistrer</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
