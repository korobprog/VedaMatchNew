import { createHash, randomBytes } from 'node:crypto';
import { base64ToBase64Url, bytesToBase64Url, createPkcePair } from './pkce';

const nodeCrypto = {
  randomBytes: (length: number) => new Uint8Array(randomBytes(length)),
  sha256Base64: async (input: string) => createHash('sha256').update(input).digest('base64'),
};

describe('bytesToBase64Url', () => {
  it('совпадает с Buffer для любых длин хвоста', () => {
    for (const length of [0, 1, 2, 3, 31, 32, 33]) {
      const bytes = new Uint8Array(randomBytes(length));
      expect(bytesToBase64Url(bytes)).toBe(Buffer.from(bytes).toString('base64url'));
    }
  });
});

describe('createPkcePair', () => {
  it('совпадает с примером RFC 7636, приложение B', async () => {
    const rfcBytes = new Uint8Array([
      116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77,
      105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121,
    ]);
    const pair = await createPkcePair({ ...nodeCrypto, randomBytes: () => rfcBytes });
    expect(pair).toEqual({
      verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    });
  });

  it('даёт верификатор допустимой длины и алфавита', async () => {
    const { verifier, challenge } = await createPkcePair(nodeCrypto);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('base64ToBase64Url снимает выравнивание', () => {
    expect(base64ToBase64Url('ab+/cd==')).toBe('ab-_cd');
  });
});
