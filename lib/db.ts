// lib/db.ts
import { Pool } from 'pg';

/**
 * Postgres pool with proper TLS handling.
 *
 * Supply your CA as a PEM string in one of:
 *  - PGSSL_CA
 *  - AIVEN_CA_PEM
 *  - DATABASE_CA_PEM
 *
 * Optional controls:
 *  - PGSSLMODE=disable         → no TLS (not for prod)
 *  - DB_SSL_INSECURE=true      → TLS but skip verification (diagnostics only)
 */

const connectionString =
  process.env.DATABASE_URL ||
  process.env.AIVEN_DB_URL ||
  '';

if (!connectionString) {
  // eslint-disable-next-line no-console
  console.warn('DATABASE_URL/AIVEN_DB_URL is not set. Database connections will fail.');
}

function normalizePem(pem?: string) {
  return (pem || '').replace(/\\n/g, '\n').trim() || undefined;
}

const caPem =
  normalizePem(process.env.PGSSL_CA) ||
  normalizePem(process.env.AIVEN_CA_PEM) ||
  normalizePem(process.env.DATABASE_CA_PEM);

let ssl: false | { rejectUnauthorized: boolean; ca?: string };

if ((process.env.PGSSLMODE || '').toLowerCase() === 'disable') {
  ssl = false;
} else if (process.env.DB_SSL_INSECURE === 'true') {
  // ⚠️ diagnostics only — do not leave enabled in production
  ssl = { rejectUnauthorized: false };
} else if (caPem) {
  // Properly trust your provider's CA
  ssl = { rejectUnauthorized: true, ca: caPem };
} else {
  // Default: require TLS and use system CAs (works for public CAs)
  ssl = { rejectUnauthorized: true };
}

const pool = new Pool({ connectionString, ssl });

export default pool;
