import bcrypt from 'bcryptjs';
import { query } from './db.js';

/**
 * Admin account bootstrap for hosts with no shell access (Render free tier,
 * etc.) where `npm run seed:admin` can't be run by hand.
 *
 * If BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD are set, this
 * upserts that admin on every boot — so the env vars are the source of
 * truth for the admin login, and fixing a mistyped password is just an
 * env-var edit + redeploy. The password is trimmed first, since a trailing
 * newline pasted into a hosting env-var field is a classic "login won't
 * work" cause.
 */
export async function bootstrapAdmin() {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
  if (!username || !password) return;

  if (password.length < 10) {
    console.warn('BOOTSTRAP_ADMIN_PASSWORD is shorter than 10 characters — skipping admin bootstrap.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const { rowCount } = await query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ($1, $2, 'Super Admin', 'admin')
     ON CONFLICT (username)
       DO UPDATE SET password_hash = EXCLUDED.password_hash, active = true`,
    [username, passwordHash],
  );
  console.log(`Bootstrapped admin account "${username}" (${rowCount ? 'ok' : 'no change'}).`);
}
