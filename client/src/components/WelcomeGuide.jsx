import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PRODUCT_NAME } from "../../../shared/brand.mjs";
import { useAuth } from "../hooks/useAuth.jsx";
import Modal from "./Modal.jsx";

export default function WelcomeGuide() {
  const { user, dismissWelcomeGuide } = useAuth();
  const navigate = useNavigate();
  const busy = useRef(false);
  const contentRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const dialog = contentRef.current?.closest('[role="dialog"]');
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const controls = () => Array.from(dialog.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]'));
    controls()[0]?.focus();
    function handleKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        finish();
      }
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0];
      const last = items.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
    dialog.addEventListener("keydown", handleKey);
    return () => {
      dialog.removeEventListener("keydown", handleKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [user?.needsWelcomeGuide, closed]);

  async function finish(discover = false) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      await dismissWelcomeGuide();
      setClosed(true);
      if (discover) navigate("/guide");
    } catch {
      setError("Votre choix n’a pas pu être enregistré. Vérifiez votre connexion puis réessayez.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={Boolean(user?.needsWelcomeGuide) && !closed} title={`Bienvenue sur ${PRODUCT_NAME}`} onClose={() => finish()} closeDisabled={saving}>
      <div ref={contentRef} className="space-y-5">
        <p className="text-sm leading-relaxed text-slate-600">
          Prenez vos repères avec un guide simple : retrouvez vos clients, suivez vos échanges et gérez vos documents commerciaux, étape par étape.
        </p>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Les conseils sont adaptés à votre rôle. Vous pourrez retrouver le guide à tout moment grâce au bouton « Guide » en haut de votre espace.
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-primary" disabled={saving} onClick={() => finish(true)}>{saving ? "Enregistrement…" : "Découvrir le guide"}</button>
          <button type="button" className="btn-secondary" disabled={saving} onClick={() => finish()}>Plus tard</button>
        </div>
      </div>
    </Modal>
  );
}
