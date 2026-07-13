import { assertApprovedSource } from './quote-source-policy';

describe('quote source policy', () => {
  const originalDomains = process.env.MOTIVATION_APPROVED_SOURCE_DOMAINS;

  afterEach(() => {
    if (originalDomains === undefined) {
      delete process.env.MOTIVATION_APPROVED_SOURCE_DOMAINS;
    } else {
      process.env.MOTIVATION_APPROVED_SOURCE_DOMAINS = originalDomains;
    }
  });

  it('accepts default approved domains', () => {
    expect(assertApprovedSource('https://vedabase.io/en/library/bg/2/47/').hostname).toBe(
      'vedabase.io',
    );
  });

  it('accepts subdomains only at a hostname boundary', () => {
    expect(assertApprovedSource('https://www.wikiquote.org/wiki/Test').hostname).toBe(
      'www.wikiquote.org',
    );
    expect(() => assertApprovedSource('https://wikiquote.org.evil.example/quote')).toThrow(
      'Source domain is not approved',
    );
  });

  it('rejects unknown domains', () => {
    expect(() => assertApprovedSource('https://unknown.example/quote')).toThrow(
      'Source domain is not approved',
    );
  });

  it('uses the configured domain allowlist', () => {
    process.env.MOTIVATION_APPROVED_SOURCE_DOMAINS = ' quotes.example.org ';

    expect(assertApprovedSource('https://ru.quotes.example.org/quote').hostname).toBe(
      'ru.quotes.example.org',
    );
    expect(() => assertApprovedSource('https://vedabase.io/quote')).toThrow(
      'Source domain is not approved',
    );
  });
});
