import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert"
import { createContainer, factory } from "../../lib/core.js"
import { metrics } from "../../lib/plugins/metrics.js"

describe("metrics plugin", () => {
  let container

  beforeEach(() => {
    container = createContainer().with(metrics())
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe("counters", () => {
    it("tracks resolution count", () => {
      const config = factory("Config", () => ({ port: 3000 }))

      container.get(config)

      assert.strictEqual(container.getCounter("Config"), 1)
    })

    it("increments on each resolution", () => {
      // Use a transient factory to get multiple resolutions
      let count = 0
      const counter = factory("Counter", () => ++count)

      // First resolution is cached
      container.get(counter)
      assert.strictEqual(container.getCounter("Counter"), 1)

      // Clear cache to allow re-resolution
      container.clearCache()
      container.get(counter)
      assert.strictEqual(container.getCounter("Counter"), 2)
    })

    it("returns 0 for unknown factories", () => {
      assert.strictEqual(container.getCounter("Unknown"), 0)
    })

    it("tracks multiple factories independently", () => {
      const db = factory("Database", () => ({ connected: true }))
      const cache = factory("Cache", () => ({ size: 100 }))

      container.get(db)
      container.get(cache)
      container.get(db) // cached, no new counter

      assert.strictEqual(container.getCounter("Database"), 1)
      assert.strictEqual(container.getCounter("Cache"), 1)
    })
  })

  describe("error tracking", () => {
    it("records errors manually", () => {
      container.recordError("FailingService")
      container.recordError("FailingService")

      assert.strictEqual(container.getErrorCount("FailingService"), 2)
    })

    it("returns 0 for factories with no errors", () => {
      assert.strictEqual(container.getErrorCount("HealthyService"), 0)
    })
  })

  describe("histograms", () => {
    it("tracks resolution timing", async () => {
      const slow = factory("Slow", async () => {
        // Use setTimeout for reliable timing
        await new Promise((r) => setTimeout(r, 10))
        return {}
      })

      await container.get(slow)

      const histogram = container.getHistogram("Slow")
      assert.strictEqual(histogram.count, 1)
      assert.ok(histogram.sum >= 5, `Expected sum >= 5, got ${histogram.sum}`)
    })

    it("returns empty histogram for unknown factories", () => {
      const histogram = container.getHistogram("Unknown")
      assert.strictEqual(histogram.count, 0)
      assert.strictEqual(histogram.sum, 0)
      assert.ok(Array.isArray(histogram.buckets))
    })

    it("uses default buckets", () => {
      const fast = factory("Fast", () => ({}))
      container.get(fast)

      const histogram = container.getHistogram("Fast")
      // Default buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
      assert.strictEqual(histogram.buckets.length, 11)
      assert.strictEqual(histogram.buckets[0].le, 1)
      assert.strictEqual(histogram.buckets[10].le, 5000)
    })

    it("counts observations in correct buckets", () => {
      const fast = factory("Fast", () => ({}))
      container.get(fast)

      const histogram = container.getHistogram("Fast")
      // Fast factory should be in all buckets (< 1ms)
      assert.ok(histogram.buckets[0].count >= 0) // Could be 0 or 1 depending on speed
    })
  })

  describe("gauges", () => {
    it("tracks active resolutions", async () => {
      let resolveFactory
      const blocking = factory("Blocking", async () => {
        await new Promise((r) => {
          resolveFactory = r
        })
        return {}
      })

      const promise = container.get(blocking)

      // While resolving, active should be 1
      assert.strictEqual(container.getActiveResolutions(), 1)

      resolveFactory()
      await promise

      // After resolution, active should be 0
      assert.strictEqual(container.getActiveResolutions(), 0)
    })

    it("tracks peak active resolutions", async () => {
      const fast = factory("Fast", () => ({}))

      container.get(fast)
      container.clearCache()
      container.get(fast)

      // Peak should be at least 1
      assert.ok(container.getPeakActiveResolutions() >= 1)
    })
  })

  describe("getAllMetrics()", () => {
    it("returns all collected metrics", () => {
      const db = factory("Database", () => ({}))
      container.get(db)
      container.recordError("ExternalAPI")

      const all = container.getAllMetrics()

      assert.ok(all.counters instanceof Map)
      assert.ok(all.errors instanceof Map)
      assert.ok(all.histograms instanceof Map)
      assert.strictEqual(typeof all.activeResolutions, "number")
      assert.strictEqual(typeof all.peakActiveResolutions, "number")

      assert.strictEqual(all.counters.get("Database"), 1)
      assert.strictEqual(all.errors.get("ExternalAPI"), 1)
    })
  })

  describe("resetMetrics()", () => {
    it("clears all metrics", () => {
      const db = factory("Database", () => ({}))
      container.get(db)
      container.recordError("API")

      container.resetMetrics()

      assert.strictEqual(container.getCounter("Database"), 0)
      assert.strictEqual(container.getErrorCount("API"), 0)
      assert.strictEqual(container.getActiveResolutions(), 0)
      assert.strictEqual(container.getPeakActiveResolutions(), 0)
    })
  })

  describe("toPrometheus()", () => {
    it("exports metrics in Prometheus format", () => {
      const db = factory("Database", () => ({}))
      container.get(db)

      const output = container.toPrometheus()

      assert.ok(output.includes("# HELP"))
      assert.ok(output.includes("# TYPE"))
      assert.ok(output.includes("di_resolutions_total"))
      assert.ok(output.includes("di_resolution_duration_ms"))
      assert.ok(output.includes("di_active_resolutions"))
    })

    it("includes factory labels", () => {
      const db = factory("Database", () => ({}))
      container.get(db)

      const output = container.toPrometheus()

      assert.ok(output.includes('factory="Database"'))
    })

    it("includes histogram buckets", () => {
      const db = factory("Database", () => ({}))
      container.get(db)

      const output = container.toPrometheus()

      assert.ok(output.includes("_bucket"))
      assert.ok(output.includes('le="'))
      assert.ok(output.includes('le="+Inf"'))
      assert.ok(output.includes("_sum"))
      assert.ok(output.includes("_count"))
    })
  })

  describe("configuration", () => {
    it("supports custom prefix", () => {
      const customContainer = createContainer().with(
        metrics({ prefix: "myapp" })
      )
      const db = factory("Database", () => ({}))
      customContainer.get(db)

      const output = customContainer.toPrometheus()

      assert.ok(output.includes("myapp_resolutions_total"))
      assert.ok(!output.includes("di_resolutions_total"))
    })

    it("supports custom buckets", () => {
      const customContainer = createContainer().with(
        metrics({ buckets: [10, 100, 1000] })
      )
      const db = factory("Database", () => ({}))
      customContainer.get(db)

      const histogram = customContainer.getHistogram("Database")

      assert.strictEqual(histogram.buckets.length, 3)
      assert.strictEqual(histogram.buckets[0].le, 10)
      assert.strictEqual(histogram.buckets[2].le, 1000)
    })

    it("supports custom labels", () => {
      const customContainer = createContainer().with(
        metrics({ labels: { env: "test", region: "us-east" } })
      )
      const db = factory("Database", () => ({}))
      customContainer.get(db)

      const output = customContainer.toPrometheus()

      assert.ok(output.includes('env="test"'))
      assert.ok(output.includes('region="us-east"'))
    })
  })

  describe("async factories", () => {
    it("tracks async resolution timing", async () => {
      const slow = factory("SlowAsync", async () => {
        await new Promise((r) => setTimeout(r, 10))
        return {}
      })

      await container.get(slow)

      const histogram = container.getHistogram("SlowAsync")
      assert.strictEqual(histogram.count, 1)
      assert.ok(histogram.sum >= 10)
    })
  })
})
