# Cache Plugin

TTL-based caching strategies beyond the built-in singleton behavior.

## Import

```ts
import { ttlCache, slidingCache, refreshAhead, keyedCache, cachePlugin } from 'no-decoration/plugins'
```

## Overview

The DI container already caches factories (singleton behavior). These decorators add:

- **Time-based expiration** - Cache expires after a duration
- **Stale-while-revalidate** - Return stale data while refreshing
- **Sliding windows** - TTL resets on access
- **Per-key caching** - Different cache entries per context

## ttlCache

Basic TTL with optional stale-while-revalidate.

```ts
import { pipe, factory } from 'no-decoration'
import { ttlCache } from 'no-decoration/plugins'

// Cache for 5 minutes
const config = pipe(
  factory('Config', async () => fetchRemoteConfig()),
  ttlCache({ ttlMs: 5 * 60 * 1000 })
)

// With stale-while-revalidate
const users = pipe(
  factory('Users', async () => fetchUsers()),
  ttlCache({
    ttlMs: 60000,
    staleWhileRevalidate: true,  // Return stale immediately, refresh in background
    onRefresh: (users) => console.log(`Refreshed ${users.length} users`)
  })
)
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttlMs` | `number` | required | Time to live in milliseconds |
| `staleWhileRevalidate` | `boolean` | `false` | Return stale while refreshing |
| `onRefresh` | `function` | - | Callback when cache is refreshed |

## slidingCache

TTL resets on each access. Good for "keep alive while in use" patterns.

```ts
// Session stays cached while actively used
const session = pipe(
  factory('Session', async () => loadSession()),
  slidingCache({ ttlMs: 30 * 60 * 1000 })  // 30 min, resets on access
)
```

**Behavior:**

```
Access at T=0    → Cached, expires at T=30min
Access at T=10min → Still cached, expires at T=40min (reset)
Access at T=35min → Still cached, expires at T=65min (reset)
No access until T=100min → Expired, fresh fetch
```

## refreshAhead

Proactively refresh before expiration. Avoids cold cache hits.

```ts
// Refresh at 75% of TTL (default)
const data = pipe(
  factory('Data', async () => fetchData()),
  refreshAhead({ ttlMs: 60000 })  // Refreshes at 45s, expires at 60s
)

// Custom refresh threshold
const config = pipe(
  factory('Config', async () => fetchConfig()),
  refreshAhead({
    ttlMs: 300000,      // 5 minutes
    refreshAt: 240000   // Start refresh at 4 minutes
  })
)
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttlMs` | `number` | required | Time to live |
| `refreshAt` | `number` | `ttlMs * 0.75` | When to start background refresh |
| `onRefresh` | `function` | - | Callback on refresh |

## keyedCache

Per-key caching with LRU eviction. Good for multi-tenant or per-user data.

```ts
// Per-user preferences cache
const userPrefs = pipe(
  factory('UserPrefs', async (c) => {
    const userId = c.get(currentUser).id
    return fetchUserPrefs(userId)
  }),
  keyedCache({
    ttlMs: 300000,  // 5 minutes per entry
    keyFn: (c) => c.get(currentUser).id,
    maxSize: 1000,  // Keep max 1000 users cached
    onEvict: (userId, prefs) => console.log(`Evicted prefs for ${userId}`)
  })
)
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttlMs` | `number` | required | TTL per entry |
| `keyFn` | `function` | required | Derives cache key from container |
| `maxSize` | `number` | - | Max entries (LRU eviction) |
| `onEvict` | `function` | - | Callback when entry evicted |

## Usage Patterns

### Remote Configuration

```ts
// Fetch config from remote, cache for 5 minutes
const config = pipe(
  factory('Config', async () => {
    const res = await fetch('https://config.example.com/app')
    return res.json()
  }),
  ttlCache({
    ttlMs: 5 * 60 * 1000,
    staleWhileRevalidate: true  // Never block on config fetch
  })
)
```

### Rate-Limited API

```ts
// Cache API responses to stay under rate limits
const apiData = pipe(
  factory('ApiData', async () => {
    const res = await fetch('https://api.example.com/data')
    return res.json()
  }),
  ttlCache({ ttlMs: 60000 })  // Cache for 1 minute
)
```

### Multi-Tenant Data

```ts
const tenantConfig = pipe(
  factory('TenantConfig', async (c) => {
    const tenantId = c.get(currentTenant).id
    return fetchTenantConfig(tenantId)
  }),
  keyedCache({
    ttlMs: 600000,  // 10 minutes
    keyFn: (c) => c.get(currentTenant).id,
    maxSize: 100    // Max 100 tenants cached
  })
)
```

### Session Data

```ts
// Keep session cached while user is active
const session = pipe(
  factory('Session', async (c) => {
    const sessionId = c.get(request).cookies.sessionId
    return loadSession(sessionId)
  }),
  keyedCache({
    keyFn: (c) => c.get(request).cookies.sessionId
  }),
  slidingCache({ ttlMs: 30 * 60 * 1000 })  // 30 min sliding window
)
```

## Comparison

| Strategy | Expires | Refresh | Use Case |
|----------|---------|---------|----------|
| `ttlCache` | After TTL | On next access | Simple caching |
| `ttlCache` + `staleWhileRevalidate` | After TTL | In background | Low latency priority |
| `slidingCache` | After TTL of inactivity | On next access | Session-like data |
| `refreshAhead` | After TTL | Before expiration | Always-fresh data |
| `keyedCache` | Per-key TTL | On next access | Per-user/tenant data |

## See Also

- [circuit-breaker](./circuit-breaker.md) - Fail fast pattern
- [patterns: memo()](./patterns.md) - Simple forever cache
