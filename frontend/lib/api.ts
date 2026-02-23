const FALLBACK_BACKEND_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://paymaster-u6z2.onrender.com'
    : 'http://localhost:4000';

export function getBackendUrl(): string {
  return process.env.PAYMASTER_BACKEND_URL || FALLBACK_BACKEND_URL;
}

export async function fetchBackend(path: string, init?: RequestInit): Promise<Response> {
  const url = `${getBackendUrl()}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
}
