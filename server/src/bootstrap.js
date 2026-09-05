import bcrypt from 'bcryptjs';
import { query } from './db.js';

/**
 * First-boot convenience for hosts with no shell access (Render free tier,
 * etc.) where `npm run seed:admin` can't be run by hand: if there is no
 * admin account yet and BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD
 * are set, create one. Once an admin exists this does nothing, so it's safe
 * to leave the env vars in place — though rotating the password and clearing
 * BOOTSTRAP_ADMIN_PASSWORD after first boot is cleaner.
 */
export async function bootstrapAdmin() {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!username || !password) return;

  const { rows } = await query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1");
  if (rows.length > 0) return;

  if (password.length < 10) {
    console.warn('BOOTSTRAP_ADMIN_PASSWORD is shorter than 10 characters — skipping admin bootstrap.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ($1, $2, 'Super Admin', 'admin')
     ON CONFLICT (username) DO NOTHING`,
    [username, passwordHash],
  );
  console.log(`Bootstrapped initial admin account "${username}".`);
}
