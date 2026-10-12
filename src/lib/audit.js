import { redis, KEYS } from '@/lib/redis';

const MAX_ENTRIES = 500;

/** Append an admin action to the audit trail. Never throws. */
export async function recordAudit({ action, detail = null, ip = null }) {
  try {
    const entry = { at: new Date().toISOString(), action, detail, ip };
    await redis.lpush(KEYS.audit, JSON.stringify(entry));
    await redis.ltrim(KEYS.audit, 0, MAX_ENTRIES - 1);
  } catch (err) {
    console.error('Audit write failed:', err.message);
  }
}

export async function listAudit(limit = 100) {
  const raw = await redis.lrange(KEYS.audit, 0, Math.max(0, Math.min(limit, MAX_ENTRIES) - 1));
  return (raw || []).map((item) => {
    if (typeof item === 'string') {
      try {
        return JSON.parse(item);
      } catch {
        return { at: null, action: item };
      }
    }
    return item;
  });
}
