import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const usersRouter = Router();

// Every route here is admin-only: account management is how role separation
// is bootstrapped, so it can't itself be reachable by a lesser role.
usersRouter.use(requireAuth, requireRole('admin'));

usersRouter.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.username, u.full_name, u.role, u.active,
            u.police_station_id, ps.station_name,
            u.entry_point_id, ep.name AS entry_point_name,
            (SELECT coalesce(json_agg(json_build_object('id', cp.id, 'name', cp.name) ORDER BY cp.name), '[]')
             FROM user_check_posts ucp
             JOIN entry_points cp ON cp.id = ucp.entry_point_id
             WHERE ucp.user_id = u.id) AS checkpoints
     FROM users u
     LEFT JOIN police_stations ps ON ps.id = u.police_station_id
     LEFT JOIN entry_points ep ON ep.id = u.entry_point_id
     ORDER BY u.role, u.username`,
  );
  res.json(rows);
});

// Replaces a check-post officer's assigned check posts (entry_points) with the
// given list of ids.
async function setCheckPosts(client, userId, ids) {
  await client.query('DELETE FROM user_check_posts WHERE user_id = $1', [userId]);
  for (const cpId of ids) {
    await client.query(
      'INSERT INTO user_check_posts (user_id, entry_point_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, cpId],
    );
  }
}

usersRouter.post('/', async (req, res) => {
  const { username, password, full_name, role, police_station_id, entry_point_id } = req.body || {};
  const checkPostIds = Array.isArray(req.body?.check_post_ids)
    ? req.body.check_post_ids.filter(Boolean)
    : [];

  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'username, password, full_name and role are required' });
  }
  if (!['admin', 'registrar', 'gate_scanner', 'district_scanner'].includes(role)) {
    return res.status(400).json({ error: 'invalid role' });
  }
  if (role === 'registrar' && !police_station_id) {
    return res.status(400).json({ error: 'registrar accounts require police_station_id' });
  }
  if (role === 'gate_scanner' && !entry_point_id) {
    return res.status(400).json({ error: 'gate_scanner accounts require entry_point_id' });
  }
  if (role === 'district_scanner' && checkPostIds.length === 0) {
    return res.status(400).json({ error: 'check-post officer accounts need at least one assigned check post' });
  }
  if (password.length < 10) {
    return res.status(400).json({ error: 'password must be at least 10 characters' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const created = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users (username, password_hash, full_name, role, police_station_id, entry_point_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, username, full_name, role, police_station_id, entry_point_id, active`,
        [username, passwordHash, full_name, role, police_station_id || null, entry_point_id || null],
      );
      if (role === 'district_scanner') await setCheckPosts(client, rows[0].id, checkPostIds);
      return rows[0];
    });
    res.status(201).json(created);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'username already exists' });
    throw err;
  }
});

usersRouter.patch('/:id', async (req, res) => {
  const { active, username, full_name, police_station_id, entry_point_id, password } = req.body || {};
  const checkPostIds = req.body?.check_post_ids;

  if (password && password.length < 10) {
    return res.status(400).json({ error: 'password must be at least 10 characters' });
  }
  if (full_name !== undefined && !full_name.trim()) {
    return res.status(400).json({ error: 'full_name cannot be blank' });
  }

  let newUsername;
  if (username !== undefined) {
    newUsername = String(username).trim();
    if (!newUsername) return res.status(400).json({ error: 'username cannot be blank' });
    if (/\s/.test(newUsername)) return res.status(400).json({ error: 'username cannot contain spaces' });
  }

  let notFound;
  try {
    notFound = await withTransaction(async (client) => {
      const sets = [];
      const values = [];
      let i = 1;

      if (active !== undefined) { sets.push(`active = $${i++}`); values.push(active); }
      if (newUsername !== undefined) { sets.push(`username = $${i++}`); values.push(newUsername); }
      if (full_name !== undefined) { sets.push(`full_name = $${i++}`); values.push(full_name.trim()); }
      if (police_station_id !== undefined) { sets.push(`police_station_id = $${i++}`); values.push(police_station_id || null); }
      if (entry_point_id !== undefined) { sets.push(`entry_point_id = $${i++}`); values.push(entry_point_id || null); }
      if (password) { sets.push(`password_hash = $${i++}`); values.push(await bcrypt.hash(password, 12)); }

      if (sets.length) {
        values.push(req.params.id);
        const { rows } = await client.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING id`, values);
        if (!rows[0]) return true;
      }
      if (Array.isArray(checkPostIds)) {
        await setCheckPosts(client, req.params.id, checkPostIds.filter(Boolean));
      }
      return false;
    });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That username is already taken' });
    throw err;
  }

  if (notFound) return res.status(404).json({ error: 'user not found' });
  res.json({ ok: true });
});

/**
 * Hard-delete a user account. Meant for clearing out test/mis-role accounts
 * before go-live. Their check-post assignments go with them (cascade) and any
 * scan-log rows they created are removed too, since those are test scans by a
 * test account. Blocked if the account registered vehicles or has admin edit
 * history — reassign/delete those first, or just disable the account.
 */
usersRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete the account you are signed in as.' });
  }

  const { rows: targetRows } = await query('SELECT id, role FROM users WHERE id = $1', [id]);
  const target = targetRows[0];
  if (!target) return res.status(404).json({ error: 'user not found' });

  if (target.role === 'admin') {
    const { rows: adminCount } = await query(
      "SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND active AND id <> $1", [id],
    );
    if (adminCount[0].n === 0) {
      return res.status(400).json({ error: 'This is the last active admin account — it cannot be deleted.' });
    }
  }

  const { rows: regRows } = await query('SELECT count(*)::int AS n FROM registrations WHERE registered_by = $1', [id]);
  if (regRows[0].n > 0) {
    return res.status(409).json({
      error: `This account registered ${regRows[0].n} vehicle(s). Delete or keep those records first, or just disable the account.`,
    });
  }

  try {
    await withTransaction(async (client) => {
      await client.query('DELETE FROM scan_log WHERE scanned_by = $1', [id]);
      await client.query('DELETE FROM district_scan_log WHERE scanned_by = $1', [id]);
      await client.query('DELETE FROM users WHERE id = $1', [id]);
    });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'This account has activity on file (e.g. an edit log) — disable it instead.' });
    }
    throw err;
  }

  res.json({ ok: true, deleted: true });
});
