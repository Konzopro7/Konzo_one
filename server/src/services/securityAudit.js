import { query } from "../db.js";

export async function securityAudit(req, action, user, statusCode, method = null, db = { query }) {
  await db.query(
    `INSERT INTO audit_logs (agency_id, user_id, action, entity_type, entity_id, path, status_code, metadata)
     VALUES ($1,$2,$3,'authentication',$2,$4,$5,$6)`,
    [user?.agency_id || null, user?.id || null, action, `/api/auth${req.path || ""}`.slice(0,255), statusCode,
      JSON.stringify({ ip: req.ip || req.socket?.remoteAddress || null, userAgent: String(req.headers?.["user-agent"] || "").slice(0,300), method })]
  );
}

export async function listSecurityEvents(req, agencyId = null) {
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const limit = 30;
  const filters = ["l.entity_type = 'authentication'"];
  const params = [];
  if (agencyId !== null) { params.push(agencyId); filters.push(`l.agency_id = $${params.length}`); }
  if (req.query.result === "success") filters.push("l.status_code < 400");
  if (req.query.result === "failure") filters.push("l.status_code >= 400");
  const search = String(req.query.search || "").trim().slice(0,120);
  if (search) {
    params.push(`%${search.replace(/[\\%_]/g, "\\$&")}%`);
    filters.push(`(u.email ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`);
  }
  params.push(limit + 1, (page - 1) * limit);
  const { rows } = await query(
    `SELECT l.id,l.action,l.status_code,l.metadata,l.created_at,u.full_name,u.email,a.name AS agency_name
     FROM audit_logs l LEFT JOIN users u ON u.id=l.user_id LEFT JOIN agencies a ON a.id=l.agency_id
     WHERE ${filters.join(" AND ")} ORDER BY l.created_at DESC,l.id DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
    params
  );
  return { page, hasMore: rows.length > limit, items: rows.slice(0,limit).map(row => ({ id: row.id, action: row.action, success: row.status_code < 400, createdAt: row.created_at, userName: row.full_name, userEmail: row.email, agencyName: row.agency_name, ip: row.metadata?.ip || null, method: row.metadata?.method || null })) };
}
