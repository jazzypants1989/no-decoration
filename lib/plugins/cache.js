/**
 * Cache plugin for TTL-based caching beyond the built-in memo().
 */

/** @import * as Types from '../core.js' */
/** @import * as CacheTypes from './cache.js' */

/**
 * @param {CacheTypes.TtlCacheOptions} options
 */
export function ttlCache(options) {
  const { ttlMs, staleWhileRevalidate = false, onRefresh } = options

  /** @type {{ value: unknown, cachedAt: number } | null} */
  let cached = null
  /** @type {Promise<unknown> | null} */
  let pendingRefresh = null

  /**
   * @template T
   * @param {Types.Factory<T | Promise<T>>} factory
   */
  const decorator = (factory) => {
    /**
     * @param {Types.Container} c
     * @returns {T | Promise<T>}
     */
    const cachedFactory = (c) => {
      const now = Date.now()

      // Check if we have a valid cached value
      if (cached !== null) {
        const age = now - cached.cachedAt
        const isExpired = age >= ttlMs

        if (!isExpired) {
          // Still fresh
          return /** @type {T} */ (cached.value)
        }

        if (staleWhileRevalidate) {
          // Return stale value immediately, refresh in background
          if (!pendingRefresh) {
            pendingRefresh = Promise.resolve().then(async () => {
              try {
                const value = await factory(c)
                cached = { value, cachedAt: Date.now() }
                onRefresh?.(/** @type {T} */ (value))
              } finally {
                pendingRefresh = null
              }
            })
          }
          return /** @type {T} */ (cached.value)
        }

        // Expired and not using stale-while-revalidate, fall through to refresh
      }

      // No valid cache, resolve fresh
      const value = factory(c)

      if (value instanceof Promise) {
        // For async factories, cache after resolution
        const promise = value.then((resolved) => {
          cached = { value: resolved, cachedAt: Date.now() }
          onRefresh?.(resolved)
          return resolved
        })
        return /** @type {T} */ (promise)
      }

      // Sync factory
      cached = { value, cachedAt: now }
      onRefresh?.(value)
      return value
    }

    cachedFactory.displayName = factory.displayName || factory.name
    cachedFactory._inner = factory

    return cachedFactory
  }

  return decorator
}

/**
 * @param {CacheTypes.SlidingCacheOptions} options
 */
export function slidingCache(options) {
  const { ttlMs, onRefresh } = options

  /** @type {{ value: unknown, cachedAt: number } | null} */
  let cached = null

  /**
   * @template T
   * @param {Types.Factory<T | Promise<T>>} factory
   */
  const decorator = (factory) => {
    /**
     * @param {Types.Container} c
     * @returns {T | Promise<T>}
     */
    const cachedFactory = (c) => {
      const now = Date.now()

      // Check if we have a valid cached value
      if (cached !== null) {
        const age = now - cached.cachedAt
        if (age < ttlMs) {
          // Still fresh - reset the timer (sliding window)
          cached.cachedAt = now
          return /** @type {T} */ (cached.value)
        }
        // Expired, fall through to refresh
      }

      // No valid cache, resolve fresh
      const value = factory(c)

      if (value instanceof Promise) {
        const promise = value.then((resolved) => {
          cached = { value: resolved, cachedAt: Date.now() }
          onRefresh?.(resolved)
          return resolved
        })
        return /** @type {T} */ (promise)
      }

      cached = { value, cachedAt: now }
      onRefresh?.(value)
      return value
    }

    cachedFactory.displayName = factory.displayName || factory.name
    cachedFactory._inner = factory

    return cachedFactory
  }

  return decorator
}

/**
 * @template T
 * @param {CacheTypes.RefreshAheadOptions<T>} options
 */
export function refreshAhead(options) {
  const { ttlMs, refreshAt, onRefresh } = options
  const refreshThreshold = refreshAt ?? ttlMs * 0.75

  /** @type {{ value: unknown, cachedAt: number } | null} */
  let cached = null
  /** @type {Promise<unknown> | null} */
  let pendingRefresh = null

  /**
   * @param {Types.Factory<T | Promise<T>>} factory
   */
  const decorator = (factory) => {
    /**
     * @param {Types.Container} c
     * @returns {T | Promise<T>}
     */
    const cachedFactory = (c) => {
      const now = Date.now()

      if (cached !== null) {
        const age = now - cached.cachedAt
        const isExpired = age >= ttlMs
        const shouldRefresh = age >= refreshThreshold

        if (isExpired) {
          // Fully expired - must wait for refresh
          cached = null
        } else {
          // Still valid
          if (shouldRefresh && !pendingRefresh) {
            // Start background refresh
            pendingRefresh = Promise.resolve().then(async () => {
              try {
                const value = await factory(c)
                cached = { value, cachedAt: Date.now() }
                onRefresh?.(/** @type {T} */ (value))
              } finally {
                pendingRefresh = null
              }
            })
          }
          return /** @type {T} */ (cached.value)
        }
      }

      // No valid cache, resolve fresh
      const value = factory(c)

      if (value instanceof Promise) {
        const promise = value.then((resolved) => {
          cached = { value: resolved, cachedAt: Date.now() }
          onRefresh?.(resolved)
          return resolved
        })
        return /** @type {T} */ (promise)
      }

      cached = { value, cachedAt: now }
      onRefresh?.(value)
      return value
    }

    cachedFactory.displayName = factory.displayName || factory.name
    cachedFactory._inner = factory

    return cachedFactory
  }

  return decorator
}

/**
 * Creates a cache key function for use with keyedCache.
 * @param {Types.Container} _container
 */
const defaultKeyFn = (_container) => "default"

/**
 * @template K
 * @param {CacheTypes.KeyedCacheOptions<K>} options
 */
export function keyedCache(options) {
  const { ttlMs, keyFn, maxSize, onEvict } = options

  /** @type {Map<K, { value: unknown, cachedAt: number }>} */
  const cache = new Map()
  /** @type {K[]} */
  const accessOrder = []

  /**
   * @param {K} key
   */
  const touch = (key) => {
    const idx = accessOrder.indexOf(key)
    if (idx !== -1) {
      accessOrder.splice(idx, 1)
    }
    accessOrder.push(key)
  }

  /**
   * @param {K} key
   * @param {unknown} value
   */
  const evictIfNeeded = (key, value) => {
    if (maxSize && cache.size >= maxSize) {
      const oldest = accessOrder.shift()
      if (oldest !== undefined && oldest !== key) {
        const entry = cache.get(oldest)
        cache.delete(oldest)
        if (entry) {
          onEvict?.(oldest, entry.value)
        }
      }
    }
  }

  /**
   * @template T
   * @param {Types.Factory<T | Promise<T>>} factory
   */
  const decorator = (factory) => {
    /**
     * @param {Types.Container} c
     * @returns {T | Promise<T>}
     */
    const cachedFactory = (c) => {
      const key = keyFn(c)
      const now = Date.now()

      const entry = cache.get(key)
      if (entry !== undefined) {
        const age = now - entry.cachedAt
        if (age < ttlMs) {
          touch(key)
          return /** @type {T} */ (entry.value)
        }
        // Expired
        cache.delete(key)
        const idx = accessOrder.indexOf(key)
        if (idx !== -1) accessOrder.splice(idx, 1)
      }

      const value = factory(c)

      if (value instanceof Promise) {
        const promise = value.then((resolved) => {
          evictIfNeeded(key, resolved)
          cache.set(key, { value: resolved, cachedAt: Date.now() })
          touch(key)
          return resolved
        })
        return /** @type {T} */ (promise)
      }

      evictIfNeeded(key, value)
      cache.set(key, { value, cachedAt: now })
      touch(key)
      return value
    }

    cachedFactory.displayName = factory.displayName || factory.name
    cachedFactory._inner = factory

    return cachedFactory
  }

  return decorator
}

/** @type {CacheTypes.cachePlugin} */
export const cachePlugin = {
  name: "cache",

  /**
   * @param {Types.Container} _container
   * @param {Types.ContainerInternals} _internals
   */
  apply(_container, _internals) {
    /** @type {Map<string, CacheTypes.CacheStats>} */
    const stats = new Map()

    return {
      getCacheStats(name) {
        return stats.get(name) ?? null
      },

      getAllCacheStats() {
        return new Map(stats)
      },

      clearAllCaches() {
        stats.clear()
      },
    }
  },
}
