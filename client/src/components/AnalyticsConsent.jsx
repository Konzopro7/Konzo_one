import { useEffect,useRef,useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../lib/api.js";
import { analyticsPage,clearAnalyticsCookies } from "../lib/analytics.js";

const consentKey="kz_analytics_consent";
export default function AnalyticsConsent(){
  const location=useLocation(),iframe=useRef(null);
  const [config,setConfig]=useState(null),[consent,setConsent]=useState(()=>{try{return localStorage.getItem(consentKey);}catch{return null;}}),[editing,setEditing]=useState(false),[ready,setReady]=useState(false);
  const page=analyticsPage(location.pathname);
  useEffect(()=>{let active=true;api.get("/analytics/config").then(({data})=>{if(active)setConfig(data);}).catch(()=>{});return()=>{active=false;};},[]);
  useEffect(()=>{const listener=event=>{if(event.origin===window.location.origin&&event.source===iframe.current?.contentWindow&&event.data?.type==="ga4-ready")setReady(true);};window.addEventListener("message",listener);return()=>window.removeEventListener("message",listener);},[]);
  useEffect(()=>{if(ready&&page&&consent==="accepted"&&config?.enabled)iframe.current?.contentWindow.postMessage({type:"ga4-page",measurementId:config.measurementId,path:page.path,title:page.title},window.location.origin);},[ready,location.pathname,consent,config]);
  useEffect(()=>{if(!page||consent!=="accepted")setReady(false);},[location.pathname,consent]);
  function choose(value){try{localStorage.setItem(consentKey,value);}catch{}setConsent(value);setEditing(false);if(value!=="accepted")clearAnalyticsCookies(document,import.meta.env.BASE_URL||"/");}
  if(!page||!config?.enabled||!/^G-[A-Z0-9]{6,20}$/.test(config.measurementId||""))return null;
  return <>
    {consent==="accepted"&&<iframe ref={iframe} src={`${import.meta.env.BASE_URL}analytics-frame.html`} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" title="Mesure d’audience consentie" aria-hidden="true" className="hidden"/>}
    {(!consent||editing)?<section aria-label="Préférences de mesure d’audience" className="card fixed bottom-4 left-4 right-4 z-40 sm:left-auto sm:max-w-md shadow-panel"><h2 className="font-heading font-semibold">Mesure d’audience</h2><p className="mt-2 text-sm text-slate-500">Avec votre accord, Google Analytics mesure la fréquentation des pages publiques. Vous pouvez refuser et utiliser le CRM normalement.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={()=>choose("refused")}>Refuser</button><button type="button" className="btn-primary" onClick={()=>choose("accepted")}>Accepter</button></div></section>:<button type="button" className="btn-secondary fixed bottom-4 right-4 z-40 text-xs" onClick={()=>setEditing(true)}>Préférences d’audience</button>}
  </>;
}
