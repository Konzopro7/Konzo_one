import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, MousePointer2, X } from "lucide-react";
import { tourPosition } from "../lib/productTour.js";

export default function ProductTour({ steps, index, onStep, onClose }) {
  const step = steps[index];
  const navigate = useNavigate();
  const location = useLocation();
  const id = useId();
  const cardRef = useRef(null);
  const targetRef = useRef(null);
  const previousFocus = useRef(null);
  const [rect, setRect] = useState(null);
  const [missing, setMissing] = useState(false);
  const [retry, setRetry] = useState(0);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [cardHeight, setCardHeight] = useState(310);

  useEffect(() => {
    previousFocus.current = document.activeElement;
    // Prevent keyboard access to business actions while presenting the tour.
    const app = document.getElementById("root");
    const alreadyInert = app?.inert;
    const previousOverflow = document.body.style.overflow;
    if (app) app.inert = true;
    document.body.style.overflow = "hidden";
    return () => {
      if (app) app.inert = alreadyInert;
      document.body.style.overflow = previousOverflow;
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    };
  }, []);

  useEffect(() => {
    setRect(null);
    setMissing(false);
    targetRef.current = null;
    if (location.pathname !== step.route) {
      navigate(step.route);
      return;
    }
    let frame;
    let scrolled = false;
    let observer;
    const measure = () => {
      frame = null;
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      const element = document.querySelector(`[data-tour="${step.target}"]`);
      if (!element || element.getBoundingClientRect().width === 0) return;
      targetRef.current = element;
      if (!scrolled) {
        scrolled = true;
        element.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
        observer.observe(element);
      }
      const box = element.getBoundingClientRect();
      setRect({ left: Math.max(4, box.left - 6), top: Math.max(4, box.top - 6), right: Math.min(window.innerWidth - 4, box.right + 6), bottom: Math.min(window.innerHeight - 4, box.bottom + 6) });
      setMissing(false);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    observer = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
    // Observe the app only: tooltip changes must not cause a measurement loop.
    mutations.observe(document.getElementById("root"), { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    const timeout = setTimeout(() => { if (!targetRef.current) setMissing(true); }, 6500);
    measure();
    return () => {
      clearTimeout(timeout);
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [step.route, step.target, location.pathname, retry, navigate]);

  useEffect(() => {
    cardRef.current?.focus();
    const observer = new ResizeObserver(() => setCardHeight(cardRef.current?.scrollHeight || 310));
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [index]);

  function handleKeys(event) {
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    if (event.key !== "Tab") return;
    const controls = Array.from(cardRef.current.querySelectorAll("button:not(:disabled)"));
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  function useTarget() {
    const target = targetRef.current;
    if (!target || !step.action || target.disabled || target.dataset.tour !== step.target || location.pathname !== step.route) return;
    onClose();
    // Wait for the inert overlay to be removed before opening the real form.
    requestAnimationFrame(() => { target.focus(); target.click(); });
  }

  const position = tourPosition(rect, viewport, cardHeight);
  const hole = rect && { x: rect.left, y: rect.top, width: Math.max(0, rect.right - rect.left), height: Math.max(0, rect.bottom - rect.top) };
  return createPortal(
    <div className="fixed inset-0 z-[80]" aria-label="Visite guidée du CRM">
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs><mask id={id}><rect width="100%" height="100%" fill="white" />{hole && <rect {...hole} rx="12" fill="black" />}</mask></defs>
        <rect width="100%" height="100%" fill="rgba(15,23,42,0.58)" mask={`url(#${id})`} />
        {hole && <rect {...hole} rx="12" fill="none" stroke="#2EC4B6" strokeWidth="3" />}
      </svg>
      {rect && <span aria-hidden="true" className="fixed h-3 w-3 rotate-45 border-slate-200 bg-white" style={{ left: position.left + Math.max(20, Math.min(position.width - 28, (rect.left + rect.right) / 2 - position.left)), top: position.placement === "above" ? position.top + Math.min(cardHeight, position.maxHeight) - 6 : position.top - 6 }} />}
      <section ref={cardRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} tabIndex={-1} onKeyDown={handleKeys} className="card fixed overflow-y-auto outline-none" style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-brand-500"><MousePointer2 size={16} aria-hidden="true" />VISITE GUIDÉE · {index + 1}/{steps.length}</p>
          <button type="button" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Quitter la visite"><X size={18} /></button>
        </div>
        <div className="mb-4 h-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full bg-brand-500" style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div>
        <h2 id={`${id}-title`} className="font-heading text-lg font-semibold text-slate-900">{step.title}</h2>
        <p id={`${id}-body`} className="mt-3 text-sm leading-relaxed text-slate-600">{step.text}</p>
        {!rect && <p role="status" className="mt-3 text-xs text-slate-500">{missing ? "L’élément n’est pas disponible. Vous pouvez réessayer ou passer à l’étape suivante." : "Ouverture de la page et repérage du bouton…"}</p>}
        {missing && <button type="button" className="btn-secondary mt-3" onClick={() => setRetry(value => value + 1)}>Réessayer</button>}
        {step.action && rect && <button type="button" className="btn-secondary mt-4 w-full" onClick={useTarget}>{step.action}</button>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="btn-secondary gap-1" disabled={index === 0} onClick={() => onStep(index - 1)}><ArrowLeft size={15} />Précédent</button>
          <button type="button" className="btn-primary gap-1" onClick={() => index === steps.length - 1 ? onClose() : onStep(index + 1)}>{index === steps.length - 1 ? "Terminer" : "Suivant"}<ArrowRight size={15} /></button>
        </div>
        <button type="button" className="mt-4 text-xs font-medium text-slate-500 underline" onClick={onClose}>Quitter et continuer seul</button>
      </section>
    </div>, document.body
  );
}
