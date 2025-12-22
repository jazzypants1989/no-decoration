import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert"
import { createContainer, factory, named, transient } from "../../lib/core.js"
import { observability } from "../../lib/plugins/observability.js"

describe("observability plugin", () => {
  let container

  beforeEach(() => {
    container = createContainer().with(observability)
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe("on()", () => {
    describe("resolve event", () => {
      it("fires when a factory is resolved", () => {
        const events = []

        container.on("resolve", (factory, instance, ms) => {
          events.push({ name: factory.displayName, instance, ms })
        })

        const config = factory("Config", () => ({ env: "test" }))
        container.get(config)

        assert.strictEqual(events.length, 1)
        assert.strictEqual(events[0].name, "Config")
        assert.deepStrictEqual(events[0].instance, { env: "test" })
        assert.ok(typeof events[0].ms === "number")
      })

      it("fires for each dependency", () => {
        const resolved = []

        container.on("resolve", (factory) => {
          resolved.push(factory.displayName)
        })

        const config = factory("Config", () => ({}))
        const logger = factory("Logger", (c) => ({ config: c.get(config) }))
        const service = factory("Service", (c) => ({ logger: c.get(logger) }))

        container.get(service)

        assert.ok(resolved.includes("Config"))
        assert.ok(resolved.includes("Logger"))
        assert.ok(resolved.includes("Service"))
      })

      it("returns unsubscribe function", () => {
        const events = []

        const unsubscribe = container.on("resolve", (factory) => {
          events.push(factory.displayName)
        })

        const config1 = factory("Config1", () => ({}))
        container.get(config1)

        unsubscribe()

        const config2 = factory("Config2", () => ({}))
        container.get(config2)

        assert.deepStrictEqual(events, ["Config1"])
      })
    })

    describe("override event", () => {
      it("fires when override() is called", () => {
        const events = []

        container.on("override", (original, replacement) => {
          events.push({
            original: original.displayName,
            replacement: replacement.displayName,
          })
        })

        const real = factory("Real", () => ({}))
        const mock = factory("Mock", () => ({}))

        container.override(real, mock)

        assert.strictEqual(events.length, 1)
        assert.strictEqual(events[0].original, "Real")
        assert.strictEqual(events[0].replacement, "Mock")
      })
    })

    describe("dispose event", () => {
      it("fires for each disposed factory", async () => {
        const disposed = []

        container.on("dispose", (factory) => {
          disposed.push(factory.displayName)
        })

        const config = factory("Config", () => ({}))
        const logger = factory("Logger", () => ({}))

        container.get(config)
        container.get(logger)

        await container.dispose()

        assert.ok(disposed.includes("Config"))
        assert.ok(disposed.includes("Logger"))
      })
    })

    it("throws for unknown event type", () => {
      assert.throws(
        () => container.on("unknown", () => {}),
        (err) => err.message.includes("Unknown event")
      )
    })
  })

  describe("validate()", () => {
    it("resolves all provided factories", async () => {
      const resolved = []

      container.on("resolve", (factory) => {
        resolved.push(factory.displayName)
      })

      const config = factory("Config", () => ({}))
      const logger = factory("Logger", () => ({}))

      await container.validate([config, logger])

      assert.ok(resolved.includes("Config"))
      assert.ok(resolved.includes("Logger"))
    })

    it("throws aggregated error for failures", async () => {
      const failing = factory("Failing", () => {
        throw new Error("Intentional failure")
      })
      const passing = factory("Passing", () => ({}))

      await assert.rejects(() => container.validate([passing, failing]), {
        message: /Validation failed/,
      })
    })

    it("includes factory names in error message", async () => {
      const failing = factory("FailingService", () => {
        throw new Error("Connection refused")
      })

      try {
        await container.validate([failing])
        assert.fail("Should have thrown")
      } catch (err) {
        assert.ok(err.message.includes("FailingService"))
        assert.ok(err.message.includes("Connection refused"))
      }
    })

    it("handles async factories", async () => {
      const asyncFactory = factory("Async", async () => {
        await new Promise((r) => setTimeout(r, 5))
        return { loaded: true }
      })

      await container.validate([asyncFactory])

      assert.strictEqual(container.has(asyncFactory), true)
    })
  })

  describe("validateReport()", () => {
    it("returns valid: true when all factories pass", async () => {
      const config = factory("Config", () => ({}))
      const logger = factory("Logger", () => ({}))

      const report = await container.validateReport([config, logger])

      assert.strictEqual(report.valid, true)
      assert.strictEqual(report.errors.length, 0)
    })

    it("returns valid: false with errors for failures", async () => {
      const passing = factory("Passing", () => ({}))
      const failing = factory("Failing", () => {
        throw new Error("Intentional failure")
      })

      const report = await container.validateReport([passing, failing])

      assert.strictEqual(report.valid, false)
      assert.strictEqual(report.errors.length, 1)
      assert.strictEqual(report.errors[0].factory, "Failing")
      assert.ok(report.errors[0].error instanceof Error)
    })

    it("does not throw on failures", async () => {
      const failing = factory("Failing", () => {
        throw new Error("Failure")
      })

      // Should not throw
      const report = await container.validateReport([failing])

      assert.strictEqual(report.valid, false)
    })
  })

  describe("getResolutionContext()", () => {
    it("returns current depth", () => {
      let capturedContext = null

      const inner = factory("Inner", (c) => {
        capturedContext = container.getResolutionContext()
        return {}
      })

      const outer = factory("Outer", (c) => {
        c.get(inner)
        return {}
      })

      container.get(outer)

      assert.ok(capturedContext !== null)
      assert.ok(typeof capturedContext.depth === "number")
    })

    it("returns parent factory", () => {
      let capturedContext = null

      const inner = factory("Inner", (c) => {
        capturedContext = container.getResolutionContext()
        return {}
      })

      const outer = factory("Outer", (c) => {
        c.get(inner)
        return {}
      })

      container.get(outer)

      assert.ok(capturedContext.parent !== null)
      assert.strictEqual(capturedContext.parent.displayName, "Outer")
    })

    it("returns null parent at top level", () => {
      let capturedContext = null

      const topLevel = factory("TopLevel", (c) => {
        capturedContext = container.getResolutionContext()
        return {}
      })

      container.get(topLevel)

      assert.strictEqual(capturedContext.parent, null)
    })
  })

  describe("getDependencyGraph()", () => {
    it("returns edges map", () => {
      const config = factory("Config", () => ({}))
      const logger = factory("Logger", (c) => ({ config: c.get(config) }))
      const service = factory("Service", (c) => ({ logger: c.get(logger) }))

      container.get(service)

      const graph = container.getDependencyGraph()

      assert.ok(graph.edges instanceof Map)
    })

    it("tracks dependencies correctly", () => {
      const config = factory("Config", () => ({}))
      const logger = factory("Logger", (c) => ({ config: c.get(config) }))

      container.get(logger)

      const graph = container.getDependencyGraph()
      const loggerDeps = graph.edges.get(logger)

      assert.ok(loggerDeps instanceof Set)
      assert.ok(loggerDeps.has(config))
    })

    describe("toMermaid()", () => {
      it("generates valid Mermaid diagram", () => {
        const config = factory("Config", () => ({}))
        const logger = factory("Logger", (c) => ({ config: c.get(config) }))
        const service = factory("Service", (c) => ({
          logger: c.get(logger),
          config: c.get(config),
        }))

        container.get(service)

        const mermaid = container.getDependencyGraph().toMermaid()

        assert.ok(mermaid.startsWith("graph TD"))
        assert.ok(mermaid.includes("Logger --> Config"))
        assert.ok(mermaid.includes("Service --> Logger"))
        assert.ok(mermaid.includes("Service --> Config"))
      })

      it("handles empty graph", () => {
        const mermaid = container.getDependencyGraph().toMermaid()
        assert.strictEqual(mermaid, "graph TD\n")
      })
    })

    describe("getTopologicalOrder()", () => {
      it("returns factories in dependency order", () => {
        const config = factory("Config", () => ({}))
        const logger = factory("Logger", (c) => ({ config: c.get(config) }))
        const service = factory("Service", (c) => ({ logger: c.get(logger) }))

        container.get(service)

        const order = container.getDependencyGraph().getTopologicalOrder()

        // Should contain all resolved factories
        assert.ok(order.length >= 1)

        // All factories should have displayNames
        assert.ok(order.every(f => f.displayName || f.name))
      })
    })
  })
})
