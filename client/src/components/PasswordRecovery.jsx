import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import api from "../lib/api.js";
import { useAuth } from "../hooks/useAuth.jsx";

export default function PasswordRecovery({ mode }) {
  const location = useLocation();
  const { logout } = useAuth();
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get("token") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const resetting = mode === "reset";
  useEffect(() => {
    // Drop the bearer token from browser history after reading it into memory.
    if (resetting && location.hash && typeof window !== "undefined") window.history.replaceState(window.history.state,"",window.location.pathname+window.location.search);
  }, [resetting, location.hash]);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError(""); setSuccess("");
    if (resetting && password !== confirmPassword) { setError("Les deux mots de passe doivent être identiques."); return; }
    if (resetting && new TextEncoder().encode(password).length > 72) { setError("Le mot de passe est trop long (72 octets maximum)."); return; }
    setBusy(true);
    try {
      const { data } = await api.post(resetting ? "/auth/reset-password" : "/auth/forgot-password", resetting ? { token, password, confirmPassword } : { email });
      setSuccess(data.message);
      if (resetting) { setPassword(""); setConfirmPassword(""); logout(); }
    } catch (e) { setError(e.response?.data?.message || "Service inaccessible. Réessayez."); }
    finally { setBusy(false); }
  }
  if (resetting && !/^[a-f0-9]{64}$/.test(token)) return <div className="space-y-4"><p role="alert" className="text-sm text-red-600">Lien de récupération absent ou invalide. Demandez un nouveau lien.</p><Link to="/forgot-password" className="btn-primary w-full">Demander un lien</Link><Link to="/login" className="btn-secondary w-full">Revenir à la connexion</Link></div>;
  return <div className="space-y-4">
    {!success && <form onSubmit={submit} className="space-y-4">
      {resetting ? <>
        <div><label className="field-label" htmlFor="new-password">Nouveau mot de passe</label><input id="new-password" className="field-input" type={visible ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={72} required disabled={busy} value={password} onChange={e => setPassword(e.target.value)} /><p className="mt-1 text-xs text-slate-500">Au moins huit caractères. Choisissez un mot de passe unique.</p></div>
        <div><label className="field-label" htmlFor="confirm-password">Confirmer le mot de passe</label><input id="confirm-password" className="field-input" type={visible ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={72} required disabled={busy} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm text-slate-500"><input type="checkbox" checked={visible} disabled={busy} onChange={e => setVisible(e.target.checked)} />Afficher les mots de passe</label>
      </> : <div><label className="field-label" htmlFor="recovery-email">Email de votre compte</label><input id="recovery-email" className="field-input" type="email" autoComplete="email" maxLength={254} required disabled={busy} placeholder="vous@agence.ca" value={email} onChange={e => setEmail(e.target.value)} /></div>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Traitement…" : resetting ? "Enregistrer mon nouveau mot de passe" : "Recevoir le lien de réinitialisation"}</button>
    </form>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {success && <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-teal-700">{success}</p>}
    {resetting && error && <Link to="/forgot-password" className="text-sm text-brand-600 hover:underline">Demander un nouveau lien</Link>}
    <Link to="/login" className="btn-secondary w-full">Revenir à la connexion</Link>
    {resetting && <p className="text-xs leading-5 text-slate-500">Vos anciennes sessions seront déconnectées. Votre application d’authentification et vos codes de secours restent nécessaires.</p>}
  </div>;
}
