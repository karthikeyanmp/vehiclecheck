# Deployment Guide

**Vehicle Permit Platform — Emmanuel Sekaran Remembrance Day**

This guide walks through deploying the platform onto a server you control, with
your own domain and HTTPS. Every step includes an explanation of *why* it's
needed so you can adapt it to your environment.

> Prefer a single self-contained walkthrough for one OS?
> - **Ubuntu + Nginx:** [DEPLOYMENT-UBUNTU.md](DEPLOYMENT-UBUNTU.md)
> - **Windows:** [DEPLOYMENT-WINDOWS.md](DEPLOYMENT-WINDOWS.md)
>
> The sections below cover Docker and the generic manual install in more depth.

---

## 1. What you are deploying

The platform is **one Node.js process** plus **one PostgreSQL database**:

```
                        ┌─────────────────────────────────────────┐
   Browser  ──HTTPS──▶  │  Reverse proxy (Caddy or Nginx)         │
  (officers)            │   • terminates TLS                      │
                        │   • forwards to the app on :4000        │
                        └───────────────────┬─────────────────────┘
                                            │ HTTP (localhost / container network)
                        ┌───────────────────▼─────────────────────┐
                        │  Node app (Express)  :4000              │
                        │   • serves the REST API (/api/*)        │
                        │   • serves the built React UI (bundled) │
                        │   • writes uploaded photos/RC to disk   │
                        └───────────────────┬─────────────────────┘
                                            │ SQL
                        ┌───────────────────▼─────────────────────┐
                        │  PostgreSQL                             │
                        └─────────────────────────────────────────┘
```

The React frontend is **already compiled into the backend** — there is no
separate website to host. The reverse proxy exists only to add HTTPS and to
give the app a clean public address.

**Two deployment options:**

| | Option A — Docker Compose | Option B — Manual install |
|---|---|---|
| Effort | One command after config | ~10 steps |
| What you install | Docker only | Node, PostgreSQL, Nginx, certbot |
| HTTPS | Automatic (Caddy) | `certbot` (one command) |
| Upgrades | `git pull` + one command | `git pull`, rebuild, restart |
| Best when | You want it reproducible and isolated | You already run Postgres/Nginx and want them shared |

Pick **A** unless you have a specific reason not to run Docker.

---

## 2. Before you start (applies to both options)

### 2.1 Server

- **OS:** Linux (Ubuntu 22.04 / Debian 12 assumed below). Windows Server works
  too — use Option A with Docker Desktop/Engine.
- **Resources:** this app is light. 2 vCPU / 4 GB RAM / 20 GB disk is
  comfortable for an event of this size. Your physical server will be far more
  than enough — the priorities are *reliability* (UPS, auto-restart, backups)
  and *security* (TLS, disk encryption, firewall), not raw performance.
- **Access:** a shell account with `sudo`.

### 2.2 Domain and DNS

Decide the address the platform will live at, e.g. `permits.yourdomain.com`
(a subdomain is recommended — it keeps this separate from any existing site on
`yourdomain.com`).

In your domain registrar's DNS panel (GoDaddy, etc.), create:

| Type | Name | Value |
|---|---|---|
| `A` | `permits` | *your server's public IP address* |

**Why:** the reverse proxy needs the domain to resolve to the server before it
can obtain a TLS certificate — the certificate authority verifies you control
the domain by connecting back to it.

Check it has propagated (can take minutes to an hour):

```bash
dig +short permits.yourdomain.com      # should print your server IP
```

### 2.3 Network / firewall

The server must be reachable **from the internet on ports 80 and 443**:

- **Port 80** — used once by the certificate authority for the initial
  domain-validation challenge, and to redirect HTTP visitors to HTTPS.
- **Port 443** — the actual HTTPS traffic.

If the server sits behind an office router/NAT, **forward** external
`80 → server:80` and `443 → server:443` on the router. On the server's own
firewall:

```bash
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow OpenSSH        # don't lock yourself out
sudo ufw enable
```

**Why not expose port 4000?** The app itself is never exposed directly — only
the reverse proxy is. Port 4000 stays on localhost / the container network.

### 2.4 Get the code

```bash
git clone https://github.com/karthikeyanmp/vehiclecheck.git vehicle-permit
cd vehicle-permit
```

If the repository is **private**, the server needs credentials. Easiest is a
read-only *deploy key*:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/vehiclecheck_deploy -N ""
cat ~/.ssh/vehiclecheck_deploy.pub
# → paste into GitHub: repo → Settings → Deploy keys → Add deploy key (read-only)
# then clone with the SSH URL:
git clone git@github.com:karthikeyanmp/vehiclecheck.git vehicle-permit
```

**Why a deploy key** rather than your personal token: it's scoped to this one
repo, read-only, and easy to revoke without affecting anything else.

### 2.5 Generate secrets (you'll need these for both options)

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # AUTH_JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # QR_JWT_SECRET
```

- `AUTH_JWT_SECRET` signs login sessions.
- `QR_JWT_SECRET` signs the tokens embedded in the QR codes.
- **They must be different.** If they were the same, a leaked printed QR could
  be replayed as a login session.

Also decide:

- `EVENT_QR_EXPIRY` — an ISO datetime after which QR codes / printed
  certificates stop verifying. Set it a day or two past the event, e.g.
  `2026-09-13T00:00:00+05:30`.
- The first admin username and password (≥10 characters).

---

## 3. Option A — Docker Compose

Everything runs in containers: PostgreSQL, the app, and **Caddy** (a reverse
proxy that obtains and renews Let's Encrypt certificates automatically).

### Step A1 — Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # so you can run docker without sudo
newgrp docker                      # apply the group change to this shell
docker compose version             # confirm the Compose plugin is present
```

**Why:** the official install script pulls Docker Engine + the Compose plugin
from Docker's repository, which is more current than the distro packages.

### Step A2 — Create the configuration file

The compose file reads its settings from a `.env` file in the project root.
Copy the template and edit it:

```bash
cp .env.example .env
nano .env
```

Fill in every value:

| Variable | What to put | Why |
|---|---|---|
| `DOMAIN` | `permits.yourdomain.com` | Caddy serves this host and gets its certificate |
| `DB_PASSWORD` | a strong random password | Postgres superuser password for the containerised DB |
| `AUTH_JWT_SECRET` | the first secret from §2.5 | signs login sessions |
| `QR_JWT_SECRET` | the second secret from §2.5 | signs QR tokens |
| `EVENT_QR_EXPIRY` | `2026-09-13T00:00:00+05:30` | when QR codes stop working |
| `BOOTSTRAP_ADMIN_USERNAME` | e.g. `admin` | created automatically on first boot |
| `BOOTSTRAP_ADMIN_PASSWORD` | ≥10 chars | password for that admin |

**Why `BOOTSTRAP_ADMIN_*`:** on first start, if no admin account exists, the
app creates one from these values. This means you get a working login without
running any extra command. Once an admin exists the values are ignored, so
they're safe to leave in place (though you may rotate the password later and
blank `BOOTSTRAP_ADMIN_PASSWORD`).

> `.env` contains secrets — it is already in `.gitignore` and `.dockerignore`.
> Keep it readable only by you: `chmod 600 .env`.

### Step A3 — Review the reverse-proxy config (optional)

`Caddyfile` in the project root:

```
{$DOMAIN} {
	reverse_proxy app:4000
	request_body {
		max_size 25MB
	}
	encode gzip
}
```

- `{$DOMAIN}` is filled from your `.env`.
- `reverse_proxy app:4000` forwards to the `app` container.
- `request_body max_size 25MB` allows the photo + RC-copy upload (each file is
  capped at 8 MB by the app; the multipart request is a bit larger).
- `encode gzip` compresses responses.

You don't normally need to change this.

### Step A4 — Start the stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

What happens:

1. **Builds the app image** — installs dependencies, compiles the React
   frontend, produces a slim runtime image.
2. **Starts PostgreSQL** and waits until it is accepting connections
   (a healthcheck).
3. **Starts the app** — it runs the database migrations, creates the bootstrap
   admin, then begins serving on port 4000 (inside the container network).
4. **Starts Caddy** — it contacts Let's Encrypt, proves domain ownership over
   port 80, installs the certificate, and starts serving HTTPS on 443.

The first run takes a few minutes (image build + certificate issuance).

### Step A5 — Verify

```bash
# app is healthy (through the proxy):
curl https://permits.yourdomain.com/api/health
# → {"ok":true}

# watch the logs if anything looks wrong:
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f caddy
```

In the app log you should see `All migrations applied.`, then
`Bootstrapped admin account "admin" (ok).`, then
`Serving bundled client from /app/client/dist` and
`Vehicle permit API listening on :4000`.

Open `https://permits.yourdomain.com` in a browser and log in with the
bootstrap admin.

### Step A6 — Day-2 operations

| Task | Command |
|---|---|
| View logs | `docker compose -f docker-compose.prod.yml logs -f app` |
| Restart the app | `docker compose -f docker-compose.prod.yml restart app` |
| Stop everything | `docker compose -f docker-compose.prod.yml down` (volumes/data kept) |
| Start again | `docker compose -f docker-compose.prod.yml up -d` |
| Update to latest code | `git pull && docker compose -f docker-compose.prod.yml up -d --build` |
| Database backup | see §5.2 |
| Run migrations manually | usually automatic; if needed: `docker compose -f docker-compose.prod.yml exec app node scripts/migrate.js` |
| Reset an admin password | `docker compose -f docker-compose.prod.yml exec app node scripts/seed-admin.js admin "NewPassword123"` |

Containers are set to `restart: unless-stopped`, so they come back
automatically after a reboot or crash.

---

## 4. Option B — Manual install (Node + PostgreSQL + Nginx)

Use this if you'd rather run the components directly on the host, e.g. because
you already operate PostgreSQL or Nginx.

### Step B1 — Install the runtime dependencies

```bash
# Node.js 22 (from NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL, Nginx, certbot
sudo apt-get install -y postgresql nginx
sudo apt-get install -y certbot python3-certbot-nginx
```

- **Node 22** runs the server and the build.
- **PostgreSQL** is the database.
- **Nginx** is the reverse proxy (TLS + a clean address).
- **certbot** obtains and auto-renews the Let's Encrypt certificate.

### Step B2 — Create the database and a database user

```bash
sudo -u postgres createuser vehicle_permit --pwprompt
#   → enter a strong password when prompted; remember it
sudo -u postgres createdb vehicle_permit -O vehicle_permit
```

**Why a dedicated user** (`vehicle_permit`) rather than the `postgres`
superuser: the app only needs rights on its own database, so if its
credentials ever leak the blast radius is limited to this one database.

### Step B3 — Configure the app

```bash
cd vehicle-permit          # the clone from §2.4
cp server/.env.example server/.env
nano server/.env
```

Set:

| Variable | Value | Why |
|---|---|---|
| `DATABASE_URL` | `postgresql://vehicle_permit:PASSWORD@localhost:5432/vehicle_permit` | how the app connects to Postgres |
| `DATABASE_SSL` | `false` | local Postgres over localhost doesn't use SSL |
| `AUTH_JWT_SECRET` | secret #1 from §2.5 | signs login sessions |
| `QR_JWT_SECRET` | secret #2 from §2.5 | signs QR tokens |
| `EVENT_QR_EXPIRY` | `2026-09-13T00:00:00+05:30` | QR / certificate expiry |
| `PORT` | `4000` | the port Nginx will proxy to |
| `CORS_ORIGIN` | *(leave unset)* | not needed — the app serves its own frontend (same origin) |

```bash
chmod 600 server/.env      # secrets — restrict access
```

### Step B4 — Install dependencies and build the frontend

```bash
npm run build
```

This runs, from the project root:

1. `npm --prefix server install` — the backend's dependencies.
2. `npm --prefix client install` — the frontend's build tools.
3. `npm --prefix client run build` — compiles the React app into
   `client/dist/`, which the server serves.

### Step B5 — Create the database schema

```bash
npm run migrate
```

Runs every file in `server/migrations/` in order, tracking which have been
applied in a `_migrations` table (so re-running is safe). You should see
`All migrations applied.`

### Step B6 — Create the first admin account

```bash
npm run seed:admin -- admin "a-real-strong-password"
```

Creates (or resets the password of) an `admin` account. The `--` passes the
username and password through to the script.

> Alternatively, set `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` in
> `server/.env` and the app creates the admin on first start — either works.

### Step B7 — Run the app under a process manager

```bash
sudo npm install -g pm2
pm2 start npm --name vehicle-permit -- start
pm2 save
pm2 startup      # prints a command — run it (with sudo) to enable boot startup
```

- `pm2 start npm ... -- start` runs `npm start`, which starts
  `node server/src/index.js`.
- `pm2 save` records the current process list.
- `pm2 startup` generates a systemd service so pm2 (and your app) start on
  boot and restart on crash.

Check it:

```bash
pm2 logs vehicle-permit --lines 40
curl http://localhost:4000/api/health      # → {"ok":true}
```

### Step B8 — Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/vehicle-permit
```

```nginx
server {
    listen 80;
    server_name permits.yourdomain.com;

    client_max_body_size 25m;        # allow the photo + RC-copy upload

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

- `proxy_pass` forwards to the app.
- `client_max_body_size 25m` — Nginx rejects large uploads by default (1 MB);
  the RC copy + photo need more headroom.
- The `X-Forwarded-*` headers tell the app the real client IP and that the
  original request was HTTPS (the app trusts one proxy hop).

Enable it and reload:

```bash
sudo ln -s /etc/nginx/sites-available/vehicle-permit /etc/nginx/sites-enabled/
sudo nginx -t          # test the config
sudo systemctl reload nginx
```

### Step B9 — Obtain the HTTPS certificate

```bash
sudo certbot --nginx -d permits.yourdomain.com
```

certbot proves domain ownership over port 80, obtains a Let's Encrypt
certificate, rewrites your Nginx config to serve HTTPS on 443 (and redirect
HTTP → HTTPS), and installs a renewal timer. Certificates renew automatically
every ~60 days.

### Step B10 — Verify

```bash
curl https://permits.yourdomain.com/api/health      # → {"ok":true}
```

Open the site in a browser and log in as the admin.

### Step B11 — Day-2 operations

| Task | Command |
|---|---|
| View logs | `pm2 logs vehicle-permit` |
| Restart the app | `pm2 restart vehicle-permit` |
| Update to latest code | `git pull && npm run build && npm run migrate && pm2 restart vehicle-permit` |
| Database backup | see §5.2 |
| Reset an admin password | `npm run seed:admin -- admin "NewPassword123"` |
| Nginx status | `sudo systemctl status nginx` |
| Renew cert manually | `sudo certbot renew` (normally automatic) |

---

## 5. After deployment (both options)

### 5.1 First-run checklist inside the app

1. **Log in** as the admin.
2. **Master Data** → replace the seeded example rows with the real
   **police stations**, **Madurai entry points**, and **Thanjavur district
   checkpoints**. (Rows already referenced by a registration can't be deleted —
   edit them instead.)
3. **Users** → create the `registrar`, `gate_scanner`, and `district_scanner`
   accounts. Each registrar is tied to a station; each gate officer to an
   entry point; each district officer to one or more checkpoints.
4. Drop the real Tamil Nadu Police emblem in at
   `server/src/assets/policelogo.jpg` (keep the filename) if you have a
   higher-resolution version, then rebuild.
5. Print a test certificate (register one vehicle) and check the layout.

### 5.2 Backups

**Database** — a nightly `pg_dump`, kept for a few weeks:

```bash
# Option A (Docker):
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U vehicle_permit vehicle_permit | gzip > ~/backups/db-$(date +%F).sql.gz

# Option B (manual):
pg_dump -U vehicle_permit -h localhost vehicle_permit | gzip > ~/backups/db-$(date +%F).sql.gz
```

Add it to cron (`crontab -e`):

```
15 1 * * *  /usr/bin/bash -lc 'cd ~/vehicle-permit && <the command above>'
```

**Uploaded files** (`server/uploads/` or the `uploads` Docker volume) — copy
them somewhere off the server on the same schedule:

```bash
# Option A: the volume is at /var/lib/docker/volumes/vehicle-permit_uploads/_data
sudo rsync -a /var/lib/docker/volumes/vehicle-permit_uploads/_data/ ~/backups/uploads/
# Option B:
rsync -a ~/vehicle-permit/server/uploads/ ~/backups/uploads/
```

**Test a restore** before the event — a backup you haven't restored is a
guess.

### 5.3 Security

- **Encrypt the disk** (or at least the partition holding the database and
  `uploads/`). It holds RC copies, applicant photos, vehicle photos, and phone numbers.
  Use LUKS at install time, or move the Postgres data directory and `uploads/`
  onto an encrypted volume.
- **UPS** on the server — a power cut mid-event otherwise takes registration
  and all gate scanning offline. `restart: unless-stopped` / `pm2 startup`
  bring the software back once power returns.
- **Restrict access** if every station/gate/checkpoint connects from a known
  network — a firewall IP allowlist or a VPN in front is stronger than
  relying on login alone.
- **Data retention** — agree how long RC copies / photos are kept after the
  event, and delete them on schedule. They are the most sensitive data here.
- **Rotate** `AUTH_JWT_SECRET`, `QR_JWT_SECRET`, and the admin password
  before reusing this deployment for a different event (rotating the QR
  secret invalidates all previously printed certificates — intended).

### 5.4 Monitoring

A minimal check is a cron job that curls the health endpoint and alerts you
if it fails:

```bash
*/5 * * * * curl -fsS https://permits.yourdomain.com/api/health >/dev/null || echo "vehicle-permit DOWN" | mail -s alert you@example.com
```

---

## 6. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Caddy log: `could not get certificate` | DNS not pointing at the server yet, or port 80/443 not reachable from the internet. Check `dig +short permits.yourdomain.com` and your router port-forwarding. |
| `curl .../api/health` hangs or refuses | App not running. `docker compose ... logs app` or `pm2 logs`. |
| App log: `Missing required env var …` | A required value is absent from `.env` / `server/.env`. |
| App log: `ECONNREFUSED … 5432` | Database not reachable. Option A: the `db` container isn't healthy yet. Option B: `sudo systemctl status postgresql`, and check `DATABASE_URL`. |
| Login page loads but login "does nothing" | Wrong admin password. Check `BOOTSTRAP_ADMIN_PASSWORD` (Option A) or re-run `seed:admin` (Option B). Also check the browser Network tab — a 401 means bad credentials. |
| Gate/District scanner: camera won't start | The page must be served over **HTTPS** (or `localhost`). Confirm the address bar shows `https://`. |
| Uploads fail with a 413 | Body-size limit. Option A: raise `max_size` in `Caddyfile`. Option B: raise `client_max_body_size` in the Nginx block. |
| Certificate PDF has blank boxes where photos should be | Expected — the applicant photo/RC copy are optional; a registration made without them still produces a valid permit. |
| Migration fails on deploy | Check the app/migrate log for the SQL error. Migrations are transactional — a failed one rolls back and nothing is half-applied. Fix the cause and redeploy. |

---

## 7. Quick reference

**Option A first deploy**
```bash
git clone git@github.com:karthikeyanmp/vehiclecheck.git vehicle-permit && cd vehicle-permit
cp .env.example .env && nano .env
docker compose -f docker-compose.prod.yml up -d --build
curl https://permits.yourdomain.com/api/health
```

**Option B first deploy**
```bash
git clone git@github.com:karthikeyanmp/vehiclecheck.git vehicle-permit && cd vehicle-permit
cp server/.env.example server/.env && nano server/.env
npm run build && npm run migrate
npm run seed:admin -- admin "a-real-strong-password"
sudo npm i -g pm2 && pm2 start npm --name vehicle-permit -- start && pm2 save && pm2 startup
# configure Nginx (§B8), then:
sudo certbot --nginx -d permits.yourdomain.com
```

**Update (either)**
```bash
git pull
# A:
docker compose -f docker-compose.prod.yml up -d --build
# B:
npm run build && npm run migrate && pm2 restart vehicle-permit
```
