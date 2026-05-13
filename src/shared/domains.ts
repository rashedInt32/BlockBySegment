/**
 * Lightweight domain helpers. We don't bundle the full Public Suffix List;
 * instead we strip a small set of common two-level suffixes. Good enough for a
 * parental-control tool — worst case the parent types the exact host.
 */

const TWO_LEVEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'net.nz', 'org.nz',
  'co.in', 'net.in', 'org.in', 'firm.in', 'gen.in', 'ind.in',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp',
  'com.br', 'net.br', 'org.br',
  'co.za', 'org.za',
  'com.sg', 'com.my', 'com.hk', 'com.tr', 'com.mx', 'com.ar',
]);

/** Lowercase, drop scheme/path/port/leading "www.". Returns null if unparseable/empty. */
export function toHostname(input: string): string | null {
  let raw = input.trim().toLowerCase();
  if (!raw) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(raw)) raw = 'https://' + raw;
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    return null;
  }
  if (host.startsWith('www.')) host = host.slice(4);
  if (!host || !host.includes('.')) return host || null;
  return host;
}

/** Best-effort registrable domain ("eTLD+1"). */
export function registrableDomain(hostname: string): string {
  const labels = hostname.split('.').filter(Boolean);
  if (labels.length <= 2) return hostname;
  const lastTwo = labels.slice(-2).join('.');
  if (TWO_LEVEL_SUFFIXES.has(lastTwo)) return labels.slice(-3).join('.');
  return lastTwo;
}

/** Parse user input into a registrable domain, or null. */
export function normalizeDomainInput(input: string): string | null {
  const host = toHostname(input);
  if (!host) return null;
  return registrableDomain(host);
}

/** Does `hostname` belong to `domain` (exact or a subdomain)? */
export function hostMatchesDomain(hostname: string, domain: string): boolean {
  const h = hostname.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith('.' + d);
}

/** Split a textarea blob of domains into normalized, de-duplicated entries. */
export function parseDomainList(blob: string): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of blob.split(/[\s,;\n]+/)) {
    const token = part.trim();
    if (!token) continue;
    const d = normalizeDomainInput(token);
    if (!d) {
      invalid.push(token);
    } else if (!seen.has(d)) {
      seen.add(d);
      valid.push(d);
    }
  }
  return { valid, invalid };
}
