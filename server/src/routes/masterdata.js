import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const masterDataRouter = Router();

masterDataRouter.use(requireAuth);

// Shared update / delete for the three master-data tables. `table` and
// `columns` are fixed literals from the route definitions below (never user
// input), so interpolating them into SQL is safe.
function updateRoute(table, columns, conflictLabel) {
  return async (req, res) => {
    const values = columns.map((c) => req.body?.[c]);
    if (values.some((v) => v === undefined || v === null || v === '')) {
      return res.status(400).json({ error: `${columns.join(' and ')} are required` });
    }
    const sets = columns.map((c, i) => `${c} = $${i + 1}`).join(', ');
    try {
      const { rows } = await query(
        `UPDATE ${table} SET ${sets} WHERE id = $${columns.length + 1} RETURNING id, ${columns.join(', ')}`,
        [...values, req.params.id],
      );
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: `${conflictLabel} already exists` });
      throw err;
    }
  };
}

function deleteRoute(table) {
  return async (req, res) => {
    try {
      const { rowCount } = await query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: 'Not found' });
      res.status(204).end();
    } catch (err) {
      if (err.code === '23503') {
        return res.status(409).json({
          error: 'Cannot delete — still referenced by registrations, scan logs, or user accounts.',
        });
      }
      throw err;
    }
  };
}

masterDataRouter.get('/police-stations', async (_req, res) => {
  const { rows } = await query(
    'SELECT id, district, station_name FROM police_stations ORDER BY station_name ASC, district ASC',
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

masterDataRouter.patch('/police-stations/:id', requireRole('admin'),
  updateRoute('police_stations', ['district', 'station_name'], 'A station with that district and name'));
masterDataRouter.delete('/police-stations/:id', requireRole('admin'), deleteRoute('police_stations'));

masterDataRouter.get('/entry-points', async (_req, res) => {
  const { rows } = await query(
    'SELECT id, name, district FROM entry_points ORDER BY name ASC, district ASC',
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

masterDataRouter.patch('/entry-points/:id', requireRole('admin'),
  updateRoute('entry_points', ['name', 'district'], 'An entry point with that name and district'));
masterDataRouter.delete('/entry-points/:id', requireRole('admin'), deleteRoute('entry_points'));

// District boundary checkpoints (home-district departure/return monitoring —
// currently only Thanjavur is seeded; adding another district is just a row
// here plus a district_scanner account tied to it, no code change needed).
masterDataRouter.get('/district-checkpoints', async (_req, res) => {
  const { rows } = await query(
    'SELECT id, name, district FROM district_checkpoints ORDER BY name ASC, district ASC',
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

masterDataRouter.patch('/district-checkpoints/:id', requireRole('admin'),
  updateRoute('district_checkpoints', ['name', 'district'], 'A checkpoint with that name and district'));
masterDataRouter.delete('/district-checkpoints/:id', requireRole('admin'), deleteRoute('district_checkpoints'));
