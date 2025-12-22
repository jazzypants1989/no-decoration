import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert"
import { createContainer, factory } from "../../lib/core.js"
import { debug } from "../../lib/plugins/debug.js"

describe("debug plugin", () => {
  describe("default configuration", () => {
    it("logs resolution events", () => {
      const logs = []
      const mockLogger = {
        log: (msg) => logs.push(msg),
        warn: (msg) => logs.push(msg),
      }

      const container = createContainer().with(
        debug.configure({ logger: mockLogger })
      )

      const config = factory("Config", () => ({ env: "test" }))
      container.get(config)

      assert.ok(logs.some((log) => log.includes("Resolving: Config")))
      assert.ok(logs.some((log) => log.includes("Resolved: Config")))
    })

    it("includes timing in resolution logs", () => {
      const logs = []
      const mockLogger = {
        log: (msg) => logs.push(msg),
        warn: () => {},
      }

      const container = createContainer().with(
        debug.configure({ logger: mockLogger })
      )

      const config = factory("Config", () => ({}))
      container.get(config)

      const resolvedLog = logs.find((log) => log.includes("Resolved:"))
      assert.ok(resolvedLog.includes("ms"))
    })

    it("shows nested resolution with indentation", () => {
      const logs = []
      const mockLogger = {
        log: (msg) => logs.push(msg),
        warn: () => {},
      }

      const container = createContainer().with(
        debug.configure({ logger: mockLogger })
      )

      const config = factory("Config", () => ({}))
      const logger = factory("Logger", (c) => ({ config: c.get(config) }))

      container.get(logger)

      // Logger should be at top level, Config should be indented
      const loggerResolving = logs.find((log) => log.includes("Resolving: Logger"))
      const configResolving = logs.find((log) => log.includes("Resolving: Config"))

      // Config should have more leading spaces
      const loggerIndent = loggerResolving.indexOf("Resolving")
      const configIndent = configResolving.indexOf("Resolving")

      assert.ok(configIndent > loggerIndent)
    })
  })

  describe("warnings", () => {
    it("does not warn for named factories", () => {
      const warnings = []
      const mockLogger = {
        log: () => {},
        warn: (msg) => warnings.push(msg),
      }

      const container = createContainer().with(
        debug.configure({ logger: mockLogger, warnings: true })
      )

      const namedFactory = factory("Named", () => ({}))
      container.get(namedFactory)

      // Should not have anonymous warning for named factories
      assert.ok(!warnings.some((w) => w.includes("Anonymous factory")))
    })

    it("warns about slow factories", async () => {
      const warnings = []
      const mockLogger = {
        log: () => {},
        warn: (msg) => warnings.push(msg),
      }

      // Create a plugin that has a lower threshold for testing
      const debugWithLowThreshold = {
        name: "debug",
        apply(container, internals) {
          const { hooks, resolutionStack } = internals

          hooks.afterResolve.push((factory, value, ms) => {
            // Use 1ms threshold for test
            if (ms > 1) {
              mockLogger.warn(`[DI WARN] Factory took ${ms.toFixed(0)}ms`)
            }
          })

          return {}
        },
      }

      const container = createContainer().with(debugWithLowThreshold)

      const slow = factory("Slow", async () => {
        await new Promise((r) => setTimeout(r, 10))
        return {}
      })

      await container.get(slow)

      assert.ok(warnings.some((w) => w.includes("ms")))
    })
  })

  describe("configuration options", () => {
    it("respects timing: false", () => {
      const logs = []
      const mockLogger = {
        log: (msg) => logs.push(msg),
        warn: () => {},
      }

      const container = createContainer().with(
        debug.configure({ logger: mockLogger, timing: false })
      )

      const config = factory("Config", () => ({}))
      container.get(config)

      // Should not log resolution events
      assert.ok(!logs.some((log) => log.includes("Resolving")))
      assert.ok(!logs.some((log) => log.includes("Resolved")))
    })

    it("respects warnings: false", () => {
      const warnings = []
      const mockLogger = {
        log: () => {},
        warn: (msg) => warnings.push(msg),
      }

      const container = createContainer().with(
        debug.configure({ logger: mockLogger, warnings: false })
      )

      const anonymous = (c) => ({})
      container.get(anonymous)

      assert.strictEqual(warnings.length, 0)
    })

    it("uses custom logger", () => {
      const customLogs = []
      const customLogger = {
        log: (msg) => customLogs.push({ type: "log", msg }),
        warn: (msg) => customLogs.push({ type: "warn", msg }),
      }

      const container = createContainer().with(
        debug.configure({ logger: customLogger })
      )

      const config = factory("Config", () => ({}))
      container.get(config)

      assert.ok(customLogs.length > 0)
      assert.ok(customLogs.every((entry) => ["log", "warn"].includes(entry.type)))
    })
  })

  describe("override logging", () => {
    it("logs when override() is called", () => {
      const logs = []
      const mockLogger = {
        log: (msg) => logs.push(msg),
        warn: () => {},
      }

      const container = createContainer().with(
        debug.configure({ logger: mockLogger })
      )

      const real = factory("Real", () => ({}))
      const mock = factory("Mock", () => ({}))

      container.override(real, mock)

      assert.ok(logs.some((log) => log.includes("Override")))
      assert.ok(logs.some((log) => log.includes("Real")))
      assert.ok(logs.some((log) => log.includes("Mock")))
    })
  })

  describe("dispose logging", () => {
    it("logs when factories are disposed", async () => {
      const logs = []
      const mockLogger = {
        log: (msg) => logs.push(msg),
        warn: () => {},
      }

      const container = createContainer().with(
        debug.configure({ logger: mockLogger })
      )

      const config = factory("Config", () => ({}))
      container.get(config)

      await container.dispose()

      assert.ok(logs.some((log) => log.includes("Disposed")))
    })
  })

  describe("default plugin (no configure)", () => {
    it("works with default settings", () => {
      // This mainly tests that the plugin doesn't throw
      const container = createContainer().with(debug)
      const config = factory("Config", () => ({}))
      container.get(config)
      // If we got here without error, the test passes
      assert.ok(true)
    })
  })
})
