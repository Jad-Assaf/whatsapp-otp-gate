import { parsePhoneNumber } from 'libphonenumber-js';

/**
 * Normalize a phone number string to E.164 format. Throws if the
 * number is invalid. Accepts numbers with or without leading plus.
 *
 * @param raw The user-provided phone number string
 * @returns Normalized E.164 phone number (e.g. "+96170000000")
 */
export function normalizePhone(raw: string): string {
  try {
    const phoneNumber = parsePhoneNumber(raw);
    if (!phoneNumber) throw new Error('Invalid phone number');
    if (!phoneNumber.isValid()) throw new Error('Invalid phone number');
    return phoneNumber.number; // returns E.164 with leading '+'
  } catch (e) {
    throw new Error('Invalid phone number');
  }
}