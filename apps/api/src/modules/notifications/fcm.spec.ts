import { createVerify, generateKeyPairSync } from 'node:crypto';
import {
  ANDROID_CHANNEL_ID,
  buildFcmMessage,
  classifyFcmError,
  FCM_SCOPE,
  GOOGLE_TOKEN_URL,
  parseServiceAccount,
  signServiceAccountAssertion,
} from './fcm';

const account = {
  project_id: 'vedamathai',
  client_email: 'push@vedamathai.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
};

describe('parseServiceAccount', () => {
  it('читает JSON', () => {
    expect(parseServiceAccount(JSON.stringify(account))).toEqual({
      projectId: 'vedamathai',
      clientEmail: account.client_email,
      privateKey: account.private_key,
    });
  });

  it('читает base64 от JSON', () => {
    const encoded = Buffer.from(JSON.stringify(account)).toString('base64');
    expect(parseServiceAccount(encoded)?.projectId).toBe('vedamathai');
  });

  it('пустое, битое и неполное дают null', () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount('  ')).toBeNull();
    expect(parseServiceAccount('{not json')).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ project_id: 'x' }))).toBeNull();
  });
});

describe('signServiceAccountAssertion', () => {
  it('подпись проверяется открытым ключом, в утверждении нужные поля', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    const jwt = signServiceAccountAssertion(
      { clientEmail: account.client_email, privateKey: pem },
      1_000,
    );
    const [header, claims, signature] = jwt.split('.');

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${header}.${claims}`);
    expect(
      verifier.verify(publicKey, Buffer.from(signature, 'base64url')),
    ).toBe(true);
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({
      iss: account.client_email,
      scope: FCM_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: 1_000,
      exp: 4_600,
    });
  });
});

describe('buildFcmMessage', () => {
  it('кладёт ссылку в data и канал Android', () => {
    const body = buildFcmMessage('tok', {
      title: 'Радха',
      body: 'Харе Кришна',
      url: '/chat/c1',
      tag: 'chat:c1',
    });
    expect(body.message.token).toBe('tok');
    expect(body.message.data).toEqual({ url: '/chat/c1', tag: 'chat:c1' });
    expect(body.message.android.notification.channel_id).toBe(
      ANDROID_CHANNEL_ID,
    );
  });
});

describe('classifyFcmError', () => {
  const fcmError = (errorCode: string) => ({
    error: { details: [{ errorCode }] },
  });

  it('мёртвый токен удаляется', () => {
    expect(classifyFcmError(404, fcmError('UNREGISTERED'))).toBe('gone');
    expect(classifyFcmError(403, fcmError('SENDER_ID_MISMATCH'))).toBe('gone');
  });

  it('ошибка в сообщении не стирает токен', () => {
    expect(classifyFcmError(400, fcmError('INVALID_ARGUMENT'))).toBe(
      'transient',
    );
  });

  it('квота и сбои', () => {
    expect(classifyFcmError(429, fcmError('QUOTA_EXCEEDED'))).toBe(
      'rate-limited',
    );
    expect(classifyFcmError(503, null)).toBe('transient');
  });
});
