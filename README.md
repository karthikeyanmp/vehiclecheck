# Vehicle Permit System — Emmanuel Sekaran Remembrance Day

Pre-event registration + gate verification for a large public function, run by
Tamil Nadu Police. Registering officers at local stations register vehicles
and print a QR-coded permit; gate personnel at Madurai entry points scan the
QR to verify and log entry/exit; district checkpoint officers separately
track the same vehicle leaving/returning through its home district's border;
an admin oversees all of it.

## Architecture

```
client/   React (Vite) SPA — four role-scoped portals in one app
server/   Node/Express API + PostgreSQL — all role enforcement happens here
```

Role separation is enforced **server-side** on every route (`requireRole` in
[server/src/middleware/auth.js](server/src/middleware/auth.js)) — the frontend
hiding a nav link is a convenience, not a security boundary. A gate account
hitting an admin or registrar endpoint gets a 403, not a hidden button.

| Role | Can | Cannot |
|---|---|---|
| `admin` | View/edit all registrations, dashboard, export, manage master data & user accounts | — |
| `registrar` | Create registrations for their own station, view/print certificates for their own station | See other stations, use gate/district-scan endpoints |
| `gate_scanner` | Scan a QR at a Madurai entry point → see name/photo/vehicle/allowed gate → mark entered/exited (event-side status) | See RC copies, mobile numbers, or edit anything |
| `district_scanner` | Scan a QR at a home-district checkpoint (Thanjavur only, for now) → mark departed/returned (district-side status, independent of the event status) | Same restrictions as `gate_scanner` |

QR codes encode **only a signed, opaque token** (`{ regId }` signed with
`QR_JWT_SECRET`) — never applicant data. The gate/checkpoint app sends the
token to the server, which resolves it server-side and returns only the
fields that role is allowed to see. The same QR is scanned at both checkpoint
types — each tracks its own independent status column on the registration
(`current_status` for the Madurai gates, `district_status` for the home
district), so one never overwrites the other.

### District entry/exit monitoring

A separate module from the Madurai gates: it watches a vehicle leave and
return through its **home district's** border, not the event's. Modeled
exactly like the gate-scanning flow (`district_checkpoints` mirrors
`entry_points`, `district_scan_log` mirrors `scan_log`), so extending it to
another district later is just a master-data row — see Admin → Master Data —
plus a `district_scanner` account tied to it, no code change needed. Only a
Thanjavur checkpoint is seeded today.

## First-time setup

### 1. Database

You need a Postgres instance. Easiest path if you have Docker:

```bash
docker compose up -d          # from the repo root — starts Postgres on :5432
```

Otherwise, point `DATABASE_URL` at any Postgres 13+ instance you already run.

### 2. Server

```bash
cd server
npm install
cp .env.example .env          # then fill in real secrets — see below
npm run migrate               # creates tables
npm run seed:admin -- admin "a-real-strong-password"
npm run dev                   # http://localhost:4000
```

Generate the two JWT secrets with:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Use a **different** value for `AUTH_JWT_SECRET` and `QR_JWT_SECRET` — a leaked
printed QR should never double as a login token.

Drop the official TN Police emblem PNG at
`server/src/assets/tn-police-emblem.png` (see the README there) — the
certificate renders fine without it, just with an empty gap where the crest
goes.

Load the real Madurai entry points and police-station list by editing
[server/migrations/002_seed.sql](server/migrations/002_seed.sql) before your
first `npm run migrate`, or add them later from Admin → Master Data.

### 3. Client

```bash
cd client
npm install
cp .env.example .env          # VITE_API_BASE, defaults to localhost:4000
npm run dev                   # http://localhost:5173
```

Log in as the admin account you seeded, then create `registrar`, `gate_scanner`,
and `district_scanner` accounts from Admin → Users (each tied to one station,
gate, or checkpoint — the account can't be created without that link).

## Verifying the certificate template

```bash
cd server
npm run sample:certificate    # writes sample-certificate.pdf with fake data, no DB needed
```

Open the PDF and compare against the paper sample. This is also the fastest
way to check a layout tweak — no need to go through a real registration.

## Deploying to Render (single service + free Postgres)

For a temporary/testing deploy, the whole platform runs as **one** Render web
service: the Express server serves the API *and* the bundled React build
(same origin, so HTTPS is automatic and the QR camera works — no CORS, no
tunnel). A [`render.yaml`](render.yaml) blueprint is included.

1. Push this repo to GitHub (see below if it isn't there yet).
2. Render dashboard → **New → Blueprint** → connect the repo. Render reads
   `render.yaml` and proposes a web service + a free Postgres.
3. When prompted, set `BOOTSTRAP_ADMIN_USERNAME` and
   `BOOTSTRAP_ADMIN_PASSWORD` (≥10 chars) — the first boot creates that admin
   login. `AUTH_JWT_SECRET` / `QR_JWT_SECRET` are auto-generated.
4. **Apply** → first deploy runs `npm run build` (installs both, builds the
   client) then `npm run migrate && npm start`.
5. Open the service URL, log in as the bootstrap admin, and create the
   `registrar` / `gate_scanner` / `district_scanner` accounts.

Free-tier caveats (all fine for a short test, not for the real event):
the service sleeps after ~15 min idle (~1 min cold start), the free Postgres
is deleted after ~30 days, and uploaded photos/RC files sit on ephemeral disk
(lost on restart — `server/src/services/uploads.js` recreates the folders on
boot). For the real event, move file storage to object storage (S3/Supabase
Storage) and use a paid instance + managed Postgres with backups.

## What's implemented vs. what's left

**Done:** schema + migrations, JWT auth with server-enforced roles, file
upload (RC copy + photo) with type/size limits, QR issuance & verification,
gate lookup/verify with row-locked status transitions (no double-scan races),
the separate district-checkpoint departed/returned module for Thanjavur,
admin edit log + both scan audit logs, CSV export, rate limiting on login and
QR verification, the certificate PDF matching the sample layout in Tamil.

**Left for you before go-live:**
- Real Madurai entry-point list and station list in `002_seed.sql`.
- The official TN Police emblem asset.
- Hosting (see below) — this was built to be self-hosted, not deployed as-is.
- Offline queueing at gates with flaky connectivity (the design called for
  IndexedDB queue + sync; the current gate app assumes it's online).
- A data retention job that purges RC copies/photos after an agreed window.

## Deployment & data-handling notes

This carries RC copies, photos, and phone numbers of the public through a
police process — treat it accordingly:

- **Host it yourself** (your own server or police infrastructure), not a
  public BaaS — this data shouldn't leave infrastructure you control.
- **HTTPS is mandatory** in production — the gate app's camera access
  requires it anyway, and JWTs/file tokens must never travel in plaintext.
- **Encrypt the disk** the `server/uploads/` directory lives on, at minimum.
- **Agree on a retention window** up front (e.g., purge RC copies/photos N
  days after the event) and script the purge — don't let it sit indefinitely.
- The CSV export and any admin edit include mobile numbers — both already
  require the `admin` role; don't loosen that.
- Rotate `AUTH_JWT_SECRET`/`QR_JWT_SECRET` and re-seed the admin password
  before reusing this for a different event.
