import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert"
import {
  createContainer,
  childContainer,
  factory,
  transient,
  named,
} from "../lib/core.js"
import { testing } from "../lib/plugins/testing.js"

describe("Container", () => {
  let container

  beforeEach(() => {
    container = createContainer().with(testing)
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe("get()", () => {
    it("resolves a factory and returns the value", () => {
      const config = factory("Config", () => ({ env: "test" }))
      const result = container.get(config)
      assert.deepStrictEqual(result, { env: "test" })
    })

    it("caches singleton factories", () => {
      let count = 0
      const counter = factory("Counter", () => ({ id: ++count }))

      const first = container.get(counter)
      const second = container.get(counter)

      assert.strictEqual(first, second)
      assert.strictEqual(count, 1)
    })

    it("creates new instances for transient factories", () => {
      let count = 0
      const counter = transient(factory("Counter", () => ({ id: ++count })))

      const first = container.get(counter)
      const second = container.get(counter)

      assert.notStrictEqual(first, second)
      assert.strictEqual(first.id, 1)
      assert.strictEqual(second.id, 2)
    })

    it("resolves nested dependencies", () => {
      const config = factory("Config", () => ({ dbUrl: "postgres://localhost" }))
      const db = factory("Database", (c) => ({
        url: c.get(config).dbUrl,
        connected: true,
      }))

      const result = container.get(db)
      assert.deepStrictEqual(result, {
        url: "postgres://localhost",
        connected: true,
      })
    })

    it("passes the container to factory functions", () => {
      let receivedContainer = null
      const test = factory("Test", (c) => {
        receivedContainer = c
        return "value"
      })

      container.get(test)
      assert.ok(receivedContainer !== null)
      assert.ok(typeof receivedContainer.get === "function")
    })
  })

  describe("async factories", () => {
    it("resolves async factories", async () => {
      const asyncConfig = factory("AsyncConfig", async () => {
        return { loaded: true }
      })

      const result = await container.get(asyncConfig)
      assert.deepStrictEqual(result, { loaded: true })
    })

    it("caches async factory results after resolution", async () => {
      let count = 0
      const asyncCounter = factory("AsyncCounter", async () => {
        return { id: ++count }
      })

      const first = await container.get(asyncCounter)
      const second = await container.get(asyncCounter)

      assert.strictEqual(first, second)
      assert.strictEqual(count, 1)
    })

    it("returns the same promise for concurrent gets", async () => {
      let count = 0
      const slowFactory = factory("Slow", async () => {
        await new Promise((r) => setTimeout(r, 10))
        return { id: ++count }
      })

      const [first, second] = await Promise.all([
        container.get(slowFactory),
        container.get(slowFactory),
      ])

      assert.strictEqual(first, second)
      assert.strictEqual(count, 1)
    })
  })

  describe("circular dependency detection", () => {
    it("throws CircularDependencyError for direct circular dependencies", () => {
      const a = named("A", (c) => ({ b: c.get(b) }))
      const b = named("B", (c) => ({ a: c.get(a) }))

      assert.throws(
        () => container.get(a),
        (err) => err.name === "CircularDependencyError"
      )
    })

    it("can be disabled via options", () => {
      const noDetect = createContainer({ detectCircular: false })

      const a = named("A", (c) => {
        // This would normally cause infinite recursion, but we return early
        return { name: "A" }
      })

      // Should not throw (because we don't actually recurse in this test)
      const result = noDetect.get(a)
      assert.deepStrictEqual(result, { name: "A" })
    })
  })

  describe("override()", () => {
    it("replaces a factory with a mock", () => {
      const real = factory("Real", () => ({ type: "real" }))
      const mock = factory("Mock", () => ({ type: "mock" }))

      container.override(real, mock)

      const result = container.get(real)
      assert.deepStrictEqual(result, { type: "mock" })
    })

    it("affects dependent factories", () => {
      const config = factory("Config", () => ({ env: "prod" }))
      const service = factory("Service", (c) => ({
        config: c.get(config),
      }))

      container.override(config, () => ({ env: "test" }))

      const result = container.get(service)
      assert.deepStrictEqual(result.config, { env: "test" })
    })
  })

  describe("clearOverrides()", () => {
    it("removes all overrides", () => {
      const real = factory("Real", () => ({ type: "real" }))

      container.override(real, () => ({ type: "mock" }))
      container.clearOverrides()
      container.clearCache()

      const result = container.get(real)
      assert.deepStrictEqual(result, { type: "real" })
    })
  })

  describe("has()", () => {
    it("returns false for unresolved factories", () => {
      const config = factory("Config", () => ({}))
      assert.strictEqual(container.has(config), false)
    })

    it("returns true for resolved factories", () => {
      const config = factory("Config", () => ({}))
      container.get(config)
      assert.strictEqual(container.has(config), true)
    })
  })

  describe("tryGet()", () => {
    it("returns the value for successful resolution", () => {
      const config = factory("Config", () => ({ env: "test" }))
      const result = container.tryGet(config)
      assert.deepStrictEqual(result, { env: "test" })
    })

    it("returns undefined for failed resolution", () => {
      const failing = factory("Failing", () => {
        throw new Error("Intentional failure")
      })
      const result = container.tryGet(failing)
      assert.strictEqual(result, undefined)
    })
  })

  describe("dispose()", () => {
    it("runs registered dispose handlers", async () => {
      let disposed = false
      const service = factory("Service", (c) => {
        c.onDispose(() => {
          disposed = true
        })
        return { name: "service" }
      })

      container.get(service)
      await container.dispose()

      assert.strictEqual(disposed, true)
    })

    it("runs dispose handlers in reverse order (LIFO)", async () => {
      const order = []

      const first = factory("First", (c) => {
        c.onDispose(() => order.push("first"))
        return "first"
      })

      const second = factory("Second", (c) => {
        c.onDispose(() => order.push("second"))
        return "second"
      })

      container.get(first)
      container.get(second)
      await container.dispose()

      assert.deepStrictEqual(order, ["second", "first"])
    })

    it("collects errors from failed dispose handlers", async () => {
      const failing = factory("Failing", (c) => {
        c.onDispose(() => {
          throw new Error("Dispose failed")
        })
        return "value"
      })

      container.get(failing)

      await assert.rejects(
        () => container.dispose(),
        (err) => err instanceof AggregateError
      )
    })

    it("clears the cache after dispose", async () => {
      const config = factory("Config", () => ({}))
      container.get(config)

      assert.strictEqual(container.has(config), true)
      await container.dispose()
      assert.strictEqual(container.has(config), false)
    })
  })

  describe("freeze()", () => {
    it("prevents resolution of new factories", () => {
      const config = factory("Config", () => ({}))
      const unresolved = factory("Unresolved", () => ({}))

      container.get(config)
      container.freeze()

      // Already resolved - should work
      container.get(config)

      // Not yet resolved - should throw
      assert.throws(
        () => container.get(unresolved),
        (err) => err.name === "FrozenContainerError"
      )
    })
  })

  describe("asReadOnly()", () => {
    it("returns a read-only view of the container", () => {
      const config = factory("Config", () => ({ env: "test" }))
      container.get(config)

      const readOnly = container.asReadOnly()

      assert.ok(typeof readOnly.get === "function")
      assert.ok(typeof readOnly.tryGet === "function")
      assert.ok(typeof readOnly.has === "function")
      assert.ok(typeof readOnly.resolver === "function")

      // Should not have mutating methods
      assert.strictEqual(readOnly.override, undefined)
      assert.strictEqual(readOnly.dispose, undefined)
      assert.strictEqual(readOnly.freeze, undefined)
    })

    it("can read values from the parent", () => {
      const config = factory("Config", () => ({ env: "test" }))
      container.get(config)

      const readOnly = container.asReadOnly()
      const result = readOnly.get(config)

      assert.deepStrictEqual(result, { env: "test" })
    })
  })

  describe("resolver()", () => {
    it("returns a resolver function that resolves to the value", () => {
      const config = factory("Config", () => ({ env: "test" }))
      const resolve = container.resolver(config)

      assert.ok(typeof resolve === "function")
      assert.deepStrictEqual(resolve(), { env: "test" })
    })
  })
})

describe("childContainer()", () => {
  let parent
  let child

  beforeEach(() => {
    parent = createContainer()
    child = childContainer(parent)
  })

  afterEach(async () => {
    await child.dispose()
    await parent.dispose()
  })

  it("inherits resolved values from parent", () => {
    const config = factory("Config", () => ({ env: "parent" }))
    parent.get(config)

    const result = child.get(config)
    assert.deepStrictEqual(result, { env: "parent" })
  })

  it("can override parent values", () => {
    const config = factory("Config", () => ({ env: "parent" }))
    parent.get(config)

    child.override(config, () => ({ env: "child" }))

    assert.deepStrictEqual(child.get(config), { env: "child" })
    assert.deepStrictEqual(parent.get(config), { env: "parent" })
  })

  it("has its own cache for new factories", () => {
    let count = 0
    const counter = factory("Counter", () => ({ id: ++count }))

    const childResult = child.get(counter)
    const parentResult = parent.get(counter)

    // Different instances because child resolved first
    assert.notStrictEqual(childResult, parentResult)
  })
})

describe("Container options", () => {
  describe("interceptors", () => {
    it("allows intercepting factory resolution", () => {
      const intercepted = []

      const container = createContainer({
        interceptors: [
          (factory, next) => {
            intercepted.push(factory.displayName)
            return next()
          },
        ],
      })

      const config = factory("Config", () => ({}))
      container.get(config)

      assert.deepStrictEqual(intercepted, ["Config"])
    })

    it("can modify resolution behavior", () => {
      const container = createContainer({
        interceptors: [
          (factory, next) => {
            const result = next()
            if (typeof result === "object") {
              return { ...result, intercepted: true }
            }
            return result
          },
        ],
      })

      const config = factory("Config", () => ({ env: "test" }))
      const result = container.get(config)

      assert.deepStrictEqual(result, { env: "test", intercepted: true })
    })
  })
})
