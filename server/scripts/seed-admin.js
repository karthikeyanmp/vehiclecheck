// Creates (or resets the password of) one admin account.
// Usage: node scripts/seed-admin.js <username> <password>
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const [, , username, password] = process.argv;

if (!username || !password) {
  console.error('Usage: node scripts/seed-admin.js <username> <password>');
  process.exit(1);
}
if (password.length < 10) {
  console.error('Password must be at least 10 characters.');
  process.exit(1);
}

async function main() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  const passwordHash = await bcrypt.hash(password, 12);
  await client.query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ($1, $2, 'Super Admin', 'admin')
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, active = true`,
    [username, passwordHash],
  );

  console.log(`Admin account "${username}" is ready.`);
  await client.end();
}

main();
