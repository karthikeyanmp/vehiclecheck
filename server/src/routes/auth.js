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
    `SELECT id, username, password_hash, full_name, role, police_station_id, entry_point_id, district_checkpoint_id, active
     FROM users WHERE username = $1`,
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

  const token = signSessionToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      policeStationId: user.police_station_id,
      entryPointId: user.entry_point_id,
      districtCheckpointId: user.district_checkpoint_id,
    },
  });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
