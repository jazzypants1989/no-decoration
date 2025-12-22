import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert"
import {
  createContainer,
  childContainer,
  factory,
  inject,
  transient,
  lazy,
  named,
  timeout,
  tagged,
  wrap,
  scoped,
  pipe,
  definePlugin,
} from "../lib/core.js"
import { defineFactories } from "../lib/plugins/batch.js"
import { testing } from "../lib/plugins/testing.js"

describe("factory()", () => {
  let container

  beforeEach(() => {
    container = createContainer().with(testing)
  })

  afterEach(async () => {
    await container.dispose()
  })

  it("creates a named factory", () => {
    const config = factory("Config", () => ({ env: "test" }))

    assert.strictEqual(config.displayName, "Config")
    assert.deepStrictEqual(container.get(config), { env: "test" })
  })

  it("supports transient option", () => {
    let count = 0
    const counter = factory("Counter", () => ({ id: ++count }), {
      transient: true,
    })

    const first = container.get(counter)
    const second = container.get(counter)

    assert.notStrictEqual(first, second)
    assert.strictEqual(first.id, 1)
    assert.strictEqual(second.id, 2)
  })

  it("supports timeout option", async () => {
    const slow = factory(
      "Slow",
      async () => {
        await new Promise((r) => setTimeout(r, 100))
        return { done: true }
      },
      { timeout: 50 }
    )

    await assert.rejects(
      () => container.get(slow),
      (err) => err.name === "TimeoutError"
    )
  })

  it("combines transient and timeout options", async () => {
    let count = 0
    // When transient and timeout are combined, the factory is wrapped by both
    // The transient wrapper goes first, then timeout wraps it
    const fast = factory(
      "Fast",
      async () => {
        await new Promise((r) => setTimeout(r, 5))
        return { id: ++count }
      },
      { transient: true, timeout: 1000 }
    )

    // Verify the factory has the expected properties
    assert.strictEqual(fast.displayName, "Fast")

    const result = await container.get(fast)
    assert.strictEqual(result.id, 1)
  })
})

describe("inject()", () => {
  let container

  beforeEach(() => {
    container = createContainer()
  })

  afterEach(async () => {
    await container.dispose()
  })

  it("creates a factory that injects dependencies into a class", () => {
    class Config {
      constructor() {
        this.env = "test"
      }
    }

    class Logger {
      constructor(config) {
        this.config = config
      }
    }

    const config = named("Config", () => new Config())
    const logger = named("Logger", inject(Logger, config))

    const result = container.get(logger)

    assert.ok(result instanceof Logger)
    assert.ok(result.config instanceof Config)
    assert.strictEqual(result.config.env, "test")
  })

  it("works with multiple dependencies", () => {
    class ServiceA {
      name = "A"
    }
    class ServiceB {
      name = "B"
    }
    class ServiceC {
      name = "C"
    }
    class Combined {
      constructor(a, b, c) {
        this.a = a
        this.b = b
        this.c = c
      }
    }

    const a = named("A", () => new ServiceA())
    const b = named("B", () => new ServiceB())
    const c = named("C", () => new ServiceC())
    const combined = named("Combined", inject(Combined, a, b, c))

    const result = container.get(combined)

    assert.ok(result instanceof Combined)
    assert.strictEqual(result.a.name, "A")
    assert.strictEqual(result.b.name, "B")
    assert.strictEqual(result.c.name, "C")
  })

  it("works with zero dependencies", () => {
    class NoArgs {
      value = 42
    }

    const noArgs = named("NoArgs", inject(NoArgs))
    const result = container.get(noArgs)

    assert.ok(result instanceof NoArgs)
    assert.strictEqual(result.value, 42)
  })

  it("works with regular functions (not just classes)", () => {
    function add(a, b) {
      return a + b
    }

    const depA = () => 2
    const depB = () => 3
    const addFactory = inject(add, depA, depB)

    const result = container.get(addFactory)

    assert.strictEqual(result, 5)
  })

  it("works with arrow functions", () => {
    const multiply = (x, y) => x * y

    const depX = () => 4
    const depY = () => 5
    const multiplyFactory = inject(multiply, depX, depY)

    const result = container.get(multiplyFactory)

    assert.strictEqual(result, 20)
  })

  it("works with async functions", async () => {
    async function fetchData(config) {
      return { url: config.url, data: "fetched" }
    }

    const config = () => ({ url: "http://example.com" })
    const fetchFactory = inject(fetchData, config)

    const result = await container.get(fetchFactory)

    assert.deepStrictEqual(result, { url: "http://example.com", data: "fetched" })
  })

  it("works with functions that return objects", () => {
    function createDatabase(config, logger) {
      return {
        url: config.dbUrl,
        log: logger,
        query: () => [{ id: 1 }],
      }
    }

    const config = () => ({ dbUrl: "postgres://localhost" })
    const logger = () => ({ log: () => {} })
    const dbFactory = inject(createDatabase, config, logger)

    const result = container.get(dbFactory)

    assert.strictEqual(result.url, "postgres://localhost")
    assert.ok(typeof result.query === "function")
    assert.deepStrictEqual(result.query(), [{ id: 1 }])
  })
})

describe("transient()", () => {
  let container

  beforeEach(() => {
    container = createContainer()
  })

  it("marks a factory as transient", () => {
    let count = 0
    const counter = transient(named("Counter", () => ({ id: ++count })))

    assert.strictEqual(counter._transient, true)

    const first = container.get(counter)
    const second = container.get(counter)

    assert.notStrictEqual(first, second)
  })

  it("preserves displayName", () => {
    const original = named("Original", () => ({}))
    const wrapped = transient(original)

    assert.strictEqual(wrapped.displayName, "Original")
  })
})

describe("lazy()", () => {
  let container

  beforeEach(() => {
    container = createContainer()
  })

  it("defers resolution until .value is accessed", () => {
    let resolved = false
    const deferred = named("Deferred", () => {
      resolved = true
      return { name: "deferred" }
    })

    const lazyValue = lazy(container, deferred)

    assert.strictEqual(resolved, false)

    const result = lazyValue.value
    assert.strictEqual(resolved, true)
    assert.deepStrictEqual(result, { name: "deferred" })
  })

  it("caches the resolved value", () => {
    let count = 0
    const counter = named("Counter", () => ({ id: ++count }))

    const lazyCounter = lazy(container, counter)

    const first = lazyCounter.value
    const second = lazyCounter.value

    assert.strictEqual(first, second)
    assert.strictEqual(count, 1)
  })

  it("can break circular dependencies", () => {
    // A depends on B, B depends on lazy(A)
    const a = named("A", (c) => ({
      name: "A",
      getB: () => c.get(b),
    }))

    const b = named("B", (c) => {
      const lazyA = lazy(c, a)
      return {
        name: "B",
        getA: () => lazyA.value,
      }
    })

    const resultA = container.get(a)
    const resultB = container.get(b)

    assert.strictEqual(resultA.name, "A")
    assert.strictEqual(resultB.name, "B")
    assert.strictEqual(resultB.getA().name, "A")
  })
})

describe("named()", () => {
  let container

  beforeEach(() => {
    container = createContainer()
  })

  it("adds displayName to a factory", () => {
    const anonymous = (c) => ({ value: 1 })
    const namedFactory = named("MyFactory", anonymous)

    assert.strictEqual(namedFactory.displayName, "MyFactory")
  })

  it("resolves correctly", () => {
    const config = named("Config", () => ({ env: "test" }))
    const result = container.get(config)

    assert.deepStrictEqual(result, { env: "test" })
  })
})

describe("timeout()", () => {
  let container

  beforeEach(() => {
    container = createContainer()
  })

  it("throws TimeoutError if factory takes too long", async () => {
    const slow = timeout(
      named("Slow", async () => {
        await new Promise((r) => setTimeout(r, 100))
        return { done: true }
      }),
      20
    )

    await assert.rejects(
      () => container.get(slow),
      (err) => err.name === "TimeoutError"
    )
  })

  it("resolves normally if within timeout", async () => {
    const fast = timeout(
      named("Fast", async () => {
        await new Promise((r) => setTimeout(r, 5))
        return { done: true }
      }),
      1000
    )

    const result = await container.get(fast)
    assert.deepStrictEqual(result, { done: true })
  })

  it("handles sync factories by wrapping them in async", async () => {
    // timeout() always wraps in async to handle the timeout logic
    const sync = timeout(named("Sync", () => ({ value: 42 })), 1000)

    const result = await container.get(sync)
    assert.deepStrictEqual(result, { value: 42 })
  })
})

describe("tagged()", () => {
  let container

  beforeEach(() => {
    container = createContainer()
  })

  it("creates namespaced factories", () => {
    const createDatabase = tagged("Database", (tag) =>
      named(`Database:${tag}`, () => ({ connection: tag }))
    )

    const postgres = createDatabase("postgres")
    const mysql = createDatabase("mysql")

    assert.strictEqual(postgres.displayName, "Database:postgres")
    assert.strictEqual(mysql.displayName, "Database:mysql")

    assert.deepStrictEqual(container.get(postgres), { connection: "postgres" })
    assert.deepStrictEqual(container.get(mysql), { connection: "mysql" })
  })

  it("caches factory instances by tag", () => {
    const createService = tagged("Service", (tag) =>
      named(`Service:${tag}`, () => ({ tag }))
    )

    const first = createService("api")
    const second = createService("api")

    assert.strictEqual(first, second)
  })
})

describe("wrap()", () => {
  let container

  beforeEach(() => {
    container = createContainer()
  })

  it("wraps a factory output", () => {
    const base = named("Base", () => ({ value: 1 }))
    const wrapped = wrap(base, (instance) => ({
      ...instance,
      wrapped: true,
    }))

    const result = container.get(wrapped)
    assert.deepStrictEqual(result, { value: 1, wrapped: true })
  })

  it("preserves displayName", () => {
    const base = named("Base", () => ({}))
    const wrapped = wrap(base, (x) => x)

    assert.strictEqual(wrapped.displayName, "Base")
  })
})

describe("scoped()", () => {
  it("creates a factory creator that captures args (container always first)", () => {
    // scoped() always passes container as first arg
    const createRequest = scoped((_, requestId) => ({
      id: requestId,
      timestamp: Date.now(),
    }))

    const container = createContainer()

    const req1Factory = createRequest("req-1")
    const req2Factory = createRequest("req-2")

    const req1 = container.get(req1Factory)
    const req2 = container.get(req2Factory)

    assert.strictEqual(req1.id, "req-1")
    assert.strictEqual(req2.id, "req-2")
  })

  it("provides container access for resolving dependencies", () => {
    const config = named("Config", () => ({ prefix: "REQ" }))

    const createRequest = scoped((c, requestId) => ({
      id: `${c.get(config).prefix}-${requestId}`,
    }))

    const container = createContainer()
    const reqFactory = createRequest("123")
    const result = container.get(reqFactory)

    assert.strictEqual(result.id, "REQ-123")
  })
})

describe("childContainer()", () => {
  it("creates a child container with asyncDispose", async () => {
    const parent = createContainer()
    const child = childContainer(parent)

    assert.ok(typeof child[Symbol.asyncDispose] === "function")

    await child[Symbol.asyncDispose]()
  })

  it("inherits from parent", () => {
    const parent = createContainer()
    const config = named("Config", () => ({ env: "test" }))
    parent.get(config)

    const child = childContainer(parent)
    const result = child.get(config)

    assert.deepStrictEqual(result, { env: "test" })
  })
})

describe("pipe()", () => {
  it("composes multiple plugins", () => {
    const plugin1 = definePlugin("plugin1", () => ({
      method1: () => "from1",
    }))

    const plugin2 = definePlugin("plugin2", () => ({
      method2: () => "from2",
    }))

    const combined = pipe(plugin1, plugin2)

    assert.strictEqual(combined.name, "plugin1+plugin2")

    const container = createContainer().with(combined)

    assert.strictEqual(container.method1(), "from1")
    assert.strictEqual(container.method2(), "from2")
  })
})

describe("definePlugin()", () => {
  it("creates a plugin with name and apply function", () => {
    const myPlugin = definePlugin("myPlugin", (container, internals) => ({
      customMethod: () => "custom",
    }))

    assert.strictEqual(myPlugin.name, "myPlugin")
    assert.ok(typeof myPlugin.apply === "function")

    const container = createContainer().with(myPlugin)
    assert.strictEqual(container.customMethod(), "custom")
  })
})

describe("defineFactories()", () => {
  let container

  beforeEach(() => {
    container = createContainer()
  })

  it("defines multiple named factories from an object", () => {
    const factories = defineFactories({
      config: () => ({ env: "test" }),
      logger: (c) => ({ config: c.get(factories.config) }),
    })

    assert.strictEqual(factories.config.displayName, "config")
    assert.strictEqual(factories.logger.displayName, "logger")

    const logger = container.get(factories.logger)
    assert.deepStrictEqual(logger.config, { env: "test" })
  })

  it("supports builder function for forward references", () => {
    // Using builder function allows referencing factories before they're defined
    const factories = defineFactories((f) => ({
      config: () => ({ env: "test" }),
      // logger references config via f.config (forward reference)
      logger: (c) => ({ config: c.get(f.config) }),
    }))

    const logger = container.get(factories.logger)
    assert.deepStrictEqual(logger.config, { env: "test" })
  })

  it("sets displayName on all factories", () => {
    const factories = defineFactories({
      first: () => ({}),
      second: () => ({}),
    })

    assert.strictEqual(factories.first.displayName, "first")
    assert.strictEqual(factories.second.displayName, "second")
  })
})
