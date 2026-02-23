type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

export function rateLimit(key: string, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  const cur = store.get(key);

  if (!cur || now > cur.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }

  if (cur.count >= limit) return { ok: false, remaining: 0 };

  cur.count += 1;
  return { ok: true, remaining: limit - cur.count };
}
