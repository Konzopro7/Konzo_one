import { query } from "../db.js";

function normalizeIp(req) {
  return req.ip || req.socket?.remoteAddress || null;
}

function safePath(req) {
  return String(req.originalUrl || "").split("?")[0].replace(/(\/api\/portal\/(?:quotes|invoices)\/)[^/]+/, "$1[redacted]").slice(0,255);
}

function resolveAuditTarget(req) {
  const path = String(req.originalUrl || "").split("?")[0];
  const parts = path.split("/").filter(Boolean);
  const entityType = parts[1] || "unknown";
  const entityId = parts.map((part) => Number(part)).find((value) => Number.isInteger(value));

  return {
    entityType,
    entityId: Number.isInteger(entityId) ? entityId : null
  };
}

export function requestLogger(req, res, next) {
  const startedAt = Date.now();

  res.on("finish", () => {
    if (!req.originalUrl?.startsWith("/api")) {
      return;
    }

    if (req.originalUrl.startsWith("/api/health")) {
      return;
    }

    const durationMs = Math.max(0, Date.now() - startedAt);
    const user = req.user || req.authActor || {};

    query(
      `INSERT INTO api_request_logs (
        agency_id,
        user_id,
        method,
        path,
        status_code,
        duration_ms,
        ip_address,
        user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        user.agencyId || null,
        user.id || null,
        req.method || "GET",
        safePath(req),
        Number(res.statusCode || 0),
        Number(durationMs),
        normalizeIp(req),
        req.headers["user-agent"] || null
      ]
    ).catch(() => {
      // Best-effort analytics logging.
    });

    if (!["POST", "PUT", "PATCH", "DELETE"].includes(String(req.method))) {
      return;
    }

    if (!user.agencyId || req.originalUrl.startsWith("/api/payments/webhook") || /^\/api\/auth\/(login|register|mfa|forgot-password|reset-password)(\/|$|\?)/.test(req.originalUrl)) {
      return;
    }

    const target = resolveAuditTarget(req);
    query(
      `INSERT INTO audit_logs (
        agency_id,
        user_id,
        action,
        entity_type,
        entity_id,
        path,
        status_code,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        user.agencyId,
        user.id || null,
        String(req.method || "GET"),
        target.entityType,
        target.entityId,
        safePath(req),
        Number(res.statusCode || 0),
        JSON.stringify({
          bodyKeys: req.body && typeof req.body === "object" ? Object.keys(req.body).slice(0, 12) : []
        })
      ]
    ).catch(() => {
      // Best-effort audit logging.
    });
  });

  return next();
}
