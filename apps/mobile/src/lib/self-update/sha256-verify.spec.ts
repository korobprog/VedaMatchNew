import { verifyDownloadedFile, verifyDownloadedSize } from './sha256-verify';

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

describe('verifyDownloadedSize', () => {
  it('размер совпал с манифестом — match', () => {
    expect(verifyDownloadedSize(162_495_135, 162_495_135)).toBe('match');
  });

  it('файл короче или длиннее заявленного — mismatch (хешировать незачем)', () => {
    expect(verifyDownloadedSize(162_495_134, 162_495_135)).toBe('mismatch');
    expect(verifyDownloadedSize(162_495_136, 162_495_135)).toBe('mismatch');
    expect(verifyDownloadedSize(0, 162_495_135)).toBe('mismatch');
  });

  it('размер неизвестен — unknown, решение за хешем', () => {
    expect(verifyDownloadedSize(null, 162_495_135)).toBe('unknown');
  });
});
