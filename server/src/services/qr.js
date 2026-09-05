import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';

const QR_JWT_SECRET = process.env.QR_JWT_SECRET;
const EVENT_QR_EXPIRY = process.env.EVENT_QR_EXPIRY;

/**
 * The QR encodes ONLY a signed, opaque token — never applicant data.
 * Anyone photographing the QR from a distance gets nothing but an id they
 * can't use without hitting the server, which enforces role-based field
 * visibility on the way back out.
 */
export function issueQrToken(registrationId) {
  const expiresInSeconds = Math.max(
    60,
    Math.floor((new Date(EVENT_QR_EXPIRY).getTime() - Date.now()) / 1000),
  );
  return jwt.sign({ regId: registrationId }, QR_JWT_SECRET, { expiresIn: expiresInSeconds });
}

/** Throws if the token is malformed, expired, or signed with the wrong secret. */
export function verifyQrToken(token) {
  const payload = jwt.verify(token, QR_JWT_SECRET);
  return payload.regId;
}

export async function qrTokenToPngDataUrl(token) {
  return QRCode.toDataURL(token, { errorCorrectionLevel: 'M', margin: 1, scale: 6 });
}

export async function qrTokenToPngBuffer(token) {
  return QRCode.toBuffer(token, { errorCorrectionLevel: 'M', margin: 1, scale: 6 });
}
