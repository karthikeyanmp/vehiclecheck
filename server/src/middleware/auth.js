import jwt from 'jsonwebtoken';

const AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET;

/**
 * Verifies the session JWT and attaches
 * { id, username, role, policeStationId, entryPointId, districtCheckpointId }
 * to req.user. Accepts the token either as a Bearer header (all normal API
 * calls) or as an `access_token` query param — needed only because <img>/<a>
 * tags (RC/photo/certificate links) can't attach a custom header. Query-param
 * tokens are just as short-lived as the header ones; nothing looser is granted.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, headerToken] = header.split(' ');
  const token = scheme === 'Bearer' ? headerToken : req.query.access_token;

  if (!token) {
    return res.status(401).json({ error: 'Missing session token' });
  }
  try {
    const payload = jwt.verify(token, AUTH_JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

/**
 * Restricts a route to one or more roles. This is the actual enforcement
 * boundary — the frontend hiding a button is cosmetic only, this is what
 * makes it impossible for a gate_scanner account to hit an admin/registrar
 * endpoint even by calling the API directly.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden for this role' });
    }
    next();
  };
}

export function signSessionToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
      policeStationId: user.police_station_id,
      entryPointId: user.entry_point_id,
      districtCheckpointId: user.district_checkpoint_id,
    },
    AUTH_JWT_SECRET,
    { expiresIn: '12h' },
  );
}
