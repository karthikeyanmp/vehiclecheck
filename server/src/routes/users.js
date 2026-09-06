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
            (SELECT coalesce(json_agg(json_build_object('id', dc.id, 'name', dc.name) ORDER BY dc.name), '[]')
             FROM user_district_checkpoints udc
             JOIN district_checkpoints dc ON dc.id = udc.district_checkpoint_id
             WHERE udc.user_id = u.id) AS checkpoints
     FROM users u
     LEFT JOIN police_stations ps ON ps.id = u.police_station_id
     LEFT JOIN entry_points ep ON ep.id = u.entry_point_id
     ORDER BY u.role, u.username`,
  );
  res.json(rows);
});

// Accepts district_checkpoint_ids (array) for district_scanner; keeps the
// legacy single district_checkpoint_id in sync (first of the list) for older
// code paths.
async function setCheckpoints(client, userId, ids) {
  await client.query('DELETE FROM user_district_checkpoints WHERE user_id = $1', [userId]);
  for (const cpId of ids) {
    await client.query(
      'INSERT INTO user_district_checkpoints (user_id, district_checkpoint_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, cpId],
    );
  }
  await client.query('UPDATE users SET district_checkpoint_id = $1 WHERE id = $2', [ids[0] ?? null, userId]);
}

usersRouter.post('/', async (req, res) => {
  const { username, password, full_name, role, police_station_id, entry_point_id } = req.body || {};
  const checkpointIds = Array.isArray(req.body?.district_checkpoint_ids)
    ? req.body.district_checkpoint_ids.filter(Boolean)
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
  if (role === 'district_scanner' && checkpointIds.length === 0) {
    return res.status(400).json({ error: 'district_scanner accounts need at least one assigned checkpoint' });
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
      if (role === 'district_scanner') await setCheckpoints(client, rows[0].id, checkpointIds);
      return rows[0];
    });
    res.status(201).json(created);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'username already exists' });
    throw err;
  }
});

usersRouter.patch('/:id', async (req, res) => {
  const { active, full_name, police_station_id, entry_point_id, password } = req.body || {};
  const checkpointIds = req.body?.district_checkpoint_ids;

  if (password && password.length < 10) {
    return res.status(400).json({ error: 'password must be at least 10 characters' });
  }
  if (full_name !== undefined && !full_name.trim()) {
    return res.status(400).json({ error: 'full_name cannot be blank' });
  }

  const notFound = await withTransaction(async (client) => {
    const sets = [];
    const values = [];
    let i = 1;

    if (active !== undefined) { sets.push(`active = $${i++}`); values.push(active); }
    if (full_name !== undefined) { sets.push(`full_name = $${i++}`); values.push(full_name.trim()); }
    if (police_station_id !== undefined) { sets.push(`police_station_id = $${i++}`); values.push(police_station_id || null); }
    if (entry_point_id !== undefined) { sets.push(`entry_point_id = $${i++}`); values.push(entry_point_id || null); }
    if (password) { sets.push(`password_hash = $${i++}`); values.push(await bcrypt.hash(password, 12)); }

    if (sets.length) {
      values.push(req.params.id);
      const { rows } = await client.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING id`, values);
      if (!rows[0]) return true;
    }
    if (Array.isArray(checkpointIds)) {
      await setCheckpoints(client, req.params.id, checkpointIds.filter(Boolean));
    }
    return false;
  });

  if (notFound) return res.status(404).json({ error: 'user not found' });
  res.json({ ok: true });
});
