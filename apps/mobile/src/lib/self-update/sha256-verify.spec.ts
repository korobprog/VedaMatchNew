import { verifyDownloadedFile } from './sha256-verify';

describe('verifyDownloadedFile', () => {
  it('совпадающие хеши в одном регистре — match', () => {
    expect(verifyDownloadedFile('a'.repeat(64), 'a'.repeat(64))).toBe('match');
  });

  it('совпадающие хеши в разном регистре — match (регистронезависимо)', () => {
    expect(verifyDownloadedFile('A'.repeat(64), 'a'.repeat(64))).toBe('match');
  });

  it('разные хеши — mismatch', () => {
    expect(verifyDownloadedFile('a'.repeat(64), 'b'.repeat(64))).toBe('mismatch');
  });

  it('пробелы по краям не мешают сравнению', () => {
    expect(verifyDownloadedFile(` ${'a'.repeat(64)} `, 'a'.repeat(64))).toBe('match');
  });
});
