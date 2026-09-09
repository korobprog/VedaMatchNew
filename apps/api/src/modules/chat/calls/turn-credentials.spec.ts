import { createHmac } from 'node:crypto';
import {
  buildIceServers,
  buildTurnCredentials,
  TURN_CREDENTIAL_TTL_SECONDS,
} from './turn-credentials';

describe('buildTurnCredentials', () => {
  const now = new Date('2026-09-09T12:00:00Z');

  it('кладёт срок и id пользователя в имя, как ждёт coturn', () => {
    const creds = buildTurnCredentials('s3cret', 'user-1', now);
    const expiry =
      Math.floor(now.getTime() / 1000) + TURN_CREDENTIAL_TTL_SECONDS;
    expect(creds.username).toBe(`${expiry}:user-1`);
    expect(creds.expiresAt).toBe(expiry);
  });

  it('пароль — HMAC-SHA1 от имени, закодированный base64', () => {
    const creds = buildTurnCredentials('s3cret', 'user-1', now);
    const expected = createHmac('sha1', 's3cret')
      .update(creds.username)
      .digest('base64');
    expect(creds.credential).toBe(expected);
  });

  it('другой секрет даёт другой пароль при том же имени', () => {
    const a = buildTurnCredentials('a', 'u', now);
    const b = buildTurnCredentials('b', 'u', now);
    expect(a.username).toBe(b.username);
    expect(a.credential).not.toBe(b.credential);
  });
});

describe('buildIceServers', () => {
  const creds = { username: '1:u', credential: 'c', expiresAt: 1 };

  it('без TURN остаётся только публичный STUN', () => {
    expect(buildIceServers(undefined, null)).toEqual([
      { urls: ['stun:stun.l.google.com:19302'] },
    ]);
  });

  it('с TURN отдаёт UDP, TCP и TLS под одной учёткой, свой STUN первым', () => {
    const servers = buildIceServers('turn.example.org', creds);
    expect(servers[0]).toEqual({ urls: ['stun:turn.example.org:3478'] });
    expect(servers.find((s) => s.username)).toEqual({
      urls: [
        'turn:turn.example.org:3478?transport=udp',
        'turn:turn.example.org:3478?transport=tcp',
        'turns:turn.example.org:5349?transport=tcp',
      ],
      username: '1:u',
      credential: 'c',
    });
  });

  it('TLS-порт настраивается: на отдельном IP это 443', () => {
    const servers = buildIceServers('turn.example.org', creds, 443);
    const turn = servers.find((s) => s.username);
    expect(turn?.urls).toContain('turns:turn.example.org:443?transport=tcp');
  });
});
