import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { transformWithEsbuild } from "vite";

const client = fileURLToPath(new URL("../", import.meta.url));
const scratch = await mkdtemp(
  path.join(client, "node_modules", ".modal-test-"),
);
const source = await readFile(
  path.join(client, "src/components/Modal.jsx"),
  "utf8",
);
await writeFile(
  path.join(scratch, "modal.mjs"),
  (
    await transformWithEsbuild(source, "Modal.jsx", {
      loader: "jsx",
      jsx: "automatic",
    })
  ).code,
);
const { default: Modal } = await import(
  pathToFileURL(path.join(scratch, "modal.mjs"))
);
const dom = new JSDOM(
  '<!doctype html><html><body><button id="trigger">Ajouter</button><div id="root"></div></body></html>',
  { pretendToBeVisual: true },
);
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.getClientRects = function () {
  return [{ width: 100, height: 30 }];
};
let root;
function Harness({ saving = false }) {
  const [open, setOpen] = useState(true);
  return React.createElement(
    Modal,
    {
      isOpen: open,
      title: "Client",
      closeDisabled: saving,
      onClose: () => setOpen(false),
    },
    React.createElement("button", { id: "last" }, "Enregistrer"),
  );
}
async function mount(saving = false) {
  if (root) await act(async () => root.unmount());
  document.getElementById("trigger").focus();
  root = createRoot(document.getElementById("root"));
  await act(async () => root.render(React.createElement(Harness, { saving })));
}
async function key(key, shiftKey = false) {
  await act(async () =>
    document.activeElement.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key,
        shiftKey,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
}

test("Modal traps Tab/Shift+Tab, closes on Escape and restores focus and scroll", async () => {
  await mount();
  assert.equal(document.activeElement.getAttribute("role"), "dialog");
  assert.equal(document.body.style.overflow, "hidden");
  await key("Tab");
  assert.equal(document.activeElement.textContent, "Fermer");
  await key("Tab", true);
  assert.equal(document.activeElement.id, "last");
  await key("Tab");
  assert.equal(document.activeElement.textContent, "Fermer");
  await key("Escape");
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement.id, "trigger");
  assert.equal(document.body.style.overflow, "");
});

test("Modal cannot be dismissed while its save is pending", async () => {
  await mount(true);
  await key("Escape");
  assert.ok(document.querySelector('[role="dialog"]'));
  assert.equal(document.querySelector('[role="dialog"] button').disabled, true);
});

after(async () => {
  if (root) await act(async () => root.unmount());
  dom.window.close();
  await rm(scratch, { recursive: true, force: true });
});
