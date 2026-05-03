/**
 * Robust URL parser with multi-level TLD support.
 * - Validates protocol before parsing
 * - Handles internationalized domain names (IDN)
 * - Handles complex TLDs (co.uk, com.au, co.jp, etc.)
 * - Returns error for invalid/non-http URLs
 */

const VALID_PROTOCOLS = new Set(['http:', 'https:']);
const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

export interface ParsedDomain {
  domain: string;
  subdomain: string | null;
  registrableDomain: string;
  isPublic: boolean;
  protocol: string;
}

export interface ParseResult {
  success: true;
  data: ParsedDomain;
}

export interface ParseError {
  success: false;
  error: 'INVALID_URL' | 'INVALID_PROTOCOL' | 'BLOCKED_HOST' | 'PARSE_FAILED';
}

export type DomainParseResult = ParseResult | ParseError;

const KNOWN_MULTI_LEVEL_TLDS = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'ltd.uk',
  'me.uk',
  'net.uk',
  'nhs.uk',
  'plc.uk',
  'sch.uk',
  'co.jp',
  'or.jp',
  'ne.jp',
  'ac.jp',
  'go.jp',
  'ed.jp',
  'ad.jp',
  'gr.jp',
  'lg.jp',
  'com.au',
  'net.au',
  'org.au',
  'edu.au',
  'gov.au',
  'asn.au',
  'id.au',
  'co.nz',
  'org.nz',
  'net.nz',
  'ac.nz',
  'govt.nz',
  'school.nz',
  'co.kr',
  'or.kr',
  'ne.kr',
  'go.kr',
  're.kr',
  'pe.kr',
  'com.br',
  'org.br',
  'net.br',
  'gov.br',
  'edu.br',
  'mil.br',
  'co.za',
  'org.za',
  'net.za',
  'web.za',
  'co.in',
  'org.in',
  'net.in',
  'gov.in',
  'ac.in',
  'firm.in',
  'gen.in',
  'ind.in',
  'com.sg',
  'org.sg',
  'net.sg',
  'gov.sg',
  'edu.sg',
  'com.hk',
  'org.hk',
  'net.hk',
  'gov.hk',
  'edu.hk',
  'com.tw',
  'org.tw',
  'net.tw',
  'gov.tw',
  'edu.tw',
]);

function getRegistrableDomain(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;

  const lastTwo = parts.slice(-2).join('.').toLowerCase();
  if (KNOWN_MULTI_LEVEL_TLDS.has(lastTwo)) {
    if (parts.length <= 3) return hostname;
    return parts.slice(-3).join('.');
  }

  return parts.slice(-2).join('.');
}

function getSubdomain(hostname: string, registrableDomain: string): string | null {
  if (hostname === registrableDomain) return null;
  const idx = hostname.lastIndexOf(`.${registrableDomain}`);
  if (idx === -1) return null;
  return hostname.slice(0, idx);
}

export function parseDomain(url: string): DomainParseResult {
  if (!url) {
    return { success: false, error: 'INVALID_URL' };
  }

  try {
    const parsed = new URL(url);

    if (!VALID_PROTOCOLS.has(parsed.protocol)) {
      return { success: false, error: 'INVALID_PROTOCOL' };
    }

    const hostname = parsed.hostname.toLowerCase();

    if (BLOCKED_HOSTNAMES.has(hostname) && !isDevMode()) {
      return { success: false, error: 'BLOCKED_HOST' };
    }

    const registrableDomain = getRegistrableDomain(hostname);
    const subdomain = getSubdomain(hostname, registrableDomain);

    return {
      success: true,
      data: {
        domain: hostname,
        subdomain,
        registrableDomain,
        isPublic: !isDevMode(),
        protocol: parsed.protocol,
      },
    };
  } catch {
    return { success: false, error: 'PARSE_FAILED' };
  }
}

function isDevMode(): boolean {
  return import.meta.env.DEV;
}
