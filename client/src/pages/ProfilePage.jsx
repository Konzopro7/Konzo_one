import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Upload, Save } from "lucide-react";
import { useAuth } from "../hooks/useAuth.jsx";
import { uploadFile } from "../lib/uploads.js";
import UserAvatar from "../components/UserAvatar.jsx";

const roles = { admin: "Administrateur", commercial: "Commercial", finance: "Finance", readonly: "Lecture seule" };

export default function ProfilePage() {
  const { user, isAdmin, updateProfile } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const busy = useRef(false);
  const dirty = fullName !== (user?.fullName || "") || avatarUrl !== (user?.avatarUrl || "");

  async function handleUpload(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file || busy.current) return;
    setSuccess("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("Choisissez une image PNG, JPG ou WebP de 5 Mo maximum.");
      input.value = "";
      return;
    }
    busy.current = true;
    setUploading(true);
    setError("");
    try {
      const result = await uploadFile(file, "avatar");
      setAvatarUrl(result.url);
    } catch (failure) {
      setError(failure.response?.data?.message || "Impossible d’importer l’image. Réessayez.");
    } finally {
      busy.current = false;
      setUploading(false);
      input.value = "";
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy.current || !dirty) return;
    if (fullName.trim().length < 2) { setError("Indiquez un nom d’au moins deux caractères."); return; }
    busy.current = true;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await updateProfile({ fullName: fullName.trim(), avatarUrl: avatarUrl || null });
      setFullName(result.fullName);
      setAvatarUrl(result.avatarUrl || "");
      setSuccess("Votre profil a été enregistré.");
    } catch (failure) {
      setError(failure.response?.data?.message || "Impossible d’enregistrer le profil. Réessayez.");
    } finally { busy.current = false; setSaving(false); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <form onSubmit={handleSubmit} className="card space-y-6">
        <div>
          <h2 className="font-heading text-lg font-semibold text-slate-900">Mon profil</h2>
          <p className="mt-1 text-sm text-slate-500">Personnalisez votre nom et votre photo ou logo dans votre espace CRM.</p>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <UserAvatar name={fullName} src={avatarUrl} large />
          <div className="space-y-2">
            <label className={`btn-secondary gap-2 cursor-pointer ${uploading || saving ? "opacity-50" : ""}`}>
              <Upload size={16} aria-hidden="true" />
              {uploading ? "Import en cours…" : "Importer une photo ou un logo"}
              <input type="file" aria-label="Photo ou logo du profil" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={uploading || saving} onChange={handleUpload} />
            </label>
            <p className="text-xs text-slate-500">PNG, JPG ou WebP · 5 Mo maximum</p>
            <p className="text-xs text-slate-500">Enregistrez votre profil après l’import ou le retrait d’une image.</p>
            {avatarUrl && <button type="button" className="btn-secondary" disabled={uploading || saving} onClick={() => { setAvatarUrl(""); setSuccess(""); }}>Retirer l’image</button>}
          </div>
        </div>
        <div>
          <label htmlFor="profile-name" className="field-label">Nom affiché</label>
          <input id="profile-name" className="field-input" value={fullName} onChange={event => { setFullName(event.target.value); setSuccess(""); }} minLength={2} maxLength={120} required autoComplete="name" disabled={saving || uploading} />
        </div>
        <div>
          <label htmlFor="profile-email" className="field-label">Email de connexion</label>
          <input id="profile-email" className="field-input" type="email" value={user?.email || ""} readOnly />
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {success && <p role="status" className="text-sm text-teal-700">{success}</p>}
        <button className="btn-primary gap-2" type="submit" disabled={saving || uploading || !dirty}><Save size={16} aria-hidden="true" />{saving ? "Enregistrement…" : "Enregistrer mon profil"}</button>
      </form>
      <aside className="card space-y-4 self-start">
        <h2 className="font-heading text-lg font-semibold text-slate-900">Votre espace de travail</h2>
        <p className="break-words text-sm font-semibold text-slate-700">{user?.agencyName}</p>
        <p className="text-sm text-slate-500">Rôle : {roles[user?.role] || user?.role}</p>
        <p className="text-sm leading-relaxed text-slate-600">Votre image de profil apparaît dans le CRM. Le logo de l’entreprise utilisé sur les devis et factures se règle séparément dans les paramètres.</p>
        {isAdmin && <Link to="/settings" className="btn-secondary">Personnaliser le logo de l’entreprise</Link>}
      </aside>
    </div>
  );
}
