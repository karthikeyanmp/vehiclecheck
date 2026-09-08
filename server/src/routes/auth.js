import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { requireAuth, signSessionToken } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const { rows } = await query(
    `SELECT u.id, u.username, u.password_hash, u.full_name, u.role, u.active,
            u.police_station_id, ps.station_name AS police_station_name,
            u.entry_point_id, ep.name AS entry_point_name,
            u.district_checkpoint_id
     FROM users u
     LEFT JOIN police_stations ps ON ps.id = u.police_station_id
     LEFT JOIN entry_points ep ON ep.id = u.entry_point_id
     WHERE u.username = $1`,
    [username],
  );
  const user = rows[0];

  // Same generic message whether the username doesn't exist or the password
  // is wrong, and whether the account is disabled — don't help an attacker
  // enumerate valid usernames or figure out which accounts still work.
  const genericError = { error: 'Invalid username or password' };
  if (!user || !user.active) {
    return res.status(401).json(genericError);
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json(genericError);
  }

  let assignedCheckpoints = [];
  if (user.role === 'district_scanner') {
    const { rows: cps } = await query(
      `SELECT ep.id, ep.name, ep.district
       FROM user_check_posts ucp
       JOIN entry_points ep ON ep.id = ucp.entry_point_id
       WHERE ucp.user_id = $1 ORDER BY ep.name`,
      [user.id],
    );
    assignedCheckpoints = cps;
  }

  const token = signSessionToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      policeStationId: user.police_station_id,
      policeStationName: user.police_station_name,
      entryPointId: user.entry_point_id,
      entryPointName: user.entry_point_name,
      districtCheckpointId: user.district_checkpoint_id,
      assignedCheckpoints,
    },
  });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
