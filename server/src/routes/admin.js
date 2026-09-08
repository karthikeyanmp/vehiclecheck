import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('admin'));

// District departure/return monitoring only. "left" = ever crossed out
// (departed + returned); "still out" = departed and not yet returned;
// "not left" = not_departed. persons_* sum num_persons_traveling.
// Scoped to registrations whose home district has a check post (Thanjavur).
const MONITORED = "district IN (SELECT DISTINCT district FROM entry_points)";

adminRouter.get('/summary', async (_req, res) => {
  const [districtTotals, byStation, byCheckpoint] = await Promise.all([
    query(`
      SELECT district,
        count(*) FILTER (WHERE district_status = 'not_departed')            AS not_left,
        count(*) FILTER (WHERE district_status IN ('departed','returned'))  AS left_total,
        count(*) FILTER (WHERE district_status = 'returned')                AS returned,
        count(*) FILTER (WHERE district_status = 'departed')                AS still_out,
        coalesce(sum(num_persons_traveling) FILTER (WHERE district_status IN ('departed','returned')), 0) AS persons_left,
        coalesce(sum(num_persons_traveling) FILTER (WHERE district_status = 'returned'), 0)               AS persons_returned,
        coalesce(sum(num_persons_traveling) FILTER (WHERE district_status = 'departed'), 0)               AS persons_still_out
      FROM registrations WHERE ${MONITORED}
      GROUP BY district ORDER BY district
    `),
    // By the police station that registered the vehicle.
    query(`
      SELECT ps.station_name, ps.district,
        count(*) FILTER (WHERE r.district_status = 'not_departed')            AS not_left,
        count(*) FILTER (WHERE r.district_status IN ('departed','returned'))  AS left_total,
        count(*) FILTER (WHERE r.district_status = 'returned')                AS returned,
        count(*) FILTER (WHERE r.district_status = 'departed')                AS still_out,
        coalesce(sum(r.num_persons_traveling) FILTER (WHERE r.district_status IN ('departed','returned')), 0) AS persons_left,
        coalesce(sum(r.num_persons_traveling) FILTER (WHERE r.district_status = 'returned'), 0)               AS persons_returned
      FROM registrations r JOIN police_stations ps ON ps.id = r.police_station_id
      WHERE r.${MONITORED}
      GROUP BY ps.station_name, ps.district ORDER BY ps.district, ps.station_name
    `),
    // By the check post a vehicle first departed through, and whether it's back.
    query(`
      WITH departures AS (
        SELECT DISTINCT ON (registration_id) registration_id, entry_point_id
        FROM district_scan_log WHERE action = 'departed' AND entry_point_id IS NOT NULL
        ORDER BY registration_id, scanned_at
      )
      SELECT ep.name AS checkpoint, ep.district,
        count(*)                                                       AS left_via,
        count(*) FILTER (WHERE r.district_status = 'returned')         AS returned,
        count(*) FILTER (WHERE r.district_status = 'departed')         AS still_out,
        coalesce(sum(r.num_persons_traveling), 0)                                                   AS persons_left,
        coalesce(sum(r.num_persons_traveling) FILTER (WHERE r.district_status = 'returned'), 0)      AS persons_returned
      FROM departures d
      JOIN registrations r ON r.id = d.registration_id
      JOIN entry_points ep ON ep.id = d.entry_point_id
      GROUP BY ep.name, ep.district ORDER BY ep.name
    `),
  ]);

  res.json({
    districtTotals: districtTotals.rows,
    byStation: byStation.rows,
    byCheckpoint: byCheckpoint.rows,
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
            u.username AS scanned_by,
            coalesce(ep.name, dc.name) AS checkpoint
     FROM district_scan_log dsl
     JOIN registrations r ON r.id = dsl.registration_id
     JOIN users u ON u.id = dsl.scanned_by
     LEFT JOIN entry_points ep ON ep.id = dsl.entry_point_id
     LEFT JOIN district_checkpoints dc ON dc.id = dsl.district_checkpoint_id
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
