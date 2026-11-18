// A small JSON client for one app's API, with the owner token attached when
// there is one and errors that say what went wrong in plain words.

export function createClient(baseUrl, token) {
  const base = String(baseUrl).replace(/\/$/, '');

  async function request(method, route, body) {
    let res;
    try {
      res = await fetch(`${base}${route}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new Error(`Could not reach ${base} (${error.cause?.code || error.message}). Is the app running?`);
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      // empty or non-JSON body
    }
    if (res.status === 401) {
      throw new Error(`${base} refused the change: this needs the owner token (set OWNER_TOKEN for the MCP server).`);
    }
    if (!res.ok) throw new Error(`${method} ${route} failed: HTTP ${res.status}${data?.error ? `, ${data.error}` : ''}`);
    return data;
  }

  // Short-lived cache for big read-only payloads (the 590-car catalogue), so a
  // conversation that asks five questions downloads it once, not five times.
  const cache = new Map();
  async function cached(route, ttlMs = 5 * 60_000) {
    const hit = cache.get(route);
    if (hit && Date.now() - hit.at < ttlMs) return hit.data;
    const data = await request('GET', route);
    cache.set(route, { at: Date.now(), data });
    return data;
  }

  return {
    base,
    get: (route) => request('GET', route),
    post: (route, body) => request('POST', route, body ?? {}),
    patch: (route, body) => request('PATCH', route, body ?? {}),
    cached,
    forget: () => cache.clear(),
  };
}

export const credits = (n) => (typeof n === 'number' ? `Cr. ${n.toLocaleString('en-US')}` : 'unpriced');
export const dollars = (n) => (n === null || n === undefined || n === '' ? '—' : `$${Number(n).toLocaleString('en-US')}`);

/** Words in common, case-insensitive: good enough to find "porsche 917" in a name. */
export function matches(haystack, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const text = String(haystack || '').toLowerCase();
  return words.every((w) => text.includes(w));
}
