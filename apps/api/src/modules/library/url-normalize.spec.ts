import { normalizeUrl } from './url-normalize';

describe('normalizeUrl', () => {
  it('strips tracking params, www and trailing slash', () => {
    const result = normalizeUrl(
      'HTTP://WWW.Example.com/Path/?utm_source=tg&fbclid=1&id=7#section',
    );

    expect(result.normalized).toBe('https://example.com/Path?id=7');
    expect(result.domain).toBe('example.com');
  });

  it('keeps the original url untouched for redirects', () => {
    const result = normalizeUrl('http://example.com/a/');

    expect(result.url).toBe('http://example.com/a/');
    expect(result.normalized).toBe('https://example.com/a');
  });

  it('sorts query params so that param order is not a new entry', () => {
    const first = normalizeUrl('https://example.com/?b=2&a=1');
    const second = normalizeUrl('https://example.com/?a=1&b=2');

    expect(first.normalized).toBe(second.normalized);
  });

  it('collapses youtube variants to a single key', () => {
    const watch = normalizeUrl(
      'https://www.youtube.com/watch?v=abc123&t=42s&list=PL1',
    );
    const short = normalizeUrl('https://youtu.be/abc123?si=xyz');

    expect(watch.normalized).toBe('https://youtube.com/watch?v=abc123');
    expect(short.normalized).toBe(watch.normalized);
  });

  it.each([
    'ftp://example.com/file',
    'javascript:alert(1)',
    'not-a-url',
    '',
    'https://example.com:8443/file',
    'https://user:secret@example.com/file',
  ])('rejects %s', (input) => {
    expect(() => normalizeUrl(input)).toThrow('unsupported_url');
  });
});
