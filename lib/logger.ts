import { DateTime } from 'luxon';

const TZ = 'Asia/Beirut';

export interface LogParams {
  cartId?: string;
  requestId?: string;
  [key: string]: any;
}

/**
 * Basic JSON logger. All logs include a timestamp in the configured
 * Beirut timezone. Additional structured context can be passed via
 * `params`.
 */
export function log(level: 'info' | 'warn' | 'error', message: string, params: LogParams = {}) {
  const timestamp = DateTime.now().setZone(TZ).toISO();
  // Spread params last so it doesn't override the standard fields.
  const entry = {
    timestamp,
    level,
    message,
    ...params
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}