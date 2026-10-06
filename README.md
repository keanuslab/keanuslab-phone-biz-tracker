# PhoneBiz

A web app for running a small **phone repair and resale business**. It tracks the phones you buy and sell, customer repair jobs, the parts you keep in stock and your expenses, and shows what you're actually making each month.

Built with React and Firebase, deployed on Firebase Hosting. The design is inspired by Nothing's monochrome, dot-matrix style.

**Live:** https://phonebiz-b7a59.web.app (sign-in restricted to approved accounts; anyone can try the demo)

## Features

- **Inventory**: every phone gets a stock ID (`PB-0001`, …). Track purchase price, parts used, sale price, fees and shipping to see real profit per device. Table view or drag-and-drop board (Acquired → In repair → Ready → Listed → Sold).
- **Repairs**: customer jobs from intake to collection, with parts and profit per job.
- **Parts stock**: parts used on a device or repair are deducted automatically; restocking updates the average unit cost. Low-stock alerts.
- **Expenses**: by category and month. Parts purchases are treated as inventory, so they're only counted once, when the part is used.
- **Investments**: investor funding, total repayment promised (including principal), deadlines, partial repayment history, overdue reminders, and printable investor statements. Investor funding and repayments are tracked separately from operating profit.
- **Dashboard**: net profit, revenue, flip vs. repair profit, comparison with the previous period, 12-month charts, best models to flip, most used parts, and a "needs attention" list.
- **Investor cash flow**: period-based funding received, repayments paid, net financing cash flow, and outstanding liabilities, kept separate from revenue and profit.
- **Monthly goals**: set targets (net profit, revenue, devices sold, repairs) and see when you're expected to hit them, based on your last 30 days.
- **willhaben import**: paste a willhaben.at ad link and text to pre-fill a new device (model, storage, colour, condition, price, battery health).
- **Model catalogue**: typeahead with current iPhone, Samsung, Pixel, Xiaomi and OnePlus models, so names stay consistent and stats group correctly.
- **CSV import/export**, **dark mode**, and a **demo mode** with sample data stored only in the browser.

## Tech stack

| | |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, React Router |
| Charts / board | Recharts, dnd-kit |
| Backend | Firebase Authentication (Google), Cloud Firestore |
| Hosting / CI | Firebase Hosting, GitHub Actions |

There is no custom server: the app talks to Firestore directly, and **`firestore.rules` is the security boundary**.

## Security model

- Sign-in is with Google. Only verified emails listed in the Firestore `allowlist` collection can read or write any data; everyone else sees an "Access pending" screen.
- Each user's data lives under `users/{uid}/…` and is only accessible to that user.
- Admins (allowlist entries with `admin: true`) manage access in the app under **Settings → Access**.
- Every write is validated by the rules (allowed fields, types, value ranges, statuses).

## Getting started

Requirements: Node.js 24+ and a Firebase project with **Authentication (Google provider)** and **Cloud Firestore** enabled.

```bash
npm install
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
| `npm run deploy` | Build and deploy hosting + Firestore rules from your machine |

## Deployment

Every push to `main` is deployed automatically by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (site and Firestore rules). It needs, in the GitHub repo settings under **Secrets and variables → Actions**:

- **Secret** `FIREBASE_SERVICE_ACCOUNT`: JSON key of a service account with the roles Firebase Hosting Admin, Firebase Rules Admin, Service Usage Consumer and Firebase Viewer.
- **Variables** `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.

Changes to `main` go through pull requests.

## Project structure

```
src/
  pages/        Dashboard, Inventory, Repairs, Parts, Expenses, Investments, Settings, Landing
  components/   UI kit, forms, data table, kanban board, goals, importers
  data/         auth, Firestore / local-demo backends, data store, sample data
  lib/          calculations, goals, CSV, model catalogue, willhaben parser, types
firestore.rules  data access and validation rules
firebase.json    hosting config (SPA rewrite, security headers, caching)
```
