import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { analyticsPage } from "../src/lib/analytics.js";

test("analytics allowlist excludes all CRM, password-recovery and private portal URLs",()=>{
  for(const path of ["/dashboard","/platform","/clients","/invoices","/forgot-password","/reset-password","/portal/quotes/private-token","/login?email=private"]){assert.equal(analyticsPage(path),null);}
  assert.equal(analyticsPage("/pricing").title,"Tarification");
  assert.equal(analyticsPage("__proto__"),null);
});
test("analytics frame never loads Google before valid consented public-page messages and drops extra fields",async()=>{
  const html=await readFile(new URL("../public/analytics-frame.html",import.meta.url),"utf8");
  const dom=new JSDOM(html,{url:"http://localhost/konzotech-one/analytics-frame.html",runScripts:"outside-only"});
  const {window}=dom;
  try{
    window.eval(window.document.querySelector("script").textContent);
    assert.equal(window.document.querySelectorAll("script[src]").length,0);
    function send(data,origin=window.location.origin){window.dispatchEvent(new window.MessageEvent("message",{data,origin,source:window}));}
    send({type:"ga4-page",measurementId:"G-ABCDEF1234",path:"/portal/invoices/private-token"});
    send({type:"ga4-page",measurementId:"G-ABCDEF1234",path:"/login"},"https://evil.example");
    assert.equal(window.document.querySelectorAll("script[src]").length,0);
    send({type:"ga4-page",measurementId:"G-ABCDEF1234",path:"/login",title:"PRIVATE-TITLE",email:"PRIVATE-EMAIL",token:"PRIVATE-TOKEN"});
    assert.equal(window.document.querySelectorAll("script[src]").length,1);
    const commands=window.dataLayer.map(args=>Array.from(args));
    assert.equal(commands.find(args=>args[0]==="config")[2].send_page_view,false);
    const view=commands.find(args=>args[0]==="event");
    assert.equal(view[2].page_location,"http://localhost/konzotech-one/login");
    assert.equal(view[2].page_referrer,"");
    assert.ok(!JSON.stringify(commands).includes("PRIVATE"));
    send({type:"ga4-page",measurementId:"G-ABCDEF1234",path:"/login"});
    assert.equal(window.dataLayer.filter(args=>args[0]==="event").length,1);
    send({type:"ga4-page",measurementId:"G-ABCDEF1234",path:"/pricing"});
    assert.equal(window.dataLayer.filter(args=>args[0]==="event").length,2);
  }finally{window.close();}
});
