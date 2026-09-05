import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const masterDataRouter = Router();

masterDataRouter.use(requireAuth);

masterDataRouter.get('/police-stations', async (_req, res) => {
  const { rows } = await query(
    'SELECT id, district, station_name FROM police_stations ORDER BY district, station_name',
  );
  res.json(rows);
});

masterDataRouter.post('/police-stations', requireRole('admin'), async (req, res) => {
  const { district, station_name } = req.body || {};
  if (!district || !station_name) {
    return res.status(400).json({ error: 'district and station_name are required' });
  }
  const { rows } = await query(
    `INSERT INTO police_stations (district, station_name) VALUES ($1, $2)
     ON CONFLICT (district, station_name) DO UPDATE SET district = EXCLUDED.district
     RETURNING id, district, station_name`,
    [district, station_name],
  );
  res.status(201).json(rows[0]);
});

masterDataRouter.get('/entry-points', async (_req, res) => {
  const { rows } = await query(
    'SELECT id, name, district FROM entry_points ORDER BY district, name',
  );
  res.json(rows);
});

masterDataRouter.post('/entry-points', requireRole('admin'), async (req, res) => {
  const { name, district } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const { rows } = await query(
    `INSERT INTO entry_points (name, district) VALUES ($1, COALESCE($2, 'Madurai'))
     ON CONFLICT (name, district) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name, district`,
    [name, district],
  );
  res.status(201).json(rows[0]);
});

// District boundary checkpoints (home-district departure/return monitoring —
// currently only Thanjavur is seeded; adding another district is just a row
// here plus a district_scanner account tied to it, no code change needed).
masterDataRouter.get('/district-checkpoints', async (_req, res) => {
  const { rows } = await query(
    'SELECT id, name, district FROM district_checkpoints ORDER BY district, name',
  );
  res.json(rows);
});

masterDataRouter.post('/district-checkpoints', requireRole('admin'), async (req, res) => {
  const { name, district } = req.body || {};
  if (!name || !district) return res.status(400).json({ error: 'name and district are required' });
  const { rows } = await query(
    `INSERT INTO district_checkpoints (name, district) VALUES ($1, $2)
     ON CONFLICT (district, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name, district`,
    [name, district],
  );
  res.status(201).json(rows[0]);
});
