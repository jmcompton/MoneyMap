# MoneyMap (working name)

AI CRM for building-materials sales reps. This is the **foundation**: the spine that everything else hangs off.

**The one working slice, end to end:** import a commission CSV → normalize account names (with a remembered alias layer) → rank the book 80/20 → show it on a mobile money-map homepage. Everything else is a clean "coming soon" stub.

> "MoneyMap" is a swappable codename. Renaming later is a find-and-replace across this repo plus the Railway service name.

---

## What's built vs stubbed

**Built and working:** multi-tenant data model, the `account_aliases` moat table, email/password auth, commission **CSV** import, unmatched-name resolution that *remembers* mappings, the 80/20 engine, the mobile homepage, an accounts list with tier filter, seed data, and a sample CSV.

**Stubbed (nav link + "coming soon"):** weekly planner, deals, quotes, email blast, AI leads, map view, notifications, cost calculator, new-hire onboarding. **PDF import is the deliberate next step** — CSV first because PDF formats vary per manufacturer.

---

## Run it locally (optional)

Needs Node 20+ and a local Postgres, OR just trust the tests (which use in-memory Postgres).

```bash
npm install
cp .env.example .env      # set DATABASE_URL + SESSION_SECRET
npm run migrate
npm run seed
npm start                 # http://localhost:3000
```

Run the tests with no database at all:

```bash
npm test                  # schema + 80/20 engine, on in-memory Postgres
node test/smoke.js        # full slice: import -> auto-match -> resolve -> remembered
```

**Login:** `admin@comptonsales.com` / `demo1234`

---

## Deploy: GitHub + Railway

### 1. GitHub
Create a new empty repo (e.g. `moneymap`), then from this folder:

```bash
git remote add origin https://github.com/<you>/moneymap.git
git branch -M main
git push -u origin main
```

### 2. Railway
1. New Project → **Deploy from GitHub repo** → pick `moneymap`.
2. In the project, **+ New → Database → PostgreSQL**. Railway sets `DATABASE_URL` automatically.
3. On the app service → **Variables**, add:
   - `SESSION_SECRET` = a long random string
4. Deploy. The `start` script runs migrations automatically, then boots.
5. **Seed once:** open the service's shell (or run locally pointed at the Railway `DATABASE_URL`) and run `npm run seed`.
6. Open the Railway URL. Log in. You're live.

When you buy the real domain, attach it under the service's **Settings → Networking → Custom Domain** (about two minutes).

---

## Prove it works (acceptance checks)

1. App is live on the Railway URL; you can log in.
2. Homepage shows Tier-A key accounts ranked by commission (seeded).
3. Import → upload `data/sample-commission.csv`, manufacturer Soudal, columns `Account` / `Commission`.
4. **The moat:** 3 names auto-match (seeded aliases), the rest are unmatched. Resolve one. Re-import the same file → it now auto-matches with no manual step. That "remembers forever" behavior is the foundation under the whole product.

---

## Env vars

| var | where | notes |
|-----|-------|-------|
| `DATABASE_URL` | Railway Postgres plugin | provided automatically |
| `SESSION_SECRET` | you set it | long random string |
| `ANTHROPIC_API_KEY` | you set it (later) | unused this session; AI features come next |
| `PORT` | Railway | provided automatically; 3000 locally |
