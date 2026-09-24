export function safeInternalPath(value: string, fallback: string): string {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback;
  }
  try {
    const url = new URL(value, 'http://localhost');
    if (url.origin !== 'http://localhost') return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

export function withNotice(
  path: string,
  key: 'saved' | 'error',
  value: string,
): string {
  const safe = safeInternalPath(path, '/');
  const url = new URL(safe, 'http://localhost');
  url.searchParams.delete('saved');
  url.searchParams.delete('error');
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}
