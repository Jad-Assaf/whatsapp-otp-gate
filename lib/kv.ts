import { kv } from '@vercel/kv';

/**
 * Thin wrapper around Vercel KV. The instance is imported from
 * `@vercel/kv` which automatically picks up KV_URL and KV_TOKEN from
 * environment variables. This file exists to centralize future
 * extensions (for example, namespacing keys) and to aid mocking in
 * unit tests.
 */
export default kv;