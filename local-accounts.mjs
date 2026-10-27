import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const work = Object.freeze({ N:131072, r:8, p:1, maxmem:256 * 1024 * 1024 });
const blocked = new Set(['password', 'password123', 'password123456', 'admin1234567890', 'siware1234567890', '123456789012345']);

export function passwordPolicyError(value, email = '') {
  if (typeof value !== 'string' || [...value].length < 15 || [...value].length > 128 || Buffer.byteLength(value, 'utf8') > 512) return 'Use a password of 15 to 128 characters.';
  const normalized = value.normalize('NFC');
  const accountName = String(email).split('@')[0].toLowerCase();
  if (blocked.has(normalized.toLowerCase()) || (accountName.length >= 4 && normalized.toLowerCase().includes(accountName))) return 'Choose a less predictable password that does not contain the account name.';
  return '';
}

export async function hashLocalPassword(value) {
  const salt = randomBytes(16);
  const digest = await scrypt(value.normalize('NFC'), salt, 64, work);
  return `scrypt:${work.N}:${work.r}:${work.p}:${salt.toString('base64url')}:${digest.toString('base64url')}`;
}

export async function verifyLocalPassword(value, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[1] !== String(work.N) || parts[2] !== String(work.r) || parts[3] !== String(work.p)) return false;
  try {
    const salt = Buffer.from(parts[4], 'base64url'), expected = Buffer.from(parts[5], 'base64url');
    if (salt.length !== 16 || expected.length !== 64 || typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 512) return false;
    const supplied = await scrypt(value.normalize('NFC'), salt, expected.length, work);
    return timingSafeEqual(expected, supplied);
  } catch { return false; }
}

export function publicAccessUser(user, sessionActive = false) {
  return {
    id:user.id, name:user.name, email:user.email, role:user.role,
    authType:user.authType === 'local' ? 'local' : 'google',
    source:user.source === 'environment' ? 'environment' : 'directory',
    active:user.active !== false, sessionActive,
    avatarUrl:String(user.avatarUrl || ''),
    createdAt:user.createdAt || '', intranetJoinedAt:user.firstSignedInAt || '',
    updatedAt:user.updatedAt || '', lastLoginAt:user.lastLoginAt || ''
  };
}
