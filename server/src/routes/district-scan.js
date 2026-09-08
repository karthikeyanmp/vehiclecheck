import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { verifyQrToken } from '../services/qr.js';
import { scanFileUrls } from './scan.js';

/**
 * Check-post monitoring: a vehicle leaving Thanjavur district through its
 * designated border check post and returning through the same one. The QR /
 * permit is shared with everything else; this tracks its own status
 * (`district_status`: not_departed -> departed -> returned) independent of the
 * legacy event `current_status`.
 *
 * A check-post officer (role `district_scanner`) is assigned one or more check
 * posts and picks which one they're at; it's sent as `checkpointId` with every
 * lookup / verify.
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
    `SELECT r.id, r.applicant_name, r.vehicle_number, r.vehicle_type, r.district,
            r.num_persons_traveling, r.district_status, r.allowed_entry_point_id,
            r.applicant_photo_path, r.rc_copy_path, r.vehicle_photo_path,
            ep.name AS allowed_check_post_name
     FROM registrations r
     JOIN entry_points ep ON ep.id = r.allowed_entry_point_id
     WHERE r.id = $1`,
    [regId],
  );
  return rows[0];
}

async function assignedCheckPosts(userId) {
  const { rows } = await query(
    `SELECT ep.id, ep.name, ep.district
     FROM user_check_posts ucp
     JOIN entry_points ep ON ep.id = ucp.entry_point_id
     WHERE ucp.user_id = $1 ORDER BY ep.name`,
    [userId],
  );
  return rows;
}

// Flagged, not blocked: the vehicle's permit names a different check post than
// the one being scanned at. Same judgement-call pattern as the old gate check.
function checkPostMismatch(reg, checkPost) {
  return String(reg.allowed_entry_point_id) !== String(checkPost?.id);
}

// The check posts THIS officer is allowed to work — the scanner UI only offers
// these.
districtScanRouter.get('/checkpoints', requireRole('district_scanner'), async (req, res) => {
  res.json(await assignedCheckPosts(req.user.id));
});

districtScanRouter.post('/lookup', requireRole('district_scanner'), async (req, res) => {
  const { token, checkpointId } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token is required' });

  const allowed = await assignedCheckPosts(req.user.id);
  const checkPost = allowed.find((c) => String(c.id) === String(checkpointId));
  if (!checkPost) {
    return res.status(403).json({ error: 'That check post is not one of your assigned check posts' });
  }

  let regId;
  try {
    regId = verifyQrToken(token);
  } catch {
    return res.status(400).json({ error: 'QR code is invalid or expired' });
  }

  const reg = await loadRegistration(regId);
  if (!reg) return res.status(404).json({ error: 'No registration found for this QR' });

  res.json({
    registrationId: reg.id,
    applicantName: reg.applicant_name,
    vehicleNumber: reg.vehicle_number,
    vehicleType: reg.vehicle_type,
    numPersonsTraveling: reg.num_persons_traveling,
    ...scanFileUrls(reg),
    districtStatus: reg.district_status,
    allowedCheckPostName: reg.allowed_check_post_name,
    checkPostMismatch: checkPostMismatch(reg, checkPost),
    nextAction: NEXT_ACTION[reg.district_status],
  });
});

districtScanRouter.post('/verify', requireRole('district_scanner'), async (req, res) => {
  const { token, action, checkpointId } = req.body || {};
  if (!token || !['departed', 'returned'].includes(action)) {
    return res.status(400).json({ error: 'token and a valid action are required' });
  }

  const allowed = await assignedCheckPosts(req.user.id);
  const checkPost = allowed.find((c) => String(c.id) === String(checkpointId));
  if (!checkPost) {
    return res.status(403).json({ error: 'That check post is not one of your assigned check posts' });
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
      'SELECT id, allowed_entry_point_id, district_status FROM registrations WHERE id = $1 FOR UPDATE',
      [regId],
    );
    const reg = rows[0];
    if (!reg) return { status: 404, body: { error: 'No registration found for this QR' } };

    if (NEXT_ACTION[reg.district_status] !== action) {
      return {
        status: 409,
        body: {
          error: `Cannot mark "${action}" — current status is "${reg.district_status}"`,
          districtStatus: reg.district_status,
        },
      };
    }

    const mismatch = checkPostMismatch(reg, checkPost);

    await client.query('UPDATE registrations SET district_status = $1 WHERE id = $2', [action, regId]);
    await client.query(
      `INSERT INTO district_scan_log (registration_id, action, scanned_by, entry_point_id, district_mismatch)
       VALUES ($1, $2, $3, $4, $5)`,
      [regId, action, req.user.id, checkPost.id, mismatch],
    );

    return { status: 200, body: { registrationId: regId, districtStatus: action, checkPostMismatch: mismatch } };
  });

  res.status(result.status).json(result.body);
});
