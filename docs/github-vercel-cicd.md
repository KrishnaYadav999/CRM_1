# GitHub, Vercel, and CI/CD Setup

## GitHub Actions

This repo has two workflows:

- `.github/workflows/ci.yml`: runs on every branch push and pull request.
- `.github/workflows/vercel-deploy.yml`: runs tests, builds the frontend, then deploys to Vercel.

Required GitHub repository secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

## Vercel

Root deployment uses `vercel.json`:

- install: `npm install --prefix backend && npm install --prefix frontend`
- build: `npm run build --prefix frontend`
- output: `frontend/dist`
- SPA rewrite: all frontend routes go to `/index.html`

Backend API routes are exposed through the root `api/` folder and load `backend/src/index.js`.

## Deployment Flow

1. Push to any branch or open a PR.
2. GitHub Actions runs backend tests and frontend build.
3. Merge to `main`.
4. `Vercel Deploy` runs and deploys production.
5. Manual preview deploy can be started from GitHub Actions with `workflow_dispatch` and `environment=preview`.

## Required Vercel Environment Variables

Configure these in Vercel Project Settings:

- `MONGODB_URI`
- `JWT_SECRET`
- `CCP_API_URL`
- `CCP_SHARED_SECRET` or `CCP_API_KEY`
- mail/Cloudinary variables used by the backend, if enabled in production

Keep CCP credentials only in backend/Vercel/GitHub secrets. Do not expose them as `VITE_*` frontend variables.
