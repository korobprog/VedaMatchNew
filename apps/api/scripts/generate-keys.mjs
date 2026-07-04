// Генерирует RS256-ключ для подписи JWT и печатает base64 PKCS8 для .env
import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
console.log('JWT_PRIVATE_KEY_BASE64=' + Buffer.from(pem).toString('base64'));
