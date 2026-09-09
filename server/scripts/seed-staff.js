// Bulk-creates staff accounts on a RUNNING deployment, via the API:
//   * one Registering Officer per police station   -> reg1, reg2, …
//   * one Check Post Officer per check post         -> gate1, gate2, …
//     (assigned that one check post + its managing police station)
//
// Existing usernames are skipped, so a plain re-run only fills gaps.
//
// Usage:
//   node scripts/seed-staff.js <baseUrl> <adminUser> <adminPassword> <sharedPassword> [--reset]
// e.g.
//   node scripts/seed-staff.js https://vehicle-permit.onrender.com admin 'AdminPass123' 'Thanjavur@2026'
//   node scripts/seed-staff.js https://vehicle-permit.onrender.com admin 'AdminPass123' 'Thanjavur@2026' --reset
//
// --reset  first deletes EVERY existing registrar / check-post / gate account
//          (never the admin), then recreates the full set cleanly. Use this to
//          fix up an inconsistent earlier run. Accounts that can't be deleted
//          (e.g. they already registered vehicles) are left alone and reported.
//
// If sharedPassword is omitted a random one is generated and printed. Every
// account created in this run gets that same temporary password.

import crypto from 'node:crypto';

const args = process.argv.slice(2);
const RESET = args.includes('--reset');
const [rawBase, adminUser, adminPass, sharedPasswordArg] = args.filter((a) => a !== '--reset');

if (!rawBase || !adminUser || !adminPass) {
  console.error('Usage: node scripts/seed-staff.js <baseUrl> <adminUser> <adminPassword> <sharedPassword> [--reset]');
  process.exit(1);
}
const API = rawBase.replace(/\/+$/, '');
const SHARED_PASSWORD = sharedPasswordArg || `Tnpolice-${crypto.randomBytes(4).toString('hex')}`;
const STAFF_ROLES = new Set(['registrar', 'district_scanner', 'gate_scanner']);

async function readJson(res) {
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.url}\n${typeof body === 'string' ? body.slice(0, 300) : JSON.stringify(body)}`);
  }
  return body;
}

// "Vilangudi (Thiruvaiyaru)" -> "Thiruvaiyaru"
function managingStationName(checkPostName) {
  const m = checkPostName.match(/\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : null;
}

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '').replace(/^th/, 't');

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

// Best police-station match for a check post's managing-station text.
function matchStation(stations, wantedName) {
  if (!wantedName) return null;
  const want = norm(wantedName);
  const exact = stations.find((s) => norm(s.station_name) === want);
  if (exact) return exact;
  let best = null;
  let bestD = Infinity;
  for (const s of stations) {
    const d = levenshtein(want, norm(s.station_name));
    if (d < bestD) { bestD = d; best = s; }
  }
  return bestD <= 3 ? best : null;
}

async function main() {
  const { token, user: me } = await readJson(await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: adminUser, password: adminPass }),
  }));
  const auth = { Authorization: `Bearer ${token}` };
  console.log('Logged in as admin.\n');

  if (RESET) {
    const existing = await readJson(await fetch(`${API}/api/users`, { headers: auth }));
    const toDelete = existing.filter((u) => STAFF_ROLES.has(u.role) && u.id !== me.id);
    console.log(`--reset: deleting ${toDelete.length} existing staff account(s)…`);
    for (const u of toDelete) {
      const res = await fetch(`${API}/api/users/${u.id}`, { method: 'DELETE', headers: auth });
      if (res.ok) {
        console.log(`  deleted  ${u.username}`);
      } else {
        const body = await readJson(res).catch((e) => e.message);
        console.log(`  KEPT     ${u.username}  (${typeof body === 'object' ? body.error : body})`);
      }
    }
    console.log('');
  }

  const stations = (await readJson(await fetch(`${API}/api/master-data/police-stations`, { headers: auth })))
    .sort((a, b) => a.station_name.localeCompare(b.station_name));
  const checkPosts = (await readJson(await fetch(`${API}/api/master-data/entry-points`, { headers: auth })))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!stations.length || !checkPosts.length) {
    throw new Error('No police stations / check posts found — did the migrations run?');
  }

  async function createUser(payload) {
    const res = await fetch(`${API}/api/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify(payload),
    });
    if (res.status === 409) return 'exists';
    await readJson(res);
    return 'created';
  }

  const rows = [];

  console.log(`Registering Officers (one per police station, ${stations.length}):`);
  for (let i = 0; i < stations.length; i++) {
    const username = `reg${i + 1}`;
    const status = await createUser({
      username, password: SHARED_PASSWORD,
      full_name: `Registering Officer - ${stations[i].station_name}`,
      role: 'registrar', police_station_id: stations[i].id,
    });
    rows.push({ username, role: 'Registering Officer', station: stations[i].station_name, check_post: '-', status });
  }

  console.log(`Check Post Officers (one per check post, ${checkPosts.length}):`);
  for (let i = 0; i < checkPosts.length; i++) {
    const username = `gate${i + 1}`;
    const cp = checkPosts[i];
    const station = matchStation(stations, managingStationName(cp.name));
    const status = await createUser({
      username, password: SHARED_PASSWORD,
      full_name: `Check Post Officer - ${cp.name}`,
      role: 'district_scanner',
      police_station_id: station ? station.id : undefined,
      check_post_ids: [cp.id],
    });
    rows.push({
      username, role: 'Check Post Officer',
      station: station ? station.station_name : '(set manually)',
      check_post: cp.name, status,
    });
  }

  console.log('\n  USERNAME  ROLE                 STATION                 CHECK POST                        STATUS');
  for (const r of rows) {
    console.log(
      `  ${r.username.padEnd(9)} ${r.role.padEnd(20)} ${r.station.padEnd(23)} ${r.check_post.padEnd(33)} ${r.status}`,
    );
  }

  const created = rows.filter((r) => r.status === 'created').length;
  console.log(`\nDone. ${created} account(s) created, ${rows.length - created} already existed.`);
  console.log(`Temporary password for every account created in this run: ${SHARED_PASSWORD}`);
  console.log('Reset individual passwords from Admin -> Users if needed.');
}

main().catch((err) => { console.error('\nFailed:', err.message); process.exit(1); });
