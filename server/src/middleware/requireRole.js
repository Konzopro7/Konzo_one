export function requireRole(...roles) {
  const allowed = new Set(roles);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentification requise." });
    }

    if (!allowed.has(req.user.role)) {
      return res.status(403).json({ message: "Permissions insuffisantes." });
    }

    return next();
  };
}
