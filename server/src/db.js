import pg from 'pg';
import 'dotenv/config';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // Hosted Postgres (Render, Supabase, etc.) generally requires SSL; a local
  // Postgres does not. Set DATABASE_SSL=true on the host if you get a
  // "connection requires SSL" or self-signed-cert error.
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  // A background client crashed — log and let the process manager decide
  // whether to restart. Don't let this crash a request that isn't using it.
  console.error('Unexpected error on idle Postgres client', err);
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Run a callback inside a single transaction, rolling back on any throw. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
