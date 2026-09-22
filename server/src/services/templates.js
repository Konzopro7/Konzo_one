function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderTemplate(template, variables = {}) {
  return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) =>
    escapeHtml(variables[key] ?? "")
  );
}

export function buildPortalUrl(type, token) {
  const clientUrl = (process.env.PUBLIC_CLIENT_URL || process.env.CLIENT_URL?.split(",")[0]?.trim() || "http://localhost:5173").replace(/\/+$/, "");
  return `${clientUrl}/portal/${type}/${token}`;
}
