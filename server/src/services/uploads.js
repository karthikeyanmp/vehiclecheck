import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';

const UPLOAD_ROOT = path.resolve('uploads');

// Make sure the upload dirs exist. On an ephemeral host (Render free tier,
// etc.) the disk is wiped on every restart, so these have to be recreated
// on boot rather than relied on from the repo.
for (const sub of ['photos', 'rc']) {
  fs.mkdirSync(path.join(UPLOAD_ROOT, sub), { recursive: true });
}

const PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const RC_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

export const uploadRegistrationFiles = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const subdir = file.fieldname === 'rc_copy' ? 'rc' : 'photos';
      cb(null, path.join(UPLOAD_ROOT, subdir));
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  fileFilter(_req, file, cb) {
    const allowed = file.fieldname === 'rc_copy' ? RC_MIME : PHOTO_MIME;
    if (!allowed.has(file.mimetype)) {
      return cb(new Error(`Unsupported file type for ${file.fieldname}: ${file.mimetype}`));
    }
    cb(null, true);
  },
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB per file
}).fields([
  { name: 'applicant_photo', maxCount: 1 },
  { name: 'rc_copy', maxCount: 1 },
]);

export function absoluteUploadPath(relativePath) {
  // relativePath is stored as e.g. "photos/<uuid>.jpg" — resolve and refuse
  // to ever escape the uploads root, in case a stored value is ever tampered with.
  const resolved = path.resolve(UPLOAD_ROOT, relativePath);
  if (!resolved.startsWith(UPLOAD_ROOT)) {
    throw new Error('Path traversal blocked');
  }
  return resolved;
}
