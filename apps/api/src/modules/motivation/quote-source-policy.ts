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
  const parsedUrl = new URL(url);
  const hostname = parsedUrl.hostname.toLowerCase();
  const approved = approvedSourceDomains().some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );

  if (!approved) {
    throw new Error('Source domain is not approved');
  }

  return parsedUrl;
}
