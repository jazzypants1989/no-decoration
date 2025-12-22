import { describe, it } from "node:test"
import assert from "node:assert"
import { createContainer, factory } from "../../lib/core.js"
import {
  pipe,
  guard,
  validate,
  intercept,
  catchError,
  tap,
  transform,
  memo,
  retry,
  withTimeout,
  when,
  ifElse,
  GuardError,
  ValidationError,
} from "../../lib/plugins/patterns.js"

describe("patterns plugin", () => {
  describe("pipe()", () => {
    it("passes factory through unchanged with no decorators", () => {
      const original = factory("Test", () => ({ value: 42 }))
      const piped = pipe(original)

      const container = createContainer()
      assert.deepStrictEqual(container.get(piped), { value: 42 })
    })

    it("applies decorators left-to-right", () => {
      const calls = []

      const first = (f) => (c) => {
        calls.push("first")
        return f(c)
      }
      const second = (f) => (c) => {
        calls.push("second")
        return f(c)
      }

      const test = pipe(
        factory("Test", () => "value"),
        first,
        second
      )

      const container = createContainer()
      container.get(test)

      assert.deepStrictEqual(calls, ["second", "first"])
    })

    it("preserves displayName", () => {
      const original = factory("MyFactory", () => ({}))
      const decorated = pipe(
        original,
        (f) => {
          const wrapped = (c) => f(c)
          wrapped.displayName = f.displayName
          return wrapped
        }
      )

      assert.strictEqual(decorated.displayName, "MyFactory")
    })
  })

  describe("guard()", () => {
    it("allows access when guard returns true", () => {
      const test = pipe(
        factory("Test", () => ({ protected: true })),
        guard(() => true)
      )

      const container = createContainer()
      assert.deepStrictEqual(container.get(test), { protected: true })
    })

    it("allows access when guard returns void", () => {
      const test = pipe(
        factory("Test", () => ({ protected: true })),
        guard(() => {})
      )

      const container = createContainer()
      assert.deepStrictEqual(container.get(test), { protected: true })
    })

    it("throws GuardError when guard returns false", () => {
      const test = pipe(
        factory("Protected", () => ({})),
        guard(() => false)
      )

      const container = createContainer()
      assert.throws(
        () => container.get(test),
        (err) => err instanceof GuardError && err.factoryName === "Protected"
      )
    })

    it("propagates custom errors from guard", () => {
      class CustomError extends Error {}

      const test = pipe(
        factory("Test", () => ({})),
        guard(() => {
          throw new CustomError("Access denied")
        })
      )

      const container = createContainer()
      assert.throws(() => container.get(test), CustomError)
    })

    it("supports async guards", async () => {
      const test = pipe(
        factory("Test", () => ({ value: 1 })),
        guard(async () => {
          await new Promise((r) => setTimeout(r, 10))
          return true
        })
      )

      const container = createContainer()
      const result = await container.get(test)
      assert.deepStrictEqual(result, { value: 1 })
    })

    it("rejects with async guard returning false", async () => {
      const test = pipe(
        factory("Async", () => ({})),
        guard(async () => false)
      )

      const container = createContainer()
      await assert.rejects(() => container.get(test), GuardError)
    })

    it("receives container in guard function", () => {
      const config = factory("Config", () => ({ auth: true }))

      const test = pipe(
        factory("Test", () => ({})),
        guard((c) => c.get(config).auth)
      )

      const container = createContainer()
      assert.ok(container.get(test))
    })

    it("can chain multiple guards", () => {
      let firstRan = false
      let secondRan = false

      const test = pipe(
        factory("Test", () => ({})),
        guard(() => {
          firstRan = true
          return true
        }),
        guard(() => {
          secondRan = true
          return true
        })
      )

      const container = createContainer()
      container.get(test)

      assert.ok(firstRan)
      assert.ok(secondRan)
    })
  })

  describe("validate()", () => {
    it("passes through valid values with function validator", () => {
      const test = pipe(
        factory("Test", () => ({ count: 5 })),
        validate((v) => {
          if (v.count < 0) throw new Error("Negative")
          return v
        })
      )

      const container = createContainer()
      assert.deepStrictEqual(container.get(test), { count: 5 })
    })

    it("can transform values", () => {
      const test = pipe(
        factory("Test", () => ({ count: 5 })),
        validate((v) => ({ ...v, validated: true }))
      )

      const container = createContainer()
      assert.deepStrictEqual(container.get(test), { count: 5, validated: true })
    })

    it("throws ValidationError on failure", () => {
      const test = pipe(
        factory("Counter", () => ({ count: -1 })),
        validate((v) => {
          if (v.count < 0) throw new Error("Negative count")
          return v
        })
      )

      const container = createContainer()
      assert.throws(
        () => container.get(test),
        (err) =>
          err instanceof ValidationError &&
          err.factoryName === "Counter" &&
          err.message.includes("Negative count")
      )
    })

    it("works with schema-like objects (parse method)", () => {
      const schema = {
        parse(v) {
          if (!v.email) throw new Error("Missing email")
          return { ...v, parsed: true }
        },
      }

      const test = pipe(factory("User", () => ({ email: "a@b.com" })), validate(schema))

      const container = createContainer()
      assert.deepStrictEqual(container.get(test), {
        email: "a@b.com",
        parsed: true,
      })
    })

    it("handles async factories", async () => {
      const test = pipe(
        factory("Async", async () => ({ value: 1 })),
        validate((v) => ({ ...v, validated: true }))
      )

      const container = createContainer()
      const result = await container.get(test)
      assert.deepStrictEqual(result, { value: 1, validated: true })
    })
  })

  describe("intercept()", () => {
    it("wraps factory resolution", () => {
      const calls = []

      const test = pipe(
        factory("Test", () => {
          calls.push("factory")
          return { value: 1 }
        }),
        intercept((next) => {
          calls.push("before")
          const result = next()
          calls.push("after")
          return result
        })
      )

      const container = createContainer()
      container.get(test)

      assert.deepStrictEqual(calls, ["before", "factory", "after"])
    })

    it("can modify the result", () => {
      const test = pipe(
        factory("Test", () => ({ value: 1 })),
        intercept((next) => {
          const result = next()
          return { ...result, intercepted: true }
        })
      )

      const container = createContainer()
      assert.deepStrictEqual(container.get(test), { value: 1, intercepted: true })
    })

    it("receives context with container and factory", () => {
      let receivedContext = null

      const testFactory = factory("TestFactory", () => ({}))

      const test = pipe(
        testFactory,
        intercept((next, ctx) => {
          receivedContext = ctx
          return next()
        })
      )

      const container = createContainer()
      container.get(test)

      assert.ok(receivedContext.container === container)
      assert.strictEqual(receivedContext.factory.displayName, "TestFactory")
    })

    it("can implement timing", () => {
      let timing = null

      const test = pipe(
        factory("Slow", () => {
          const start = Date.now()
          while (Date.now() - start < 10) {} // Busy wait
          return {}
        }),
        intercept((next, ctx) => {
          const start = Date.now()
          const result = next()
          timing = Date.now() - start
          return result
        })
      )

      const container = createContainer()
      container.get(test)

      assert.ok(timing >= 10)
    })

    it("can implement caching", () => {
      let callCount = 0

      const cached = (() => {
        let cache = null
        return (next) => {
          if (cache) return cache
          cache = next()
          return cache
        }
      })()

      const test = pipe(
        factory("Expensive", () => {
          callCount++
          return { id: callCount }
        }),
        intercept(cached)
      )

      const container = createContainer()
      const first = container.get(test)
      const second = container.get(test)

      assert.strictEqual(callCount, 1)
      assert.strictEqual(first, second)
    })
  })

  describe("catchError()", () => {
    it("catches sync errors", () => {
      const test = pipe(
        factory("Failing", () => {
          throw new Error("Oops")
        }),
        catchError(() => ({ fallback: true }))
      )

      const container = createContainer()
      assert.deepStrictEqual(container.get(test), { fallback: true })
    })

    it("catches async errors", async () => {
      const test = pipe(
        factory("Failing", async () => {
          throw new Error("Async oops")
        }),
        catchError(() => ({ fallback: true }))
      )

      const container = createContainer()
      const result = await container.get(test)
      assert.deepStrictEqual(result, { fallback: true })
    })

    it("receives error and context", () => {
      let receivedError = null
      let receivedContext = null

      const test = pipe(
        factory("TestFactory", () => {
          throw new Error("Test error")
        }),
        catchError((err, ctx) => {
          receivedError = err
          receivedContext = ctx
          return {}
        })
      )

      const container = createContainer()
      container.get(test)

      assert.ok(receivedError instanceof Error)
      assert.strictEqual(receivedError.message, "Test error")
      assert.ok(receivedContext.container === container)
    })

    it("can rethrow different error", () => {
      class WrappedError extends Error {}

      const test = pipe(
        factory("Failing", () => {
          throw new Error("Original")
        }),
        catchError((err) => {
          throw new WrappedError("Wrapped: " + err.message)
        })
      )

      const container = createContainer()
      assert.throws(() => container.get(test), WrappedError)
    })

    it("does not interfere when no error", () => {
      let handlerCalled = false

      const test = pipe(
        factory("Success", () => ({ ok: true })),
        catchError(() => {
          handlerCalled = true
          return { fallback: true }
        })
      )

      const container = createContainer()
      const result = container.get(test)

      assert.strictEqual(handlerCalled, false)
      assert.deepStrictEqual(result, { ok: true })
    })
  })

  describe("tap()", () => {
    it("calls function without modifying value", () => {
      let tapped = null

      const test = pipe(
        factory("Test", () => ({ value: 42 })),
        tap((v) => {
          tapped = v
        })
      )

      const container = createContainer()
      const result = container.get(test)

      assert.deepStrictEqual(result, { value: 42 })
      assert.deepStrictEqual(tapped, { value: 42 })
    })

    it("works with async factories", async () => {
      let tapped = null

      const test = pipe(
        factory("Async", async () => ({ async: true })),
        tap((v) => {
          tapped = v
        })
      )

      const container = createContainer()
      const result = await container.get(test)

      assert.deepStrictEqual(result, { async: true })
      assert.deepStrictEqual(tapped, { async: true })
    })
  })

  describe("transform()", () => {
    it("transforms the resolved value", () => {
      const test = pipe(
        factory("Users", () => [{ id: 1 }, { id: 2 }]),
        transform((users) => users.map((u) => u.id))
      )

      const container = createContainer()
      assert.deepStrictEqual(container.get(test), [1, 2])
    })

    it("receives context", () => {
      let receivedContext = null

      const test = pipe(
        factory("Test", () => ({})),
        transform((v, ctx) => {
          receivedContext = ctx
          return v
        })
      )

      const container = createContainer()
      container.get(test)

      assert.ok(receivedContext.container === container)
    })
  })

  describe("memo()", () => {
    it("caches result across container instances", () => {
      let callCount = 0

      const memoized = memo()
      const test = pipe(
        factory("Expensive", () => ({ call: ++callCount })),
        memoized
      )

      const c1 = createContainer()
      const c2 = createContainer()

      c1.get(test)
      c2.get(test)

      assert.strictEqual(callCount, 1)
    })

    it("handles async factories", async () => {
      let callCount = 0

      const memoized = memo()
      const test = pipe(
        factory("AsyncExpensive", async () => ({ call: ++callCount })),
        memoized
      )

      const c1 = createContainer()
      const c2 = createContainer()

      await c1.get(test)
      await c2.get(test)

      assert.strictEqual(callCount, 1)
    })
  })

  describe("retry()", () => {
    it("succeeds on first try", async () => {
      let attempts = 0

      const test = pipe(
        factory("Reliable", () => {
          attempts++
          return { ok: true }
        }),
        retry(3)
      )

      const container = createContainer()
      const result = await container.get(test)

      assert.strictEqual(attempts, 1)
      assert.deepStrictEqual(result, { ok: true })
    })

    it("retries on failure", async () => {
      let attempts = 0

      const test = pipe(
        factory("Flaky", () => {
          attempts++
          if (attempts < 3) throw new Error("Not yet")
          return { ok: true }
        }),
        retry(3)
      )

      const container = createContainer()
      const result = await container.get(test)

      assert.strictEqual(attempts, 3)
      assert.deepStrictEqual(result, { ok: true })
    })

    it("throws after all retries exhausted", async () => {
      let attempts = 0

      const test = pipe(
        factory("AlwaysFails", () => {
          attempts++
          throw new Error("Nope")
        }),
        retry(3)
      )

      const container = createContainer()
      await assert.rejects(() => container.get(test), /Nope/)
      assert.strictEqual(attempts, 3)
    })

    it("respects delay between retries", async () => {
      let attempts = 0
      const timestamps = []

      const test = pipe(
        factory("Slow", () => {
          timestamps.push(Date.now())
          attempts++
          if (attempts < 3) throw new Error("Retry")
          return { ok: true }
        }),
        retry(3, 50)
      )

      const container = createContainer()
      await container.get(test)

      assert.ok(timestamps[1] - timestamps[0] >= 45) // Allow some variance
      assert.ok(timestamps[2] - timestamps[1] >= 45)
    })
  })

  describe("withTimeout()", () => {
    it("returns quickly when factory is fast", async () => {
      const test = pipe(
        factory("Fast", async () => {
          await new Promise((r) => setTimeout(r, 10))
          return { fast: true }
        }),
        withTimeout(1000)
      )

      const container = createContainer()
      const result = await container.get(test)
      assert.deepStrictEqual(result, { fast: true })
    })

    it("throws on timeout", async () => {
      const test = pipe(
        factory("Slow", async () => {
          await new Promise((r) => setTimeout(r, 200))
          return { slow: true }
        }),
        withTimeout(50)
      )

      const container = createContainer()
      await assert.rejects(() => container.get(test), /Timeout/)
    })

    it("passes through sync factories", async () => {
      const test = pipe(
        factory("Sync", () => ({ sync: true })),
        withTimeout(100)
      )

      const container = createContainer()
      const result = await container.get(test)
      assert.deepStrictEqual(result, { sync: true })
    })
  })

  describe("when()", () => {
    it("applies decorator when condition is true", () => {
      const addField = (f) => (c) => ({ ...f(c), added: true })

      const test = pipe(factory("Test", () => ({})), when(true, addField))

      const container = createContainer()
      assert.deepStrictEqual(container.get(test), { added: true })
    })

    it("skips decorator when condition is false", () => {
      const addField = (f) => (c) => ({ ...f(c), added: true })

      const test = pipe(factory("Test", () => ({})), when(false, addField))

      const container = createContainer()
      assert.deepStrictEqual(container.get(test), {})
    })

    it("accepts function condition", () => {
      let evaluated = false
      const condition = () => {
        evaluated = true
        return true
      }

      const test = pipe(
        factory("Test", () => ({})),
        when(condition, (f) => (c) => ({ ...f(c), conditional: true }))
      )

      const container = createContainer()
      container.get(test)

      assert.ok(evaluated)
    })
  })

  describe("ifElse()", () => {
    it("applies ifTrue decorator when condition is true", () => {
      const test = pipe(
        factory("Test", () => ({ base: true })),
        ifElse(
          true,
          (f) => (c) => ({ ...f(c), branch: "true" }),
          (f) => (c) => ({ ...f(c), branch: "false" })
        )
      )

      const container = createContainer()
      assert.deepStrictEqual(container.get(test), { base: true, branch: "true" })
    })

    it("applies ifFalse decorator when condition is false", () => {
      const test = pipe(
        factory("Test", () => ({ base: true })),
        ifElse(
          false,
          (f) => (c) => ({ ...f(c), branch: "true" }),
          (f) => (c) => ({ ...f(c), branch: "false" })
        )
      )

      const container = createContainer()
      assert.deepStrictEqual(container.get(test), { base: true, branch: "false" })
    })
  })

  describe("integration: complex composition", () => {
    it("composes multiple decorators correctly", async () => {
      const log = []

      const service = pipe(
        factory("ComplexService", async () => {
          log.push("factory")
          await new Promise((r) => setTimeout(r, 10))
          return { data: [1, 2, 3] }
        }),
        guard(() => {
          log.push("guard")
          return true
        }),
        intercept((next, ctx) => {
          log.push("intercept-before")
          const result = next()
          log.push("intercept-after")
          return result
        }),
        validate((v) => {
          log.push("validate")
          return v
        }),
        transform((v) => {
          log.push("transform")
          return { ...v, transformed: true }
        }),
        tap(() => {
          log.push("tap")
        })
      )

      const container = createContainer()
      const result = await container.get(service)

      assert.deepStrictEqual(result, { data: [1, 2, 3], transformed: true })
      assert.ok(log.includes("guard"))
      assert.ok(log.includes("factory"))
      assert.ok(log.includes("validate"))
      assert.ok(log.includes("transform"))
      assert.ok(log.includes("tap"))
    })

    it("handles errors in composition chain", () => {
      const service = pipe(
        factory("Failing", () => {
          throw new Error("Factory error")
        }),
        guard(() => true),
        catchError((err) => ({ error: err.message }))
      )

      const container = createContainer()
      const result = container.get(service)

      assert.deepStrictEqual(result, { error: "Factory error" })
    })
  })
})
