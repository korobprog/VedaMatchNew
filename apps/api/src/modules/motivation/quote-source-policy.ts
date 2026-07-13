const DEFAULT_APPROVED_SOURCE_DOMAINS = [
  'vedabase.io',
  'vedabase.com',
  'prabhupadabooks.com',
  'wikiquote.org',
];

function approvedSourceDomains(): string[] {
  const configuredDomains = process.env.MOTIVATION_APPROVED_SOURCE_DOMAINS;
  if (!configuredDomains?.trim()) {
    return DEFAULT_APPROVED_SOURCE_DOMAINS;
  }

  return configuredDomains
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

export function assertApprovedSource(url: string): URL {
  const parsedUrl = assertSafeFetchUrl(url);
  const hostname = parsedUrl.hostname.toLowerCase();
  const approved = approvedSourceDomains().some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );

  if (!approved) {
    throw new Error('Source domain is not approved');
  }

  return parsedUrl;
}

const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?fc[0-9a-f]{2}:/i,
  /^\[?fe80:/i,
];

/**
 * SSRF guard for URLs supplied directly by an admin (MotivationSourceWatch), which are
 * not restricted to the static approved-source domain allowlist above.
 */
export function assertSafeFetchUrl(url: string): URL {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Only http/https URLs are allowed');
  }
  const hostname = parsedUrl.hostname.toLowerCase();
  if (PRIVATE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname))) {
    throw new Error('URL host is not allowed');
  }
  return parsedUrl;
}
