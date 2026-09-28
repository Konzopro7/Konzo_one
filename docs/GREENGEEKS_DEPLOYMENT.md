# GreenGeeks Deployment Guide (konzoCRM.com)

Target configuration only: DNS, TLS and provider callbacks must be configured separately. Deploy `shared/` alongside `server/`; the backend imports the product identity from it. Keep old public document links working through compatible redirects.

This guide deploys:
- `konzocrm.com` for the React frontend
- `api.konzocrm.com` for the Node.js API

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
1. Create `konzocrm.com` (document root for static frontend).
2. Create `api.konzocrm.com` (used by Node.js app URL).

## 4) Deploy API (api.konzocrm.com)

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
CLIENT_URL=https://konzocrm.com
PUBLIC_CLIENT_URL=https://konzocrm.com
API_URL=https://api.konzocrm.com
APP_TIMEZONE=America/Toronto
SUPER_ADMIN_EMAILS=you@example.com
PLAN_PRICE_PRO_MONTHLY=49
PLAN_PRICE_PREMIUM_MONTHLY=99

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=konzoCRM.com <no-reply@konzotech.agency>

REMINDERS_ENABLED=true
REMINDERS_CRON=0 */6 * * *

STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PREMIUM_MONTHLY=
STRIPE_SUCCESS_URL=https://konzocrm.com/invoices?payment=success&session_id={CHECKOUT_SESSION_ID}
STRIPE_CANCEL_URL=https://konzocrm.com/invoices?payment=cancelled
BILLING_SUCCESS_URL=https://konzocrm.com/billing?billing=success&session_id={CHECKOUT_SESSION_ID}
BILLING_CANCEL_URL=https://konzocrm.com/billing?billing=cancelled
WHATSAPP_APP_SECRET=
```

### 4.4 Run database SQL

Run full schema (new install):
- `server/sql/schema.sql`

Then follow [the migration runbook](LOCAL_AND_MIGRATIONS.md). For an existing installation, back up first, verify and record the legacy baseline, then apply pending migrations through the runner. Do not replay an arbitrary historical migration or reset the database.

### 4.5 Configure Node app in cPanel

In `Setup NodeJS App`:
- Node.js version: `18+` (or highest stable available)
- Application mode: `Production`
- Application root: `konzotech-one/server`
- Application URL: `api.konzocrm.com`
- Application startup file: `src/server.js`

Then click:
1. `Create`
2. `Run NPM Install` (if available)
3. `Restart`

Health check:
- `https://api.konzocrm.com/api/health`

## 5) Deploy Frontend (konzocrm.com)

Build frontend with production API URL:

```powershell
$env:VITE_API_URL="https://api.konzocrm.com/api"
npm run build --prefix client
```

Upload `client/dist/*` to the document root of `konzocrm.com`.

The SPA rewrite file is included at:
- `client/public/.htaccess`

After upload, confirm `.htaccess` exists in frontend root.

## 6) DNS + SSL

- Ensure both subdomains resolve correctly:
  - `konzocrm.com`
  - `api.konzocrm.com`
- Enable SSL for both in cPanel.
- Force HTTPS if not already active.

## 7) Final Smoke Tests

1. Open `https://konzocrm.com`
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
