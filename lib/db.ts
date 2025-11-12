import { Pool } from 'pg';

/**
 * Creates a PostgreSQL connection pool using the connection string defined in
 * the environment.  The pool is shared across the entire application.
 *
 * The expected environment variable is `DATABASE_URL` or `AIVEN_DB_URL`,
 * containing a full PostgreSQL connection string (including protocol,
 * username, password, host, port, and database name).  Aiven typically
 * provides such a URL.
 */
const connectionString = process.env.DATABASE_URL || process.env.AIVEN_DB_URL || '';

if (!connectionString) {
  // eslint-disable-next-line no-console
  console.warn('DATABASE_URL/AIVEN_DB_URL is not set. Database connections will fail.');
}

// Configure SSL for Aiven/PostgreSQL. Aiven's managed PostgreSQL
// instances often present a self‑signed certificate. Without the
// `rejectUnauthorized: false` option, Node will reject the connection
// with a `self-signed certificate in certificate chain` error. If you
// provide your own CA certificate in the connection string or
// environment variables, you can remove this option and rely on
// proper certificate verification.
const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

export default pool;