import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
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
            u.district_checkpoint_id, dc.name AS district_checkpoint_name
     FROM users u
     LEFT JOIN police_stations ps ON ps.id = u.police_station_id
     LEFT JOIN entry_points ep ON ep.id = u.entry_point_id
     LEFT JOIN district_checkpoints dc ON dc.id = u.district_checkpoint_id
     ORDER BY u.role, u.username`,
  );
  res.json(rows);
});

usersRouter.post('/', async (req, res) => {
  const { username, password, full_name, role, police_station_id, entry_point_id, district_checkpoint_id } = req.body || {};

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
  // district_checkpoint_id is optional for district_scanner — it's just a
  // default; the officer picks their checkpoint in the scanner UI each shift.
  if (password.length < 10) {
    return res.status(400).json({ error: 'password must be at least 10 characters' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await query(
      `INSERT INTO users (username, password_hash, full_name, role, police_station_id, entry_point_id, district_checkpoint_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, full_name, role, police_station_id, entry_point_id, district_checkpoint_id, active`,
      [username, passwordHash, full_name, role, police_station_id || null, entry_point_id || null, district_checkpoint_id || null],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'username already exists' });
    }
    throw err;
  }
});

usersRouter.patch('/:id', async (req, res) => {
  const { active, police_station_id, entry_point_id, district_checkpoint_id, password } = req.body || {};
  const sets = [];
  const values = [];
  let i = 1;

  if (active !== undefined) { sets.push(`active = $${i++}`); values.push(active); }
  if (police_station_id !== undefined) { sets.push(`police_station_id = $${i++}`); values.push(police_station_id); }
  if (entry_point_id !== undefined) { sets.push(`entry_point_id = $${i++}`); values.push(entry_point_id); }
  if (district_checkpoint_id !== undefined) { sets.push(`district_checkpoint_id = $${i++}`); values.push(district_checkpoint_id); }
  if (password) {
    if (password.length < 10) return res.status(400).json({ error: 'password must be at least 10 characters' });
    sets.push(`password_hash = $${i++}`);
    values.push(await bcrypt.hash(password, 12));
  }
  if (sets.length === 0) return res.status(400).json({ error: 'no updatable fields provided' });

  values.push(req.params.id);
  const { rows } = await query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, username, full_name, role, active`,
    values,
  );
  if (!rows[0]) return res.status(404).json({ error: 'user not found' });
  res.json(rows[0]);
});
