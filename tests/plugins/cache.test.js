import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert"
import { createContainer, factory } from "../../lib/core.js"
import {
  ttlCache,
  slidingCache,
  refreshAhead,
  keyedCache,
  cachePlugin,
} from "../../lib/plugins/cache.js"

describe("cache plugin", () => {
  let container

  beforeEach(() => {
    container = createContainer()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe("ttlCache()", () => {
    it("caches the result of a sync factory", () => {
      let callCount = 0
      const config = factory("Config", () => {
        callCount++
        return { port: 3000 }
      })
      const cached = ttlCache({ ttlMs: 1000 })(config)

      const result1 = container.get(cached)
      const result2 = container.get(cached)

      assert.strictEqual(callCount, 1)
      assert.deepStrictEqual(result1, { port: 3000 })
      assert.strictEqual(result1, result2)
    })

    it("caches the result of an async factory", async () => {
      let callCount = 0
      const config = factory("Config", async () => {
        callCount++
        return { port: 3000 }
      })
      const cached = ttlCache({ ttlMs: 1000 })(config)

      const result1 = await container.get(cached)
      const result2 = await container.get(cached)

      assert.strictEqual(callCount, 1)
      assert.deepStrictEqual(result1, { port: 3000 })
    })

    it("expires after TTL", async () => {
      let callCount = 0
      const config = factory("Config", () => {
        callCount++
        return { value: callCount }
      })
      const cached = ttlCache({ ttlMs: 50 })(config)

      const result1 = cached(container)
      assert.strictEqual(callCount, 1)

      // Wait for expiration
      await new Promise((r) => setTimeout(r, 60))

      const result2 = cached(container)
      assert.strictEqual(callCount, 2)
      assert.deepStrictEqual(result2, { value: 2 })
    })

    it("returns fresh value while expired", async () => {
      let callCount = 0
      const config = factory("Config", () => {
        callCount++
        return { value: callCount }
      })
      const cached = ttlCache({ ttlMs: 20 })(config)

      // First call
      cached(container)
      assert.strictEqual(callCount, 1)

      // Wait for expiration
      await new Promise((r) => setTimeout(r, 30))

      // Second call should get fresh value
      const result = cached(container)
      assert.strictEqual(callCount, 2)
      assert.deepStrictEqual(result, { value: 2 })
    })

    describe("staleWhileRevalidate", () => {
      it("returns stale value immediately while refreshing", async () => {
        let callCount = 0
        let resolveRefresh
        const refreshPromise = new Promise((r) => {
          resolveRefresh = r
        })

        const slow = factory("Slow", async () => {
          callCount++
          if (callCount > 1) {
            await refreshPromise
          }
          return { value: callCount }
        })
        const cached = ttlCache({ ttlMs: 20, staleWhileRevalidate: true })(slow)

        // First call - cache miss
        const result1 = await cached(container)
        assert.strictEqual(callCount, 1)
        assert.deepStrictEqual(result1, { value: 1 })

        // Wait for expiration
        await new Promise((r) => setTimeout(r, 30))

        // Second call - should return stale immediately
        const result2 = await cached(container)
        assert.deepStrictEqual(result2, { value: 1 }) // Stale value

        // Background refresh is happening
        assert.strictEqual(callCount, 2)

        // Let the refresh complete
        resolveRefresh()
        await new Promise((r) => setTimeout(r, 10))

        // Now we get the fresh value
        const result3 = await cached(container)
        assert.deepStrictEqual(result3, { value: 2 })
      })

      it("only starts one background refresh", async () => {
        let callCount = 0
        const slow = factory("Slow", async () => {
          callCount++
          await new Promise((r) => setTimeout(r, 50))
          return { value: callCount }
        })
        const cached = ttlCache({ ttlMs: 10, staleWhileRevalidate: true })(slow)

        // Prime the cache
        await cached(container)
        assert.strictEqual(callCount, 1)

        // Wait for expiration
        await new Promise((r) => setTimeout(r, 20))

        // Multiple calls should only trigger one refresh
        await Promise.all([
          cached(container),
          cached(container),
          cached(container),
        ])

        // Wait for refresh to complete
        await new Promise((r) => setTimeout(r, 60))

        assert.strictEqual(callCount, 2) // Only 1 refresh, not 3
      })
    })

    describe("onRefresh callback", () => {
      it("is called on initial cache", () => {
        const refreshed = []
        const config = factory("Config", () => ({ port: 3000 }))
        const cached = ttlCache({
          ttlMs: 1000,
          onRefresh: (v) => refreshed.push(v),
        })(config)

        cached(container)

        assert.strictEqual(refreshed.length, 1)
        assert.deepStrictEqual(refreshed[0], { port: 3000 })
      })

      it("is called on cache refresh", async () => {
        const refreshed = []
        let callCount = 0
        const config = factory("Config", () => ({ value: ++callCount }))
        const cached = ttlCache({
          ttlMs: 20,
          onRefresh: (v) => refreshed.push(v),
        })(config)

        cached(container)
        await new Promise((r) => setTimeout(r, 30))
        cached(container)

        assert.strictEqual(refreshed.length, 2)
        assert.deepStrictEqual(refreshed[1], { value: 2 })
      })
    })

    it("preserves displayName", () => {
      const config = factory("MyConfig", () => ({}))
      const cached = ttlCache({ ttlMs: 1000 })(config)

      assert.strictEqual(cached.displayName, "MyConfig")
    })

    it("preserves _inner reference", () => {
      const config = factory("Config", () => ({}))
      const cached = ttlCache({ ttlMs: 1000 })(config)

      assert.strictEqual(cached._inner, config)
    })
  })

  describe("slidingCache()", () => {
    it("caches the result", () => {
      let callCount = 0
      const config = factory("Config", () => {
        callCount++
        return { port: 3000 }
      })
      const cached = slidingCache({ ttlMs: 100 })(config)

      cached(container)
      cached(container)

      assert.strictEqual(callCount, 1)
    })

    it("extends TTL on each access", async () => {
      let callCount = 0
      const config = factory("Config", () => {
        callCount++
        return { value: callCount }
      })
      const cached = slidingCache({ ttlMs: 40 })(config)

      // Initial call
      cached(container)
      assert.strictEqual(callCount, 1)

      // Access before half the TTL
      await new Promise((r) => setTimeout(r, 20))
      cached(container) // This resets the TTL
      assert.strictEqual(callCount, 1)

      // Access again before original TTL would have expired
      await new Promise((r) => setTimeout(r, 25))
      cached(container) // Still fresh because TTL was reset
      assert.strictEqual(callCount, 1)

      // Wait for full TTL after last access
      await new Promise((r) => setTimeout(r, 50))
      cached(container) // Now expired
      assert.strictEqual(callCount, 2)
    })

    it("expires when not accessed", async () => {
      let callCount = 0
      const config = factory("Config", () => {
        callCount++
        return { value: callCount }
      })
      const cached = slidingCache({ ttlMs: 30 })(config)

      cached(container)
      assert.strictEqual(callCount, 1)

      // Wait for expiration without accessing
      await new Promise((r) => setTimeout(r, 40))

      cached(container)
      assert.strictEqual(callCount, 2)
    })

    it("calls onRefresh on refresh", async () => {
      const refreshed = []
      let callCount = 0
      const config = factory("Config", () => ({ value: ++callCount }))
      const cached = slidingCache({
        ttlMs: 20,
        onRefresh: (v) => refreshed.push(v),
      })(config)

      cached(container)
      await new Promise((r) => setTimeout(r, 30))
      cached(container)

      assert.strictEqual(refreshed.length, 2)
    })
  })

  describe("refreshAhead()", () => {
    it("caches the result", async () => {
      let callCount = 0
      const config = factory("Config", async () => {
        callCount++
        return { port: 3000 }
      })
      const cached = refreshAhead({ ttlMs: 1000 })(config)

      await cached(container)
      await cached(container)

      assert.strictEqual(callCount, 1)
    })

    it("refreshes in background before expiration", async () => {
      let callCount = 0
      const config = factory("Config", async () => {
        callCount++
        return { value: callCount }
      })
      // TTL 100ms, refresh at 50ms (default 75% = 75ms, but we override)
      const cached = refreshAhead({ ttlMs: 100, refreshAt: 30 })(config)

      // Initial fetch
      await cached(container)
      assert.strictEqual(callCount, 1)

      // Wait until after refresh threshold but before expiration
      await new Promise((r) => setTimeout(r, 40))

      // This should trigger background refresh but return cached value
      const result = await cached(container)
      assert.deepStrictEqual(result, { value: 1 }) // Still cached value

      // Wait for background refresh to complete
      await new Promise((r) => setTimeout(r, 20))

      // Now we get fresh value
      const result2 = await cached(container)
      assert.deepStrictEqual(result2, { value: 2 })
    })

    it("uses default 75% refresh threshold", async () => {
      let callCount = 0
      const config = factory("Config", async () => {
        callCount++
        return { value: callCount }
      })
      // TTL 100ms, refresh at 75ms (default)
      const cached = refreshAhead({ ttlMs: 100 })(config)

      await cached(container)
      assert.strictEqual(callCount, 1)

      // At 60ms (before 75% threshold) - no refresh
      await new Promise((r) => setTimeout(r, 60))
      await cached(container)
      assert.strictEqual(callCount, 1)

      // At 80ms (after 75% threshold) - triggers refresh
      await new Promise((r) => setTimeout(r, 20))
      await cached(container)

      // Wait for background refresh
      await new Promise((r) => setTimeout(r, 20))
      assert.strictEqual(callCount, 2)
    })

    it("requires new fetch when fully expired", async () => {
      let callCount = 0
      const config = factory("Config", async () => {
        callCount++
        return { value: callCount }
      })
      const cached = refreshAhead({ ttlMs: 30 })(config)

      await cached(container)
      assert.strictEqual(callCount, 1)

      // Wait for full expiration
      await new Promise((r) => setTimeout(r, 40))

      // Must wait for new fetch
      const result = await cached(container)
      assert.strictEqual(callCount, 2)
      assert.deepStrictEqual(result, { value: 2 })
    })

    it("calls onRefresh callback", async () => {
      const refreshed = []
      const config = factory("Config", async () => ({ port: 3000 }))
      const cached = refreshAhead({
        ttlMs: 1000,
        onRefresh: (v) => refreshed.push(v),
      })(config)

      await cached(container)

      assert.strictEqual(refreshed.length, 1)
      assert.deepStrictEqual(refreshed[0], { port: 3000 })
    })
  })

  describe("keyedCache()", () => {
    it("caches per key", () => {
      let callCount = 0
      const userFactory = factory("User", () => ({ id: ++callCount }))

      // Simple key based on call order for testing
      let currentKey = "a"
      const cached = keyedCache({
        ttlMs: 1000,
        keyFn: () => currentKey,
      })(userFactory)

      currentKey = "a"
      const user1 = cached(container)
      const user1Again = cached(container)

      currentKey = "b"
      const user2 = cached(container)

      currentKey = "a"
      const user1Third = cached(container)

      assert.strictEqual(callCount, 2) // Only 2 unique keys
      assert.strictEqual(user1, user1Again)
      assert.strictEqual(user1, user1Third)
      assert.notStrictEqual(user1, user2)
    })

    it("expires each key independently", async () => {
      let callCount = 0
      const userFactory = factory("User", () => ({ id: ++callCount }))

      let currentKey = "a"
      const cached = keyedCache({
        ttlMs: 30,
        keyFn: () => currentKey,
      })(userFactory)

      currentKey = "a"
      cached(container) // key a -> id 1

      await new Promise((r) => setTimeout(r, 15))

      currentKey = "b"
      cached(container) // key b -> id 2

      await new Promise((r) => setTimeout(r, 20))

      // key a expired, key b still valid
      currentKey = "a"
      cached(container) // key a -> id 3

      currentKey = "b"
      const bResult = cached(container) // still id 2

      assert.strictEqual(callCount, 3)
      assert.deepStrictEqual(bResult, { id: 2 })
    })

    it("evicts LRU when maxSize exceeded", () => {
      let callCount = 0
      const userFactory = factory("User", () => ({ id: ++callCount }))

      const evicted = []
      let currentKey = "a"
      const cached = keyedCache({
        ttlMs: 10000,
        keyFn: () => currentKey,
        maxSize: 2,
        onEvict: (key, value) => evicted.push({ key, value }),
      })(userFactory)

      currentKey = "a"
      cached(container) // a -> 1

      currentKey = "b"
      cached(container) // b -> 2

      currentKey = "c"
      cached(container) // c -> 3, evicts a

      assert.strictEqual(evicted.length, 1)
      assert.strictEqual(evicted[0].key, "a")
      assert.deepStrictEqual(evicted[0].value, { id: 1 })

      // a should be re-fetched
      currentKey = "a"
      const aResult = cached(container) // a -> 4
      assert.deepStrictEqual(aResult, { id: 4 })
    })

    it("updates LRU order on access", () => {
      let callCount = 0
      const userFactory = factory("User", () => ({ id: ++callCount }))

      const evicted = []
      let currentKey = "a"
      const cached = keyedCache({
        ttlMs: 10000,
        keyFn: () => currentKey,
        maxSize: 2,
        onEvict: (key) => evicted.push(key),
      })(userFactory)

      currentKey = "a"
      cached(container) // a

      currentKey = "b"
      cached(container) // b

      // Access a again to make it recently used
      currentKey = "a"
      cached(container) // a (no new call)

      currentKey = "c"
      cached(container) // c, evicts b (not a, because a was accessed)

      assert.deepStrictEqual(evicted, ["b"])
    })

    it("extracts key from container", () => {
      const currentUser = factory("CurrentUser", () => ({ id: "user-123" }))

      let callCount = 0
      const prefs = factory("Prefs", () => ({ theme: "dark", calls: ++callCount }))

      const cached = keyedCache({
        ttlMs: 1000,
        keyFn: (c) => c.get(currentUser).id,
      })(prefs)

      // Resolve currentUser first
      container.get(currentUser)

      const result1 = cached(container)
      const result2 = cached(container)

      assert.strictEqual(callCount, 1)
      assert.strictEqual(result1, result2)
    })
  })

  describe("cachePlugin", () => {
    it("can be applied to container", () => {
      const pluginContainer = createContainer().with(cachePlugin)

      assert.ok(typeof pluginContainer.getCacheStats === "function")
      assert.ok(typeof pluginContainer.getAllCacheStats === "function")
      assert.ok(typeof pluginContainer.clearAllCaches === "function")
    })

    it("returns null for unknown cache stats", () => {
      const pluginContainer = createContainer().with(cachePlugin)
      const stats = pluginContainer.getCacheStats("unknown")
      assert.strictEqual(stats, null)
    })

    it("returns empty map for getAllCacheStats", () => {
      const pluginContainer = createContainer().with(cachePlugin)
      const stats = pluginContainer.getAllCacheStats()
      assert.ok(stats instanceof Map)
      assert.strictEqual(stats.size, 0)
    })
  })

  describe("async factory handling", () => {
    it("ttlCache handles async correctly", async () => {
      let callCount = 0
      const asyncFactory = factory("Async", async () => {
        callCount++
        await new Promise((r) => setTimeout(r, 10))
        return { value: callCount }
      })
      const cached = ttlCache({ ttlMs: 1000 })(asyncFactory)

      const result1 = await cached(container)
      const result2 = await cached(container)

      assert.strictEqual(callCount, 1)
      assert.deepStrictEqual(result1, { value: 1 })
      assert.deepStrictEqual(result2, { value: 1 })
    })

    it("slidingCache handles async correctly", async () => {
      let callCount = 0
      const asyncFactory = factory("Async", async () => {
        callCount++
        return { value: callCount }
      })
      const cached = slidingCache({ ttlMs: 1000 })(asyncFactory)

      const result1 = await cached(container)
      const result2 = await cached(container)

      assert.strictEqual(callCount, 1)
      assert.deepStrictEqual(result1, result2)
    })

    it("keyedCache handles async correctly", async () => {
      let callCount = 0
      const asyncFactory = factory("Async", async () => {
        callCount++
        return { value: callCount }
      })
      let key = "a"
      const cached = keyedCache({
        ttlMs: 1000,
        keyFn: () => key,
      })(asyncFactory)

      const result1 = await cached(container)
      const result2 = await cached(container)

      assert.strictEqual(callCount, 1)
      assert.deepStrictEqual(result1, result2)
    })
  })
})
