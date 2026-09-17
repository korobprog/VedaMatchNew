import { createVerify, generateKeyPairSync } from 'node:crypto';
import {
  ANDROID_CHANNEL_ID,
  buildCallEndedMessage,
  buildCallIncomingMessage,
  buildFcmMessage,
  CALL_ENDED_TTL_SECONDS,
  CALL_INCOMING_TTL_SECONDS,
  CALL_PUSH_TYPE_ENDED,
  CALL_PUSH_TYPE_INCOMING,
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

describe('buildCallIncomingMessage', () => {
  const data = {
    callId: 'c1',
    conversationId: 'conv1',
    kind: 'video' as const,
    callerName: 'Радха',
    callerAvatarUrl: 'https://cdn.example/a.jpg',
    expiresAt: '2026-09-17T10:00:45.000Z',
  };

  it('data-only, без блока notification, priority high и ttl 45 с', () => {
    const body = buildCallIncomingMessage('tok', data);
    expect(body.message.token).toBe('tok');
    expect(body.message).not.toHaveProperty('notification');
    expect(body.message.android).toEqual({
      priority: 'high',
      ttl: '45s',
    });
    expect(CALL_INCOMING_TTL_SECONDS).toBe(45);
  });

  it('все поля данных — строки, тип звонка помечен call.incoming', () => {
    const body = buildCallIncomingMessage('tok', data);
    expect(body.message.data).toEqual({
      type: CALL_PUSH_TYPE_INCOMING,
      callId: 'c1',
      conversationId: 'conv1',
      kind: 'video',
      callerName: 'Радха',
      callerAvatarUrl: 'https://cdn.example/a.jpg',
      expiresAt: '2026-09-17T10:00:45.000Z',
    });
    for (const value of Object.values(body.message.data)) {
      expect(typeof value).toBe('string');
    }
  });

  it('без аватара у звонившего ключ callerAvatarUrl не попадает в data', () => {
    const body = buildCallIncomingMessage('tok', {
      ...data,
      callerAvatarUrl: null,
    });
    expect(body.message.data).not.toHaveProperty('callerAvatarUrl');
  });
});

describe('buildCallEndedMessage', () => {
  it('data-only сигнал с причиной, без notification', () => {
    const body = buildCallEndedMessage('tok', {
      callId: 'c1',
      reason: 'declined',
    });
    expect(body.message).not.toHaveProperty('notification');
    expect(body.message.data).toEqual({
      type: CALL_PUSH_TYPE_ENDED,
      callId: 'c1',
      reason: 'declined',
    });
    expect(body.message.android).toEqual({
      priority: 'high',
      ttl: `${CALL_ENDED_TTL_SECONDS}s`,
    });
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
