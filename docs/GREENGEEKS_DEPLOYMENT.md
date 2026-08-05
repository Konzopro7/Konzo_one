# GreenGeeks Deployment Guide (Konzotech One)

This guide deploys:
- `one.konzotech.agency` for the React frontend
- `api.one.konzotech.agency` for the Node.js API

## 1) Prerequisites

- GreenGeeks plan with Node.js app support in cPanel (`Setup NodeJS App`).
- SSH access enabled from GreenGeeks support.
- A PostgreSQL database endpoint (local cPanel PostgreSQL if available, or external managed Postgres).
- Domain DNS managed in GreenGeeks or your registrar.

## 2) Repository Strategy

Use the same repository for frontend + backend:
- one codebase
- one CI/CD flow
- easier version tracking

No second repository is required.

## 3) Create Subdomains

In cPanel:
1. Create `one.konzotech.agency` (document root for static frontend).
2. Create `api.one.konzotech.agency` (used by Node.js app URL).

## 4) Deploy API (api.one.konzotech.agency)

### 4.1 Upload code

Use Git Version Control in cPanel or SSH:

```bash
cd ~
git clone <your-repo-url> konzotech-one
cd konzotech-one
```

### 4.2 Install backend dependencies

```bash
cd server
npm ci --omit=dev
```

### 4.3 Configure production env

Create `server/.env` (example):

```env
PORT=4000
NODE_ENV=production
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB_NAME
JWT_SECRET=replace-with-long-random-secret
CLIENT_URL=https://one.konzotech.agency
API_URL=https://api.one.konzotech.agency
APP_TIMEZONE=America/Toronto
SUPER_ADMIN_EMAILS=you@konzotech.agency
PLAN_PRICE_PRO_MONTHLY=49
PLAN_PRICE_PREMIUM_MONTHLY=99

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=Konzotech One <no-reply@konzotech.agency>

REMINDERS_ENABLED=true
REMINDERS_CRON=0 */6 * * *

STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PREMIUM_MONTHLY=
STRIPE_SUCCESS_URL=https://one.konzotech.agency/invoices?payment=success&session_id={CHECKOUT_SESSION_ID}
STRIPE_CANCEL_URL=https://one.konzotech.agency/invoices?payment=cancelled
BILLING_SUCCESS_URL=https://one.konzotech.agency/settings?billing=success&session_id={CHECKOUT_SESSION_ID}
BILLING_CANCEL_URL=https://one.konzotech.agency/settings?billing=cancelled
```

### 4.4 Run database SQL

Run full schema (new install):
- `server/sql/schema.sql`

or migration only (existing install):
- `server/sql/migrations/2026-04-19-erp-phase2.sql`

### 4.5 Configure Node app in cPanel

In `Setup NodeJS App`:
- Node.js version: `18+` (or highest stable available)
- Application mode: `Production`
- Application root: `konzotech-one/server`
- Application URL: `api.one.konzotech.agency`
- Application startup file: `src/server.js`

Then click:
1. `Create`
2. `Run NPM Install` (if available)
3. `Restart`

Health check:
- `https://api.one.konzotech.agency/api/health`

## 5) Deploy Frontend (one.konzotech.agency)

Build frontend with production API URL:

```powershell
$env:VITE_API_URL="https://api.one.konzotech.agency/api"
npm run build --prefix client
```

Upload `client/dist/*` to the document root of `one.konzotech.agency`.

The SPA rewrite file is included at:
- `client/public/.htaccess`

After upload, confirm `.htaccess` exists in frontend root.

## 6) DNS + SSL

- Ensure both subdomains resolve correctly:
  - `one.konzotech.agency`
  - `api.one.konzotech.agency`
- Enable SSL for both in cPanel.
- Force HTTPS if not already active.

## 7) Final Smoke Tests

1. Open `https://one.konzotech.agency`
2. Register/login
3. Create a client, quote, invoice
4. Open purchases and download purchase PDF
5. Open ledger and export CSV
6. Open stock page and create one item + stock adjustment

## 8) Common Pitfalls

- 404 on frontend routes: `.htaccess` missing in deployed frontend root.
- CORS blocked: `CLIENT_URL` mismatch in `server/.env`.
- API unreachable: Node app not restarted after env changes.
- DB errors: schema/migration not executed on production database.
