const LOCAL_DEV_JWT_SECRET = "local-dev-secret";

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production.");
  }

  return LOCAL_DEV_JWT_SECRET;
}

export function assertJwtSecretConfigured() {
  getJwtSecret();
}
