# GitHub, Vercel, and CI/CD Setup

## GitHub Actions

This repo has two workflows:

- `.github/workflows/ci.yml`: runs on every branch push and pull request.
- `.github/workflows/vercel-deploy.yml`: runs tests, builds the frontend, creates a
  Vercel prebuilt output, then deploys that exact verified output.

Required GitHub repository secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Mail credentials are runtime secrets and belong in Vercel, not in the repository or
GitHub Actions build environment.

## Vercel

Root deployment uses `vercel.json`:

- install: `npm install --prefix backend && npm install --prefix frontend`
- build: `npm run build --prefix frontend`
- output: `frontend/dist`
- SPA rewrite: all frontend routes go to `/index.html`

Backend API routes are exposed through the root `api/` folder and load `backend/src/index.js`.

### Compliance Health Report CRM contract

The CRM Compliance Health Report opens as a routed page at `/sales/compliance-health-report/:leadId`. Vercel's SPA rewrite must remain enabled so direct links and refreshes on this page resolve to `frontend/dist/index.html`.

Report submission updates the CRM lead directly through the CRM backend:

- frontend endpoint: `API_ENDPOINTS.leads.detail(id)`
- backend route: `PUT /api/leads/:id`
- payload field: `complianceHealthReport`

No CCP proxy is involved in this flow anymore.

### CCP screenshot and document storage contract

The CRM Client Master upload flow stores the document in Cloudinary through the backend's `/assets/cloudinary-signature` endpoint and forwards the saved rows to CCP as part of the client payload.

For each uploaded document row, the payload shape must remain:

- `id`: Cloudinary public ID
- `name`: user-entered document label
- `file`: full Cloudinary upload metadata object, including `secureUrl` and `url`

This is the payload that is written through the CCP proxy route in `backend/src/routes/ccpIntegrations.js`, so the screenshot and process-diagram rows are expected to land in the CCP database as structured attachment records rather than as plain CRM-only local fields.

## Deployment Flow

1. Push to any branch or open a PR.
2. GitHub Actions runs backend tests and frontend build.
3. Merge to `main`.
4. `Vercel Deploy` runs and deploys production.
5. Manual preview deploy can be started from GitHub Actions with `workflow_dispatch` and `environment=preview`.

The deploy workflow pins the Vercel CLI version and writes the deployment URL to the
GitHub Actions job summary. Production and preview deployments use separate
concurrency groups so an older run cannot overwrite a newer deployment.

## Required Vercel Environment Variables

Configure these in Vercel Project Settings:

- `MONGODB_URI`
- `JWT_SECRET`
- `CCP_API_URL`
- `CCP_SHARED_SECRET` or `CCP_API_KEY`
- `MAIL_PROVIDER=microsoft-graph`
- `MS_TENANT_ID`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `OTP_SENDER_EMAIL=crm@ananttattva.com`
- `MAIL_REPLY_TO=crm@ananttattva.com`
- Cloudinary variables used by the backend, if enabled in production

Keep CCP credentials only in backend/Vercel/GitHub secrets. Do not expose them as `VITE_*` frontend variables.

### Outlook / Microsoft Graph mail

All backend mail (OTP, lead assignment, reminders, approvals, and other notifications)
goes through `backend/src/utils/mailer.js`. When the Microsoft variables above are
configured, the shared mailer uses the Microsoft Graph `sendMail` endpoint and sends
from `OTP_SENDER_EMAIL`. The Entra application needs the Microsoft Graph application
permission `Mail.Send` with tenant admin consent, and the sender must be a valid
Exchange Online mailbox.

Never commit the client secret. If a secret is pasted into chat, logs, screenshots, or
source code, revoke it in Microsoft Entra, create a replacement, and update only the
Vercel encrypted environment value.
