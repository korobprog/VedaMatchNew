import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/**
 * Формат хранения: `scrypt$<salt-hex>$<key-hex>`.
 * Тот же формат генерирует dev-сид (apps/api/prisma/seed-dev.cjs).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, salt, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !keyHex) return false;

  const expected = Buffer.from(keyHex, 'hex');
  if (expected.length !== KEY_LENGTH) return false;

  const actual = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return timingSafeEqual(expected, actual);
}
