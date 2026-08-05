function parseAdminEmails() {
  return String(process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdminEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return parseAdminEmails().includes(normalized);
}

