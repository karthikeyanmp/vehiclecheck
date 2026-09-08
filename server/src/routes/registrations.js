import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { withTransaction, query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadRegistrationFiles, absoluteUploadPath } from '../services/uploads.js';
import { issueQrToken } from '../services/qr.js';
import { renderPermitPdf } from '../services/certificate.js';

export const registrationsRouter = Router();
registrationsRouter.use(requireAuth);

const REG_SUMMARY_COLUMNS = `
  r.id, r.vehicle_number, r.vehicle_type, r.applicant_name, r.applicant_mobile,
  r.applicant_age, r.district, r.num_persons_traveling, r.current_status,
  r.district_status, r.permit_number, r.created_at,
  ps.station_name, ep.name AS allowed_entry_point_name
`;

function scopeToOwnStation(req, whereClauses, values) {
  if (req.user.role === 'registrar') {
    values.push(req.user.policeStationId);
    whereClauses.push(`r.police_station_id = $${values.length}`);
  }
}

/** Registering Officer creates a registration; Admin can also create one directly. */
registrationsRouter.post(
  '/',
  requireRole('registrar', 'admin'),
  uploadRegistrationFiles,
  async (req, res) => {
    const b = req.body || {};
    const files = req.files || {};
    const photo = files.applicant_photo?.[0];
    const rc = files.rc_copy?.[0];
    const vehiclePhoto = files.vehicle_photo?.[0];

    // Remove whatever did get uploaded when we reject the request before the
    // DB insert, so a failed submit doesn't leave orphaned files on disk.
    const discardUploads = () => {
      for (const f of [photo && `photos/${photo.filename}`, rc && `rc/${rc.filename}`, vehiclePhoto && `vehicle/${vehiclePhoto.filename}`]) {
        if (f) fs.unlink(absoluteUploadPath(f), () => {});
      }
    };
    const reject = (status, error) => { discardUploads(); return res.status(status).json({ error }); };

    const required = ['vehicle_number', 'vehicle_type', 'applicant_name', 'applicant_mobile', 'district', 'allowed_entry_point_id'];
    for (const field of required) {
      if (!b[field]) return reject(400, `${field} is required`);
    }

    // The applicant photo, RC and vehicle photo are all mandatory.
    if (!photo) return reject(400, 'Applicant photo is required');
    if (!rc) return reject(400, 'RC photo is required');
    if (!vehiclePhoto) return reject(400, 'Vehicle photo is required');

    // A registrar can only ever create records for their own station.
    const policeStationId = req.user.role === 'registrar' ? req.user.policeStationId : b.police_station_id;
    if (!policeStationId) {
      return reject(400, 'police_station_id is required');
    }

    let coPassengers = [];
    if (b.co_passengers) {
      try {
        coPassengers = JSON.parse(b.co_passengers);
      } catch {
        return reject(400, 'co_passengers must be a JSON array');
      }
    }

    try {
      const registration = await withTransaction(async (client) => {
        const permitRow = await client.query("SELECT nextval('permit_number_seq') AS n");
        const permitNumber = `ESR26-${String(permitRow.rows[0].n).padStart(6, '0')}`;

        // Generate the id up front so the QR token can be computed and
        // stored in the same INSERT — no placeholder-then-update, which
        // would otherwise collide on the qr_token unique constraint under
        // concurrent registrations.
        const regId = crypto.randomUUID();
        const qrToken = issueQrToken(regId);

        await client.query(
          `INSERT INTO registrations (
             id, vehicle_number, vehicle_type, rc_copy_path, applicant_photo_path,
             vehicle_photo_path, applicant_name, applicant_age, applicant_mobile, district,
             police_station_id, num_persons_traveling, allowed_entry_point_id,
             registered_by, qr_token, permit_number
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [
            regId,
            b.vehicle_number.trim().toUpperCase(),
            b.vehicle_type,
            `rc/${rc.filename}`,
            `photos/${photo.filename}`,
            `vehicle/${vehiclePhoto.filename}`,
            b.applicant_name.trim().toUpperCase(),
            b.applicant_age || null,
            b.applicant_mobile.trim(),
            b.district.trim(),
            policeStationId,
            b.num_persons_traveling || 1,
            b.allowed_entry_point_id,
            req.user.id,
            qrToken,
            permitNumber,
          ],
        );

        for (const p of coPassengers) {
          if (!p.name) continue;
          await client.query(
            'INSERT INTO co_passengers (registration_id, name, age, gender) VALUES ($1,$2,$3,$4)',
            [regId, p.name, p.age || null, p.gender || null],
          );
        }

        return { id: regId, permitNumber };
      });

      res.status(201).json(registration);
    } catch (err) {
      discardUploads(); // don't leave orphaned files if the DB insert failed
      throw err;
    }
  },
);

/** List registrations — registrars see only their own station's; admin sees all, with filters. */
registrationsRouter.get('/', requireRole('registrar', 'admin'), async (req, res) => {
  const where = [];
  const values = [];
  scopeToOwnStation(req, where, values);

  const { search, status, district_status } = req.query;
  if (search) {
    values.push(`%${search}%`);
    where.push(`(r.vehicle_number ILIKE $${values.length} OR r.applicant_name ILIKE $${values.length} OR r.applicant_mobile ILIKE $${values.length})`);
  }
  if (status) {
    values.push(status);
    where.push(`r.current_status = $${values.length}`);
  }
  if (district_status) {
    values.push(district_status);
    where.push(`r.district_status = $${values.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT ${REG_SUMMARY_COLUMNS}
     FROM registrations r
     JOIN police_stations ps ON ps.id = r.police_station_id
     JOIN entry_points ep ON ep.id = r.allowed_entry_point_id
     ${whereSql}
     ORDER BY r.created_at DESC
     LIMIT 200`,
    values,
  );
  res.json(rows);
});

async function loadFullRegistration(id) {
  const { rows } = await query(
    `SELECT r.*, ps.district AS station_district, ps.station_name, ep.name AS entry_point_name
     FROM registrations r
     JOIN police_stations ps ON ps.id = r.police_station_id
     JOIN entry_points ep ON ep.id = r.allowed_entry_point_id
     WHERE r.id = $1`,
    [id],
  );
  return rows[0];
}

function assertStationAccess(req, res, reg) {
  if (req.user.role === 'registrar' && reg.police_station_id !== req.user.policeStationId) {
    res.status(403).json({ error: 'Not your station’s record' });
    return false;
  }
  return true;
}

registrationsRouter.get('/:id', requireRole('registrar', 'admin'), async (req, res) => {
  const reg = await loadFullRegistration(req.params.id);
  if (!reg) return res.status(404).json({ error: 'not found' });
  if (!assertStationAccess(req, res, reg)) return;

  const { rows: coPassengers } = await query(
    'SELECT name, age, gender FROM co_passengers WHERE registration_id = $1',
    [reg.id],
  );
  res.json({ ...reg, co_passengers: coPassengers });
});

const ADMIN_ONLY_FIELDS = new Set(['allowed_entry_point_id', 'police_station_id', 'current_status']);
const EDITABLE_FIELDS = ['vehicle_number', 'vehicle_type', 'applicant_name', 'applicant_age', 'applicant_mobile', 'district', 'num_persons_traveling', 'allowed_entry_point_id', 'police_station_id', 'current_status'];

registrationsRouter.patch('/:id', requireRole('registrar', 'admin'), async (req, res) => {
  const reg = await loadFullRegistration(req.params.id);
  if (!reg) return res.status(404).json({ error: 'not found' });
  if (!assertStationAccess(req, res, reg)) return;

  const changes = {};
  const sets = [];
  const values = [];
  let i = 1;
  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] === undefined) continue;
    if (req.user.role !== 'admin' && ADMIN_ONLY_FIELDS.has(field)) {
      return res.status(403).json({ error: `Only admin can change ${field}` });
    }
    const newVal = req.body[field];
    if (String(reg[field]) === String(newVal)) continue;
    changes[field] = { old: reg[field], new: newVal };
    sets.push(`${field} = $${i++}`);
    values.push(newVal);
  }

  if (sets.length === 0) return res.json({ id: reg.id, changed: false });

  values.push(reg.id);
  await withTransaction(async (client) => {
    await client.query(`UPDATE registrations SET ${sets.join(', ')} WHERE id = $${i}`, values);
    // Every correction is logged with who/when — corrections must never
    // silently overwrite history, especially on a police-administered record.
    await client.query(
      'INSERT INTO admin_edit_log (registration_id, edited_by, changes) VALUES ($1, $2, $3)',
      [reg.id, req.user.id, JSON.stringify(changes)],
    );
  });

  res.json({ id: reg.id, changed: true, changes });
});

/**
 * Hard-delete a registration and everything attached to it — scan history,
 * district-scan history, edit log, co-passengers, uploaded files. Admin only;
 * meant for clearing out test/mistaken records before go-live, so it's a real
 * delete, not a soft flag.
 */
registrationsRouter.delete('/:id', requireRole('admin'), async (req, res) => {
  const reg = await loadFullRegistration(req.params.id);
  if (!reg) return res.status(404).json({ error: 'not found' });

  await withTransaction(async (client) => {
    await client.query('DELETE FROM scan_log WHERE registration_id = $1', [reg.id]);
    await client.query('DELETE FROM district_scan_log WHERE registration_id = $1', [reg.id]);
    await client.query('DELETE FROM admin_edit_log WHERE registration_id = $1', [reg.id]);
    await client.query('DELETE FROM co_passengers WHERE registration_id = $1', [reg.id]);
    await client.query('DELETE FROM registrations WHERE id = $1', [reg.id]);
  });

  for (const relPath of [reg.applicant_photo_path, reg.rc_copy_path, reg.vehicle_photo_path]) {
    if (relPath) fs.unlink(absoluteUploadPath(relPath), () => {});
  }

  res.json({ id: reg.id, deleted: true });
});

/** Streams RC copy or applicant photo. Gate scanners never reach this route (photo is served via /scan/lookup instead). */
registrationsRouter.get('/:id/file/:type', requireRole('registrar', 'admin'), async (req, res) => {
  const reg = await loadFullRegistration(req.params.id);
  if (!reg) return res.status(404).json({ error: 'not found' });
  if (!assertStationAccess(req, res, reg)) return;

  const { type } = req.params;
  const relPathByType = {
    photo: reg.applicant_photo_path,
    rc: reg.rc_copy_path,
    vehicle: reg.vehicle_photo_path,
  };
  if (!(type in relPathByType)) return res.status(400).json({ error: 'invalid file type' });
  const relPath = relPathByType[type];
  if (!relPath) return res.status(404).json({ error: `no ${type} on file for this registration` });
  res.sendFile(absoluteUploadPath(relPath));
});

registrationsRouter.get('/:id/certificate.pdf', requireRole('registrar', 'admin'), async (req, res) => {
  const reg = await loadFullRegistration(req.params.id);
  if (!reg) return res.status(404).json({ error: 'not found' });
  if (!assertStationAccess(req, res, reg)) return;

  const pdf = await renderPermitPdf(reg);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="permit-${reg.permit_number}.pdf"`);
  res.send(pdf);
});
