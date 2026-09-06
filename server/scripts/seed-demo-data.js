// Populates a RUNNING deployment with demo scanner accounts + registrations,
// via the API — so QR tokens are signed with that server's own secret
// (a direct DB insert would make QR codes that fail verification).
//
// Usage:
//   node scripts/seed-demo-data.js <baseUrl> <adminUser> <adminPassword>
// e.g.
//   node scripts/seed-demo-data.js https://vehicle-permit.onrender.com admin PoliceEvent2026

const [, , rawBase, adminUser, adminPass] = process.argv;

if (!rawBase || !adminUser || !adminPass) {
  console.error('Usage: node scripts/seed-demo-data.js <baseUrl> <adminUser> <adminPassword>');
  process.exit(1);
}
const API = rawBase.replace(/\/+$/, '');

// Minimal valid JPEG (grey 1x1-ish) — stands in for the photo / RC copy.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

async function readJson(res) {
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.url}\n${typeof body === 'string' ? body.slice(0, 300) : JSON.stringify(body)}`);
  }
  return body;
}

const DEMO = [
  { vehicle_number: 'TN45AA1111', vehicle_type: 'two_wheeler', applicant_name: 'Selvi Priya', applicant_age: 28, applicant_mobile: '9000000001', district: 'Thanjavur', num_persons_traveling: 2 },
  { vehicle_number: 'TN49BB2222', vehicle_type: 'four_wheeler', applicant_name: 'Karthik Raja', applicant_age: 41, applicant_mobile: '9000000002', district: 'Trichy', num_persons_traveling: 4 },
  { vehicle_number: 'TN58CC3333', vehicle_type: 'two_wheeler', applicant_name: 'Meena Kumari', applicant_age: 23, applicant_mobile: '9000000003', district: 'Pudukkottai', num_persons_traveling: 1 },
  { vehicle_number: 'TN63DD4444', vehicle_type: 'four_wheeler', applicant_name: 'Arun Prakash', applicant_age: 35, applicant_mobile: '9000000004', district: 'Sivaganga', num_persons_traveling: 3 },
  { vehicle_number: 'TN72EE5555', vehicle_type: 'four_wheeler', applicant_name: 'Lakshmi Devi', applicant_age: 50, applicant_mobile: '9000000005', district: 'Ramanathapuram', num_persons_traveling: 5 },
];

async function main() {
  const { token } = await readJson(await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: adminUser, password: adminPass }),
  }));
  const auth = { Authorization: `Bearer ${token}` };
  console.log('Logged in as admin.');

  const stations = await readJson(await fetch(`${API}/api/master-data/police-stations`, { headers: auth }));
  const entryPoints = await readJson(await fetch(`${API}/api/master-data/entry-points`, { headers: auth }));
  const checkpoints = await readJson(await fetch(`${API}/api/master-data/district-checkpoints`, { headers: auth }));

  if (!stations.length || !entryPoints.length) {
    throw new Error('No police stations / entry points found — did the migrations run?');
  }

  async function ensureUser(payload) {
    const res = await fetch(`${API}/api/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify(payload),
    });
    if (res.status === 409) { console.log(`  ${payload.username}: already exists`); return; }
    await readJson(res);
    console.log(`  ${payload.username}: created (${payload.role})`);
  }

  console.log('Demo scanner accounts:');
  await ensureUser({ username: 'reg1', password: 'RegistrarPass123', full_name: 'Demo Registrar', role: 'registrar', police_station_id: stations[0].id });
  await ensureUser({ username: 'gate1', password: 'GatePass12345', full_name: 'Demo Gate Officer', role: 'gate_scanner', entry_point_id: entryPoints[0].id });
  if (checkpoints.length) {
    await ensureUser({
      username: 'dist1', password: 'DistrictPass123', full_name: 'Demo District Officer',
      role: 'district_scanner',
      police_station_id: stations[0].id,
      district_checkpoint_ids: checkpoints.map((c) => c.id), // assign all for the demo
    });
  }

  console.log('Registrations:');
  for (let i = 0; i < DEMO.length; i++) {
    const d = DEMO[i];
    const fd = new FormData();
    for (const [k, v] of Object.entries(d)) fd.append(k, String(v));
    fd.append('police_station_id', String(stations[i % stations.length].id));
    fd.append('allowed_entry_point_id', String(entryPoints[i % entryPoints.length].id));
    fd.append('applicant_photo', new Blob([JPEG], { type: 'image/jpeg' }), 'photo.jpg');
    fd.append('rc_copy', new Blob([JPEG], { type: 'image/jpeg' }), 'rc.jpg');

    const r = await readJson(await fetch(`${API}/api/registrations`, { method: 'POST', headers: auth, body: fd }));
    console.log(`  ${r.permitNumber}  ${d.vehicle_number}  ${d.applicant_name} (${d.district})`);
  }

  console.log('\nDone. Demo logins: reg1/RegistrarPass123, gate1/GatePass12345, dist1/DistrictPass123');
}

main().catch((err) => { console.error('\nFailed:', err.message); process.exit(1); });
