import { useEffect, useState } from "react";
import api from "../lib/api.js";
import { useAuth } from "../hooks/useAuth.jsx";

export default function MfaLogin({ challenge, onBack }) {
  const { completeLogin } = useAuth();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [session, setSession] = useState(null);
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!challenge.enrollmentRequired) return;
    let active = true;
    setError("");
    api.post("/auth/mfa/setup", { challengeToken: challenge.challengeToken }).then(({ data }) => {
      if (active) setSetup(data);
    }).catch(e => { if (active) setError(e.response?.data?.message || "Configuration inaccessible. Réessayez."); });
    return () => { active = false; };
  }, [challenge.challengeToken, challenge.enrollmentRequired, retry]);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const { data } = await api.post("/auth/mfa/verify", { challengeToken: challenge.challengeToken, code });
      setCode(""); setSetup(null);
      if (data.recoveryCodes) setSession(data);
      else completeLogin(data);
    } catch (e) { setError(e.response?.data?.message || "Vérification inaccessible. Réessayez."); }
    finally { setBusy(false); }
  }
  function download() {
    const blob = new Blob(["konzoCRM.com — Codes de secours\nConservez ce fichier en lieu sûr. Chaque code ne fonctionne qu’une fois.\n\n" + session.recoveryCodes.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "konzoCRM-codes-de-secours.txt"; link.click();
    URL.revokeObjectURL(url);
  }
  if (session) return <div className="space-y-4">
    <h3 className="font-heading text-xl font-semibold">Conservez vos codes de secours</h3>
    <p className="text-sm text-slate-500">Si vous perdez votre téléphone, ces codes permettent de vous connecter. Chaque code fonctionne une seule fois. Ils ne seront plus affichés.</p>
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">{session.recoveryCodes.map(value => <p className="font-mono text-xs break-all" key={value}>{value}</p>)}</div>
    <button className="btn-secondary w-full" type="button" onClick={download}>Télécharger les codes</button>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />J’ai conservé mes codes dans un endroit sûr.</label>
    <button className="btn-primary w-full" disabled={!saved} onClick={() => completeLogin(session)}>Accéder à mon espace</button>
  </div>;
  return <div className="space-y-4">
    <h3 className="font-heading text-xl font-semibold text-slate-900">{challenge.enrollmentRequired ? "Protégez votre compte" : "Vérifiez votre connexion"}</h3>
    {challenge.enrollmentRequired ? <>
      <p className="text-sm leading-6 text-slate-500">1. Ouvrez Google Authenticator, Microsoft Authenticator ou une application compatible sur votre téléphone.<br />2. Ajoutez un compte et scannez ce QR code.<br />3. Saisissez le code à six chiffres affiché dans l’application.</p>
      {setup ? <div className="rounded-xl border border-slate-200 p-3 text-center">
        <img src={setup.qrCode} alt="QR code pour configurer votre application d’authentification" className="mx-auto w-48 max-w-full" />
        <details className="mt-2 text-sm"><summary className="cursor-pointer">Impossible de scanner ?</summary><p className="mt-2 text-xs text-slate-500">Ajoutez le compte manuellement avec cette clé :</p><code className="block mt-2 break-all text-xs select-all">{setup.secret}</code></details>
      </div> : !error ? <p role="status" className="text-sm text-slate-500">Préparation du QR code…</p> : <button type="button" className="btn-secondary" onClick={() => setRetry(n => n+1)}>Réessayer la configuration</button>}
    </> : <p className="text-sm text-slate-500">{recovery ? "Saisissez un de vos codes de secours conservés lors de l’activation." : "Saisissez le code à six chiffres de votre application d’authentification."}</p>}
    <form onSubmit={submit} className="space-y-4">
      <div><label className="field-label" htmlFor="mfa-code">{recovery ? "Code de secours" : "Code de sécurité"}</label>
        <input id="mfa-code" className="field-input" value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" inputMode={recovery ? "text" : "numeric"} pattern={recovery ? undefined : "[0-9]{6}"} maxLength={recovery ? 48 : 6} required disabled={busy} />
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || (challenge.enrollmentRequired && !setup)}>{busy ? "Vérification…" : "Valider ma connexion"}</button>
    </form>
    {!challenge.enrollmentRequired && <button type="button" className="text-sm text-brand-600 hover:underline" disabled={busy} onClick={() => { setRecovery(v => !v); setCode(""); setError(""); }}>{recovery ? "Utiliser mon application" : "Utiliser un code de secours"}</button>}
    <button type="button" className="btn-secondary w-full" disabled={busy} onClick={onBack}>Revenir à la connexion</button>
  </div>;
}
