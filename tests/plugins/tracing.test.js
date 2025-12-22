import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert"
import { createContainer, factory } from "../../lib/core.js"
import { tracing } from "../../lib/plugins/tracing.js"

describe("tracing plugin", () => {
  let container

  beforeEach(() => {
    container = createContainer().with(tracing())
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe("span creation", () => {
    it("creates spans for factory resolution", () => {
      const db = factory("Database", () => ({ connected: true }))

      container.get(db)

      const spans = container.getCompletedSpans()
      assert.strictEqual(spans.length, 1)
      assert.strictEqual(spans[0].operationName, "resolve:Database")
    })

    it("includes timing information", () => {
      const db = factory("Database", () => ({}))

      container.get(db)

      const spans = container.getCompletedSpans()
      assert.ok(spans[0].startTime > 0)
      assert.ok(spans[0].endTime > 0)
      assert.ok(spans[0].duration >= 0)
      // Use approximate equality due to floating point
      const computed = spans[0].startTime + spans[0].duration
      assert.ok(
        Math.abs(spans[0].endTime - computed) < 0.01,
        `endTime (${spans[0].endTime}) should approximately equal startTime + duration (${computed})`
      )
    })

    it("includes trace and span IDs", () => {
      const db = factory("Database", () => ({}))

      container.get(db)

      const spans = container.getCompletedSpans()
      assert.ok(spans[0].traceId)
      assert.ok(spans[0].spanId)
    })

    it("includes factory attributes", () => {
      const db = factory("Database", () => ({}))

      container.get(db)

      const spans = container.getCompletedSpans()
      assert.strictEqual(spans[0].attributes["di.factory.name"], "Database")
      assert.strictEqual(spans[0].attributes["di.factory.transient"], false)
    })
  })

  describe("parent-child relationships", () => {
    it("links child spans to parent spans", () => {
      const config = factory("Config", () => ({ url: "localhost" }))
      const db = factory("Database", (c) => {
        const cfg = c.get(config)
        return { connected: true, url: cfg.url }
      })

      container.get(db)

      const spans = container.getCompletedSpans()
      assert.strictEqual(spans.length, 2)

      // Find parent and child
      const dbSpan = spans.find((s) => s.operationName === "resolve:Database")
      const configSpan = spans.find((s) => s.operationName === "resolve:Config")

      assert.ok(dbSpan)
      assert.ok(configSpan)
      assert.strictEqual(configSpan.parentSpanId, dbSpan.spanId)
      assert.strictEqual(configSpan.traceId, dbSpan.traceId)
    })

    it("maintains trace ID across nested resolutions", () => {
      const a = factory("A", () => "a")
      const b = factory("B", (c) => c.get(a) + "b")
      const c_ = factory("C", (c) => c.get(b) + "c")

      container.get(c_)

      const spans = container.getCompletedSpans()
      const traceIds = new Set(spans.map((s) => s.traceId))

      // All spans should share the same trace ID
      assert.strictEqual(traceIds.size, 1)
    })
  })

  describe("trace management", () => {
    it("generates trace ID on creation", () => {
      const traceId = container.getCurrentTraceId()
      assert.ok(traceId)
      assert.strictEqual(typeof traceId, "string")
    })

    it("starts new trace with new ID", () => {
      const oldTraceId = container.getCurrentTraceId()
      const newTraceId = container.startNewTrace()

      assert.notStrictEqual(oldTraceId, newTraceId)
      assert.strictEqual(container.getCurrentTraceId(), newTraceId)
    })

    it("new spans use new trace ID after startNewTrace", () => {
      const db = factory("Database", () => ({}))

      container.get(db)
      const firstTraceId = container.getCompletedSpans()[0].traceId

      container.startNewTrace()
      container.clearCache()
      container.get(db)

      const spans = container.getCompletedSpans()
      const secondTraceId = spans[spans.length - 1].traceId

      assert.notStrictEqual(firstTraceId, secondTraceId)
    })
  })

  describe("span queries", () => {
    it("getActiveSpans returns in-progress spans", async () => {
      let resolveFactory
      const blocking = factory("Blocking", async () => {
        await new Promise((r) => {
          resolveFactory = r
        })
        return {}
      })

      const promise = container.get(blocking)

      const active = container.getActiveSpans()
      assert.strictEqual(active.length, 1)
      assert.strictEqual(active[0].operationName, "resolve:Blocking")

      resolveFactory()
      await promise

      assert.strictEqual(container.getActiveSpans().length, 0)
    })

    it("getSpansByTrace filters by trace ID", () => {
      const db = factory("Database", () => ({}))

      container.get(db)
      const firstTraceId = container.getCurrentTraceId()

      container.startNewTrace()
      const secondTraceId = container.getCurrentTraceId()
      container.clearCache()
      container.get(db)

      const firstTraceSpans = container.getSpansByTrace(firstTraceId)
      const secondTraceSpans = container.getSpansByTrace(secondTraceId)

      assert.strictEqual(firstTraceSpans.length, 1)
      assert.strictEqual(secondTraceSpans.length, 1)
      // Trace IDs should be different
      assert.notStrictEqual(firstTraceId, secondTraceId)
      assert.strictEqual(firstTraceSpans[0].traceId, firstTraceId)
      assert.strictEqual(secondTraceSpans[0].traceId, secondTraceId)
    })

    it("clearSpans removes all completed spans", () => {
      const db = factory("Database", () => ({}))
      container.get(db)

      assert.strictEqual(container.getCompletedSpans().length, 1)

      container.clearSpans()

      assert.strictEqual(container.getCompletedSpans().length, 0)
    })
  })

  describe("withSpan()", () => {
    it("creates manual spans", async () => {
      const result = await container.withSpan("customOperation")(async () => {
        return "result"
      })

      assert.strictEqual(result, "result")

      const spans = container.getCompletedSpans()
      const customSpan = spans.find((s) => s.operationName === "customOperation")
      assert.ok(customSpan)
    })

    it("captures errors in spans", async () => {
      await assert.rejects(async () => {
        await container.withSpan("failingOperation")(async () => {
          throw new Error("Something went wrong")
        })
      })

      const spans = container.getCompletedSpans()
      const failSpan = spans.find((s) => s.operationName === "failingOperation")

      assert.ok(failSpan)
      assert.strictEqual(failSpan.status, "ERROR")
      assert.strictEqual(failSpan.attributes["error"], true)
      assert.strictEqual(
        failSpan.attributes["error.message"],
        "Something went wrong"
      )
      assert.strictEqual(failSpan.events.length, 1)
      assert.strictEqual(failSpan.events[0].name, "exception")
    })

    it("supports custom attributes", async () => {
      await container.withSpan("operation", {
        attributes: { "custom.key": "custom.value" },
      })(async () => {})

      const spans = container.getCompletedSpans()
      const span = spans.find((s) => s.operationName === "operation")

      assert.strictEqual(span.attributes["custom.key"], "custom.value")
    })
  })

  describe("callbacks", () => {
    it("calls onSpanStart callback", () => {
      const startedSpans = []
      const tracingContainer = createContainer().with(
        tracing({
          onSpanStart: (span) => startedSpans.push(span.operationName),
        })
      )

      const db = factory("Database", () => ({}))
      tracingContainer.get(db)

      assert.deepStrictEqual(startedSpans, ["resolve:Database"])
    })

    it("calls onSpanEnd callback", () => {
      const endedSpans = []
      const tracingContainer = createContainer().with(
        tracing({
          onSpanEnd: (span) => endedSpans.push(span.operationName),
        })
      )

      const db = factory("Database", () => ({}))
      tracingContainer.get(db)

      assert.deepStrictEqual(endedSpans, ["resolve:Database"])
    })
  })

  describe("configuration", () => {
    it("supports custom service name", () => {
      const customContainer = createContainer().with(
        tracing({ serviceName: "my-service" })
      )
      const db = factory("Database", () => ({}))
      customContainer.get(db)

      const spans = customContainer.getCompletedSpans()
      assert.strictEqual(spans[0].serviceName, "my-service")
    })
  })

  describe("toJaegerJSON()", () => {
    it("exports spans in Jaeger format", () => {
      const db = factory("Database", () => ({}))
      container.get(db)

      const jaeger = container.toJaegerJSON()

      assert.ok(jaeger.data)
      assert.strictEqual(jaeger.data.length, 1)
      assert.ok(jaeger.data[0].traceID)
      assert.ok(jaeger.data[0].spans)
      assert.strictEqual(jaeger.data[0].spans.length, 1)
      assert.ok(jaeger.data[0].processes)
    })

    it("includes span tags", () => {
      const db = factory("Database", () => ({}))
      container.get(db)

      const jaeger = container.toJaegerJSON()
      const span = jaeger.data[0].spans[0]

      assert.ok(span.tags.some((t) => t.key === "di.factory.name"))
    })

    it("uses microseconds for timing", () => {
      const db = factory("Database", () => ({}))
      container.get(db)

      const jaeger = container.toJaegerJSON()
      const span = jaeger.data[0].spans[0]

      // Jaeger uses microseconds, so values should be larger than milliseconds
      assert.ok(span.startTime > 1000) // More than 1 second in microseconds
    })
  })

  describe("toZipkinJSON()", () => {
    it("exports spans in Zipkin format", () => {
      const db = factory("Database", () => ({}))
      container.get(db)

      const zipkin = container.toZipkinJSON()

      assert.ok(Array.isArray(zipkin))
      assert.strictEqual(zipkin.length, 1)
      assert.ok(zipkin[0].traceId)
      assert.ok(zipkin[0].id)
      assert.ok(zipkin[0].name)
      assert.ok(zipkin[0].localEndpoint)
    })

    it("includes tags as strings", () => {
      const db = factory("Database", () => ({}))
      container.get(db)

      const zipkin = container.toZipkinJSON()

      assert.ok(zipkin[0].tags)
      assert.strictEqual(typeof zipkin[0].tags["di.factory.name"], "string")
    })

    it("includes parent ID for child spans", () => {
      const config = factory("Config", () => ({}))
      const db = factory("Database", (c) => {
        c.get(config)
        return {}
      })

      container.get(db)

      const zipkin = container.toZipkinJSON()
      const childSpan = zipkin.find((s) => s.name === "resolve:Config")

      assert.ok(childSpan.parentId)
    })
  })

  describe("async factories", () => {
    it("creates spans for async resolution", async () => {
      const asyncDb = factory("AsyncDatabase", async () => {
        await new Promise((r) => setTimeout(r, 5))
        return { connected: true }
      })

      await container.get(asyncDb)

      const spans = container.getCompletedSpans()
      assert.strictEqual(spans.length, 1)
      assert.ok(spans[0].duration >= 5)
    })

    it("maintains parent-child for async nested resolution", async () => {
      const config = factory("Config", async () => {
        await new Promise((r) => setTimeout(r, 1))
        return {}
      })
      const db = factory("Database", async (c) => {
        await c.get(config)
        return {}
      })

      await container.get(db)

      const spans = container.getCompletedSpans()
      assert.strictEqual(spans.length, 2)

      const dbSpan = spans.find((s) => s.operationName === "resolve:Database")
      const configSpan = spans.find((s) => s.operationName === "resolve:Config")

      assert.strictEqual(configSpan.parentSpanId, dbSpan.spanId)
    })
  })
})
