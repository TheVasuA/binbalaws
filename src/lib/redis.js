import { Redis } from '@upstash/redis';

// One client per server process; the Upstash client is stateless HTTP so it is
// safe to share across requests.
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const KEYS = {
  settings: 'portfolio_settings',
  compound: 'compound_data',
  appConfig: 'app_config',
  audit: 'admin:audit',
  watcherHeartbeat: 'bulk:watcher:heartbeat',
};
