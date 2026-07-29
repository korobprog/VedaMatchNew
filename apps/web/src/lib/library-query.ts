export function buildLibraryQuery(
  params?: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) query.set(key, first);
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}
