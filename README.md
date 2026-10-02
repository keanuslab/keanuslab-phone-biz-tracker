# PhoneBiz

A web app for running a small **phone repair and resale business**. It tracks the phones you buy and sell, customer repair jobs, the parts you keep in stock and your expenses, and shows what you're actually making each month.

Built with React and Firebase, deployed on Firebase Hosting. The design is inspired by Nothing's monochrome, dot-matrix style.

**Live:** https://phonebiz-b7a59.web.app (sign-in restricted to approved accounts; anyone can try the demo)

## Features

- **Inventory**: every phone gets a stock ID (`PB-0001`, …). Track purchase price, parts used, sale price, fees and shipping to see real profit per device. Table view or drag-and-drop board (Acquired → In repair → Ready → Listed → Awaiting handover → Sold / Handed over). Existing `Sold` records remain completed sales; only the new `Awaiting handover` status appears in handover alerts. All three sale statuses count toward sales.
- **Repairs**: customer jobs from intake to collection, with parts and profit per job.
- **Parts stock**: parts used on a device or repair are deducted automatically; restocking updates the average unit cost. Low-stock alerts.
- **Expenses**: by category and month. Parts purchases are treated as inventory, so they're only counted once, when the part is used.
- **Dashboard**: net profit, revenue, flip vs. repair profit, comparison with the previous period, 12-month charts, best models to flip, most used parts, and a "needs attention" list.
- **Monthly goals**: set targets (net profit, revenue, devices sold, repairs) and see when you're expected to hit them, based on your last 30 days.
- **willhaben import**: paste an ad link to load its details automatically when the optional import function is enabled. Paste the ad text if automatic loading is unavailable or the site markup changes. The imported image URL depends on willhaben keeping the image online.
- **Deal check**: analyze a willhaben listing before buying, suggest repairs from stated faults, price compatible parts from your stock catalogue, and estimate resale profit from comparable completed sales. Missing part or resale prices require manual estimates.
- **Model catalogue**: typeahead with current iPhone, Samsung, Pixel, Xiaomi and OnePlus models, so names stay consistent and stats group correctly.
- **CSV import/export**, **dark mode**, and a **demo mode** with sample data stored only in the browser.

## Tech stack

| | |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, React Router |
| Charts / board | Recharts, dnd-kit |
| Backend | Firebase Authentication (Google), Cloud Firestore |
| Hosting / CI | Firebase Hosting, GitHub Actions |

Device data goes directly to Firestore, and **`firestore.rules` is the security boundary**. An optional Firebase Cloud Function retrieves public willhaben listing pages for approved signed-in users. It allows at most 20 requests per user per hour and spaces requests at least three seconds apart.

## Security model

- Sign-in is with Google. Only verified emails listed in the Firestore `allowlist` collection can read or write any data; everyone else sees an "Access pending" screen.
- Each user's data lives under `users/{uid}/…` and is only accessible to that user.
- Admins (allowlist entries with `admin: true`) manage access in the app under **Settings → Access**.
- Every write is validated by the rules (allowed fields, types, value ranges, statuses).

## Getting started

Requirements: Node.js 24+ and a Firebase project with **Authentication (Google provider)** and **Cloud Firestore** enabled. Deploying the willhaben import function also requires the Firebase **Blaze** plan.

```bash
npm install
npm ci --prefix functions
cp .env.example .env.local   # then fill in your Firebase web app config
npm run dev                  # http://localhost:5173
```

The values for `.env.local` come from Firebase console → Project settings → Your apps. They are not secret, but `.env.local` is git-ignored so each environment can use its own project. Without them, the app runs in demo mode only.

### First admin

Before your first sign-in, add yourself to the allowlist in the Firebase console:
Firestore → collection **`allowlist`** → document ID = your Google email in lowercase → field `admin` (boolean) = `true`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run deploy` | Build and deploy hosting, Firestore rules and the import function (requires Blaze and Functions deployment access) |

## Deployment

Every pull request runs the [build check](.github/workflows/check.yml). Every push to `main` runs [the deploy workflow](.github/workflows/deploy.yml). By default, it deploys Hosting and Firestore rules with automatic willhaben loading disabled; the paste-text import remains available. This keeps the existing deployment service account within its Hosting/Firestore scope.

To enable automatic loading, first confirm the Firebase project is on Blaze and grant the deploy service account the permissions required for second-generation Cloud Functions and its build, Cloud Run, and artifact resources. Then set the Actions variable `ENABLE_WILLHABEN_FUNCTION=true`, run the deployment workflow manually, and confirm that its function and Hosting steps succeed before relying on automatic loading. The current repository does not establish that billing, permissions or a Functions deploy have succeeded. In GitHub repo settings under **Secrets and variables → Actions**, configure:

- **Secret** `FIREBASE_SERVICE_ACCOUNT`: JSON key of a service account with the roles Firebase Hosting Admin, Firebase Rules Admin, Service Usage Consumer and Firebase Viewer.
- **Variables** `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.

Changes to `main` go through pull requests.

## Project structure

```
src/
  pages/        Dashboard, Inventory, Repairs, Parts, Expenses, Settings, Landing
  components/   UI kit, forms, data table, kanban board, goals, importers
  data/         auth, Firestore / local-demo backends, data store, sample data
  lib/          calculations, goals, CSV, model catalogue, willhaben parser, types
firestore.rules  data access and validation rules
firebase.json    hosting config (SPA rewrite, security headers, caching)
```
