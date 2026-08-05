import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Copy,
  MessageCircle,
  Power,
  RefreshCcw,
  Send,
  Settings2
} from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/api.js";
import { formatDate } from "../lib/format.js";
import { useAuth } from "../hooks/useAuth.jsx";

const emptySettings = {
  displayPhoneNumber: "",
  phoneNumberId: "",
  businessAccountId: "",
  accessToken: "",
  accessTokenMasked: "",
  verifyToken: "",
  webhookUrl: "",
  isActive: false,
  autoReplyEnabled: false,
  autoReplyMessage:
    "Bonjour {{contactName}}, merci pour votre message. Nous revenons vers vous rapidement."
};

const emptyTest = {
  contactPhone: "33600000000",
  contactName: "Client test",
  body: "Bonjour, je veux avoir plus d'informations."
};

function compactTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessagesPage() {
  const { isAdmin, isCommercial } = useAuth();
  const canWrite = isAdmin || isCommercial;
  const [settings, setSettings] = useState(emptySettings);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [reply, setReply] = useState("");
  const [testForm, setTestForm] = useState(emptyTest);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [sending, setSending] = useState(false);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedId) || null,
    [conversations, selectedId]
  );

  async function loadConversations(nextSelectedId = selectedId) {
    const { data } = await api.get("/chatbot/conversations");
    setConversations(data);

    const stillExists = data.some((item) => item.id === nextSelectedId);
    if (!nextSelectedId || !stillExists) {
      setSelectedId(data[0]?.id || null);
    }
  }

  async function loadSettings() {
    const { data } = await api.get("/chatbot/settings");
    setSettings({
      ...emptySettings,
      ...data,
      displayPhoneNumber: data.displayPhoneNumber || "",
      phoneNumberId: data.phoneNumberId || "",
      businessAccountId: data.businessAccountId || "",
      accessToken: "",
      accessTokenMasked: data.accessTokenMasked || "",
      verifyToken: data.verifyToken || "",
      webhookUrl: data.webhookUrl || "",
      isActive: Boolean(data.isActive),
      autoReplyEnabled: Boolean(data.autoReplyEnabled)
    });
  }

  async function loadMessages(conversationId) {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    const { data } = await api.get(`/chatbot/conversations/${conversationId}/messages`);
    setMessages(data);
    await loadConversations(conversationId);
  }

  useEffect(() => {
    let active = true;
    Promise.all([loadSettings(), loadConversations()])
      .catch(() => toast.error("Impossible de charger la messagerie."))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    loadMessages(selectedId).catch(() => toast.error("Impossible de charger les messages."));
  }, [selectedId]);

  async function saveSettings(event) {
    event.preventDefault();
    if (!isAdmin) {
      toast.error("Seuls les admins peuvent modifier la connexion WhatsApp.");
      return;
    }

    setSavingSettings(true);
    try {
      const { data } = await api.put("/chatbot/settings", {
        displayPhoneNumber: settings.displayPhoneNumber,
        phoneNumberId: settings.phoneNumberId,
        businessAccountId: settings.businessAccountId,
        accessToken: settings.accessToken || null,
        verifyToken: settings.verifyToken,
        isActive: settings.isActive,
        autoReplyEnabled: settings.autoReplyEnabled,
        autoReplyMessage: settings.autoReplyMessage
      });
      setSettings({
        ...emptySettings,
        ...data,
        accessToken: "",
        accessTokenMasked: data.accessTokenMasked || ""
      });
      toast.success("Connexion WhatsApp enregistree.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Sauvegarde impossible.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function copyText(value, label) {
    try {
      await navigator.clipboard.writeText(value || "");
      toast.success(`${label} copie.`);
    } catch (error) {
      toast.error("Copie impossible.");
    }
  }

  async function sendReply(event) {
    event.preventDefault();
    if (!selectedId || !reply.trim()) return;

    setSending(true);
    try {
      const { data } = await api.post(`/chatbot/conversations/${selectedId}/messages`, {
        body: reply.trim()
      });
      setMessages((prev) => [...prev, data]);
      setReply("");
      await loadConversations(selectedId);
      toast.success(data.status === "simulated" ? "Message ajoute en simulation." : "Message envoye.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Envoi impossible.");
    } finally {
      setSending(false);
    }
  }

  async function createTestMessage(event) {
    event.preventDefault();
    setSending(true);
    try {
      const { data } = await api.post("/chatbot/test-message", testForm);
      await loadConversations(data.conversationId);
      setSelectedId(data.conversationId);
      toast.success("Message entrant ajoute.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Test impossible.");
    } finally {
      setSending(false);
    }
  }

  async function changeConversationStatus(status) {
    if (!selectedId) return;
    try {
      await api.patch(`/chatbot/conversations/${selectedId}/status`, { status });
      await loadConversations(selectedId);
    } catch (error) {
      toast.error(error.response?.data?.message || "Mise a jour impossible.");
    }
  }

  if (loading) {
    return (
      <section className="card">
        <p className="text-sm text-slate-500">Chargement de la messagerie...</p>
      </section>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <aside className="space-y-5">
        <section className="card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-semibold text-slate-900">WhatsApp</h2>
              <p className="mt-1 text-xs text-slate-500">
                {settings.isActive ? "Canal actif" : "Canal inactif"}
              </p>
            </div>
            <span
              className={[
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
                settings.isActive
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              ].join(" ")}
            >
              <Power size={13} />
              {settings.isActive ? "Actif" : "Pause"}
            </span>
          </div>

          <form onSubmit={saveSettings} className="space-y-3">
            <div>
              <label className="field-label">Numero affiche</label>
              <input
                className="field-input"
                value={settings.displayPhoneNumber}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, displayPhoneNumber: event.target.value }))
                }
                disabled={!isAdmin}
                placeholder="+33..."
              />
            </div>
            <div>
              <label className="field-label">Phone number ID</label>
              <input
                className="field-input"
                value={settings.phoneNumberId}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, phoneNumberId: event.target.value }))
                }
                disabled={!isAdmin}
              />
            </div>
            <div>
              <label className="field-label">WhatsApp Business Account ID</label>
              <input
                className="field-input"
                value={settings.businessAccountId}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, businessAccountId: event.target.value }))
                }
                disabled={!isAdmin}
              />
            </div>
            <div>
              <label className="field-label">Access token</label>
              <input
                type="password"
                className="field-input"
                value={settings.accessToken}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, accessToken: event.target.value }))
                }
                disabled={!isAdmin}
                placeholder={settings.accessTokenMasked || "Token permanent Meta"}
              />
            </div>
            <div>
              <label className="field-label">Webhook URL</label>
              <div className="flex gap-2">
                <input className="field-input" value={settings.webhookUrl} readOnly />
                <button
                  type="button"
                  className="btn-secondary px-3"
                  onClick={() => copyText(settings.webhookUrl, "Webhook")}
                >
                  <Copy size={15} />
                </button>
              </div>
            </div>
            <div>
              <label className="field-label">Verify token</label>
              <div className="flex gap-2">
                <input
                  className="field-input"
                  value={settings.verifyToken}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, verifyToken: event.target.value }))
                  }
                  disabled={!isAdmin}
                />
                <button
                  type="button"
                  className="btn-secondary px-3"
                  onClick={() => copyText(settings.verifyToken, "Token")}
                >
                  <Copy size={15} />
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={settings.isActive}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, isActive: event.target.checked }))
                }
                disabled={!isAdmin}
              />
              Activer le canal
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={settings.autoReplyEnabled}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, autoReplyEnabled: event.target.checked }))
                }
                disabled={!isAdmin}
              />
              Reponse automatique
            </label>
            <textarea
              className="field-textarea"
              rows={4}
              value={settings.autoReplyMessage}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, autoReplyMessage: event.target.value }))
              }
              disabled={!isAdmin}
            />
            <button type="submit" className="btn-primary w-full gap-2" disabled={!isAdmin || savingSettings}>
              <Settings2 size={15} />
              {savingSettings ? "Enregistrement..." : "Sauvegarder WhatsApp"}
            </button>
          </form>
        </section>

        <section className="card">
          <div className="mb-3 flex items-center gap-2">
            <Bot size={18} className="text-brand-600" />
            <h2 className="font-heading text-lg font-semibold text-slate-900">Test entrant</h2>
          </div>
          <form onSubmit={createTestMessage} className="space-y-3">
            <input
              className="field-input"
              value={testForm.contactPhone}
              onChange={(event) => setTestForm((prev) => ({ ...prev, contactPhone: event.target.value }))}
              disabled={!canWrite}
              placeholder="Telephone"
            />
            <input
              className="field-input"
              value={testForm.contactName}
              onChange={(event) => setTestForm((prev) => ({ ...prev, contactName: event.target.value }))}
              disabled={!canWrite}
              placeholder="Nom"
            />
            <textarea
              className="field-textarea"
              rows={3}
              value={testForm.body}
              onChange={(event) => setTestForm((prev) => ({ ...prev, body: event.target.value }))}
              disabled={!canWrite}
            />
            <button type="submit" className="btn-secondary w-full gap-2" disabled={!canWrite || sending}>
              <RefreshCcw size={15} />
              Simuler
            </button>
          </form>
        </section>

        <section className="card p-0">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-heading text-lg font-semibold text-slate-900">Conversations</h2>
          </div>
          <div className="max-h-[460px] overflow-y-auto p-2">
            {conversations.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">Aucune conversation.</p>
            ) : (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setSelectedId(conversation.id)}
                  className={[
                    "mb-2 w-full rounded-xl border px-3 py-3 text-left transition",
                    selectedId === conversation.id
                      ? "border-brand-300 bg-brand-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">
                        {conversation.contactName || conversation.contactPhone}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {conversation.lastMessageBody || "Nouveau contact"}
                      </p>
                    </div>
                    {conversation.unreadCount > 0 ? (
                      <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">
                    {formatDate(conversation.lastMessageAt)}
                  </p>
                </button>
              ))
            )}
          </div>
        </section>
      </aside>

      <section className="card flex min-h-[680px] flex-col overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <MessageCircle size={22} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-heading text-lg font-semibold text-slate-900">
                {selectedConversation
                  ? selectedConversation.contactName || selectedConversation.contactPhone
                  : "Messages WhatsApp"}
              </h2>
              <p className="truncate text-sm text-slate-500">
                {selectedConversation?.contactPhone || settings.displayPhoneNumber || "Aucun fil selectionne"}
              </p>
            </div>
          </div>
          {selectedConversation ? (
            <button
              type="button"
              className="btn-secondary gap-2"
              onClick={() =>
                changeConversationStatus(selectedConversation.status === "open" ? "closed" : "open")
              }
              disabled={!canWrite}
            >
              <CheckCircle2 size={15} />
              {selectedConversation.status === "open" ? "Clore" : "Rouvrir"}
            </button>
          ) : null}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-5">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Selectionne ou simule une conversation.
            </div>
          ) : (
            messages.map((message) => {
              const outbound = message.direction === "outbound";
              return (
                <div key={message.id} className={outbound ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={[
                      "max-w-[78%] rounded-2xl px-4 py-3 shadow-sm",
                      outbound
                        ? "rounded-br-md bg-brand-600 text-white"
                        : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                    ].join(" ")}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
                    <div
                      className={[
                        "mt-2 flex items-center justify-end gap-2 text-[11px]",
                        outbound ? "text-blue-100" : "text-slate-400"
                      ].join(" ")}
                    >
                      <span>{compactTime(message.createdAt)}</span>
                      <span>{message.status}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={sendReply} className="border-t border-slate-200 bg-white p-4">
          <div className="flex gap-3">
            <textarea
              className="field-textarea min-h-12 flex-1 resize-none"
              rows={2}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              disabled={!canWrite || !selectedConversation}
              placeholder="Ecrire une reponse..."
            />
            <button
              type="submit"
              className="btn-primary self-end gap-2"
              disabled={!canWrite || !selectedConversation || sending || !reply.trim()}
            >
              <Send size={16} />
              Envoyer
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
