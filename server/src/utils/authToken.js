import jwt from "jsonwebtoken";
import { getJwtSecret } from "./jwtSecret.js";

export function createAuthToken(user, { mfaVerified = false } = {}) {
  return jwt.sign(
    {
      userId: user.id,
      agencyId: user.agency_id,
      role: user.role,
      email: user.email,
      purpose: "access",
      mfaVerified,
      mfaVersion: user.mfa_version
    },
    getJwtSecret(),
    {
      expiresIn: "12h"
    }
  );
}
