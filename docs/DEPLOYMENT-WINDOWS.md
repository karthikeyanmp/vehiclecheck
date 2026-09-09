# Deploying on a Windows 11 server (manual install)

This runs the whole platform on one Windows machine: PostgreSQL for data,
Node.js for the app (which serves both the API and the web UI), and a small
reverse proxy for HTTPS. Uploaded photos live on the machine's own disk, so
nothing is lost on restart.

**You need HTTPS** (Step 9) even on a LAN — the QR scanner uses the device
camera, and browsers block camera access on plain `http://` for anything
other than `localhost`.

---

## 0. Before you start

- A Windows 10/11 (or Windows Server) machine that stays on during the event.
- Administrator access on it.
- A fixed IP address for the machine on your network (set a static IP or a DHCP
  reservation).
- Decide the address officers will type. Best: a real domain name pointed at
  the machine (e.g. `permits.yourdomain.in`). Workable without one: the
  machine's IP with a self-signed certificate (Step 9, Option B).
- Roughly 2 GB free disk for the app + a photo allowance (≈ 5 MB per
  registration for 3 images).

Everything below uses **PowerShell run as Administrator** unless noted.

---

## 1. Install Node.js 22 LTS

1. Download the **Windows Installer (.msi), 64-bit** from
   <https://nodejs.org/en/download> — pick the **LTS** (22.x).
2. Run it, accept defaults. On the "Tools for Native Modules" screen you can
   **leave the checkbox unticked** — this app has no components that need
   compiling.
3. Close and reopen PowerShell, then check:
   ```powershell
   node -v   # v22.x.x
   npm -v
   ```

## 2. Install PostgreSQL 16

1. Download the **Windows x86-64** installer from
   <https://www.enterprisedb.com/downloads/postgres-postgresql-downloads>
   (EDB), version 16.
2. Run it:
   - Components: keep **PostgreSQL Server** and **Command Line Tools**
     (pgAdmin is optional).
   - **Password for the `postgres` superuser** — set a strong one and
     **write it down**, you need it in Step 5.
   - Port: **5432** (default).
   - Locale: default.
3. Add the tools to PATH for this session (adjust `16` if the version differs):
   ```powershell
   $env:Path += ";C:\Program Files\PostgreSQL\16\bin"
   ```
4. Create the database:
   ```powershell
   createdb -U postgres vehicle_permit
   # enter the postgres password when prompted
   ```
   Verify:
   ```powershell
   psql -U postgres -l    # you should see "vehicle_permit" in the list
   ```

The PostgreSQL service is set to start automatically on boot by the installer —
nothing more to do.

## 3. Install Git (recommended)

Download **Git for Windows** from <https://git-scm.com/download/win>, install
with defaults. This makes updates one command later. (If you'd rather not,
you can download the repo as a ZIP from GitHub and skip `git`.)

## 4. Get the code

```powershell
cd C:\
git clone https://github.com/karthikeyanmp/vehiclecheck.git vehicle-permit
cd C:\vehicle-permit
```

(ZIP alternative: download, extract to `C:\vehicle-permit` so that
`C:\vehicle-permit\server` and `C:\vehicle-permit\client` exist.)

## 5. Configure

Create the server config file `C:\vehicle-permit\server\.env`.

First generate two secrets — run this twice and copy each result:
```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Then create the file (use Notepad or the here-string below, filling in the
three CHANGE_ME values):
```powershell
@"
DATABASE_URL=postgresql://postgres:CHANGE_ME_POSTGRES_PASSWORD@localhost:5432/vehicle_permit
DATABASE_SSL=false

AUTH_JWT_SECRET=CHANGE_ME_FIRST_SECRET
QR_JWT_SECRET=CHANGE_ME_SECOND_SECRET

# QR codes / certificates stop being accepted after this moment.
# Set it a day or two past your event.
EVENT_QR_EXPIRY=2026-09-13T00:00:00+05:30

PORT=4000
"@ | Set-Content -Encoding utf8 C:\vehicle-permit\server\.env
```

Notes:
- If the postgres password has special characters like `@` or `:`, percent-encode
  them in the URL (`@` → `%40`, `:` → `%3A`).
- Leave `CORS_ORIGIN` unset — the server serves its own UI, so it's same-origin.

## 6. Build

From `C:\vehicle-permit`:
```powershell
npm run build
```
This installs dependencies for `server` and `client` and builds the web UI into
`client\dist`. Takes a few minutes the first time. Warnings about "chunks larger
than 500 kB" are harmless.

## 7. Create the database tables and the first admin

```powershell
npm run migrate
# expect: "All migrations applied."

npm --prefix server run seed:admin -- admin "ChooseAStrongAdminPassword"
# expect: 'Admin account "admin" is ready.'
```

## 8. Test it runs

```powershell
npm start
```
Leave it running and open <http://localhost:4000> in a browser **on the server
itself**. Log in with `admin` / the password you just set. You should reach the
dashboard.

Press **Ctrl+C** to stop it — the next step makes it run on its own.

## 9. Put HTTPS in front of it (Caddy)

Officers' phones need HTTPS for the camera. Caddy is a single .exe that
terminates TLS and forwards to the app.

1. Download `caddy_windows_amd64.exe` from <https://caddyserver.com/download>
   (no extras needed). Rename it `caddy.exe`, put it in `C:\caddy\`.

2. Create `C:\caddy\Caddyfile`:

   **Option A — you have a domain name** (recommended; automatic real
   certificate). The machine must be reachable from the internet on ports 80
   and 443, and the domain's DNS `A` record must point at the machine's public
   IP.
   ```
   permits.yourdomain.in {
       reverse_proxy localhost:4000
   }
   ```

   **Option B — no domain, LAN only** (self-signed certificate). Replace the IP
   with your machine's:
   ```
   https://192.168.1.50 {
       tls internal
       reverse_proxy localhost:4000
   }
   ```
   With Option B, run `C:\caddy\caddy.exe trust` once on the server, then
   install the generated root certificate on every scanning device — the file
   is at
   `C:\Users\<you>\AppData\Roaming\Caddy\pki\authorities\local\root.crt`
   (copy it to each phone/tablet and add it as a trusted CA). Without this the
   camera will not start on those devices.

3. Test Caddy: `cd C:\caddy` then `.\caddy.exe run`. Visit
   `https://permits.yourdomain.in` (or `https://192.168.1.50`). Stop with
   Ctrl+C once it works.

## 10. Run both as Windows services (NSSM)

So the app and proxy start on boot and restart if they crash.

1. Download **NSSM** from <https://nssm.cc/download> (the "latest release" zip).
   Extract `win64\nssm.exe` to `C:\nssm\`.

2. Install the **app** service:
   ```powershell
   C:\nssm\nssm.exe install VehiclePermit "C:\Program Files\nodejs\node.exe" "src\index.js"
   C:\nssm\nssm.exe set VehiclePermit AppDirectory "C:\vehicle-permit\server"
   C:\nssm\nssm.exe set VehiclePermit AppStdout "C:\vehicle-permit\logs\app.log"
   C:\nssm\nssm.exe set VehiclePermit AppStderr "C:\vehicle-permit\logs\app.log"
   C:\nssm\nssm.exe set VehiclePermit AppRotateFiles 1
   C:\nssm\nssm.exe set VehiclePermit Start SERVICE_AUTO_START
   New-Item -ItemType Directory -Force C:\vehicle-permit\logs | Out-Null
   Start-Service VehiclePermit
   ```
   The `.env` file is read automatically from the `AppDirectory`, so no
   environment setup is needed here.

3. Install the **proxy** service:
   ```powershell
   C:\nssm\nssm.exe install VehiclePermitProxy "C:\caddy\caddy.exe" "run --config C:\caddy\Caddyfile"
   C:\nssm\nssm.exe set VehiclePermitProxy AppDirectory "C:\caddy"
   C:\nssm\nssm.exe set VehiclePermitProxy AppStdout "C:\caddy\caddy.log"
   C:\nssm\nssm.exe set VehiclePermitProxy AppStderr "C:\caddy\caddy.log"
   C:\nssm\nssm.exe set VehiclePermitProxy Start SERVICE_AUTO_START
   Start-Service VehiclePermitProxy
   ```

Check both: `Get-Service VehiclePermit*`. Manage later with
`Restart-Service VehiclePermit`, or `C:\nssm\nssm.exe edit VehiclePermit`.

## 11. Open the firewall

```powershell
New-NetFirewallRule -DisplayName "Vehicle Permit HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
New-NetFirewallRule -DisplayName "Vehicle Permit HTTP"  -Direction Inbound -Protocol TCP -LocalPort 80  -Action Allow
```
(Port 80 is needed for Option A's certificate renewal and the HTTP→HTTPS
redirect. Not needed for Option B, but harmless.)

Do **not** open port 4000 — the app should only be reached through Caddy.

## 12. Use it

From any device on the network, open:
- Option A: `https://permits.yourdomain.in`
- Option B: `https://192.168.1.50`

Log in as `admin`. Then:
1. **Master Data** — check the police stations and check posts are correct.
2. **Users** — create the registrar and check-post-officer accounts (or run
   `server\scripts\seed-staff.js`, see its header).
3. Hand out the logins. Registering officers use New Registration; check-post
   officers use Check Post Scan (allow the camera when prompted).

---

## Updating to newer code

```powershell
cd C:\vehicle-permit
git pull
npm run build
npm run migrate
Restart-Service VehiclePermit
```

## Backups

Two things to copy somewhere safe, ideally daily:

```powershell
# Database
& "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -U postgres -F c -f "D:\backups\vehicle_permit_$(Get-Date -f yyyyMMdd).dump" vehicle_permit

# Uploaded photos / RC / vehicle images
robocopy C:\vehicle-permit\server\uploads D:\backups\uploads /MIR
```

Restore a database dump with:
```powershell
& "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" -U postgres -d vehicle_permit --clean "D:\backups\vehicle_permit_YYYYMMDD.dump"
```

## Security notes

- The `uploads\` folder and the database hold personal data (photos, mobile
  numbers). Enable **BitLocker** on the drive they live on.
- Keep the machine on a **UPS** — a power cut mid-event otherwise interrupts
  registrations.
- Restrict who can log into the Windows machine itself.
- After the event, delete `uploads\` and drop the database per your data-
  retention policy.

## Troubleshooting

| Symptom | Check |
|---|---|
| `npm run migrate` fails to connect | PostgreSQL service running? `Get-Service postgresql*`. Password / DB name in `.env` correct? |
| App service won't start | `C:\vehicle-permit\logs\app.log`. Usually a missing/wrong `.env` value — all of `DATABASE_URL`, `AUTH_JWT_SECRET`, `QR_JWT_SECRET`, `EVENT_QR_EXPIRY` must be set. |
| Site loads but "Internal server error" on login | DB not migrated, or admin not seeded. Re-run Step 7. |
| Camera won't open on phones | You're on `http://`, or (Option B) the Caddy root cert isn't installed/trusted on that device. |
| "QR code is invalid or expired" for every scan | `EVENT_QR_EXPIRY` is in the past. Set it forward, `Restart-Service VehiclePermit`, reprint permits. |
| Certificate PDF is blank / errors | Check `app.log`; make sure `npm run build` completed (it also installs the server deps `pdfkit` needs). |
| Can reach site from server but not other devices | Firewall rule (Step 11), and the machine's IP is what you think (`ipconfig`). |
