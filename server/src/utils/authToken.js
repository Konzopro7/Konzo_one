import jwt from "jsonwebtoken";
import { getJwtSecret } from "./jwtSecret.js";

export function createAuthToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      agencyId: user.agency_id,
      role: user.role,
      email: user.email
    },
    getJwtSecret(),
    {
      expiresIn: "12h"
    }
  );
}
