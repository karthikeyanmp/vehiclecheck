import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { verifyQrToken } from '../services/qr.js';

/**
 * District entry/exit monitoring — a separate checkpoint type from the
 * Madurai event gates in scan.js. Tracks a vehicle leaving and returning
 * through its *home* district's border (Thanjavur only, for now). Same
 * QR/permit as the event gates; it just tracks its own status
 * (`district_status`) on the registration row, independent of the event's
 * `current_status`.
 *
 * A district_scanner isn't pinned to one checkpoint — the officer picks
 * which of their district's checkpoints they're at, and it's sent as
 * `checkpointId` with every lookup/verify.
 */
export const districtScanRouter = Router();
districtScanRouter.use(requireAuth);

const NEXT_ACTION = {
  not_departed: 'departed',
  departed: 'returned',
  returned: null, // round trip complete — nothing further to verify here
};

async function loadRegistration(regId) {
  const { rows } = await query(
    `SELECT id, applicant_name, vehicle_number, vehicle_type, district,
            num_persons_traveling, district_status
     FROM registrations WHERE id = $1`,
    [regId],
  );
  return rows[0];
}

async function loadCheckpoint(checkpointId) {
  if (!checkpointId) return undefined;
  const { rows } = await query('SELECT id, name, district FROM district_checkpoints WHERE id = $1', [checkpointId]);
  return rows[0];
}

function districtMismatch(reg, checkpoint) {
  return (reg.district || '').trim().toLowerCase() !== (checkpoint?.district || '').trim().toLowerCase();
}

districtScanRouter.post('/lookup', requireRole('district_scanner'), async (req, res) => {
  const { token, checkpointId } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token is required' });

  let regId;
  try {
    regId = verifyQrToken(token);
  } catch {
    return res.status(400).json({ error: 'QR code is invalid or expired' });
  }

  const reg = await loadRegistration(regId);
  if (!reg) return res.status(404).json({ error: 'No registration found for this QR' });
  const checkpoint = await loadCheckpoint(checkpointId ?? req.user.districtCheckpointId);

  res.json({
    registrationId: reg.id,
    applicantName: reg.applicant_name,
    vehicleNumber: reg.vehicle_number,
    vehicleType: reg.vehicle_type,
    numPersonsTraveling: reg.num_persons_traveling,
    photoUrl: `/api/scan/photo/${reg.id}`,
    districtStatus: reg.district_status,
    registrationDistrict: reg.district,
    checkpointDistrict: checkpoint?.district,
    // Flagged, not blocked — same judgement-call pattern as the gate mismatch.
    districtMismatch: districtMismatch(reg, checkpoint),
    nextAction: NEXT_ACTION[reg.district_status],
  });
});

districtScanRouter.post('/verify', requireRole('district_scanner'), async (req, res) => {
  const { token, action, checkpointId } = req.body || {};
  if (!token || !['departed', 'returned'].includes(action)) {
    return res.status(400).json({ error: 'token and a valid action are required' });
  }

  const chosenCheckpointId = checkpointId ?? req.user.districtCheckpointId;
  const checkpoint = await loadCheckpoint(chosenCheckpointId);
  if (!checkpoint) {
    return res.status(400).json({ error: 'Select which checkpoint you are at before verifying' });
  }

  let regId;
  try {
    regId = verifyQrToken(token);
  } catch {
    return res.status(400).json({ error: 'QR code is invalid or expired' });
  }

  const result = await withTransaction(async (client) => {
    // Row lock — same double-scan protection as the event gate's verify.
    const { rows } = await client.query(
      'SELECT id, district, district_status FROM registrations WHERE id = $1 FOR UPDATE',
      [regId],
    );
    const reg = rows[0];
    if (!reg) return { status: 404, body: { error: 'No registration found for this QR' } };

    if (NEXT_ACTION[reg.district_status] !== action) {
      return {
        status: 409,
        body: {
          error: `Cannot mark "${action}" — current district status is "${reg.district_status}"`,
          districtStatus: reg.district_status,
        },
      };
    }

    const mismatch = districtMismatch(reg, checkpoint);

    await client.query('UPDATE registrations SET district_status = $1 WHERE id = $2', [action, regId]);
    await client.query(
      `INSERT INTO district_scan_log (registration_id, action, scanned_by, district_checkpoint_id, district_mismatch)
       VALUES ($1, $2, $3, $4, $5)`,
      [regId, action, req.user.id, checkpoint.id, mismatch],
    );

    return { status: 200, body: { registrationId: regId, districtStatus: action, districtMismatch: mismatch } };
  });

  res.status(result.status).json(result.body);
});
