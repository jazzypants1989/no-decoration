import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert"
import { createContainer, factory } from "../../lib/core.js"
import { health } from "../../lib/plugins/health.js"

describe("health plugin", () => {
  let container

  beforeEach(() => {
    container = createContainer().with(health)
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe("onHealthCheck()", () => {
    it("registers a health check", async () => {
      let checkCalled = false

      container.onHealthCheck("test", async () => {
        checkCalled = true
      })

      await container.checkHealth()
      assert.strictEqual(checkCalled, true)
    })

    it("can register multiple health checks", async () => {
      const calls = []

      container.onHealthCheck("db", async () => calls.push("db"))
      container.onHealthCheck("cache", async () => calls.push("cache"))
      container.onHealthCheck("api", async () => calls.push("api"))

      await container.checkHealth()

      assert.strictEqual(calls.length, 3)
      assert.ok(calls.includes("db"))
      assert.ok(calls.includes("cache"))
      assert.ok(calls.includes("api"))
    })
  })

  describe("checkHealth()", () => {
    it("returns healthy=true when all checks pass", async () => {
      container.onHealthCheck("db", async () => {})
      container.onHealthCheck("cache", async () => {})

      const report = await container.checkHealth()

      assert.strictEqual(report.healthy, true)
    })

    it("returns healthy=false when any check fails", async () => {
      container.onHealthCheck("db", async () => {})
      container.onHealthCheck("cache", async () => {
        throw new Error("Cache connection failed")
      })

      const report = await container.checkHealth()

      assert.strictEqual(report.healthy, false)
    })

    it("returns a Map of check results", async () => {
      container.onHealthCheck("db", async () => {})
      container.onHealthCheck("cache", async () => {})

      const report = await container.checkHealth()

      assert.ok(report.checks instanceof Map)
      assert.strictEqual(report.checks.size, 2)
      assert.ok(report.checks.has("db"))
      assert.ok(report.checks.has("cache"))
    })

    it("includes timing for each check", async () => {
      container.onHealthCheck("fast", async () => {})
      container.onHealthCheck("slow", async () => {
        await new Promise((r) => setTimeout(r, 10))
      })

      const report = await container.checkHealth()

      const fastResult = report.checks.get("fast")
      const slowResult = report.checks.get("slow")

      assert.ok(typeof fastResult.ms === "number")
      assert.ok(typeof slowResult.ms === "number")
      assert.ok(slowResult.ms >= fastResult.ms)
    })

    it("includes error for failed checks", async () => {
      container.onHealthCheck("failing", async () => {
        throw new Error("Connection refused")
      })

      const report = await container.checkHealth()

      const result = report.checks.get("failing")
      assert.strictEqual(result.healthy, false)
      assert.ok(result.error instanceof Error)
      assert.strictEqual(result.error.message, "Connection refused")
    })

    it("marks successful checks as healthy", async () => {
      container.onHealthCheck("passing", async () => {})

      const report = await container.checkHealth()

      const result = report.checks.get("passing")
      assert.strictEqual(result.healthy, true)
      assert.strictEqual(result.error, undefined)
    })

    it("returns empty report when no checks registered", async () => {
      const report = await container.checkHealth()

      assert.strictEqual(report.healthy, true)
      assert.strictEqual(report.checks.size, 0)
    })

    it("continues checking even after failures", async () => {
      const calls = []

      container.onHealthCheck("first", async () => calls.push("first"))
      container.onHealthCheck("failing", async () => {
        calls.push("failing")
        throw new Error("Failed")
      })
      container.onHealthCheck("last", async () => calls.push("last"))

      await container.checkHealth()

      assert.deepStrictEqual(calls, ["first", "failing", "last"])
    })
  })

  describe("integration with factories", () => {
    it("can check health of resolved services", async () => {
      const db = factory("Database", (c) => {
        const instance = { connected: true }

        c.onDispose(async () => {
          instance.connected = false
        })

        return instance
      })

      // Resolve the database
      const dbInstance = container.get(db)

      // Register health check that uses the resolved instance
      container.onHealthCheck("database", async () => {
        if (!dbInstance.connected) {
          throw new Error("Database not connected")
        }
      })

      const report = await container.checkHealth()
      assert.strictEqual(report.healthy, true)
    })
  })
})
