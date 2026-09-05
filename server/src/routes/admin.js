import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('admin'));

adminRouter.get('/summary', async (_req, res) => {
  const [totals, byEntryPoint, byStation, districtTotals, byDistrictCheckpoint] = await Promise.all([
    query(`
      SELECT
        count(*) FILTER (WHERE true) AS total,
        count(*) FILTER (WHERE current_status = 'not_arrived') AS not_arrived,
        count(*) FILTER (WHERE current_status = 'verified_entered') AS currently_inside,
        count(*) FILTER (WHERE current_status = 'verified_exited') AS exited
      FROM registrations
    `),
    query(`
      SELECT ep.name AS entry_point, r.current_status, count(*) AS n
      FROM registrations r JOIN entry_points ep ON ep.id = r.allowed_entry_point_id
      GROUP BY ep.name, r.current_status ORDER BY ep.name
    `),
    query(`
      SELECT ps.station_name, ps.district, r.current_status, count(*) AS n
      FROM registrations r JOIN police_stations ps ON ps.id = r.police_station_id
      GROUP BY ps.station_name, ps.district, r.current_status ORDER BY ps.district, ps.station_name
    `),
    // District monitoring is scoped to whichever districts have a
    // checkpoint (only Thanjavur for now) — counted by the registration's
    // own home district, not by checkpoint, so it reads correctly even if a
    // registration was scanned at a mismatched checkpoint.
    query(`
      SELECT district,
        count(*) FILTER (WHERE district_status = 'not_departed') AS not_departed,
        count(*) FILTER (WHERE district_status = 'departed') AS departed,
        count(*) FILTER (WHERE district_status = 'returned') AS returned
      FROM registrations
      WHERE district IN (SELECT DISTINCT district FROM district_checkpoints)
      GROUP BY district ORDER BY district
    `),
    query(`
      SELECT dc.name AS checkpoint, dc.district, dsl.action, count(*) AS n
      FROM district_scan_log dsl JOIN district_checkpoints dc ON dc.id = dsl.district_checkpoint_id
      GROUP BY dc.name, dc.district, dsl.action ORDER BY dc.district, dc.name
    `),
  ]);

  res.json({
    totals: totals.rows[0],
    byEntryPoint: byEntryPoint.rows,
    byStation: byStation.rows,
    districtTotals: districtTotals.rows,
    byDistrictCheckpoint: byDistrictCheckpoint.rows,
  });
});

adminRouter.get('/scan-log', async (req, res) => {
  const { registration_id } = req.query;
  const where = registration_id ? 'WHERE sl.registration_id = $1' : '';
  const values = registration_id ? [registration_id] : [];
  const { rows } = await query(
    `SELECT sl.id, sl.action, sl.scanned_at, sl.gate_mismatch,
            r.vehicle_number, r.applicant_name, r.permit_number,
            u.username AS scanned_by, ep.name AS entry_point
     FROM scan_log sl
     JOIN registrations r ON r.id = sl.registration_id
     JOIN users u ON u.id = sl.scanned_by
     JOIN entry_points ep ON ep.id = sl.entry_point_id
     ${where}
     ORDER BY sl.scanned_at DESC
     LIMIT 500`,
    values,
  );
  res.json(rows);
});

adminRouter.get('/district-scan-log', async (req, res) => {
  const { registration_id } = req.query;
  const where = registration_id ? 'WHERE dsl.registration_id = $1' : '';
  const values = registration_id ? [registration_id] : [];
  const { rows } = await query(
    `SELECT dsl.id, dsl.action, dsl.scanned_at, dsl.district_mismatch,
            r.vehicle_number, r.applicant_name, r.permit_number,
            u.username AS scanned_by, dc.name AS checkpoint
     FROM district_scan_log dsl
     JOIN registrations r ON r.id = dsl.registration_id
     JOIN users u ON u.id = dsl.scanned_by
     JOIN district_checkpoints dc ON dc.id = dsl.district_checkpoint_id
     ${where}
     ORDER BY dsl.scanned_at DESC
     LIMIT 500`,
    values,
  );
  res.json(rows);
});

adminRouter.get('/edit-log', async (req, res) => {
  const { registration_id } = req.query;
  const where = registration_id ? 'WHERE ael.registration_id = $1' : '';
  const values = registration_id ? [registration_id] : [];
  const { rows } = await query(
    `SELECT ael.id, ael.changes, ael.edited_at, u.username AS edited_by, ael.registration_id
     FROM admin_edit_log ael JOIN users u ON u.id = ael.edited_by
     ${where}
     ORDER BY ael.edited_at DESC
     LIMIT 500`,
    values,
  );
  res.json(rows);
});

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

adminRouter.get('/export.csv', async (_req, res) => {
  const { rows } = await query(`
    SELECT r.permit_number, r.vehicle_number, r.vehicle_type, r.applicant_name,
           r.applicant_age, r.applicant_mobile, r.district, ps.station_name,
           ep.name AS allowed_entry_point, r.num_persons_traveling,
           r.current_status, r.created_at
    FROM registrations r
    JOIN police_stations ps ON ps.id = r.police_station_id
    JOIN entry_points ep ON ep.id = r.allowed_entry_point_id
    ORDER BY r.created_at
  `);

  const columns = Object.keys(rows[0] || {
    permit_number: '', vehicle_number: '', vehicle_type: '', applicant_name: '',
    applicant_age: '', applicant_mobile: '', district: '', station_name: '',
    allowed_entry_point: '', num_persons_traveling: '', current_status: '', created_at: '',
  });
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(row[c])).join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="registrations-export.csv"');
  // Sensitive: this export includes mobile numbers — it stays admin-only
  // and should be deleted per the agreed data-retention window after the event.
  res.send(lines.join('\n'));
});
