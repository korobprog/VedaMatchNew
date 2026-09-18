import { createHash } from 'node:crypto';
import { bytesToHex } from './binary-utils';
import { Sha256 } from './sha256';

/** Детерминированный генератор (LCG), чтобы тест не зависел от случайности прогона. */
function pseudoRandomBytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = state >>> 24;
  }
  return out;
}

function nodeSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function oneShot(bytes: Uint8Array): string {
  return bytesToHex(new Sha256().update(bytes).digest());
}

const ascii = (text: string) => new Uint8Array(Buffer.from(text, 'latin1'));

describe('Sha256', () => {
  // Эталонные векторы FIPS 180-4 / NIST CSRC.
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ])('вектор NIST: "%s"', (text, expected) => {
    expect(oneShot(ascii(text))).toBe(expected);
  });

  it('вектор NIST: миллион букв "a"', () => {
    expect(oneShot(new Uint8Array(1_000_000).fill(0x61))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  it('совпадает с node:crypto на всех длинах 0..200 — все варианты хвоста и добивки (55/56/63/64/119/120 байт)', () => {
    for (let length = 0; length <= 200; length += 1) {
      const bytes = pseudoRandomBytes(length, length * 7 + 3);
      expect(oneShot(bytes)).toBe(nodeSha256(bytes));
    }
  });

  it('результат не зависит от того, как вход нарезан на куски (случайные границы)', () => {
    const bytes = pseudoRandomBytes(300_000, 42);
    const expected = nodeSha256(bytes);
    let cutSeed = 7;
    for (let round = 0; round < 20; round += 1) {
      const hasher = new Sha256();
      let offset = 0;
      while (offset < bytes.length) {
        cutSeed = (Math.imul(cutSeed, 1103515245) + 12345) >>> 0;
        // Куски от 0 до ~5000 байт: пустые, короче блока, ровно 64, через границу блока.
        const size = cutSeed % 5000;
        hasher.update(bytes.subarray(offset, offset + size));
        offset += size;
      }
      expect(bytesToHex(hasher.digest())).toBe(expected);
    }
  });

  it('побайтовая подача даёт тот же хеш, что и целиком', () => {
    const bytes = pseudoRandomBytes(1000, 99);
    const hasher = new Sha256();
    for (let i = 0; i < bytes.length; i += 1) hasher.update(bytes.subarray(i, i + 1));
    expect(bytesToHex(hasher.digest())).toBe(nodeSha256(bytes));
  });

  it('один изменённый байт меняет хеш', () => {
    const bytes = pseudoRandomBytes(4096, 5);
    const before = oneShot(bytes);
    bytes[2048] ^= 0x01;
    expect(oneShot(bytes)).not.toBe(before);
    expect(oneShot(bytes)).toBe(nodeSha256(bytes));
  });

  it('не принимает данные после digest() и не отдаёт дайджест дважды', () => {
    const hasher = new Sha256().update(ascii('abc'));
    hasher.digest();
    expect(() => hasher.update(ascii('d'))).toThrow('update() после digest()');
    expect(() => hasher.digest()).toThrow('digest() уже вызван');
  });
});
