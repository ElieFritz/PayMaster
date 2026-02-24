const FALLBACK_BACKEND_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://paymaster-u6z2.onrender.com'
    : 'http://localhost:4000';
const DEFAULT_BACKEND_TIMEOUT_MS = Number(process.env.PAYMASTER_BACKEND_TIMEOUT_MS || 12000);

export function getBackendUrl(): string {
  return process.env.PAYMASTER_BACKEND_URL || FALLBACK_BACKEND_URL;
}

export async function fetchBackend(path: string, init?: RequestInit): Promise<Response> {
  return fetchBackendRaw(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function fetchBackendRaw(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_BACKEND_TIMEOUT_MS);
  const url = `${getBackendUrl()}${path}`;

  try {
    return await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
