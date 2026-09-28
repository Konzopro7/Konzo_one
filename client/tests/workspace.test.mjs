import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { act, create } from "react-test-renderer";
import { MemoryRouter, Routes, Route } from "react-router-dom";
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
 post: async (path, data) => { globalThis.__workspaceTest.postCount=(globalThis.__workspaceTest.postCount||0)+1; globalThis.__workspaceTest.posted = {path,data}; if(globalThis.__workspaceTest.failPost) throw {response:{data:{message:globalThis.__workspaceTest.postError || 'Code refusé'}}}; return {data: path.endsWith('/setup') ? {secret:'FIXTURE',qrCode:'data:image/png;base64,fixture'} : path.includes('password') ? {message:'Demande traitée'} : globalThis.__workspaceTest.mfaSession}; },
 get: async (path, options) => { globalThis.__workspaceTest.lastGet={path,options}; if(globalThis.__workspaceTest.failLoad) throw Error('offline'); return {data: globalThis.__workspaceTest.responses?.[path] ?? (path === '/clients' ? globalThis.__workspaceTest.clients : path.startsWith('/clients/') ? globalThis.__workspaceTest.clientDetail : globalThis.__workspaceTest.settings)}; },
 patch: async (path,data) => {globalThis.__workspaceTest.patched={path,data}; if(globalThis.__workspaceTest.failPatch) throw {response:{data:{message:'Modification refusée'}}}; return {data:{ok:true}};},
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
const { default: Newsletter } = await import(
  pathToFileURL(await compile(path.join(root, "src/components/NewsletterSection.jsx")))
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
  pathToFileURL(
    await compile(path.join(root, "src/components/WelcomeGuide.jsx")),
  )
);
const { default: Profile } = await import(
  pathToFileURL(await compile(path.join(root, "src/pages/ProfilePage.jsx")))
);
const { default: MfaLogin } = await import(
  pathToFileURL(await compile(path.join(root, "src/components/MfaLogin.jsx")))
);
const { default: PasswordRecovery } = await import(
  pathToFileURL(
    await compile(path.join(root, "src/components/PasswordRecovery.jsx")),
  )
);
const { default: AdminWorkspaces } = await import(
  pathToFileURL(
    await compile(path.join(root, "src/components/AdminWorkspaces.jsx")),
  )
);
const { default: AnalyticsConsent } = await import(
  pathToFileURL(
    await compile(path.join(root, "src/components/AnalyticsConsent.jsx")),
  )
);
const { default: GoogleAnalyticsPanel } = await import(
  pathToFileURL(
    await compile(path.join(root, "src/components/GoogleAnalyticsPanel.jsx")),
  )
);
const { default: Billing } = await import(
  pathToFileURL(await compile(path.join(root, "src/pages/BillingPage.jsx")))
);
const { default: Quotes } = await import(
  pathToFileURL(await compile(path.join(root, "src/pages/QuotesPage.jsx")))
);
const { default: Invoices } = await import(
  pathToFileURL(await compile(path.join(root, "src/pages/InvoicesPage.jsx")))
);
const { default: Portal } = await import(
  pathToFileURL(
    await compile(path.join(root, "src/pages/ClientPortalPage.jsx")),
  )
);

test("billing cancellation opens the dedicated confirmation flow and recovers from server errors", async () => {
  globalThis.__workspaceTest.responses = {
    "/billing/status": {
      subscription: {
        subscriptionStatus: "active",
        stripeCustomerId: "cus_fixture",
        stripeSubscriptionId: "sub_fixture",
      },
    },
  };
  globalThis.__workspaceTest.failPost = true;
  const ui = await render(Billing);
  const cancel = () =>
    ui
      .findAllByType("button")
      .find((b) => b.children.includes("Annuler mon abonnement"));
  assert.ok(cancel());
  await act(async () => cancel().props.onClick());
  assert.deepEqual(globalThis.__workspaceTest.posted, {
    path: "/billing/portal-session",
    data: { action: "cancel" },
  });
  assert.equal(cancel().props.disabled, false);
});

test("billing cancellation is hidden for employees, ended subscriptions and free trials without Stripe", async () => {
  for (const [isAdmin, subscription] of [
    [
      false,
      {
        subscriptionStatus: "active",
        stripeCustomerId: "cus_fixture",
        stripeSubscriptionId: "sub_fixture",
      },
    ],
    [
      true,
      {
        subscriptionStatus: "canceled",
        stripeCustomerId: "cus_fixture",
        stripeSubscriptionId: "sub_fixture",
      },
    ],
    [true, { subscriptionStatus: "trial" }],
  ]) {
    globalThis.__workspaceTest.auth.isAdmin = isAdmin;
    globalThis.__workspaceTest.responses = {
      "/billing/status": { subscription },
    };
    const ui = await render(Billing);
    assert.equal(
      ui
        .findAllByType("button")
        .some((b) => b.children.includes("Annuler mon abonnement")),
      false,
    );
    act(() => view.unmount());
  }
});
let view;
async function render(Component, props = {}, initialEntries = ["/"]) {
  await act(async () => {
    view = create(
      React.createElement(
        MemoryRouter,
        {
          initialEntries,
          future: { v7_startTransition: true, v7_relativeSplatPath: true },
        },
        Component === Portal
          ? React.createElement(
              Routes,
              null,
              React.createElement(Route, {
                path: "/portal/:type/:token",
                element: React.createElement(Component, props),
              }),
            )
          : React.createElement(Component, props),
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

test("MFA enrollment verifies the code and waits for recovery-code acknowledgement before signing in", async () => {
  let signedIn = 0;
  globalThis.__workspaceTest.auth.completeLogin = (data) => {
    assert.equal(data.token, "fixture-access");
    signedIn++;
  };
  globalThis.__workspaceTest.mfaSession = {
    token: "fixture-access",
    user: {},
    recoveryCodes: ["ABCD-EFGH"],
  };
  const root = await render(MfaLogin, {
    challenge: {
      challengeToken: "fixture-challenge",
      enrollmentRequired: true,
    },
    onBack() {},
  });
  assert.equal(globalThis.__workspaceTest.posted.path, "/auth/mfa/setup");
  assert.ok(root.findByType("img").props.src.startsWith("data:image/png"));
  await act(async () =>
    root
      .findByProps({ id: "mfa-code" })
      .props.onChange({ target: { value: "123456" } }),
  );
  await act(async () =>
    root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  assert.equal(globalThis.__workspaceTest.posted.data.code, "123456");
  assert.equal(signedIn, 0);
  const enter = () =>
    root
      .findAllByType("button")
      .find((button) => button.props.children === "Accéder à mon espace");
  assert.equal(enter().props.disabled, true);
  await act(async () =>
    root
      .findByProps({ type: "checkbox" })
      .props.onChange({ target: { checked: true } }),
  );
  assert.equal(enter().props.disabled, false);
  await act(async () => enter().props.onClick());
  assert.equal(signedIn, 1);
});

test("MFA failures preserve the login stage and recovery codes can complete a normal login", async () => {
  let signedIn = 0;
  globalThis.__workspaceTest.auth.completeLogin = () => signedIn++;
  globalThis.__workspaceTest.failPost = true;
  const root = await render(MfaLogin, {
    challenge: { challengeToken: "fixture", enrollmentRequired: false },
    onBack() {},
  });
  await act(async () =>
    root
      .findByProps({ id: "mfa-code" })
      .props.onChange({ target: { value: "123456" } }),
  );
  await act(async () =>
    root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  assert.equal(
    root.findByProps({ role: "alert" }).props.children,
    "Code refusé",
  );
  assert.equal(signedIn, 0);
  await act(async () =>
    root
      .findAllByType("button")
      .find((b) => b.props.children === "Utiliser un code de secours")
      .props.onClick(),
  );
  assert.equal(root.findByProps({ id: "mfa-code" }).props.inputMode, "text");
  globalThis.__workspaceTest.failPost = false;
  globalThis.__workspaceTest.mfaSession = { token: "fixture", user: {} };
  await act(async () =>
    root
      .findByProps({ id: "mfa-code" })
      .props.onChange({ target: { value: "ABCD-EFGH" } }),
  );
  await act(async () =>
    root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  assert.equal(signedIn, 1);
});

test("password login transitions to MFA without granting a session", async () => {
  globalThis.__workspaceTest.auth.login = async () => ({
    mfaRequired: true,
    enrollmentRequired: false,
    challengeToken: "fixture",
  });
  const root = await render(Login);
  await act(async () =>
    root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  assert.ok(root.findByProps({ id: "mfa-code" }));
});

test("forgot password is reachable from login and reports unavailable email delivery", async () => {
  let root = await render(Login);
  assert.ok(
    root
      .findAllByType("a")
      .some((node) => node.props.href === "/forgot-password"),
  );
  globalThis.__workspaceTest.failPost = true;
  globalThis.__workspaceTest.postError =
    "L’envoi d’emails n’est pas configuré.";
  root = await render(PasswordRecovery, { mode: "forgot" });
  await act(async () =>
    root
      .findByProps({ id: "recovery-email" })
      .props.onChange({ target: { value: "owner@example.test" } }),
  );
  await act(async () =>
    root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  assert.equal(globalThis.__workspaceTest.posted.path, "/auth/forgot-password");
  assert.equal(
    globalThis.__workspaceTest.posted.data.email,
    "owner@example.test",
  );
  assert.match(root.findByProps({ role: "alert" }).props.children, /configuré/);
  assert.equal(root.findAllByProps({ role: "status" }).length, 0);
});

test("password reset rejects mismatching confirmations and signs out after success", async () => {
  let loggedOut = 0;
  globalThis.__workspaceTest.auth.logout = () => loggedOut++;
  const root = await render(PasswordRecovery, { mode: "reset" }, [
    "/reset-password#token=" + "a".repeat(64),
  ]);
  await act(async () =>
    root
      .findByProps({ id: "new-password" })
      .props.onChange({ target: { value: "New-password-123" } }),
  );
  await act(async () =>
    root
      .findByProps({ id: "confirm-password" })
      .props.onChange({ target: { value: "different" } }),
  );
  await act(async () =>
    root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  assert.match(
    root.findByProps({ role: "alert" }).props.children,
    /identiques/,
  );
  assert.equal(globalThis.__workspaceTest.posted, undefined);
  await act(async () =>
    root
      .findByProps({ id: "confirm-password" })
      .props.onChange({ target: { value: "New-password-123" } }),
  );
  await act(async () =>
    root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  assert.equal(globalThis.__workspaceTest.posted.path, "/auth/reset-password");
  assert.equal(globalThis.__workspaceTest.posted.data.token.length, 64);
  assert.equal(loggedOut, 1);
  assert.equal(root.findAllByType("form").length, 0);
});

test("missing and expired recovery links show how to request a new link", async () => {
  let root = await render(PasswordRecovery, { mode: "reset" });
  assert.match(root.findByProps({ role: "alert" }).props.children, /invalide/);
  assert.equal(root.findAllByType("form").length, 0);
  globalThis.__workspaceTest.failPost = true;
  globalThis.__workspaceTest.postError = "Lien expiré";
  root = await render(PasswordRecovery, { mode: "reset" }, [
    "/reset-password#token=" + "a".repeat(64),
  ]);
  await act(async () =>
    root
      .findByProps({ id: "new-password" })
      .props.onChange({ target: { value: "New-password-123" } }),
  );
  await act(async () =>
    root
      .findByProps({ id: "confirm-password" })
      .props.onChange({ target: { value: "New-password-123" } }),
  );
  await act(async () =>
    root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  assert.equal(
    root.findByProps({ role: "alert" }).props.children,
    "Lien expiré",
  );
  assert.ok(
    root
      .findAllByType("a")
      .some((node) => node.props.href === "/forgot-password"),
  );
});

test("platform table scopes company modules and preserves an unsuccessful access change", async () => {
  globalThis.__workspaceTest.auth.user = { id: 1, agencyId: 1 };
  globalThis.__workspaceTest.responses = {
    "/platform/agencies": {
      items: [
        {
          id: 2,
          name: "Other",
          plan_tier: "pro",
          subscription_status: "active",
          users: 2,
          clients: 1,
        },
      ],
      hasMore: false,
    },
    "/platform/agencies/2/users": {
      items: [
        {
          id: 3,
          title: "Sales",
          role: "commercial",
          is_active: true,
          mfa_enabled: true,
        },
      ],
      columns: ["title", "role", "is_active"],
      hasMore: false,
    },
  };
  const root = await render(AdminWorkspaces);
  await act(async () =>
    root
      .findAllByType("button")
      .find((b) => b.props.children === "Consulter")
      .props.onClick(),
  );
  assert.equal(
    globalThis.__workspaceTest.lastGet.path,
    "/platform/agencies/2/users",
  );
  await act(async () =>
    root
      .findAllByType("button")
      .find((b) => b.props.children === "Gérer l’accès")
      .props.onClick(),
  );
  await act(async () =>
    root
      .findByProps({ id: "admin-role" })
      .props.onChange({ target: { value: "readonly" } }),
  );
  await act(async () =>
    root
      .findByProps({ id: "admin-reason" })
      .props.onChange({ target: { value: "Accès revu par administrateur" } }),
  );
  globalThis.__workspaceTest.failPatch = true;
  await act(async () =>
    root
      .findByProps({ role: "dialog" })
      .findByType("form")
      .props.onSubmit({ preventDefault() {} }),
  );
  assert.equal(globalThis.__workspaceTest.patched.path, "/platform/users/3");
  assert.equal(globalThis.__workspaceTest.patched.data.role, "readonly");
  assert.equal(
    root.findByProps({ role: "alert" }).props.children,
    "Modification refusée",
  );
  assert.equal(root.findByProps({ id: "admin-role" }).props.value, "readonly");
});

test("GA4 reports show missing configuration rather than invented metrics", async () => {
  globalThis.__workspaceTest.responses = {
    "/platform/analytics/config": {
      enabled: false,
      measurementId: "",
      propertyId: "",
      credentialsConfigured: false,
    },
    "/platform/analytics/report": { configured: false },
  };
  const root = await render(GoogleAnalyticsPanel);
  assert.ok(
    root
      .findAllByType("h4")
      .some((node) => node.props.children === "Connexion Google à compléter"),
  );
  assert.equal(root.findByProps({ id: "ga4-measurement" }).props.value, "");
});

test("Google iframe requires consent and is absent from private CRM pages", async (t) => {
  const previous = {
    window: globalThis.window,
    localStorage: globalThis.localStorage,
    document: globalThis.document,
  };
  const storage = new Map();
  globalThis.window = {
    location: { origin: "http://localhost" },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  };
  globalThis.document = { cookie: "", location: { hostname: "localhost" } };
  t.after(async () => {
    if (view) {
      await act(async () => view.unmount());
      view = null;
    }
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  globalThis.__workspaceTest.responses = {
    "/analytics/config": { enabled: true, measurementId: "G-ABCDEF1234" },
  };
  let root = await render(AnalyticsConsent, {}, ["/pricing"]);
  assert.equal(root.findAllByType("iframe").length, 0);
  await act(async () =>
    root
      .findAllByType("button")
      .find((b) => b.props.children === "Accepter")
      .props.onClick(),
  );
  assert.equal(root.findAllByType("iframe").length, 1);
  root = await render(AnalyticsConsent, {}, ["/reset-password#token=private"]);
  assert.equal(root.findAllByType("iframe").length, 0);
});
after(async () => {
  if (view) act(() => view.unmount());
  delete globalThis.__workspaceTest;
  assert.equal(path.dirname(scratch), path.join(root, "node_modules"));
  assert.ok(path.basename(scratch).startsWith(".workspace-test-"));
  await rm(scratch, { recursive: true, force: true });
});

test("newsletter waits for explicit consent, submits no recipient IDs and retains choices on failure", async () => {
  globalThis.__workspaceTest.responses = {"/newsletter/status":{status:"not_subscribed",email:"fixture@example.test",offerEligible:true,emailEnabled:true}};
  globalThis.__workspaceTest.failPost = true;
  const ui = await render(Newsletter);
  const submit = () => ui.findAllByType("button").find(button=>button.children.includes("M’inscrire à la newsletter"));
  assert.equal(submit().props.disabled,true);
  assert.equal(globalThis.__workspaceTest.postCount || 0,0);
  await act(async()=>ui.findByType("input").props.onChange({target:{checked:true}}));
  assert.equal(submit().props.disabled,false);
  await act(async()=>submit().props.onClick());
  assert.deepEqual(globalThis.__workspaceTest.posted,{path:"/newsletter/subscribe",data:{consent:true}});
  assert.equal(ui.findByType("input").props.checked,true);
  assert.equal(submit().props.disabled,false);
  assert.ok(ui.findAll(node=>node.props.role==="alert").length);
});

test("newsletter login offer respects saved refusal and does not interfere with the welcome guide",async()=>{
  globalThis.__workspaceTest.responses={"/newsletter/status":{status:"not_subscribed",email:"fixture@example.test",promptDismissed:true}};
  const ui=await render(Newsletter,{prompt:true});
  assert.equal(ui.findAllByType("section").length,0);
  act(()=>view.unmount());
  globalThis.__workspaceTest.responses["/newsletter/status"].promptDismissed=false;
  globalThis.__workspaceTest.auth.user.needsWelcomeGuide=true;
  const welcome=await render(Newsletter,{prompt:true});
  assert.equal(welcome.findAllByType("section").length,0);
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
    id: 1,
    name: "Alice",
    email: "alice@example.invalid",
    company: "Studio Nord",
    phone: "",
    city: "Montréal",
    preferredLanguage: "fr-CA",
    tags: ["PME"],
    notes: "À conserver",
  };
  const ui = await render(Clients);
  await act(async () =>
    ui.findAllByProps({ title: "Modifier" })[0].props.onClick(),
  );
  assert.equal(ui.findByProps({ id: "contact-city" }).props.value, "Montréal");
  act(() =>
    ui
      .findByProps({ id: "contact-tags" })
      .props.onChange({ target: { value: "PME, Québec, PME" } }),
  );
  await act(async () =>
    ui.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  assert.equal(globalThis.__workspaceTest.saved.path, "/clients/1");
  assert.deepEqual(globalThis.__workspaceTest.saved.data.tags, [
    "PME",
    "Québec",
  ]);
  assert.equal(globalThis.__workspaceTest.saved.data.notes, "À conserver");
});

test("read-only users see client history but no create or edit controls", async () => {
  globalThis.__workspaceTest.auth = {
    isAdmin: false,
    isCommercial: false,
    user: { role: "readonly" },
  };
  const ui = await render(Clients);
  assert.equal(ui.findAllByProps({ title: "Modifier" }).length, 0);
  assert.equal(ui.findAllByProps({ title: "Historique" }).length, 2);
  assert.ok(!JSON.stringify(view.toJSON()).includes("Ajouter un client"));
});

test("failed client load renders an error rather than an empty customer list", async () => {
  globalThis.__workspaceTest.failLoad = true;
  const ui = await render(Clients);
  assert.equal(ui.findAllByProps({ role: "alert" }).length, 1);
  assert.ok(
    !JSON.stringify(view.toJSON()).includes("Ajoutez votre premier client"),
  );
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
    const links = ui.findAllByType("a").map((item) => item.props.href);
    assert.equal(links.includes("/settings"), role === "admin");
    assert.equal(links.includes("/team"), role === "admin");
    assert.equal(
      links.includes("/pipeline"),
      ["admin", "commercial"].includes(role),
    );
    assert.ok(links.includes("/clients") && links.includes("/invoices"));
    if (role === "readonly")
      assert.ok(
        !JSON.stringify(view.toJSON()).includes(
          "Cliquez sur « Nouveau devis »",
        ),
      );
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
  const later = () =>
    ui
      .findAllByType("button")
      .find((item) => item.children.includes("Plus tard"));
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
  globalThis.__workspaceTest.auth.dismissWelcomeGuide = async () => {
    saved = true;
  };
  const ui = await render(Welcome);
  await act(async () =>
    ui
      .findAllByType("button")
      .find((item) => item.children.includes("Découvrir le guide"))
      .props.onClick(),
  );
  assert.equal(saved, true);
  assert.equal(ui.findAllByProps({ role: "dialog" }).length, 0);
});

test("profile saves the display name and photo for read-only users without touching their role", async () => {
  globalThis.__workspaceTest.auth.isAdmin = false;
  globalThis.__workspaceTest.auth.user = {
    fullName: "Camille",
    role: "readonly",
    email: "camille@example.invalid",
    avatarUrl: "https://example.invalid/photo.png",
  };
  let submitted;
  globalThis.__workspaceTest.auth.updateProfile = async (payload) => {
    submitted = payload;
    return payload;
  };
  const ui = await render(Profile);
  assert.equal(ui.findAllByType("a").length, 0);
  assert.equal(ui.findByProps({ id: "profile-email" }).props.readOnly, true);
  act(() =>
    ui
      .findByProps({ id: "profile-name" })
      .props.onChange({ target: { value: "Camille Martin" } }),
  );
  await act(async () =>
    ui.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  assert.deepEqual(submitted, {
    fullName: "Camille Martin",
    avatarUrl: "https://example.invalid/photo.png",
  });
  assert.equal(ui.findAllByProps({ role: "status" }).length, 1);
});

test("profile can remove an image and retains edits after a server error", async () => {
  globalThis.__workspaceTest.auth.user.avatarUrl =
    "https://example.invalid/photo.png";
  globalThis.__workspaceTest.auth.updateProfile = async () => {
    throw Error("offline");
  };
  const ui = await render(Profile);
  act(() =>
    ui
      .findAllByType("button")
      .find((item) => item.children.includes("Retirer l’image"))
      .props.onClick(),
  );
  await act(async () =>
    ui.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  assert.equal(ui.findAllByType("img").length, 0);
  assert.equal(ui.findAllByProps({ role: "alert" }).length, 1);
  assert.equal(ui.findByProps({ type: "submit" }).props.disabled, false);
});

test("profile upload preview uses the existing uploader and rejects oversized images", async () => {
  const ui = await render(Profile);
  const input = ui.findByProps({ "aria-label": "Photo ou logo du profil" });
  await act(async () =>
    input.props.onChange({
      target: { files: [{ type: "image/png", size: 10 }], value: "photo.png" },
    }),
  );
  assert.equal(ui.findByType("img").props.src, "/uploads/test.png");
  await act(async () =>
    input.props.onChange({
      target: {
        files: [{ type: "image/png", size: 6 * 1024 * 1024 }],
        value: "photo.png",
      },
    }),
  );
  assert.equal(ui.findAllByProps({ role: "alert" }).length, 1);
  assert.equal(ui.findByType("img").props.src, "/uploads/test.png");
});

test("guide can start the interactive tour and welcome waits for preference persistence", async () => {
  let started = 0;
  globalThis.__workspaceTest.tour = {
    startTour() {
      started++;
    },
  };
  let ui = await render(Guide);
  act(() =>
    ui
      .findAllByType("button")
      .find((item) => item.children.includes("Lancer la visite interactive"))
      .props.onClick(),
  );
  assert.equal(started, 1);
  act(() => view.unmount());
  globalThis.__workspaceTest.auth.user.needsWelcomeGuide = true;
  let saves = 0;
  globalThis.__workspaceTest.auth.dismissWelcomeGuide = async () => {
    if (++saves === 1) throw Error("offline");
  };
  ui = await render(Welcome);
  const start = () =>
    ui
      .findAllByType("button")
      .find((item) => item.children.includes("Me guider dans le CRM"));
  await act(async () => start().props.onClick());
  assert.equal(started, 1);
  assert.equal(ui.findAllByProps({ role: "alert" }).length, 1);
  await act(async () => start().props.onClick());
  assert.equal(started, 2);
});

test("Quotes and invoices keep reader controls read-only and expose load failures", async () => {
  globalThis.__workspaceTest.auth.isAdmin = false;
  const client = { id: 1, name: "Camille", company: "Studio" };
  globalThis.__workspaceTest.responses = {
    "/quotes": [
      { id: 1, quoteNumber: "DEV-TEST", client, status: "sent", total: 100 },
    ],
    "/invoices": [
      {
        id: 1,
        invoiceNumber: "FAC-TEST",
        client,
        status: "pending",
        total: 100,
      },
    ],
  };
  for (const Component of [Quotes, Invoices]) {
    const ui = await render(Component);
    assert.equal(ui.findAllByType("select").length, 0);
    assert.equal(
      ui
        .findAllByType("button")
        .some((b) =>
          [
            "Modifier",
            "Envoyer email",
            "Convertir en facture",
            "Payer via Stripe",
          ].includes(b.props.title),
        ),
      false,
    );
    assert.ok(ui.findAllByProps({ title: "PDF" }).length);
    act(() => view.unmount());
    globalThis.__workspaceTest.failLoad = true;
    const failed = await render(Component);
    assert.equal(failed.findAllByProps({ role: "alert" }).length, 1);
    assert.equal(failed.findAllByType("table").length, 0);
    act(() => view.unmount());
    globalThis.__workspaceTest.failLoad = false;
  }
});

test("Invoice form accepts fractional quantities, converts tax percentage and prevents duplicate saves", async () => {
  globalThis.__workspaceTest.responses = { "/invoices": [] };
  const ui = await render(Invoices);
  await act(async () =>
    ui.findByProps({ "data-tour": "invoice-create" }).props.onClick(),
  );
  await act(async () => {
    ui.findByProps({ id: "invoice-clientId" }).props.onChange({
      target: { value: "1" },
    });
    ui.findByProps({ id: "invoice-taxRate" }).props.onChange({
      target: { value: "14.975" },
    });
  });
  await act(async () =>
    ui
      .findByProps({ "aria-label": "Description du service 1" })
      .props.onChange({ target: { value: "Consultation" } }),
  );
  await act(async () =>
    ui
      .findByProps({ "aria-label": "Prix unitaire du service 1" })
      .props.onChange({ target: { value: "75.25" } }),
  );
  await act(async () =>
    ui
      .findByProps({ "aria-label": "Quantité du service 1" })
      .props.onChange({ target: { value: "0.5" } }),
  );
  const submit = ui.findByType("form").props.onSubmit;
  await act(async () => {
    submit({ preventDefault() {} });
    submit({ preventDefault() {} });
  });
  assert.equal(globalThis.__workspaceTest.postCount, 1);
  assert.equal(globalThis.__workspaceTest.posted.data.taxRate, 0.14975);
  assert.equal(globalThis.__workspaceTest.posted.data.items[0].quantity, 0.5);
  assert.equal(ui.findAllByProps({ role: "dialog" }).length, 0);
});

test("Billing failure does not offer activation based on an invented subscription", async () => {
  globalThis.__workspaceTest.failLoad = true;
  const ui = await render(Billing);
  assert.equal(ui.findAllByProps({ role: "alert" }).length, 1);
  assert.equal(ui.findAllByType("button").length, 1);
});

test("Public quote hides acceptance for expired/refused documents and distinguishes an outage", async () => {
  globalThis.__workspaceTest.responses = {
    "/portal/quotes/fixture": {
      quote: {
        quoteNumber: "DEV-TEST",
        status: "refused",
        canAccept: false,
        items: [],
        total: 100,
      },
      agency: { name: "Studio" },
    },
  };
  const ui = await render(Portal, {}, ["/portal/quotes/fixture"]);
  assert.equal(
    ui
      .findAllByType("button")
      .some((b) => b.children.includes("Accepter le devis")),
    false,
  );
  act(() => view.unmount());
  globalThis.__workspaceTest.failLoad = true;
  const failed = await render(Portal, {}, ["/portal/quotes/fixture"]);
  assert.equal(failed.findAllByProps({ role: "alert" }).length, 1);
  assert.ok(
    failed
      .findAllByType("button")
      .some((b) => b.children.includes("Réessayer")),
  );
});

test("Public payment return does not claim success before the signed webhook confirms it", async () => {
  globalThis.__workspaceTest.responses = {
    "/portal/invoices/fixture": {
      invoice: {
        invoiceNumber: "FAC-TEST",
        status: "pending",
        items: [],
        total: 100,
      },
      agency: { name: "Studio" },
    },
  };
  const ui = await render(Portal, {}, [
    "/portal/invoices/fixture?payment=success",
  ]);
  const text = JSON.stringify(view.toJSON());
  assert.ok(text.includes("La confirmation peut prendre quelques instants"));
  assert.ok(!text.includes("Votre paiement est confirmé"));
  assert.ok(
    ui
      .findAllByType("button")
      .some((b) => b.children.includes("Actualiser le statut")),
  );
});
