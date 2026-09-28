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
export function useTour() { return globalThis.__workspaceTest.tour || {startTour() {}}; }
export const api = {
 get: async path => { if(globalThis.__workspaceTest.failLoad) throw Error('offline'); return {data: path === '/clients' ? globalThis.__workspaceTest.clients : path.startsWith('/clients/') ? globalThis.__workspaceTest.clientDetail : globalThis.__workspaceTest.settings}; },
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
    else if (specifier.endsWith("hooks/useTour.jsx"))
      replacement = `import { useTour } from '${pathToFileURL(mockPath)}';`;
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
const { default: Guide } = await import(
  pathToFileURL(await compile(path.join(root, "src/pages/GuidePage.jsx")))
);
const { default: Welcome } = await import(
  pathToFileURL(await compile(path.join(root, "src/components/WelcomeGuide.jsx")))
);
const { default: Profile } = await import(
  pathToFileURL(await compile(path.join(root, "src/pages/ProfilePage.jsx")))
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

test("contact editor loads the full profile and saves structured optional fields", async () => {
  globalThis.__workspaceTest.clientDetail = {
    id: 1, name: "Alice", email: "alice@example.invalid", company: "Studio Nord", phone: "",
    city: "Montréal", preferredLanguage: "fr-CA", tags: ["PME"], notes: "À conserver"
  };
  const ui = await render(Clients);
  await act(async () => ui.findAllByProps({ title: "Modifier" })[0].props.onClick());
  assert.equal(ui.findByProps({ id: "contact-city" }).props.value, "Montréal");
  act(() => ui.findByProps({ id: "contact-tags" }).props.onChange({ target: { value: "PME, Québec, PME" } }));
  await act(async () => ui.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(globalThis.__workspaceTest.saved.path, "/clients/1");
  assert.deepEqual(globalThis.__workspaceTest.saved.data.tags, ["PME", "Québec"]);
  assert.equal(globalThis.__workspaceTest.saved.data.notes, "À conserver");
});

test("read-only users see client history but no create or edit controls", async () => {
  globalThis.__workspaceTest.auth = { isAdmin: false, isCommercial: false, user: { role: "readonly" } };
  const ui = await render(Clients);
  assert.equal(ui.findAllByProps({ title: "Modifier" }).length, 0);
  assert.equal(ui.findAllByProps({ title: "Historique" }).length, 2);
  assert.ok(!JSON.stringify(view.toJSON()).includes("Ajouter un client"));
});

test("failed client load renders an error rather than an empty customer list", async () => {
  globalThis.__workspaceTest.failLoad = true;
  const ui = await render(Clients);
  assert.equal(ui.findAllByProps({ role: "alert" }).length, 1);
  assert.ok(!JSON.stringify(view.toJSON()).includes("Ajoutez votre premier client"));
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

test("guide adapts its destinations and instructions to the user's permissions", async () => {
  for (const role of ["admin", "commercial", "finance", "readonly"]) {
    if (view) act(() => view.unmount());
    globalThis.__workspaceTest.auth.user.role = role;
    const ui = await render(Guide);
    const links = ui.findAllByType("a").map(item => item.props.href);
    assert.equal(links.includes("/settings"), role === "admin");
    assert.equal(links.includes("/team"), role === "admin");
    assert.equal(links.includes("/pipeline"), ["admin", "commercial"].includes(role));
    assert.ok(links.includes("/clients") && links.includes("/invoices"));
    if (role === "readonly") assert.ok(!JSON.stringify(view.toJSON()).includes("Cliquez sur « Nouveau devis »"));
  }
});

test("welcome is only automatic for new accounts, and a failed save can be retried", async () => {
  let ui = await render(Welcome);
  assert.equal(ui.findAllByProps({ role: "dialog" }).length, 0);
  act(() => view.unmount());
  globalThis.__workspaceTest.auth.user.needsWelcomeGuide = true;
  let attempts = 0;
  globalThis.__workspaceTest.auth.dismissWelcomeGuide = async () => {
    attempts++;
    if (attempts === 1) throw Error("offline");
  };
  ui = await render(Welcome);
  const later = () => ui.findAllByType("button").find(item => item.children.includes("Plus tard"));
  await act(async () => later().props.onClick());
  assert.equal(ui.findAllByProps({ role: "alert" }).length, 1);
  assert.equal(ui.findAllByProps({ role: "dialog" }).length, 1);
  await act(async () => later().props.onClick());
  assert.equal(attempts, 2);
  assert.equal(ui.findAllByProps({ role: "dialog" }).length, 0);
});

test("welcome discovery persists the choice before navigating to the guide", async () => {
  globalThis.__workspaceTest.auth.user.needsWelcomeGuide = true;
  let saved = false;
  globalThis.__workspaceTest.auth.dismissWelcomeGuide = async () => { saved = true; };
  const ui = await render(Welcome);
  await act(async () => ui.findAllByType("button").find(item => item.children.includes("Découvrir le guide")).props.onClick());
  assert.equal(saved, true);
  assert.equal(ui.findAllByProps({ role: "dialog" }).length, 0);
});

test("profile saves the display name and photo for read-only users without touching their role", async () => {
  globalThis.__workspaceTest.auth.isAdmin = false;
  globalThis.__workspaceTest.auth.user = { fullName: "Camille", role: "readonly", email: "camille@example.invalid", avatarUrl: "https://example.invalid/photo.png" };
  let submitted;
  globalThis.__workspaceTest.auth.updateProfile = async payload => { submitted = payload; return payload; };
  const ui = await render(Profile);
  assert.equal(ui.findAllByType("a").length, 0);
  assert.equal(ui.findByProps({ id: "profile-email" }).props.readOnly, true);
  act(() => ui.findByProps({ id: "profile-name" }).props.onChange({ target: { value: "Camille Martin" } }));
  await act(async () => ui.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.deepEqual(submitted, { fullName: "Camille Martin", avatarUrl: "https://example.invalid/photo.png" });
  assert.equal(ui.findAllByProps({ role: "status" }).length, 1);
});

test("profile can remove an image and retains edits after a server error", async () => {
  globalThis.__workspaceTest.auth.user.avatarUrl = "https://example.invalid/photo.png";
  globalThis.__workspaceTest.auth.updateProfile = async () => { throw Error("offline"); };
  const ui = await render(Profile);
  act(() => ui.findAllByType("button").find(item => item.children.includes("Retirer l’image")).props.onClick());
  await act(async () => ui.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(ui.findAllByType("img").length, 0);
  assert.equal(ui.findAllByProps({ role: "alert" }).length, 1);
  assert.equal(ui.findByProps({ type: "submit" }).props.disabled, false);
});

test("profile upload preview uses the existing uploader and rejects oversized images", async () => {
  const ui = await render(Profile);
  const input = ui.findByProps({ "aria-label": "Photo ou logo du profil" });
  await act(async () => input.props.onChange({ target: { files: [{ type: "image/png", size: 10 }], value: "photo.png" } }));
  assert.equal(ui.findByType("img").props.src, "/uploads/test.png");
  await act(async () => input.props.onChange({ target: { files: [{ type: "image/png", size: 6 * 1024 * 1024 }], value: "photo.png" } }));
  assert.equal(ui.findAllByProps({ role: "alert" }).length, 1);
  assert.equal(ui.findByType("img").props.src, "/uploads/test.png");
});

test("guide can start the interactive tour and welcome waits for preference persistence", async () => {
  let started = 0;
  globalThis.__workspaceTest.tour = { startTour() { started++; } };
  let ui = await render(Guide);
  act(() => ui.findAllByType("button").find(item => item.children.includes("Lancer la visite interactive")).props.onClick());
  assert.equal(started, 1);
  act(() => view.unmount());
  globalThis.__workspaceTest.auth.user.needsWelcomeGuide = true;
  let saves = 0;
  globalThis.__workspaceTest.auth.dismissWelcomeGuide = async () => { if (++saves === 1) throw Error("offline"); };
  ui = await render(Welcome);
  const start = () => ui.findAllByType("button").find(item => item.children.includes("Me guider dans le CRM"));
  await act(async () => start().props.onClick());
  assert.equal(started, 1);
  assert.equal(ui.findAllByProps({ role: "alert" }).length, 1);
  await act(async () => start().props.onClick());
  assert.equal(started, 2);
});
