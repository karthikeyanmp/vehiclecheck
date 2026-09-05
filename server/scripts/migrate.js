import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = path.resolve('migrations');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set — copy .env.example to .env first.');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const { rows: applied } = await client.query('SELECT filename FROM _migrations');
  const appliedSet = new Set(applied.map((r) => r.filename));

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`skip  ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`apply ${file}`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Migration ${file} failed:`, err.message);
      process.exit(1);
    }
  }

  console.log('All migrations applied.');
  await client.end();
}

main();
