/**
 * Cache Plugin - Type Declarations
 *
 * TTL-based caching decorators beyond the built-in memo().
 * Provides time-based expiration, stale-while-revalidate, and keyed caching.
 */

import type { Container, Factory, Plugin } from "../core.js"

// ═══════════════════════════════════════════════════════════════════════════
// TTL CACHE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options for ttlCache decorator.
 */
export interface TtlCacheOptions {
  /**
   * Time to live in milliseconds. After this duration, the cached value expires.
   */
  ttlMs: number

  /**
   * If true, returns stale value immediately while refreshing in background.
   * This provides better latency at the cost of potentially stale data.
   * @default false
   */
  staleWhileRevalidate?: boolean

  /**
   * Callback invoked when a new value is cached (initial or refresh).
   */
  onRefresh?: (value: unknown) => void
}

/**
 * Create a TTL (time-to-live) cache decorator.
 * Caches the factory result and expires after the specified duration.
 *
 * @param options - Cache configuration
 *
 * @example
 * ```ts
 * import { pipe, factory } from 'no-decoration/core'
 * import { ttlCache } from 'no-decoration/plugins/cache'
 *
 * // Cache config for 5 minutes
 * const config = pipe(
 *   factory("Config", async () => fetchRemoteConfig()),
 *   ttlCache({ ttlMs: 5 * 60 * 1000 })
 * )
 * ```
 *
 * @example
 * ```ts
 * // With stale-while-revalidate for better latency
 * const users = pipe(
 *   factory("Users", async () => fetchUsers()),
 *   ttlCache({
 *     ttlMs: 60000,
 *     staleWhileRevalidate: true,  // Return stale data while fetching fresh
 *     onRefresh: (users) => console.log(`Refreshed ${users.length} users`)
 *   })
 * )
 * ```
 */
export declare function ttlCache(
  options: TtlCacheOptions
): <T>(factory: Factory<T | Promise<T>>) => Factory<T | Promise<T>>

// ═══════════════════════════════════════════════════════════════════════════
// SLIDING CACHE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options for slidingCache decorator.
 */
export interface SlidingCacheOptions {
  /**
   * Time to live in milliseconds. Resets on each access.
   */
  ttlMs: number

  /**
   * Callback invoked when a new value is cached.
   */
  onRefresh?: (value: unknown) => void
}

/**
 * Create a sliding window cache decorator.
 * Like ttlCache, but the TTL resets on each access.
 * Good for "keep alive while actively used" patterns.
 *
 * @param options - Cache configuration
 *
 * @example
 * ```ts
 * // Session data that stays cached while actively used
 * const session = pipe(
 *   factory("Session", async () => loadSession()),
 *   slidingCache({ ttlMs: 30 * 60 * 1000 })  // 30 min, resets on access
 * )
 * ```
 */
export declare function slidingCache(
  options: SlidingCacheOptions
): <T>(factory: Factory<T | Promise<T>>) => Factory<T | Promise<T>>

// ═══════════════════════════════════════════════════════════════════════════
// REFRESH AHEAD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options for refreshAhead decorator.
 */
export interface RefreshAheadOptions<T = unknown> {
  /**
   * Time to live in milliseconds. After this, the cache is considered expired.
   */
  ttlMs: number

  /**
   * Time in milliseconds after which to start background refresh.
   * @default ttlMs * 0.75 (75% of TTL)
   */
  refreshAt?: number

  /**
   * Callback invoked when a new value is cached.
   */
  onRefresh?: (value: T) => void
}

/**
 * Create a refresh-ahead cache decorator.
 * Proactively refreshes the cache before expiration to avoid cold cache hits.
 *
 * @param options - Cache configuration
 *
 * @example
 * ```ts
 * // Refresh at 75% of TTL (default)
 * const data = pipe(
 *   factory("Data", async () => fetchData()),
 *   refreshAhead({ ttlMs: 60000 })  // Refreshes at 45s, expires at 60s
 * )
 *
 * // Custom refresh threshold
 * const config = pipe(
 *   factory("Config", async () => fetchConfig()),
 *   refreshAhead({
 *     ttlMs: 300000,      // 5 minutes
 *     refreshAt: 240000   // Start refresh at 4 minutes
 *   })
 * )
 * ```
 */
export declare function refreshAhead<T>(
  options: RefreshAheadOptions<T>
): (factory: Factory<T | Promise<T>>) => Factory<T | Promise<T>>

// ═══════════════════════════════════════════════════════════════════════════
// KEYED CACHE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options for keyedCache decorator.
 */
export interface KeyedCacheOptions<K = string> {
  /**
   * Time to live in milliseconds for each cached entry.
   */
  ttlMs: number

  /**
   * Function to derive the cache key from the container.
   * Typically extracts request-specific data like user ID or tenant.
   */
  keyFn: (container: Container) => K

  /**
   * Maximum number of entries to keep. Uses LRU eviction.
   */
  maxSize?: number

  /**
   * Callback invoked when an entry is evicted (due to maxSize).
   */
  onEvict?: (key: K, value: unknown) => void
}

/**
 * Create a keyed cache decorator with per-key TTL.
 * Useful for multi-tenant or per-user caching.
 *
 * @param options - Cache configuration
 *
 * @example
 * ```ts
 * // Per-user cache with LRU eviction
 * const userPrefs = pipe(
 *   factory("UserPrefs", async (c) => {
 *     const userId = c.get(currentUser).id
 *     return fetchUserPrefs(userId)
 *   }),
 *   keyedCache({
 *     ttlMs: 300000,  // 5 minutes
 *     keyFn: (c) => c.get(currentUser).id,
 *     maxSize: 1000,  // Keep max 1000 users cached
 *     onEvict: (userId, prefs) => console.log(`Evicted prefs for ${userId}`)
 *   })
 * )
 * ```
 */
export declare function keyedCache<K = string>(
  options: KeyedCacheOptions<K>
): <T>(factory: Factory<T | Promise<T>>) => Factory<T | Promise<T>>

// ═══════════════════════════════════════════════════════════════════════════
// PLUGIN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cache statistics for monitoring.
 */
export interface CacheStats {
  hits: number
  misses: number
  evictions: number
  size: number
}

/**
 * Methods added to the container by the cache plugin.
 */
export interface CacheMethods {
  /**
   * Get cache statistics for a named cache.
   */
  getCacheStats(name: string): CacheStats | null

  /**
   * Get all cache statistics.
   */
  getAllCacheStats(): Map<string, CacheStats>

  /**
   * Clear all cache statistics.
   */
  clearAllCaches(): void
}

/**
 * Cache plugin for container-level cache management.
 * Currently provides statistics tracking infrastructure.
 *
 * Note: The cache decorators (ttlCache, slidingCache, etc.) work
 * without this plugin. The plugin is for monitoring and management.
 *
 * @example
 * ```ts
 * const container = createContainer().with(cachePlugin)
 *
 * // Later: check cache stats
 * const stats = container.getCacheStats("myCache")
 * ```
 */
export declare const cachePlugin: Plugin<CacheMethods>
