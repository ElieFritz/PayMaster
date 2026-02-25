const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

export function resolvePublicOrigin(candidates: Array<string | null | undefined>): string | null {
  const parsedCandidates = candidates
    .map((candidate) => normalizeOrigin(candidate))
    .filter((origin): origin is string => Boolean(origin));

  if (parsedCandidates.length === 0) {
    return null;
  }

  const nonLocalOrigin = parsedCandidates.find((origin) => !isLocalOrigin(origin));
  return nonLocalOrigin || parsedCandidates[0];
}

function normalizeOrigin(candidate: string | null | undefined): string | null {
  if (!candidate) {
    return null;
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).origin.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function isLocalOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();

    if (LOCAL_HOSTNAMES.has(hostname)) {
      return true;
    }

    return hostname.startsWith('127.');
  } catch {
    return true;
  }
}
