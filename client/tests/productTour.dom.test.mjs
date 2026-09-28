import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { transformWithEsbuild } from "vite";

const client = fileURLToPath(new URL("../", import.meta.url));
const scratch = await mkdtemp(path.join(client, "node_modules", ".tour-dom-test-"));
let source = await readFile(path.join(client, "src/components/ProductTour.jsx"), "utf8");
source = source.replace('"../lib/productTour.js"', JSON.stringify(pathToFileURL(path.join(client, "src/lib/productTour.js")).href));
await writeFile(path.join(scratch, "tour.mjs"), (await transformWithEsbuild(source, "ProductTour.jsx", { loader: "jsx", jsx: "automatic" })).code);
const { default: ProductTour } = await import(pathToFileURL(path.join(scratch, "tour.mjs")));
const dom = new JSDOM('<!doctype html><html><body><button id="before">Guide</button><div id="root"></div></body></html>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
dom.window.HTMLElement.prototype.getBoundingClientRect = function () { return { left: 24, top: 90, right: 224, bottom: 130, width: 200, height: 40 }; };

const steps = [
  { route: "/dashboard", target: "heading", title: "Premier repère", text: "Informations sur le tableau de bord." },
  { route: "/clients", target: "create", title: "Créer un client", text: "Bouton de création, sans enregistrement.", action: "Utiliser ce bouton" }
];
let root;
let opened = 0;
function Harness({ tourSteps = steps }) {
  const [index, setIndex] = useState(0);
  const [active, setActive] = useState(true);
  const location = useLocation();
  return React.createElement(React.Fragment, null,
    React.createElement("p", { "data-tour": "heading", id: "route" }, location.pathname),
    location.pathname === "/clients" && React.createElement("button", { "data-tour": "create", onClick: () => opened++ }, "Ajouter un client"),
    active && React.createElement(ProductTour, { steps: tourSteps, index, onStep: setIndex, onClose: () => setActive(false) })
  );
}
async function mount(props) {
  if (root) await act(async () => root.unmount());
  opened = 0;
  document.getElementById("before").focus();
  root = createRoot(document.getElementById("root"));
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: ["/guide"], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(Harness, props))));
}
async function click(text) {
  const button = [...document.querySelectorAll('[role="dialog"] button')].find(node => node.textContent.includes(text));
  assert.ok(button, text);
  await act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 5)); });
}

test("tour navigates to targets, supports previous, and restores focus and interaction on Escape", async () => {
  await mount();
  assert.equal(document.getElementById("route").textContent, "/dashboard");
  assert.equal(document.getElementById("root").inert, true);
  assert.ok(document.querySelector("mask rect[fill='black']"));
  await click("Suivant");
  assert.equal(document.getElementById("route").textContent, "/clients");
  assert.equal(opened, 0);
  await click("Précédent");
  assert.equal(document.getElementById("route").textContent, "/dashboard");
  await act(async () => document.querySelector('[role="dialog"]').dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.notEqual(document.getElementById("root").inert, true);
  assert.equal(document.activeElement.id, "before");
});

test("using a highlighted creation control ends the tour before opening the real form", async () => {
  await mount();
  await click("Suivant");
  await click("Utiliser ce bouton");
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.notEqual(document.getElementById("root").inert, true);
  assert.equal(opened, 1);
});

test("a missing target does not prevent quitting or finishing the tour", async () => {
  await mount({ tourSteps: [{ ...steps[0], target: "unavailable" }] });
  assert.match(document.querySelector('[role="status"]').textContent, /repérage/);
  await click("Terminer");
  assert.equal(document.querySelector('[role="dialog"]'), null);
});

after(async () => {
  if (root) await act(async () => root.unmount());
  dom.window.close();
  assert.equal(path.dirname(scratch), path.join(client, "node_modules"));
  assert.ok(path.basename(scratch).startsWith(".tour-dom-test-"));
  await rm(scratch, { recursive: true, force: true });
});
