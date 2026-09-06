import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { verifyQrToken } from '../services/qr.js';
import { absoluteUploadPath } from '../services/uploads.js';

export const scanRouter = Router();
scanRouter.use(requireAuth);

const NEXT_ACTION = {
  not_arrived: 'verified_entered',
  verified_entered: 'verified_exited',
  verified_exited: null, // already exited — nothing further to verify
};

async function loadForGate(regId) {
  const { rows } = await query(
    `SELECT r.id, r.applicant_name, r.vehicle_number, r.vehicle_type,
            r.num_persons_traveling, r.applicant_photo_path, r.current_status,
            r.allowed_entry_point_id, ep.name AS allowed_entry_point_name
     FROM registrations r
     JOIN entry_points ep ON ep.id = r.allowed_entry_point_id
     WHERE r.id = $1`,
    [regId],
  );
  return rows[0];
}

/**
 * Gate personnel scan a QR and get back ONLY what they need to verify a
 * person at the gate — never the RC copy or mobile number, regardless of
 * what a curious officer might ask the API for directly.
 */
scanRouter.post('/lookup', requireRole('gate_scanner'), async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token is required' });

  let regId;
  try {
    regId = verifyQrToken(token);
  } catch {
    return res.status(400).json({ error: 'QR code is invalid or expired' });
  }

  const reg = await loadForGate(regId);
  if (!reg) return res.status(404).json({ error: 'No registration found for this QR' });

  res.json({
    registrationId: reg.id,
    applicantName: reg.applicant_name,
    vehicleNumber: reg.vehicle_number,
    vehicleType: reg.vehicle_type,
    numPersonsTraveling: reg.num_persons_traveling,
    photoUrl: `/api/scan/photo/${reg.id}`,
    currentStatus: reg.current_status,
    allowedEntryPointName: reg.allowed_entry_point_name,
    gateMismatch: reg.allowed_entry_point_id !== req.user.entryPointId,
    nextAction: NEXT_ACTION[reg.current_status],
  });
});

/**
 * Minimal photo-thumbnail endpoint for gate/checkpoint personnel — no RC, no
 * other fields. Shared by both scan.js (event gates) and district-scan.js
 * (home-district checkpoints), since both need the same thumbnail.
 */
scanRouter.get('/photo/:id', requireRole('gate_scanner', 'district_scanner', 'registrar', 'admin'), async (req, res) => {
  const { rows } = await query('SELECT applicant_photo_path FROM registrations WHERE id = $1', [req.params.id]);
  if (!rows[0] || !rows[0].applicant_photo_path) return res.status(404).end();
  res.sendFile(absoluteUploadPath(rows[0].applicant_photo_path));
});

scanRouter.post('/verify', requireRole('gate_scanner'), async (req, res) => {
  const { token, action } = req.body || {};
  if (!token || !['verified_entered', 'verified_exited'].includes(action)) {
    return res.status(400).json({ error: 'token and a valid action are required' });
  }

  let regId;
  try {
    regId = verifyQrToken(token);
  } catch {
    return res.status(400).json({ error: 'QR code is invalid or expired' });
  }

  const result = await withTransaction(async (client) => {
      // Lock the row so two gate devices scanning the same QR within
      // milliseconds of each other can't both push a stale transition through.
      const { rows } = await client.query(
        `SELECT id, current_status, allowed_entry_point_id FROM registrations WHERE id = $1 FOR UPDATE`,
        [regId],
      );
      const reg = rows[0];
      if (!reg) return { status: 404, body: { error: 'No registration found for this QR' } };

      if (NEXT_ACTION[reg.current_status] !== action) {
        return {
          status: 409,
          body: {
            error: `Cannot mark "${action}" — current status is "${reg.current_status}"`,
            currentStatus: reg.current_status,
          },
        };
      }

      const gateMismatch = reg.allowed_entry_point_id !== req.user.entryPointId;

      await client.query('UPDATE registrations SET current_status = $1 WHERE id = $2', [action, regId]);
      await client.query(
        `INSERT INTO scan_log (registration_id, action, scanned_by, entry_point_id, gate_mismatch)
         VALUES ($1, $2, $3, $4, $5)`,
        [regId, action, req.user.id, req.user.entryPointId, gateMismatch],
      );

      return { status: 200, body: { registrationId: regId, currentStatus: action, gateMismatch } };
    });

  res.status(result.status).json(result.body);
});
