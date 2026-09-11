import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { act, create } from "react-test-renderer";
import { MemoryRouter } from "react-router-dom";
import { transformWithEsbuild } from "vite";

// Render actual components with an isolated API; never touch an agency or send mail.
const root = fileURLToPath(new URL("../", import.meta.url));
const scratch = await mkdtemp(
  path.join(root, "node_modules", ".workspace-test-"),
);
const mockPath = path.join(scratch, "mocks.mjs");
await writeFile(
  mockPath,
  `
export function useAuth() { return globalThis.__workspaceTest.auth; }
export const api = {
 get: async path => { if(globalThis.__workspaceTest.failLoad) throw Error('offline'); return {data: path === '/clients' ? globalThis.__workspaceTest.clients : globalThis.__workspaceTest.settings}; },
 put: async (path, data) => { globalThis.__workspaceTest.saved = {path, data}; return {data}; }
};
export const toast = { success() {}, error() {} };
export async function uploadFile() { return {url:'/uploads/test.png'}; }
`,
);
const compiled = new Map();
async function compile(file) {
  if (compiled.has(file)) return compiled.get(file);
  const output = path.join(scratch, `${compiled.size}.mjs`);
  compiled.set(file, output);
  let source = await readFile(file, "utf8");
  for (const match of [
    ...source.matchAll(/import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];/g),
  ]) {
    const [statement, bindings, specifier] = match;
    let replacement;
    if (specifier.endsWith("hooks/useAuth.jsx"))
      replacement = `import { useAuth } from '${pathToFileURL(mockPath)}';`;
    else if (specifier.endsWith("lib/api.js"))
      replacement = `import { api } from '${pathToFileURL(mockPath)}';`;
    else if (specifier.endsWith("lib/uploads.js"))
      replacement = `import { uploadFile } from '${pathToFileURL(mockPath)}';`;
    else if (specifier === "react-hot-toast")
      replacement = `import { toast } from '${pathToFileURL(mockPath)}';`;
    else if (specifier.startsWith("."))
      replacement = `import ${bindings} from '${pathToFileURL(await compile(path.resolve(path.dirname(file), specifier)))}';`;
    if (replacement) source = source.replace(statement, replacement);
  }
  source = source.replaceAll(
    "import.meta.env",
    '({ BASE_URL: "/konzotech-one/" })',
  );
  const result = await transformWithEsbuild(source, file, {
    jsx: "automatic",
    loader: file.endsWith("jsx") ? "jsx" : "js",
  });
  await writeFile(output, result.code);
  return output;
}
const { default: Settings } = await import(
  pathToFileURL(await compile(path.join(root, "src/pages/SettingsPage.jsx")))
);
const { default: Clients } = await import(
  pathToFileURL(await compile(path.join(root, "src/pages/ClientsPage.jsx")))
);
const { default: Sidebar } = await import(
  pathToFileURL(await compile(path.join(root, "src/layout/Sidebar.jsx")))
);
const { default: Login } = await import(
  pathToFileURL(await compile(path.join(root, "src/pages/LoginPage.jsx")))
);
const { default: Topbar } = await import(
  pathToFileURL(await compile(path.join(root, "src/layout/Topbar.jsx")))
);
let view;
async function render(Component, props = {}) {
  await act(async () => {
    view = create(
      React.createElement(
        MemoryRouter,
        { future: { v7_startTransition: true, v7_relativeSplatPath: true } },
        React.createElement(Component, props),
      ),
    );
  });
  return view.root;
}
beforeEach(() => {
  if (view) act(() => view.unmount());
  globalThis.__workspaceTest = {
    auth: {
      isAdmin: true,
      user: { fullName: "Test", role: "admin" },
      logout() {},
    },
    settings: {
      agencyName: "Agence test",
      agencyEmail: "test@example.invalid",
      reminderEnabled: true,
    },
    clients: [
      {
        id: 1,
        name: "Alice",
        company: "Studio Nord",
        email: "alice@example.invalid",
      },
      {
        id: 2,
        name: "Bob",
        company: "Atelier Sud",
        email: "bob@example.invalid",
      },
    ],
  };
});
after(async () => {
  if (view) act(() => view.unmount());
  delete globalThis.__workspaceTest;
  assert.equal(path.dirname(scratch), path.join(root, "node_modules"));
  assert.ok(path.basename(scratch).startsWith(".workspace-test-"));
  await rm(scratch, { recursive: true, force: true });
});

test("settings retain edits across tabs and save numeric reminder delays", async () => {
  const ui = await render(Settings);
  act(() =>
    ui
      .findByProps({ id: "agencyName" })
      .props.onChange({ target: { value: "Nouvelle agence" } }),
  );
  act(() => ui.findByProps({ id: "tab-reminders" }).props.onClick());
  act(() =>
    ui
      .findByProps({ id: "quoteFollowupDays" })
      .props.onChange({ target: { value: "7" } }),
  );
  act(() => ui.findByProps({ id: "tab-identity" }).props.onClick());
  assert.equal(
    ui.findByProps({ id: "agencyName" }).props.value,
    "Nouvelle agence",
  );
  await act(async () =>
    ui.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  assert.equal(globalThis.__workspaceTest.saved.data.quoteFollowupDays, 7);
  assert.equal(
    globalThis.__workspaceTest.saved.data.agencyName,
    "Nouvelle agence",
  );
  assert.equal(ui.findByProps({ type: "submit" }).props.disabled, true);
});
test("email preview is sandboxed and edits preserve template variables", async () => {
  const ui = await render(Settings);
  act(() => ui.findByProps({ id: "tab-emails" }).props.onClick());
  assert.equal(ui.findByType("iframe").props.sandbox, "");
  assert.match(ui.findByType("iframe").props.srcDoc, /default-src 'none'/);
  const edit = ui
    .findAllByType("button")
    .find((button) => button.children.includes("Modifier le HTML"));
  act(() => edit.props.onClick());
  const body = "<p>Bonjour {{clientName}}, voici {{documentNumber}}.</p>";
  act(() =>
    ui.findByType("textarea").props.onChange({ target: { value: body } }),
  );
  await act(async () =>
    ui.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  assert.equal(globalThis.__workspaceTest.saved.data.quoteEmailBody, body);
});
test("read-only users cannot edit settings or submit changes", async () => {
  globalThis.__workspaceTest.auth = {
    isAdmin: false,
    user: { role: "readonly" },
  };
  const ui = await render(Settings);
  assert.equal(ui.findByProps({ id: "agencyName" }).props.disabled, true);
  assert.equal(ui.findByProps({ type: "submit" }).props.disabled, true);
  await act(async () =>
    ui.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  assert.equal(globalThis.__workspaceTest.saved, undefined);
});
test("failed settings load does not expose an editable default form", async () => {
  globalThis.__workspaceTest.failLoad = true;
  const ui = await render(Settings);
  assert.equal(ui.findAllByType("form").length, 0);
  assert.match(JSON.stringify(view.toJSON()), /indisponibles/);
});
test("client search filters by company and shows no-match feedback", async () => {
  const ui = await render(Clients);
  const search = ui.findByProps({ "aria-label": "Rechercher un client" });
  act(() => search.props.onChange({ target: { value: "nord" } }));
  assert.equal(ui.findByType("tbody").findAllByType("tr").length, 1);
  assert.match(JSON.stringify(view.toJSON()), /Alice/);
  act(() => search.props.onChange({ target: { value: "not-found" } }));
  assert.equal(ui.findByType("tbody").findAllByType("tr").length, 0);
  assert.match(JSON.stringify(view.toJSON()), /Aucun client ne correspond/);
});
test("sidebar keeps restricted sections hidden for read-only users", async () => {
  globalThis.__workspaceTest.auth = {
    isAdmin: false,
    user: { role: "readonly" },
    logout() {},
  };
  const ui = await render(Sidebar, { open: true, onClose() {} });
  const links = ui.findAllByType("a").map((link) => link.props.href);
  assert.ok(links.includes("/clients"));
  assert.ok(!links.includes("/team"));
  assert.ok(!links.includes("/platform"));
});

test("login submits entered credentials and password visibility toggles", async () => {
  let submitted;
  globalThis.__workspaceTest.auth.login = async (payload) => {
    submitted = payload;
  };
  const ui = await render(Login);
  act(() =>
    ui
      .findByProps({ "aria-label": "Email professionnel" })
      .props.onChange({ target: { value: "test@example.invalid" } }),
  );
  act(() =>
    ui
      .findByProps({ "aria-label": "Mot de passe" })
      .props.onChange({ target: { value: "test-only-password" } }),
  );
  act(() =>
    ui
      .findByProps({ "aria-label": "Afficher le mot de passe" })
      .props.onClick(),
  );
  assert.equal(
    ui.findByProps({ "aria-label": "Mot de passe" }).props.type,
    "text",
  );
  await act(async () =>
    ui.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  assert.deepEqual(submitted, {
    email: "test@example.invalid",
    password: "test-only-password",
  });
});
test("page search presents a real destination and clears after selection", async () => {
  const ui = await render(Topbar, { onOpenSidebar() {} });
  act(() =>
    ui
      .findByProps({ "aria-label": "Rechercher une page" })
      .props.onChange({ target: { value: "Clients" } }),
  );
  const link = ui
    .findAllByType("a")
    .find((item) => item.props.href === "/clients");
  assert.ok(link);
  // Invoke the Link callback without browser navigation in this component test.
  const routeLink = ui.findAll(
    (node) =>
      node.props.to === "/clients" && typeof node.props.onClick === "function",
  )[0];
  act(() => routeLink.props.onClick());
  assert.equal(
    ui.findByProps({ "aria-label": "Rechercher une page" }).props.value,
    "",
  );
});
