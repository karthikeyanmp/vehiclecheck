import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
// Patches Express 4 so a thrown/rejected error inside an async route handler
// reaches the error-handling middleware below instead of hanging the request.
import 'express-async-errors';

import { authRouter } from './routes/auth.js';
import { masterDataRouter } from './routes/masterdata.js';
import { usersRouter } from './routes/users.js';
import { registrationsRouter } from './routes/registrations.js';
import { scanRouter } from './routes/scan.js';
import { districtScanRouter } from './routes/district-scan.js';
import { adminRouter } from './routes/admin.js';
import { bootstrapAdmin } from './bootstrap.js';

for (const required of ['DATABASE_URL', 'AUTH_JWT_SECRET', 'QR_JWT_SECRET', 'EVENT_QR_EXPIRY']) {
  if (!process.env[required]) {
    console.error(`Missing required env var ${required} — copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

const app = express();
app.set('trust proxy', 1);

app.use(compression());
const corsOrigins = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
// No CORS_ORIGIN → same-origin only (the bundled deploy, where the frontend
// is served by this same server). Set it to a comma-separated list of
// origins only if the frontend is hosted separately.
app.use(cors({ origin: corsOrigins.length ? corsOrigins : false }));
app.use(express.json());

// Brute-force protection: login and QR verification are the two endpoints an
// outsider could hammer without an account (login) or with a low-privilege
// gate account (verify) — everything else already requires a role-checked session.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
// 120/min comfortably covers a busy gate (lookup + verify per vehicle) while
// still bounding how fast a gate account could be used to brute-force tokens.
const scanLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });

app.use('/api/auth/login', loginLimiter);
app.use(['/api/scan/lookup', '/api/scan/verify', '/api/district-scan/lookup', '/api/district-scan/verify'], scanLimiter);

app.use('/api/auth', authRouter);
app.use('/api/master-data', masterDataRouter);
app.use('/api/users', usersRouter);
app.use('/api/registrations', registrationsRouter);
app.use('/api/scan', scanRouter);
app.use('/api/district-scan', districtScanRouter);
app.use('/api/admin', adminRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// --- Serve the bundled React client, if a build is present ---
// In local dev the Vite dev server does this (with hot reload), so this
// block only activates on a bundled deploy where `client/dist` exists.
const clientDist = process.env.CLIENT_DIST_PATH
  ? path.resolve(process.env.CLIENT_DIST_PATH)
  : path.resolve('..', 'client', 'dist');

if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist, {
    setHeaders(res, filePath) {
      // Vite emits content-hashed filenames under assets/ — safe to cache hard.
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));
  // SPA fallback: any non-API GET that isn't a real file returns index.html
  // so client-side routes (deep links, refreshes) resolve.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  console.log(`Serving bundled client from ${clientDist}`);
} else {
  console.log('No client build found — running API-only (use the Vite dev server for the frontend).');
}

// Central error handler — keeps stack traces out of API responses while
// still logging them server-side for debugging.
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.message?.startsWith('Unsupported file type')) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 4000;
bootstrapAdmin()
  .catch((err) => console.error('Admin bootstrap failed:', err))
  .finally(() => {
    app.listen(port, () => {
      console.log(`Vehicle permit API listening on :${port}`);
    });
  });
