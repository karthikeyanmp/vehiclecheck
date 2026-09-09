# Deploying on Ubuntu Server with Nginx (manual install)

Runs the whole platform on one Ubuntu machine: PostgreSQL for data, Node.js for
the app (it serves both the API and the web UI), Nginx as the HTTPS reverse
proxy. Uploaded photos live on the machine's own disk, so nothing is lost on
restart.

Tested on **Ubuntu Server 22.04 / 24.04 LTS**.

**You need HTTPS** (Step 8) even on a LAN — the QR scanner uses the device
camera, and browsers block camera access on plain `http://` for anything other
than `localhost`.

---

## 0. Before you start

- An Ubuntu machine that stays on during the event, with `sudo` access.
- A fixed IP on your network (static lease or DHCP reservation).
- Decide the address officers will type:
  - **Best:** a real domain pointed at the machine (e.g. `permits.yourdomain.in`)
    — gets a free auto-renewing certificate (Step 8, Option A).
  - **LAN only:** the machine's IP with a self-signed certificate
    (Step 8, Option B).
- ~2 GB free disk for the app, plus ≈ 5 MB per registration for the 3 images.

```bash
sudo apt update && sudo apt -y upgrade
```

---

## 1. Install Node.js 22, PostgreSQL, Nginx

```bash
# Node.js 22 LTS (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL + Nginx + git
sudo apt-get install -y postgresql nginx git

# check
node -v          # v22.x
psql --version
nginx -v
```

PostgreSQL and Nginx are enabled on boot automatically by their packages.

## 2. Create the database and a database user

```bash
sudo -u postgres createuser vehicle_permit --pwprompt
#   → type a strong password when prompted, and note it down
sudo -u postgres createdb vehicle_permit -O vehicle_permit
```

A dedicated `vehicle_permit` DB user (not the `postgres` superuser) keeps the
blast radius small if the app's credentials ever leak.

## 3. Create a service user and get the code

```bash
# unprivileged account to own and run the app
sudo useradd --system --create-home --home-dir /opt/vehicle-permit --shell /usr/sbin/nologin vehiclepermit
```

**If the GitHub repo is private**, a plain `git clone` will prompt for a
username/password and fail — GitHub no longer accepts account passwords here.
Set up a read-only **deploy key** for the service user:

```bash
sudo -u vehiclepermit -H mkdir -p /opt/vehicle-permit/.ssh
sudo -u vehiclepermit -H ssh-keygen -t ed25519 -N "" -f /opt/vehicle-permit/.ssh/id_ed25519
sudo -u vehiclepermit -H ssh-keyscan github.com | sudo -u vehiclepermit tee -a /opt/vehicle-permit/.ssh/known_hosts
sudo -u vehiclepermit -H cat /opt/vehicle-permit/.ssh/id_ed25519.pub
```

Copy that public key into GitHub: **repo → Settings → Deploy keys → Add deploy
key** — paste it, leave *Allow write access* unchecked, Add. Then clone over
SSH:

```bash
sudo -u vehiclepermit -H git clone git@github.com:karthikeyanmp/vehiclecheck.git /opt/vehicle-permit/app
cd /opt/vehicle-permit/app
```

(A **public** repo needs none of this — just
`sudo -u vehiclepermit -H git clone https://github.com/karthikeyanmp/vehiclecheck.git /opt/vehicle-permit/app`.)

Later `git pull`s from the service user will use the same key automatically.

## 4. Configure

Generate two secrets — run this twice, copy each line:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Create `/opt/vehicle-permit/app/server/.env`:
```bash
sudo -u vehiclepermit tee /opt/vehicle-permit/app/server/.env >/dev/null <<'EOF'
DATABASE_URL=postgresql://vehicle_permit:CHANGE_ME_DB_PASSWORD@localhost:5432/vehicle_permit
DATABASE_SSL=false

AUTH_JWT_SECRET=CHANGE_ME_FIRST_SECRET
QR_JWT_SECRET=CHANGE_ME_SECOND_SECRET

# QR codes / certificates stop verifying after this moment — set it a day or
# two past your event.
EVENT_QR_EXPIRY=2026-09-13T00:00:00+05:30

PORT=4000
EOF

sudo chmod 600 /opt/vehicle-permit/app/server/.env
```

Fill in the three `CHANGE_ME` values. If the DB password contains `@` or `:`,
percent-encode them (`@` → `%40`, `:` → `%3A`). Leave `CORS_ORIGIN` unset — the
app serves its own UI (same origin).

## 5. Build

```bash
cd /opt/vehicle-permit/app
sudo -u vehiclepermit npm run build
```

Installs backend + frontend dependencies and compiles the web UI into
`client/dist`. A few minutes the first time. "chunks larger than 500 kB"
warnings are harmless.

## 6. Create the schema and the first admin

```bash
sudo -u vehiclepermit npm run migrate
#   → "All migrations applied."

sudo -u vehiclepermit npm run seed:admin -- admin "ChooseAStrongAdminPassword"
#   → 'Admin account "admin" is ready.'
```

## 7. Run the app as a systemd service

```bash
sudo tee /etc/systemd/system/vehicle-permit.service >/dev/null <<'EOF'
[Unit]
Description=Vehicle Permit Platform
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=vehiclepermit
WorkingDirectory=/opt/vehicle-permit/app/server
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now vehicle-permit
```

Check:
```bash
systemctl status vehicle-permit --no-pager
curl http://localhost:4000/api/health        # → {"ok":true}
journalctl -u vehicle-permit -n 40 --no-pager
```

The `.env` file is read automatically from `WorkingDirectory`.

## 8. Nginx + HTTPS

### 8a. Nginx site

```bash
sudo tee /etc/nginx/sites-available/vehicle-permit >/dev/null <<'EOF'
server {
    listen 80;
    server_name permits.yourdomain.in;   # or "_" for IP-only / LAN

    client_max_body_size 25m;            # allow the 3-image upload

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/vehicle-permit /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 8b. Certificate — pick one

**Option A — you have a domain** (recommended). The machine must be reachable
from the internet on ports 80 and 443, and the domain's `A` record must point
at it.
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d permits.yourdomain.in
```
certbot fetches a Let's Encrypt cert, rewrites the Nginx config for HTTPS +
HTTP→HTTPS redirect, and installs an auto-renew timer.

**Option B — no domain, LAN only** (self-signed). Replace the IP with the
machine's:
```bash
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/vehicle-permit.key \
  -out    /etc/nginx/ssl/vehicle-permit.crt \
  -subj "/CN=192.168.1.50" \
  -addext "subjectAltName=IP:192.168.1.50"
```
Then edit `/etc/nginx/sites-available/vehicle-permit` — change the `server`
block to:
```nginx
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    server_name _;
    ssl_certificate     /etc/nginx/ssl/vehicle-permit.crt;
    ssl_certificate_key /etc/nginx/ssl/vehicle-permit.key;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
```bash
sudo nginx -t && sudo systemctl reload nginx
```
**Every scanning device must trust this certificate** or its camera won't
start. Copy `/etc/nginx/ssl/vehicle-permit.crt` to each phone/tablet and
install it as a trusted CA (Android: Settings → Security → *Install a
certificate* → *CA certificate*). A cleaner alternative is
[`mkcert`](https://github.com/FiloSottile/mkcert) — it creates a local CA you
install once per device.

## 9. Firewall

```bash
sudo ufw allow OpenSSH        # don't lock yourself out
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

Do **not** open port 4000 — the app is only reached through Nginx.

## 10. Use it

From any device on the network:
- Option A: `https://permits.yourdomain.in`
- Option B: `https://192.168.1.50`

Log in as `admin`, then:
1. **Master Data** — verify police stations and check posts.
2. **Users** — create registrar and check-post-officer accounts (or run
   `server/scripts/seed-staff.js`, see its header).
3. Hand out logins. Registering officers → New Registration; check-post
   officers → Check Post Scan (allow the camera when asked).

---

## Updating to newer code

```bash
cd /opt/vehicle-permit/app
sudo -u vehiclepermit git pull
sudo -u vehiclepermit npm run build
sudo -u vehiclepermit npm run migrate
sudo systemctl restart vehicle-permit
```

## Backups

Daily, to a separate disk or another machine:

```bash
# database
sudo -u postgres pg_dump -F c vehicle_permit \
  > /var/backups/vehicle_permit_$(date +%F).dump

# uploaded images
sudo rsync -a --delete /opt/vehicle-permit/app/server/uploads/ /var/backups/uploads/
```

Restore a dump:
```bash
sudo -u postgres pg_restore -d vehicle_permit --clean /var/backups/vehicle_permit_YYYY-MM-DD.dump
```

## Security notes

- `uploads/` and the database hold personal data (photos, mobile numbers).
  Use full-disk encryption (LUKS at install time) or put the PostgreSQL data
  directory and `uploads/` on an encrypted volume.
- Keep the machine on a **UPS**.
- After the event, delete `uploads/` and drop the database per your data-
  retention policy.

## Troubleshooting

| Symptom | Check |
|---|---|
| `npm run migrate` can't connect | `systemctl status postgresql`; DB name / password / user in `.env`. |
| Service won't start | `journalctl -u vehicle-permit -n 50`. Usually a missing `.env` value — `DATABASE_URL`, `AUTH_JWT_SECRET`, `QR_JWT_SECRET`, `EVENT_QR_EXPIRY` are all required. |
| 502 Bad Gateway from Nginx | App not running on :4000 — check the service and `curl http://localhost:4000/api/health`. |
| Login → "Internal server error" | Schema not migrated or admin not seeded — redo Step 6. |
| Camera won't open on phones | You're on `http://`, or (Option B) the cert isn't trusted on that device. |
| Every scan says "QR code is invalid or expired" | `EVENT_QR_EXPIRY` is in the past. Fix it, `systemctl restart vehicle-permit`, reprint permits. |
| Upload fails for larger photos | `client_max_body_size 25m;` missing from the Nginx `server` block. |
| Reachable from server but not other devices | `ufw status`, and confirm the machine's IP with `ip a`. |
