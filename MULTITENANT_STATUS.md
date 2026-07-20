# OutsideSelling (commercial RepRoute) — multi-tenant conversion status

This is a copy of RepRoute being converted into a multi-firm commercial product.
The real RepRoute / Compton Sales app is untouched.

## DONE (this pass)

**Database foundation**
- New `companies` table. One row = one paying rep firm.
- `company_id` stamped on all 23 firm-data tables, with indexes.
- Removed Compton-only pieces: Fortress promo table + seed + CSV, the
  Sean Compton name-fix migration, and the JohnMark-specific time-session seed.

**Auth / tenant plumbing**
- Login now carries `companyId` in the session.
- Signup (`/register`) now CREATES A COMPANY and makes the registrant its
  manager. One signup = one firm. Company name is required.
- New `/auth/change-password` endpoint (requires current password). This is
  the change-password feature that was missing.
- Tenant middleware sets `req.companyId` on every request. This is the wall.
- Manager route rewritten: lists reps and activity scoped to the firm, and
  "add rep" stamps the new rep with the manager's `company_id` (taken from the
  session, never the request body).

**User-list leak vectors closed** (these listed all reps across all firms):
admin, commissions, weekly_report, zoho — all now filter by `company_id`.

**De-branding (visible)**
- Removed the Compton Group homepage + its domain-routing.
- package.json + manifest renamed to OutsideSelling placeholder.

## REMAINING (do against a running database, with two test firms)

This is the tested sweep. It needs a live DB because each change must be
verified, and a missed filter = a data leak.

1. **Stamp `company_id` on every INSERT** of firm data (prospects, calls,
   quotes, samples, contacts, commissions, etc.). Reads scope correctly today
   through the user relationship, but direct company filtering and by-id
   operations need the stamp populated.
2. **Scope remaining manager/aggregate reads** that pull data directly rather
   than through a user. Known one: `GET /api/commissions/imports` lists
   commission imports across all firms — scope by `company_id`.
3. **Scope by-id operations** (e.g. commission-pdf account merge/delete operate
   on a prospect by id with no company check — potential cross-firm access if an
   id is guessed). Add `AND company_id = $req.companyId` to those.
4. **Full UI de-brand**: strip "RepRoute"/"Compton"/navy-gold from views/ and
   app.html; strip the guarded Fortress block from recap.js.
5. **THE TEST**: create two fake firms, load data into each, confirm from every
   screen that neither can see the other. This is the ship gate.

## DEPLOY (fresh start)
Because the schema changed, deploy against a FRESH Postgres on the
outsideselling Railway project (delete the old MoneyMap database, add a new
one). First signup becomes company #1.
