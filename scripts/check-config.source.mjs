import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

if (typeof process.loadEnvFile === 'function') {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

const databaseOnly = process.argv.includes('--database-only');
const errors = [];
const ok = (message) => console.log(`✓ ${message}`);
const fail = (message) => {
  errors.push(message);
  console.error(`✗ ${message}`);
};

const publicUrl = (process.env.PUBLIC_URL ?? '').replace(/\/+$/, '');
const redirect = process.env.DISCORD_REDIRECT_URI ?? '';
const clientId = process.env.DISCORD_CLIENT_ID ?? '';
const clientSecret = process.env.DISCORD_CLIENT_SECRET ?? '';
const databaseUrl = process.env.DATABASE_URL ?? '';

if (!databaseOnly) {
  if (/^https:\/\/[^/]+$/i.test(publicUrl)) ok(`PUBLIC_URL: ${publicUrl}`);
  else fail('PUBLIC_URL must be a public HTTPS origin without a path');

  const expectedRedirect = `${publicUrl}/api/auth/discord/callback`;
  if (redirect === expectedRedirect) ok('DISCORD_REDIRECT_URI matches PUBLIC_URL');
  else fail(`DISCORD_REDIRECT_URI must be exactly: ${expectedRedirect}`);

  if (/^\d{17,20}$/.test(clientId)) ok(`DISCORD_CLIENT_ID: …${clientId.slice(-6)}`);
  else fail('DISCORD_CLIENT_ID must be the numeric Discord Application ID');

  if (clientSecret.length >= 20 && !clientSecret.includes('YOUR_')) ok('DISCORD_CLIENT_SECRET is present (value hidden)');
  else fail('DISCORD_CLIENT_SECRET is missing or still a placeholder');
}

if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
  fail('DATABASE_URL must be a PostgreSQL connection string');
} else {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false,
    max: 1,
    connectionTimeoutMillis: 8000,
  });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clue_me_state (
        state_key TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const result = await pool.query('SELECT current_database() AS database, NOW() AS now');
    ok(`PostgreSQL connected and schema ready: ${result.rows[0].database}`);
  } catch (error) {
    fail(`PostgreSQL connection failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

if (errors.length) {
  console.error(`\nConfiguration failed with ${errors.length} error(s).`);
  process.exit(1);
}
console.log('\nConfiguration is ready. Restart the Clue Me server.');
