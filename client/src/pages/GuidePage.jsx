import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";
import { gettingStartedSteps, guideQuestions } from "../lib/gettingStarted.js";
import { useTour } from "../hooks/useTour.jsx";

export default function GuidePage() {
  const { user } = useAuth();
  const { startTour } = useTour();
  const steps = gettingStartedSteps(user?.role || "readonly");
  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <h2 className="font-heading text-lg font-semibold text-slate-900">Votre premier parcours dans le CRM</h2>
        <p className="text-sm leading-relaxed text-slate-600">Suivez les étapes à votre rythme. Chaque bouton ouvre le module correspondant ; il ne crée aucune donnée et n’envoie aucun message.</p>
        <p className="text-sm font-semibold text-brand-500">Prospect → Client → Devis → Facture → Paiement</p>
        <div className="space-y-2">
          <button type="button" className="btn-primary" onClick={startTour}>Lancer la visite interactive</button>
          <p className="text-xs text-slate-500">Des repères sur les vrais boutons, étape par étape. Vous pouvez quitter à tout moment.</p>
        </div>
        <Link to="/dashboard" className="btn-secondary">Revenir au tableau de bord</Link>
      </section>
      <ol className="grid gap-5 md:grid-cols-2">
        {steps.map((step, index) => (
          <li key={step.path} className="card flex flex-col items-start gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Étape {index + 1}</p>
            <h2 className="font-heading text-lg font-semibold text-slate-900">{step.title}</h2>
            <p className="text-sm leading-relaxed text-slate-600">{step.description}</p>
            <p className="text-sm text-slate-500">À retenir : {step.check}</p>
            <Link to={step.path} className="btn-primary mt-auto">{step.action}</Link>
          </li>
        ))}
      </ol>
      <section className="card space-y-4">
        <h2 className="font-heading text-lg font-semibold text-slate-900">Questions fréquentes</h2>
        {guideQuestions.map((item) => (
          <details key={item.question} className="rounded-xl border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">{item.question}</summary>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.answer}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
