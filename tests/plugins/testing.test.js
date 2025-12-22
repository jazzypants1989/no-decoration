import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert"
import { createContainer, factory, named } from "../../lib/core.js"
import { testing } from "../../lib/plugins/testing.js"

describe("testing plugin", () => {
  let container

  beforeEach(() => {
    container = createContainer().with(testing)
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe("withMocks()", () => {
    it("creates a child container with overrides", () => {
      const realDb = factory("Database", () => ({ type: "real" }))

      const mockContainer = container.withMocks([
        [realDb, () => ({ type: "mock" })],
      ])

      assert.deepStrictEqual(mockContainer.get(realDb), { type: "mock" })
    })

    it("does not affect the parent container", () => {
      const db = factory("Database", () => ({ type: "real" }))

      container.withMocks([[db, () => ({ type: "mock" })]])

      assert.deepStrictEqual(container.get(db), { type: "real" })
    })

    it("accepts a Map of mocks", () => {
      const db = factory("Database", () => ({ type: "real" }))
      const logger = factory("Logger", () => ({ type: "real" }))

      const mocks = new Map([
        [db, () => ({ type: "mockDb" })],
        [logger, () => ({ type: "mockLogger" })],
      ])

      const mockContainer = container.withMocks(mocks)

      assert.deepStrictEqual(mockContainer.get(db), { type: "mockDb" })
      assert.deepStrictEqual(mockContainer.get(logger), { type: "mockLogger" })
    })

    it("supports multiple mocks in array", () => {
      const db = factory("Database", () => ({ type: "real" }))
      const logger = factory("Logger", () => ({ type: "real" }))
      const cache = factory("Cache", () => ({ type: "real" }))

      const mockContainer = container.withMocks([
        [db, () => ({ type: "mockDb" })],
        [logger, () => ({ type: "mockLogger" })],
        [cache, () => ({ type: "mockCache" })],
      ])

      assert.deepStrictEqual(mockContainer.get(db), { type: "mockDb" })
      assert.deepStrictEqual(mockContainer.get(logger), { type: "mockLogger" })
      assert.deepStrictEqual(mockContainer.get(cache), { type: "mockCache" })
    })

    it("child container also has testing plugin methods", () => {
      const db = factory("Database", () => ({ type: "real" }))

      const mockContainer = container.withMocks([
        [db, () => ({ type: "mock" })],
      ])

      assert.ok(typeof mockContainer.withMocks === "function")
      assert.ok(typeof mockContainer.snapshot === "function")
      assert.ok(typeof mockContainer.restore === "function")
    })
  })

  describe("snapshot()", () => {
    it("captures the current cache state", () => {
      const config = factory("Config", () => ({ env: "test" }))
      container.get(config)

      const snap = container.snapshot()

      assert.ok(snap.cache instanceof Map)
      assert.strictEqual(snap.cache.size, 1)
    })

    it("captures current overrides", () => {
      const config = factory("Config", () => ({ env: "real" }))
      container.override(config, () => ({ env: "mock" }))

      const snap = container.snapshot()

      assert.ok(snap.overrides instanceof Map)
      assert.strictEqual(snap.overrides.size, 1)
    })

    it("creates independent copies", () => {
      const config = factory("Config", () => ({ env: "test" }))
      container.get(config)

      const snap = container.snapshot()

      // Modify original container
      container.clearCache()

      // Snapshot should still have the data
      assert.strictEqual(snap.cache.size, 1)
    })
  })

  describe("restore()", () => {
    it("restores cache from snapshot", () => {
      const config = factory("Config", () => ({ env: "original" }))
      container.get(config)

      const snap = container.snapshot()

      // Clear and verify
      container.clearCache()
      assert.strictEqual(container.has(config), false)

      // Restore
      container.restore(snap)
      assert.strictEqual(container.has(config), true)
    })

    it("restores overrides from snapshot", () => {
      const config = factory("Config", () => ({ env: "real" }))

      // Set up override
      container.override(config, () => ({ env: "mock" }))
      const snap = container.snapshot()

      // Clear overrides
      container.clearOverrides()
      container.clearCache()

      // Should get real value now
      assert.deepStrictEqual(container.get(config), { env: "real" })

      // Restore snapshot
      container.restore(snap)
      container.clearCache()

      // Should get mock value again
      assert.deepStrictEqual(container.get(config), { env: "mock" })
    })

    it("clears state not in snapshot", () => {
      const config1 = factory("Config1", () => ({ id: 1 }))
      const config2 = factory("Config2", () => ({ id: 2 }))

      container.get(config1)
      const snap = container.snapshot()

      container.get(config2)
      assert.strictEqual(container.has(config2), true)

      container.restore(snap)
      assert.strictEqual(container.has(config2), false)
    })
  })

  describe("integration: test isolation pattern", () => {
    it("supports typical test isolation workflow", async () => {
      const db = factory("Database", () => ({ connected: true }))
      const service = factory("Service", (c) => ({
        db: c.get(db),
      }))

      // Take snapshot before test
      const snap = container.snapshot()

      // Run test with mocks
      container.override(db, () => ({ connected: false, mock: true }))
      const result = container.get(service)
      assert.strictEqual(result.db.mock, true)

      // Restore for next test
      container.restore(snap)
      container.clearCache()

      // Verify clean state
      const cleanResult = container.get(service)
      assert.strictEqual(cleanResult.db.connected, true)
      assert.strictEqual(cleanResult.db.mock, undefined)
    })
  })
})
