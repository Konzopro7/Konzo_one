# Konzotech One - Konzotech Agency SaaS

Internal SaaS platform for **Konzotech Agency** with:
- modern dashboard
- public marketing pricing page (`/pricing`)
- quote and invoice management
- client CRM
- multi-user roles (`admin`, `commercial`)
- SaaS subscriptions (`pro`, `premium`) with 30-day free trial
- platform admin analytics (traffic, activity, growth)
- automated reminder engine
- Stripe payment integration
- ERP finance phase 2 (suppliers, purchases, expenses, stock/inventory, simplified ledger)

## What is new in V2
- Agency workspace model (`agencies` + shared data scope)
- Team management page (create members, change role, activate/deactivate)
- Pricing onboarding flow:
  - public plan comparison page
  - signup with selected plan pre-filled
  - redirect toward billing activation flow
- Role-based access control:
  - `admin`: full access
  - `commercial`: operational access, restricted destructive/admin actions
- Automated reminders:
  - pending invoices due soon
  - overdue invoices
  - quote follow-up after configurable delay
  - manual trigger button in dashboard + scheduled cron
- Stripe:
  - create Checkout session from invoice
  - public payment link per invoice
  - webhook to mark invoice as paid automatically
- Subscription billing:
  - monthly plans (`pro`, `premium`)
  - free trial 30 days per agency
  - Stripe Checkout in subscription mode
  - platform admin access via `SUPER_ADMIN_EMAILS`
  - traffic/activity analytics via `api_request_logs`
- ERP finance:
  - suppliers management
  - purchases with line items and supplier workflow
  - purchase PDF export
  - expenses by category with statuses
  - stock and inventory tracking (items + stock movements)
  - simplified ledger and cashflow overview
  - ledger CSV export
- Product expansion:
  - commercial pipeline with prospects and opportunities
  - real uploads for agency logos and expense receipts
  - client portal for quote acceptance, invoice download, and payment
  - customizable email templates for quotes, invoices, and reminders
  - finer roles (`admin`, `commercial`, `finance`, `readonly`)
  - audit activity log
  - 60-day cashflow forecast
  - monthly accounting exports in CSV and PDF
- WhatsApp messaging:
  - WhatsApp Business Cloud API channel configuration
  - webhook receiver for inbound WhatsApp messages and delivery statuses
  - internal inbox with conversations and direct replies
  - configurable automatic reply and local inbound message simulator

## Stack
- Frontend: React + Vite + Tailwind CSS + Chart.js
- Backend: Node.js + Express
- Database: PostgreSQL
- Auth: JWT
- Payments: Stripe

## Project structure
```txt
client/   -> React app
server/   -> Express API + SQL schema
```

## Setup
1. Install dependencies
```bash
npm install
npm install --prefix server
npm install --prefix client
```

2. Copy environment files
```bash
copy server\.env.example server\.env
copy client\.env.example client\.env
```

3. Start PostgreSQL (recommended)
```bash
docker compose up -d
```

4. Run the app
```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000/api`

## Local XAMPP test mode
- Frontend URL: `http://localhost/konzotech-one/`
- API URL: `http://localhost:4000/api`
- Start API: `powershell -ExecutionPolicy Bypass -File scripts/local-start-api.ps1`
- Stop API: `powershell -ExecutionPolicy Bypass -File scripts/local-stop-api.ps1`
- Deploy frontend to XAMPP: `powershell -ExecutionPolicy Bypass -File scripts/local-deploy-xampp.ps1`

## Important V2 database note
V2 schema changed significantly (agency model + reminders + Stripe fields).

If you already ran V1 with Docker volume persistence, recreate the database volume before restarting:
```bash
docker compose down -v
docker compose up -d
```

## Main server env vars
- `DATABASE_URL`
- `JWT_SECRET`
- `CLIENT_URL`
- `API_URL`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `REMINDERS_ENABLED`
- `REMINDERS_CRON`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PREMIUM_MONTHLY`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`
- `BILLING_SUCCESS_URL`
- `BILLING_CANCEL_URL`
- `SUPER_ADMIN_EMAILS`
- `PLAN_PRICE_PRO_MONTHLY`
- `PLAN_PRICE_PREMIUM_MONTHLY`
- Default currency: `CAD`
- `WHATSAPP_GRAPH_VERSION`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN`

## Main client env vars
- `VITE_API_URL`
- `VITE_PLAN_PRICE_PRO_MONTHLY`
- `VITE_PLAN_PRICE_PREMIUM_MONTHLY`

## Production deployment
- GreenGeeks guide: `docs/GREENGEEKS_DEPLOYMENT.md`
- ERP phase 2 migration file: `server/sql/migrations/2026-04-19-erp-phase2.sql`
- Backend production env template: `server/.env.production.example`
- Frontend production env template: `client/.env.production.example`
- Frontend production build helper (PowerShell): `scripts/build-client-prod.ps1`
- WhatsApp migration file: `server/sql/migrations/2026-06-15-chatbot-whatsapp.sql`

## Stripe webhook (local example)
Use Stripe CLI to forward events:
```bash
stripe listen --forward-to localhost:4000/api/payments/webhook
```

Then copy the generated webhook secret into `server/.env` as `STRIPE_WEBHOOK_SECRET`.
